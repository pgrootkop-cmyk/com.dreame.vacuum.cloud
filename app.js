'use strict';

const Homey = require('homey');
const { HomeyAPI } = require('homey-api');
const zlib = require('zlib');
const crypto = require('crypto');
const DreameApi = require('./lib/DreameApi');
const DreameMqtt = require('./lib/DreameMqtt');

// Dreame Light color scheme (matches Tasshack/dreame-vacuum)
const SEGMENT_COLORS = [
  [171, 199, 248], [249, 224, 125], [184, 227, 255], [184, 217, 141],
];
const WALL_COLOR = [159, 159, 159];
const FLOOR_COLOR = [221, 221, 221];
const NEW_SEGMENT_COLOR = [153, 191, 255];
const MAP_HEADER_SIZE = 27;

class DreameApp extends Homey.App {

  async onInit() {
    this._api = null;
    this._mqtt = null;
    this._initApi();
  }

  /**
   * Log a diagnostic message. All levels go to console (visible via --remote).
   */
  sendDiagnostic(message, extra, level = 'info') {
    if (level === 'error' || level === 'fatal') this.error(`[DIAG] ${message}`);
    else this.log(`[DIAG] ${message}`);
  }

  /**
   * Log an error. Goes to console (visible via --remote).
   */
  sendError(err, extra, level = 'error') {
    this.error(`[DIAG:ERR] ${err.message || err}`);
  }

  _initApi() {
    const username = this.homey.settings.get('username');
    const password = this.homey.settings.get('password');
    const country = this.homey.settings.get('country') || 'eu';

    if (username && password) {
      this._api = new DreameApi({ username, password, country });
      this._wireApi();
    }
  }

  _wireApi() {
    // Restore tokens if available
    const refreshToken = this.homey.settings.get('refreshToken');
    if (refreshToken) {
      this._api.refreshToken = refreshToken;
    }
    const accessToken = this.homey.settings.get('accessToken');
    const tokenExpiry = this.homey.settings.get('tokenExpiry');
    const tenantId = this.homey.settings.get('tenantId');
    if (accessToken && tokenExpiry && Date.now() < tokenExpiry) {
      this._api.accessToken = accessToken;
      this._api.tokenExpiry = tokenExpiry;
    }
    if (tenantId) {
      this._api.tenantId = tenantId;
    }

    // Restore uid and region
    const uid = this.homey.settings.get('uid');
    if (uid) {
      this._api.uid = uid;
    }
    const region = this.homey.settings.get('region');
    if (region) {
      this._api.region = region;
    }

    // Auto-save tokens whenever they change
    this._api.onTokenUpdate = (tokens) => {
      this.homey.settings.set('accessToken', tokens.accessToken);
      this.homey.settings.set('refreshToken', tokens.refreshToken);
      this.homey.settings.set('tokenExpiry', tokens.tokenExpiry);
      this.homey.settings.set('tenantId', tokens.tenantId);
      if (tokens.uid) {
        this.homey.settings.set('uid', tokens.uid);
      }
      if (tokens.region) {
        this.homey.settings.set('region', tokens.region);
      }

      // Update MQTT token if connected
      if (this._mqtt) {
        this._mqtt.updateToken(tokens.accessToken);
      }
    };
  }

  getApi() {
    return this._api;
  }

  /**
   * Get or create the shared MQTT client.
   * Devices call this to register for property updates.
   */
  getMqtt() {
    if (!this._mqtt) {
      this._mqtt = new DreameMqtt({ logger: this.log.bind(this) });
    }
    return this._mqtt;
  }

  setCredentials(username, password, country) {
    this.homey.settings.set('username', username);
    this.homey.settings.set('password', password);
    this.homey.settings.set('country', country || 'eu');

    if (this._api) {
      this._api.setCredentials({ username, password, country });
    } else {
      this._api = new DreameApi({ username, password, country });
    }

    this._wireApi();
  }

  saveRefreshToken(refreshToken) {
    this.homey.settings.set('refreshToken', refreshToken);
    if (this._api) {
      this._api.refreshToken = refreshToken;
    }
  }

