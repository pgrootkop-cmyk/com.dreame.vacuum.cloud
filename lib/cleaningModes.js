'use strict';

/**
 * Dreame cleaning mode value resolver.
 *
 * IMPORTANT — SWEEPING/MOPPING SWAP:
 * For robots with mop_pad_lifting (combo dock = self-wash + auto-empty),
 * Dreame swaps API values 0 (SWEEPING) and 2 (MOPPING) on the wire.
 * This affects: X40 Ultra, X50 Ultra, L20 Ultra, and all modern combo-dock robots.
 *
 * Source: Tasshack/dreame-vacuum device.py, property mop_pad_lifting.
 * Confirmed by Pjotr Grootkop in Homey Community Forum, March 21 2026.
 */

const CLEANING_MODES = {
  sweeping:             0,
  mopping:              2,
  sweeping_and_mopping: 3,
  vacuum_then_mop:      4,
};

/**
 * Resolve a cleaning mode string to the correct API integer,
 * applying the swap for combo-dock robots automatically.
 *
 * @param {string}  mode            - One of the CLEANING_MODES keys
 * @param {boolean} hasMopPadLifting - true for X40/X50 Ultra, L20 Ultra, etc.
 * @returns {number}
 */
function resolveCleaningModeValue(mode, hasMopPadLifting = false) {
  const value = CLEANING_MODES[mode];
  if (value === undefined) throw new Error(`Unknown cleaning mode: ${mode}`);

  if (hasMopPadLifting && (value === 0 || value === 2)) {
    return value === 0 ? 2 : 0;
  }

  return value;
}

/**
 * Detect whether a device has mop_pad_lifting from its property list.
 * Call once on connect and store the result with setStoreValue().
 *
 * @param {Array} properties - Raw property array from the device info response
 * @returns {boolean}
 */
function detectMopPadLifting(properties) {
  if (!Array.isArray(properties)) return false;
  // MIoT: siid=2, piid=27 — present and defined means the robot has a liftable mop
  return properties.some(p =>
    p.siid === 2 && p.piid === 27 && p.value !== undefined
  );
}

module.exports = { CLEANING_MODES, resolveCleaningModeValue, detectMopPadLifting };
