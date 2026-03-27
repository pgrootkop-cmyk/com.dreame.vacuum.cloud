'use strict';

/**
 * Dreame vacuum error code map.
 *
 * Source: Tasshack/dreame-vacuum v2.0.0b22 — DreameVacuumErrorCode enum (device.py)
 * These strings match exactly what the official Dreame Home app displays.
 *
 * Usage:
 *   const { resolveError } = require('./errorCodes');
 *   const error = resolveError(23);
 *   // → { key: 'garbage_container_full', en: 'Dustbin full — empty bin' }
 */

const ERROR_CODES = {
  0:  { key: 'none',                      en: 'No error' },
  1:  { key: 'drop',                      en: 'Drop detected — cliff sensor triggered' },
  2:  { key: 'collision',                 en: 'Collision detected' },
  3:  { key: 'wheels_stuck',              en: 'Wheels stuck' },
  4:  { key: 'crash_bar_stuck',           en: 'Crash bar stuck' },
  5:  { key: 'filter_blocked',            en: 'Filter clogged' },
  6:  { key: 'magnetic_field',            en: 'Magnetic field interference' },
  7:  { key: 'low_battery',              en: 'Low battery — cannot return to dock' },
  8:  { key: 'charging_error',            en: 'Charging error' },
  9:  { key: 'battery_error',             en: 'Battery error' },
  10: { key: 'fan_error',                 en: 'Fan error' },
  11: { key: 'main_brush_stuck',          en: 'Main brush stuck' },
  12: { key: 'charge_sensor_dirty',       en: 'Charging sensor dirty' },
  13: { key: 'dustbin_missing',           en: 'Dustbin not attached' },
  14: { key: 'downward_sensor_dirty',     en: 'Downward sensor dirty' },
  15: { key: 'wall_sensor_dirty',         en: 'Wall sensor dirty' },
  16: { key: 'unable_to_return',          en: 'Unable to return to dock' },
  17: { key: 'unable_to_charge',          en: 'Unable to start charging' },
  18: { key: 'side_brush_stuck',          en: 'Side brush stuck' },
  19: { key: 'fan_stuck',                 en: 'Fan stuck' },
  20: { key: 'left_wheel_stuck',          en: 'Left wheel stuck' },
  21: { key: 'right_wheel_stuck',         en: 'Right wheel stuck' },
  22: { key: 'radar_point_missing',       en: 'LiDAR sensor error' },
  23: { key: 'garbage_container_full',    en: 'Dustbin full — empty bin' },
  24: { key: 'mop_pad_not_installed',     en: 'Mop pad not installed' },
  25: { key: 'mop_pad_missing',           en: 'Mop pad missing or detached' },
  26: { key: 'filter_missing',            en: 'Filter not installed' },
  27: { key: 'tank_missing',              en: 'Water tank not attached' },
  28: { key: 'tank_low',                  en: 'Clean water tank empty or low' },
  29: { key: 'carpet_boost_fail',         en: 'Carpet boost failed — check for obstacles' },
  30: { key: 'positioning_failed',        en: 'Positioning failed — try mapping again' },
  31: { key: 'unable_to_return_dock',     en: 'Cannot reach dock' },
  32: { key: 'laser_sensor_error',        en: 'LiDAR sensor error' },
  33: { key: 'front_sensor_error',        en: 'Front sensor error' },
  34: { key: 'psd_sensor_error',          en: 'PSD sensor error' },
  35: { key: 'auto_empty_bag_full',       en: 'Auto-empty bag full — replace bag' },
  36: { key: 'auto_empty_hose_blocked',   en: 'Auto-empty hose blocked' },
  37: { key: 'auto_empty_no_suction',     en: 'Auto-empty failed — no suction' },
  38: { key: 'stuck_5_minutes',           en: 'Robot stuck for 5 minutes' },
  39: { key: 'dirty_water_tank_full',     en: 'Dirty water tank full — empty it' },
  40: { key: 'dirty_water_tank_blocked',  en: 'Dirty water drain blocked' },
  41: { key: 'clean_water_tank_empty',    en: 'Clean water tank empty' },
  42: { key: 'detergent_empty',           en: 'Detergent empty' },
  43: { key: 'hot_water_error',           en: 'Hot water system error' },
  44: { key: 'mop_wash_error',            en: 'Mop washing error' },
  45: { key: 'dock_drainage_error',       en: 'Dock drainage error' },
  46: { key: 'airseal_error',             en: 'Air seal error' },
  47: { key: 'dock_heating_error',        en: 'Dock heating error' },
  48: { key: 'radar_sensor_missing',      en: 'LiDAR not detected' },
  49: { key: 'station_self_test_fail',    en: 'Dock self-test failed' },
  50: { key: 'dock_map_fail',             en: 'Dock positioning failed' },
};

/**
 * Resolve an error code integer to its key and description.
 * Always returns a valid object — unknown codes get a generated key.
 *
 * @param {number} code
 * @returns {{ key: string, en: string }}
 */
function resolveError(code) {
  return ERROR_CODES[code] || {
    key: `unknown_${code}`,
    en:  `Unknown error (code ${code})`,
  };
}

module.exports = { ERROR_CODES, resolveError };