  saveUid(uid) {
    this.homey.settings.set('uid', uid);
    if (this._api) {
      this._api.uid = uid;
    }
  }

  /**
   * Get vacuum device data for settings page and widget.
   */
  getVacuumData() {
    const driver = this.homey.drivers.getDriver('vacuum');
    const devices = driver ? driver.getDevices() : [];
    return devices.map(d => this.getVacuumDataForDevice(d));
  }

  getVacuumDataForDevice(d) {
    const caps = {};
    for (const cap of d.getCapabilities()) {
      caps[cap] = d.getCapabilityValue(cap);
    }
    const result = {
      id: d.getData().id,
      name: d.getName(),
      rooms: d.getRooms(),
      capabilities: caps,
      store: {
        model: d.getStoreValue('model'),
        mapObjectName: d.getStoreValue('mapObjectName'),
      },
    };
    // Multi-floor metadata (only included when device supports it)
    if (d.isMultiFloor()) {
      result.isMultiFloor = true;
      result.currentMapId = d.getCurrentMapId();
      // Include per-floor rooms for settings display
      result.floors = d.getFloorList().map(f => ({
        ...f,
        rooms: d.getFloorRooms(f.mapId),
      }));
    }
    return result;
  }

  /**
   * Resolve a Web API device UUID (what Homey.getDeviceIds() returns in widgets)
   * to a Dreame DID. SDK Device instances don't expose the Web API UUID, so this
   * goes through homey-api and matches our driver's devices on data.id.
   */
  async _resolveWebApiUuid(uuid) {
    if (this._uuidToDid && this._uuidToDid.has(uuid)) {
      return this._uuidToDid.get(uuid);
    }
    // Unknown UUID: refresh the map, but at most once per minute
    const now = Date.now();
    if (this._uuidMapFetchedAt && now - this._uuidMapFetchedAt < 60000) {
      return this._uuidToDid ? this._uuidToDid.get(uuid) : undefined;
    }
    this._uuidMapFetchedAt = now;
    try {
      if (!this._webApi) {
        this._webApi = await HomeyAPI.createAppAPI({ homey: this.homey });
      }
      const webDevices = await this._webApi.devices.getDevices();
      const uuidToDid = new Map();
      for (const wd of Object.values(webDevices)) {
        if (wd.driverId && wd.driverId.includes('com.dreame.vacuum.cloud') && wd.data && wd.data.id != null) {
          uuidToDid.set(wd.id, wd.data.id);
        }
      }
      this._uuidToDid = uuidToDid;
    } catch (e) {
      this.error(`Web API device lookup failed: ${e.message}`);
    }
    return this._uuidToDid ? this._uuidToDid.get(uuid) : undefined;
  }

  /**
   * Find a vacuum device by Dreame DID or Web API device UUID (from widgets).
   * Returns null when an explicit id has no match — falling back to the first
   * device here is what made every widget show the same vacuum (#38).
   */
  async _findVacuumDevice(did) {
    const driver = this.homey.drivers.getDriver('vacuum');
    const devices = driver ? driver.getDevices() : [];
    if (!did) return devices[0] || null;
    // Match by Dreame DID
    const byDid = devices.find(d => d.getData().id === did);
    if (byDid) return byDid;
    // Match by Web API device UUID (widget Homey.getDeviceIds() returns these)
    const dreameId = await this._resolveWebApiUuid(did);
    if (dreameId != null) {
      return devices.find(d => d.getData().id === dreameId) || null;
    }
    return null;
  }

  /**
   * Get rendered map as RGBA pixel data + dimensions for a device.
   * Returns { width, height, pixels: base64-encoded RGBA, rooms: [...] } or null.
   */
  async getRenderedMap(did, colorScheme, mapId) {
    const device = await this._findVacuumDevice(did);
    if (!device) return null;

    // Always render from the active floor's cached map (flat store).
    // Settings page switches floor via switchFloor API before requesting render.
    const raw = device.getStoreValue('mapRawBase64');
    if (!raw) return null;

    const rooms = device.getRooms() || [];
    const model = device.getStoreValue('model') || '';
    return this._renderMapPixels(raw, rooms, model);
  }

