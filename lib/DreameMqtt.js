'use strict';

const mqtt = require('mqtt');
const crypto = require('crypto');
const EventEmitter = require('events');

const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_MS = 10000;
const RECONNECT_MAX_MS = 300000;

/**
 * Multi-device MQTT client for Dreame vacuum real-time property updates.
 *
 * Single connection to the Dreame broker, shared across all devices.
 * Each device registers with its DID/model/country to subscribe to its topic.
 * Messages are routed to the correct device by DID.
 *
 * Usage:
 *   const mqtt = app.getMqtt();
 *   mqtt.register(did, { uid, accessToken, bindDomain, model, country }, handler);
 *   mqtt.unregister(did);
 *
 * Events (per-device, emitted with DID prefix):
 *   'connected'    - broker connection established
 *   'disconnected' - broker connection lost
 *   'auth_error'   - authentication failed (token expired)
 *   'gave_up'      - max reconnect attempts reached
 */
class DreameMqtt extends EventEmitter {

  constructor({ logger } = {}) {
    super();
    this.on('error', () => {}); // prevent unhandled 'error' crash
    this._log = logger || (() => {});
    this._client = null;
    this._clientId = 0;
    this._connected = false;
    this._reconnectTimer = null;
    this._reconnectAttempts = 0;
    this._stopped = false;

    // Multi-device state
    this._devices = new Map(); // did -> { topic, handler, uid, accessToken, bindDomain, model, country }
    this._connectConfig = null; // shared broker connection config (uid, accessToken, bindDomain)
  }

  /**
   * Register a device for MQTT updates.
   * Connects to broker on first registration, subscribes to device topic.
   *
   * @param {string} did - Device ID
   * @param {Object} opts
   * @param {string} opts.uid
   * @param {string} opts.accessToken
   * @param {string} opts.bindDomain
   * @param {string} opts.model
   * @param {string} opts.country
   * @param {Function} handler - Called with (params) on properties_changed
   */
  async register(did, opts, handler) {
    const { uid, accessToken, bindDomain, model, country } = opts;
    const topic = `/status/${did}/${uid}/${model}/${country}/`;

    this._devices.set(did, { topic, handler, uid, accessToken, bindDomain, model, country });

    if (!this._client || !this._connected) {
      // First device or reconnecting — establish connection
      this._connectConfig = { uid, accessToken, bindDomain };
      await this._connect();
    } else {
      // Already connected — just subscribe to the new topic
      this._client.subscribe(topic, { qos: 0 }, (err) => {
        if (err) this._log(`[MQTT] Subscribe error for ${did}: ${err.message}`);
      });
    }
  }

  /**
   * Unregister a device. Unsubscribes from its topic.
   * Disconnects when no devices remain.
   */
  unregister(did) {
    const entry = this._devices.get(did);
    if (!entry) return;

    if (this._client && this._connected) {
      this._client.unsubscribe(entry.topic, (err) => {
        if (err) this._log(`[MQTT] Unsubscribe error for ${did}: ${err.message}`);
      });
    }
    this._devices.delete(did);

    if (this._devices.size === 0) {
      this.disconnect();
    }
  }

  /**
   * Update the access token (e.g. after refresh).
   * Reconnects if currently disconnected.
   */
  updateToken(accessToken) {
    if (this._connectConfig) {
      this._connectConfig.accessToken = accessToken;
    }
    // Update token in all device entries
    for (const entry of this._devices.values()) {
      entry.accessToken = accessToken;
    }

    this._reconnectAttempts = 0;
    this._stopped = false;

    if (!this._connected && this._connectConfig) {
      this._cancelReconnect();
      this._connect().catch(e => {
        this._log(`[MQTT] Reconnect after token update failed: ${e.message}`);
        this._handleConnectError(e);
      });
    }
  }

  disconnect() {
    this._stopped = true;
    this._cancelReconnect();
    this._destroyClient();
    this._connected = false;
  }

  get connected() {
    return this._connected;
  }

  // --- Internal ---

