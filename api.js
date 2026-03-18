'use strict';

module.exports = {
  async getVacuumData({ homey }) {
    return homey.app.getVacuumData();
  },

  async getRenderedMap({ homey, query }) {
    const did = query.did;
    if (!did) return null;
    return homey.app.getRenderedMap(did, query.colorScheme, query.floorId);
  },

  async getRobotPosition({ homey, query }) {
    const did = query.did;
    if (!did) return null;
    return homey.app.getRobotPosition(did);
  },

  async getFloors({ homey, query }) {
    const did = query.did;
    const device = homey.app._findVacuumDevice(did);
    if (!device) return [];
    if (device._multiFloorEnabled && device.getFloors().length === 0) {
      device._requestMapViaMqtt().catch(() => {});
    }
    return device.getFloors();
  },

  async getRooms({ homey, query }) {
    const did = query.did;
    const device = homey.app._findVacuumDevice(did);
    if (!device) return [];
    if (query.floorId) return device.getRoomsForFloor(query.floorId);
    return device.getRooms();
  },

  async selectFloor({ homey, body }) {
    const did = body.did;
    const mapId = parseInt(body.mapId, 10);
    const device = homey.app._findVacuumDevice(did);
    if (!device) throw new Error('Device not found');
    if (isNaN(mapId)) throw new Error('Invalid mapId');
    homey.app.log(`[API] selectFloor: did=${did} mapId=${mapId}`);
    await device.selectFloor(mapId);
    return { ok: true };
  },

  async getZones({ homey, query }) {
    const did = query.did;
    const device = homey.app._findVacuumDevice(did);
    if (!device) return [];
    if (query.floorId) return device.getZonesForFloor(query.floorId);
    return device.getZones();
  },

  async saveZone({ homey, body }) {
    const did = body.did;
    const device = homey.app._findVacuumDevice(did);
    if (!device) throw new Error('Device not found');
    const zone = body.zone;
    if (!zone || !zone.name || !zone.coords) throw new Error('Invalid zone data');
    try {
      return await device.saveZone(zone);
    } catch (e) {
      homey.app.log(`[API] saveZone error: ${e.message}`);
      throw e;
    }
  },

  // Zone deletion uses query params (Homey DELETE doesn't reliably send body from settings page)
  async deleteZone({ homey, query }) {
    const did = query.did;
    const zoneId = query.zoneId;
    const device = homey.app._findVacuumDevice(did);
    if (!device) throw new Error('Device not found');
    if (!zoneId) throw new Error('Missing zoneId');
    await device.deleteZone(zoneId);
    return { ok: true };
  },

  // GET fallback for zone deletion (settings page can't send DELETE body reliably)
  async deleteZoneGet({ homey, query }) {
    const did = query.did;
    const zoneId = query.zoneId;
    const device = homey.app._findVacuumDevice(did);
    if (!device) throw new Error('Device not found');
    if (!zoneId) throw new Error('Missing zoneId');
    try {
      await device.deleteZone(zoneId);
      return { ok: true };
    } catch (e) {
      homey.app.log(`[API] deleteZone error: ${e.message}`);
      throw e;
    }
  },
};