  async getRobotPosition(did) {
    const device = await this._findVacuumDevice(did);
    if (!device) return null;
    return device.getRobotPosition();
  }

  /**
   * Get the AES-CBC IV for a given vacuum model.
   * Returns the 16-char IV string or null.
   */
  _getMapIv(model) {
    if (!model) return null;
    const suffix = model.replace('dreame.vacuum.', '');
    // Explicit non-default IVs, generated from Tasshack DEVICE_INFO (dev branch,
    // v2.0.0b25). Every model not listed here uses the default IV — including the
    // X60 family (r5089b/r5089u/r6001a/r9515*). Replaces the old prefix heuristics,
    // which mis-mapped e.g. r249x to the 3F family.
    const MODEL_IV = {
      r2243: '3F0ji4ufBMaH1ThM', r2312: '3F0ji4ufBMaH1ThM', r2312a: '3F0ji4ufBMaH1ThM', r2328: '3F0ji4ufBMaH1ThM', r2380: '3F0ji4ufBMaH1ThM', r2380r: '3F0ji4ufBMaH1ThM', r2388: '3F0ji4ufBMaH1ThM', r2422: '3F0ji4ufBMaH1ThM',
      r2422a: '3F0ji4ufBMaH1ThM', r2422b: '3F0ji4ufBMaH1ThM', r2422c: '3F0ji4ufBMaH1ThM', r2458a: '3F0ji4ufBMaH1ThM', r2458h: '3F0ji4ufBMaH1ThM', r2459a: '3F0ji4ufBMaH1ThM', r2459h: '3F0ji4ufBMaH1ThM', r2459k: '3F0ji4ufBMaH1ThM',
      r2459r: '3F0ji4ufBMaH1ThM', r2463r: '3F0ji4ufBMaH1ThM', r2478r: '3F0ji4ufBMaH1ThM', r2478v: '3F0ji4ufBMaH1ThM', r95239: '3F0ji4ufBMaH1ThM', r9523a: '3F0ji4ufBMaH1ThM', r9523b: '3F0ji4ufBMaH1ThM', r9523c: '3F0ji4ufBMaH1ThM',
      r9523h: '3F0ji4ufBMaH1ThM', r9523k: '3F0ji4ufBMaH1ThM', r9523t: '3F0ji4ufBMaH1ThM', r9523u: '3F0ji4ufBMaH1ThM',
      r2216o: '4sCv3Q2BtbWVBIB2',
      p2114a: '6PFiLPYMHLylp7RR', p2114o: '6PFiLPYMHLylp7RR',
      p2140: '8qnS9dqgT3CppGe1', p2140a: '8qnS9dqgT3CppGe1', p2140o: '8qnS9dqgT3CppGe1', p2140p: '8qnS9dqgT3CppGe1', p2140q: '8qnS9dqgT3CppGe1',
      r2251a: 'FmnfaI2pbem0k75t', r2251o: 'FmnfaI2pbem0k75t', r2257o: 'FmnfaI2pbem0k75t', r2317: 'FmnfaI2pbem0k75t', r2345a: 'FmnfaI2pbem0k75t', r2345h: 'FmnfaI2pbem0k75t', r2363: 'FmnfaI2pbem0k75t', r2363a: 'FmnfaI2pbem0k75t',
      r2363n: 'FmnfaI2pbem0k75t', r2364: 'FmnfaI2pbem0k75t', r23646: 'FmnfaI2pbem0k75t', r2364a: 'FmnfaI2pbem0k75t', r2382a: 'FmnfaI2pbem0k75t', r2382k: 'FmnfaI2pbem0k75t', r2382r: 'FmnfaI2pbem0k75t', r2383a: 'FmnfaI2pbem0k75t',
      r2383k: 'FmnfaI2pbem0k75t', r2386: 'FmnfaI2pbem0k75t', r2471: 'FmnfaI2pbem0k75t', r2563b: 'FmnfaI2pbem0k75t', r2563v: 'FmnfaI2pbem0k75t', r25642: 'FmnfaI2pbem0k75t', r2564b: 'FmnfaI2pbem0k75t', r2564s: 'FmnfaI2pbem0k75t',
      r2564z: 'FmnfaI2pbem0k75t', r2565a: 'FmnfaI2pbem0k75t', r2565v: 'FmnfaI2pbem0k75t', r2566a: 'FmnfaI2pbem0k75t', r2566h: 'FmnfaI2pbem0k75t', r53148: 'FmnfaI2pbem0k75t', r5314a: 'FmnfaI2pbem0k75t', r5314s: 'FmnfaI2pbem0k75t',
      r5314z: 'FmnfaI2pbem0k75t', r531ra: 'FmnfaI2pbem0k75t', r531rh: 'FmnfaI2pbem0k75t', r53456: 'FmnfaI2pbem0k75t', r5345b: 'FmnfaI2pbem0k75t', r5345e: 'FmnfaI2pbem0k75t', r54125: 'FmnfaI2pbem0k75t', r5412a: 'FmnfaI2pbem0k75t',
      r5412v: 'FmnfaI2pbem0k75t', r54136: 'FmnfaI2pbem0k75t', r5413a: 'FmnfaI2pbem0k75t', r5413v: 'FmnfaI2pbem0k75t', r63014: 'FmnfaI2pbem0k75t', r63015: 'FmnfaI2pbem0k75t', r63017: 'FmnfaI2pbem0k75t', r63018: 'FmnfaI2pbem0k75t',
      r6301a: 'FmnfaI2pbem0k75t', r6301h: 'FmnfaI2pbem0k75t', r6301r: 'FmnfaI2pbem0k75t', r6301v: 'FmnfaI2pbem0k75t', r64015: 'FmnfaI2pbem0k75t', r64016: 'FmnfaI2pbem0k75t', r6401c: 'FmnfaI2pbem0k75t', r6401k: 'FmnfaI2pbem0k75t',
      r6401r: 'FmnfaI2pbem0k75t', r6401v: 'FmnfaI2pbem0k75t', r95265: 'FmnfaI2pbem0k75t', r95266: 'FmnfaI2pbem0k75t', r95267: 'FmnfaI2pbem0k75t', r9526a: 'FmnfaI2pbem0k75t', r9526c: 'FmnfaI2pbem0k75t', r9526h: 'FmnfaI2pbem0k75t',
      r9526k: 'FmnfaI2pbem0k75t', r95275: 'FmnfaI2pbem0k75t', r95276: 'FmnfaI2pbem0k75t', r95277: 'FmnfaI2pbem0k75t', r95278: 'FmnfaI2pbem0k75t', r95279: 'FmnfaI2pbem0k75t', r9527a: 'FmnfaI2pbem0k75t', r9527f: 'FmnfaI2pbem0k75t',
      r9527v: 'FmnfaI2pbem0k75t', r9537a: 'FmnfaI2pbem0k75t', r9537h: 'FmnfaI2pbem0k75t', r95425: 'FmnfaI2pbem0k75t', r9542a: 'FmnfaI2pbem0k75t', r9542b: 'FmnfaI2pbem0k75t', r9542h: 'FmnfaI2pbem0k75t', r9542t: 'FmnfaI2pbem0k75t',
      r2210: 'OFULk9To37qRdXY3',
      p2149o: 'RNO4p35b2QKaovHC',
      r2211o: 'dndRQ3z8ACjDdDMo',
      r2250: 'nf3Zi2Mq8jD5AAOm',
      r2240: 'ojxGnogHfVuefVfx',
      r2209: 'qFKhvoAqRFTPfKN6',
      r2254: 'wRy05fYLQJMRH6Mj',
    };
    // Default IV for all other models (r2212+, r2253*, r2449*, X60 family, etc.)
    return MODEL_IV[suffix] || 'NRwnBj5FsNPgBNbT';
  }