  async _connect() {
    this._destroyClient();
    this._stopped = false;

    const config = this._connectConfig;
    if (!config || !config.uid || !config.accessToken || !config.bindDomain) {
      throw new Error('MQTT connect requires uid, accessToken and bindDomain');
    }

    const { uid, accessToken, bindDomain } = config;
    const [brokerHost, brokerPortStr] = bindDomain.split(':');
    const brokerPort = parseInt(brokerPortStr, 10) || 8883;
    const brokerUrl = `mqtts://${brokerHost}:${brokerPort}`;
    const clientIdStr = `p_${crypto.randomBytes(8).toString('hex')}`;
    const myClientId = ++this._clientId;

    this._client = await mqtt.connectAsync(brokerUrl, {
      clientId: clientIdStr,
      username: uid,
      password: accessToken,
      rejectUnauthorized: false,
      reconnectPeriod: 0,
      connectTimeout: 15000,
      keepalive: 60,
      clean: true,
      protocolVersion: 4,
    });

    this._connected = true;
    this._reconnectAttempts = 0;

    // Subscribe to ALL registered device topics
    for (const [did, entry] of this._devices) {
      this._client.subscribe(entry.topic, { qos: 0 }, (err) => {
        if (err) this._log(`[MQTT] Subscribe error for ${did}: ${err.message}`);
      });
    }

    this._client.on('message', (topic, payload) => {
      if (myClientId !== this._clientId) return;
      this._handleMessage(topic, payload);
    });

    this._client.on('error', (err) => {
      if (myClientId !== this._clientId) return;
      this._log(`[MQTT] Error: ${err.message}`);

      const msg = (err.message || '').toLowerCase();
      const code = err.code;
      if (msg.includes('not authorized') || msg.includes('bad user') || code === 4 || code === 5) {
        this._log('[MQTT] Auth error — token may be expired');
        this.emit('auth_error', err);
        return;
      }
    });

    this._client.on('close', () => {
      if (myClientId !== this._clientId) return;
      const wasConnected = this._connected;
      this._connected = false;
      if (wasConnected) {
        this.emit('disconnected');
      }
      if (!this._stopped) {
        this._scheduleReconnect();
      }
    });

    this._client.on('offline', () => {
      if (myClientId !== this._clientId) return;
      this._connected = false;
    });

    this.emit('connected');
  }

  _handleMessage(topic, payload) {
    try {
      const msg = JSON.parse(payload.toString());
      const data = msg.data || msg;

      if (data.method === 'properties_changed' && Array.isArray(data.params)) {
        // Route to correct device by DID from the message
        const did = data.params[0]?.did;
        if (did) {
          const entry = this._devices.get(did);
          if (entry && entry.handler) {
            entry.handler(data.params);
          }
        } else {
          // No DID in message — try routing by topic match
          for (const [, entry] of this._devices) {
            if (entry.topic === topic && entry.handler) {
              entry.handler(data.params);
              break;
            }
          }
        }
      } else if (data.method) {
        this.emit('message', data);
      }
    } catch (e) {
      this._log(`[MQTT] Message parse error: ${e.message}`);
    }
  }

  _destroyClient() {
    if (this._client) {
      this._clientId++;
      try { this._client.end(true); } catch (_) {}
      this._client = null;
    }
  }

  _cancelReconnect() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this._reconnectTimer || this._stopped) return;

    if (this._reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this._log(`[MQTT] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached — giving up`);
      this._stopped = true;
      this.emit('gave_up');
      return;
    }

    const delay = Math.min(RECONNECT_BASE_MS * Math.pow(2, this._reconnectAttempts), RECONNECT_MAX_MS);
    this._reconnectAttempts++;
    this._log(`[MQTT] Reconnect attempt ${this._reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s`);

    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (!this._connected && !this._stopped && this._connectConfig) {
        this._connect().catch(e => {
          this._log(`[MQTT] Reconnect error: ${e.message}`);
          this._handleConnectError(e);
        });
      }
    }, delay);
  }

  _handleConnectError(err) {
    this._connected = false;
    const msg = (err.message || '').toLowerCase();
    const code = err.code;
    if (msg.includes('not authorized') || msg.includes('bad user') || code === 4 || code === 5) {
      this._log('[MQTT] Auth error during connect — token may be expired');
      this.emit('auth_error', err);
      return;
    }
    if (!this._stopped) {
      this._scheduleReconnect();
    }
  }
}

module.exports = DreameMqtt;
