'use strict';

/**
 * device.patch.js
 * ═══════════════════════════════════════════════════════════════════════════
 * This file is NOT a standalone module.
 * It shows EXACTLY what code to add to drivers/vacuum/device.js.
 *
 * Each section is marked with ── ADD TO: <location> ──────────────────────
 * so you can find the right spot in your existing file.
 * ═══════════════════════════════════════════════════════════════════════════
 */


// ── ADD TO: top of device.js, with other require() statements ───────────────

const { resolveError }              = require('../../lib/errorCodes');
const { resolveCleaningModeValue,
        detectMopPadLifting }       = require('../../lib/cleaningModes');
const { ALERT_THRESHOLD,
        findConsumable }            = require('../../lib/consumables');


// ── ADD TO: class body, as instance properties (before constructor or onInit) ─

// Tracks which consumables have already fired an alert this cycle.
// Reset when the consumable life goes back above threshold (i.e. after replacement).
_consumableAlertFired = new Set();


// ── ADD TO: onInit() or wherever you register Flow action cards ───────────────

async _registerFlowCards() {
  // ── Gap #2: Go to point ─────────────────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_goto_point')
    .registerRunListener(async ({ x, y }) => {
      this.log(`[goto] x=${x} y=${y}`);
      await this._api.gotoPoint(x, y);
    });

  // ── Gap #3: Spot cleaning ────────────────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_clean_spot')
    .registerRunListener(async ({ x, y, radius, repeats }) => {
      this.log(`[spot] x=${x} y=${y} r=${radius} repeats=${repeats}`);
      await this._api.cleanSpot(x, y, radius, repeats);
    });

  // ── Gap #4: Multi-zone batch ─────────────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_clean_zones_multi')
    .registerRunListener(async ({ zone_names }) => {
      const storedZones = this.getStoreValue('customZones') || [];
      const names = zone_names.split(',').map(n => n.trim().toLowerCase());
      const matched = storedZones.filter(z => names.includes(z.name.toLowerCase()));

      if (matched.length === 0) {
        throw new Error(`No zones found matching: ${zone_names}`);
      }

      const zones = matched.map(z => [
        Math.round(z.x1), Math.round(z.y1),
        Math.round(z.x2), Math.round(z.y2),
        z.repeats || 1,
      ]);
      this.log(`[zones-multi] cleaning ${zones.length} zones`);
      await this._api.cleanZones(zones);
    });

  // ── Gap #7: Mopping type ─────────────────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_set_mopping_type')
    .registerRunListener(async ({ mopping_type }) => {
      this.log(`[mopping-type] ${mopping_type}`);
      await this._api.setMoppingType(mopping_type);
    });

  // ── Gap #8: Room cleaning sequence ───────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_clean_rooms_sequence')
    .registerRunListener(async ({ room_ids }) => {
      const ids = room_ids
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n));

      if (ids.length === 0) throw new Error('No valid room IDs provided');
      this.log(`[room-seq] ${ids.join(' → ')}`);
      await this._api.cleanSegmentsOrdered(ids);
    });

  // ── Gap #9: Room rename ──────────────────────────────────────────────────
  this.homey.flow.getActionCard('vacuum_rename_room')
    .registerRunListener(async ({ room_id, room_name }) => {
      const id = parseInt(room_id, 10);
      if (isNaN(id)) throw new Error(`Invalid room ID: ${room_id}`);
      this.log(`[rename] room ${id} → "${room_name}"`);
      await this._api.renameSegment(id, room_name);
    });
}


// ── ADD TO: wherever you currently call _api.setCleaningMode() ───────────────
// Replace the direct value lookup with this helper call:
//
//   BEFORE:
//     const modeValues = { sweeping: 0, mopping: 2, ... };
//     await this._api.setProperty(siid, piid, modeValues[mode]);
//
//   AFTER:

async _setCleaningMode(mode) {
  const hasMopPadLifting = await this.getStoreValue('hasMopPadLifting') || false;
  const value = resolveCleaningModeValue(mode, hasMopPadLifting);
  this.log(`[cleaning-mode] ${mode} → api value ${value} (mopPadLifting=${hasMopPadLifting})`);
  await this._api.setCleaningModeValue(value);
}


// ── ADD TO: your connect/onInit flow, after receiving device properties ───────
// Detect and store the mop_pad_lifting flag once per device pairing.

async _detectAndStoreCapabilities(properties) {
  const hasMopPadLifting = detectMopPadLifting(properties);
  await this.setStoreValue('hasMopPadLifting', hasMopPadLifting);
  this.log(`[caps] hasMopPadLifting=${hasMopPadLifting}`);
}


// ── ADD TO / REPLACE IN: your error handling method ──────────────────────────
// Find where you currently set the error capability or fire the error trigger,
// and replace/extend it with this:

_handleErrorCode(errorCode) {
  const error = resolveError(errorCode);
  const hasError = errorCode !== 0;

  this.log(`[error] code=${errorCode} key=${error.key} — ${error.en}`);

  // Update the boolean alarm capability (existing behaviour, keep as-is)
  this.setCapabilityValue('alarm_generic', hasError).catch(this.error);

  // Fire the enriched trigger with descriptive tokens
  if (hasError) {
    this.homey.flow.getDeviceTriggerCard('vacuum_error_occurred')
      .trigger(this, {
        error_code:        errorCode,
        error_key:         error.key,
        error_description: error.en,
      })
      .catch(this.error);
  }
}


// ── ADD TO: wherever you update consumable capability values ─────────────────
// Call this method each time you receive a new consumable life percentage
// (from polling or MQTT push).

_checkConsumableThreshold(key, lifePercent) {
  const consumable = findConsumable(key);
  if (!consumable) return;

  if (lifePercent <= ALERT_THRESHOLD && !this._consumableAlertFired.has(key)) {
    this._consumableAlertFired.add(key);
    this.log(`[consumable] alert: ${key} at ${lifePercent}%`);

    this.homey.flow.getDeviceTriggerCard('consumable_low')
      .trigger(this, {
        consumable_name: consumable.name.en,
        consumable_key:  key,
        consumable_life: Math.round(lifePercent),
      })
      .catch(this.error);
  }

  // Reset the fired flag once the consumable is replaced (life well above threshold)
  if (lifePercent > ALERT_THRESHOLD + 5) {
    this._consumableAlertFired.delete(key);
  }
}