  /**
   * Decode raw map data (base64, optionally AES-encrypted, zlib-compressed).
   * Returns { buf, width, height, dataJson } or null.
   */
  _decodeMapData(raw, model) {
    let mapStr = String(raw).replace(/_/g, '/').replace(/-/g, '+');
    let aesKey = null;
    if (mapStr.includes(',')) {
      const parts = mapStr.split(',');
      mapStr = parts[0];
      aesKey = parts[1];
    }

    let buf = Buffer.from(mapStr, 'base64');

    if (aesKey) {
      try {
        const keyHash = crypto.createHash('sha256').update(aesKey).digest('hex').substring(0, 32);
        const modelIv = this._getMapIv(model);
        const iv = modelIv ? Buffer.from(modelIv, 'utf8') : Buffer.alloc(16, 0);
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(keyHash, 'utf8'), iv);
        decipher.setAutoPadding(true);
        buf = Buffer.concat([decipher.update(buf), decipher.final()]);
      } catch (_) {
        buf = Buffer.from(mapStr, 'base64');
      }
    }

    try {
      buf = zlib.inflateSync(buf);
    } catch (_) {
      try { buf = zlib.inflateRawSync(buf); } catch (__) { return null; }
    }

    if (buf.length < MAP_HEADER_SIZE) return null;
    const width = buf.readInt16LE(19);
    const height = buf.readInt16LE(21);
    if (width <= 0 || height <= 0 || width > 4000 || height > 4000) return null;

    const imageSize = MAP_HEADER_SIZE + (width * height);
    let dataJson = {};
    if (buf.length > imageSize) {
      try { dataJson = JSON.parse(buf.slice(imageSize).toString('utf8')); } catch (_) {}
    }

    return { buf, width, height, dataJson };
  }

  /**
   * Get pixel type from raw pixel value, matching Tasshack's logic.
   * frame_map: pixel >> 2 for segment_id (63=wall, 62=floor, 61=unknown)
   * saved map: pixel & 0x3F for segment_id, bit 7 for wall+segment
   */
  _getPixelType(pixel, frameMap, savedMapStatus) {
    if (frameMap) {
      const segId = pixel >> 2;
      if (segId > 0 && segId < 64) {
        if (segId === 63) return { type: 'wall' };
        if (segId === 62) return { type: 'floor' };
        if (segId === 61) return { type: 'outside' };
        return { type: 'segment', id: segId };
      }
      const low = pixel & 0x03;
      if (low === 1 || low === 3) return { type: 'new_segment' };
      if (low === 2) return { type: 'wall' };
      return { type: 'outside' };
    }

    // Non-frame map (saved map / I-frame without fsm)
    const segId = pixel & 0x3F;
    if (pixel >> 7) {
      // High bit set: wall or segment with wall overlay
      if (segId > 0) return { type: 'segment', id: segId };
      return { type: 'wall' };
    }
    if (segId > 0) {
      if (savedMapStatus === 1 || savedMapStatus === 0) {
        if (segId === 1 || segId === 3) return { type: 'new_segment' };
        if (segId === 2) return { type: 'wall' };
        return { type: 'outside' };
      }
      return { type: 'segment', id: segId };
    }
    return { type: 'outside' };
  }

  _renderMapPixels(raw, rooms, model) {
    try {
      // Decode the outer map
      const outer = this._decodeMapData(raw, model);
      if (!outer) return null;

      const { dataJson } = outer;
      const frameMap = !!(dataJson.fsm && dataJson.fsm === 1);
      const savedMapStatus = dataJson.ris !== undefined ? dataJson.ris : -1;

      // Prefer the rism (saved map) if available - it has proper room segments
      let renderData = outer;
      let renderFrameMap = frameMap;
      let renderSavedMapStatus = savedMapStatus;

      if (dataJson.rism) {
        const saved = this._decodeMapData(dataJson.rism, model);
        if (saved && saved.width > 2 && saved.height > 2) {
          renderData = saved;
          renderFrameMap = !!(saved.dataJson.fsm && saved.dataJson.fsm === 1);
          renderSavedMapStatus = saved.dataJson.ris !== undefined ? saved.dataJson.ris : -1;
        }
      }

      const { buf, width, height } = renderData;
      const roomColorMap = {};
      rooms.forEach((r, i) => { roomColorMap[r.id] = i % SEGMENT_COLORS.length; });

      const rgba = Buffer.alloc(width * height * 4);
      // Track segment pixel positions for room label placement
      const segBounds = {};

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const pi = MAP_HEADER_SIZE + (y * width + x);
          const px = buf[pi] || 0;
          const oi = ((height - 1 - y) * width + x) * 4;

          if (px === 0) continue; // Outside - transparent

          const pxType = this._getPixelType(px, renderFrameMap, renderSavedMapStatus);

          let col;
          switch (pxType.type) {
            case 'wall':
              col = WALL_COLOR;
              break;
            case 'floor':
              col = FLOOR_COLOR;
              break;
            case 'new_segment':
              col = NEW_SEGMENT_COLOR;
              break;
            case 'segment': {
              const colorIdx = roomColorMap[pxType.id] !== undefined
                ? roomColorMap[pxType.id]
                : (pxType.id - 1) % SEGMENT_COLORS.length;
              col = SEGMENT_COLORS[colorIdx];
              // Track bounds for room labels
              const flippedY = height - 1 - y;
              if (!segBounds[pxType.id]) segBounds[pxType.id] = { minX: x, maxX: x, minY: flippedY, maxY: flippedY, count: 0 };
              const b = segBounds[pxType.id];
              if (x < b.minX) b.minX = x;
              if (x > b.maxX) b.maxX = x;
              if (flippedY < b.minY) b.minY = flippedY;
              if (flippedY > b.maxY) b.maxY = flippedY;
              b.count++;
              break;
            }
            default:
              continue;
          }

          rgba[oi] = col[0]; rgba[oi + 1] = col[1]; rgba[oi + 2] = col[2]; rgba[oi + 3] = 255;
        }
      }

      // Build room label positions (center of each segment's bounding box)
      const roomLabels = [];
      for (const room of rooms) {
        const b = segBounds[room.id];
        if (b && b.count > 10) {
          roomLabels.push({
            id: room.id,
            name: room.name,
            x: Math.round((b.minX + b.maxX) / 2),
            y: Math.round((b.minY + b.maxY) / 2),
          });
        }
      }

      // Parse robot and charger positions + map metadata from header
      let robotPos = null;
      let chargerPos = null;
      let mapMeta = null;
      const headerBuf = renderData.buf;
      if (headerBuf.length >= MAP_HEADER_SIZE) {
        const gridSize = headerBuf.readInt16LE(17);
        const left = headerBuf.readInt16LE(23);
        const top = headerBuf.readInt16LE(25);
        const rX = headerBuf.readInt16LE(5);
        const rY = headerBuf.readInt16LE(7);
        const cX = headerBuf.readInt16LE(11);
        const cY = headerBuf.readInt16LE(13);
        if (gridSize > 0) {
          mapMeta = { gridSize, left, top };
        }
        if (rX !== 32767 && rY !== 32767 && gridSize > 0) {
          robotPos = {
            x: Math.round((rX - left) / gridSize),
            y: height - 1 - Math.round((rY - top) / gridSize),
          };
        }
        if (cX !== 32767 && cY !== 32767 && gridSize > 0) {
          chargerPos = {
            x: Math.round((cX - left) / gridSize),
            y: height - 1 - Math.round((cY - top) / gridSize),
          };
        }
      }

      return {
        width, height,
        pixels: rgba.toString('base64'),
        roomLabels,
        robotPos,
        chargerPos,
        mapMeta,
      };
    } catch (_) {
      return null;
    }
  }

  async onUninit() {
    if (this._mqtt) {
      this._mqtt.disconnect();
      this._mqtt = null;
    }
    if (this._webApi) {
      try { this._webApi.destroy(); } catch (e) { /* already destroyed */ }
      this._webApi = null;
    }
  }

}

module.exports = DreameApp;
