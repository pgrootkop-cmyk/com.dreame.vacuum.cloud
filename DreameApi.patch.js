'use strict';

/**
 * DreameApi.patch.js
 * ═══════════════════════════════════════════════════════════════════════════
 * This file is NOT a standalone module.
 * It shows EXACTLY what new methods to add to lib/DreameApi.js (or wherever
 * your API client class lives).
 *
 * All methods follow the same pattern as the existing ones in your class.
 * Adjust the sendCommand / sendAction / setProperty call signatures to match
 * your existing wrappers — the logic and parameter values are correct.
 * ═══════════════════════════════════════════════════════════════════════════
 */

class DreameApiAdditions {

  // ── Gap #1: Apply cleaning mode value (with swap already resolved) ─────────
  // Replace your existing setCleaningMode() with this — it receives the
  // final integer value from resolveCleaningModeValue() in device.js,
  // so the swap logic lives in one place only.

  async setCleaningModeValue(value) {
    // Adjust siid/piid to match your existing property IDs
    return this.setProperty(2, 4, value);
  }


  // ── Gap #2: Go to point ────────────────────────────────────────────────────
  // Navigate the robot to a coordinate without cleaning.
  // MIoT: siid=2, aiid=4, in=[{ piid:1, value: "[[x,y]]" }]
  // Source: Tasshack vacuum_goto service

  async gotoPoint(x, y) {
    return this.sendAction({
      siid: 2,
      aiid: 4,
      in: [
        {
          piid:  1,
          value: JSON.stringify([[Math.round(x), Math.round(y)]]),
        },
      ],
    });
  }


  // ── Gap #3: Spot cleaning ──────────────────────────────────────────────────
  // Internally sends a zone cleaning command with a small square around
  // the target point. Matches Tasshack's vacuum_clean_spot implementation.

  async cleanSpot(x, y, radius = 500, repeats = 1) {
    const cx = Math.round(x);
    const cy = Math.round(y);
    const r  = Math.round(Math.max(100, radius));
    // Zone format: [x1, y1, x2, y2, repeats]
    return this.cleanZones([[cx - r, cy - r, cx + r, cy + r, repeats]]);
  }


  // ── Gap #4: Multi-zone batch ───────────────────────────────────────────────
  // Send multiple zones in a single command — same protocol as one zone,
  // just pass an array of arrays.
  // Assumes your existing cleanZone() wraps a single zone; this replaces or
  // extends it to accept an array.

  async cleanZones(zones) {
    if (!Array.isArray(zones) || zones.length === 0) {
      throw new Error('zones must be a non-empty array');
    }
    // Dreame protocol sends all zones as one nested array value
    return this.sendCommand('app_zoned_clean', [zones]);
  }


  // ── Gap #7: Mopping type ───────────────────────────────────────────────────
  // Controls mop pad movement aggressiveness.
  // MIoT: siid=2, piid=8 — Values: 0=standard, 1=deep, 2=quick
  // Source: Tasshack mopping_type property

  async setMoppingType(type) {
    const MOPPING_TYPE = { standard: 0, deep: 1, quick: 2 };
    const value = MOPPING_TYPE[type];
    if (value === undefined) throw new Error(`Unknown mopping type: ${type}`);
    return this.setProperty(2, 8, value);
  }


  // ── Gap #8: Clean rooms in ordered sequence ────────────────────────────────
  // Sends room IDs with an explicit order field so the robot cleans them
  // in the sequence you define, not the order it decides.
  // Source: Tasshack vacuum_clean_segment with cleaning_sequence param

  async cleanSegmentsOrdered(segmentIds, options = {}) {
    const { suction = null, water = null, repeats = 1 } = options;

    const segments = segmentIds.map((id, index) => {
      const seg = { id, order: index + 1, repeats };
      if (suction !== null) seg.suction = suction;
      if (water   !== null) seg.water   = water;
      return seg;
    });

    return this.sendCommand('app_segment_clean', [segments]);
  }


  // ── Gap #9: Rename room segment ────────────────────────────────────────────
  // Renames a room on the robot's internal map.
  // MIoT: siid=6, aiid=2, in=[{ piid:1, value: segmentId }, { piid:2, value: name }]
  // Source: Tasshack vacuum_rename_segment service

  async renameSegment(segmentId, newName) {
    if (!newName || newName.trim().length === 0) {
      throw new Error('Room name cannot be empty');
    }
    return this.sendAction({
      siid: 6,
      aiid: 2,
      in: [
        { piid: 1, value: segmentId },
        { piid: 2, value: newName.trim().substring(0, 32) },
      ],
    });
  }

}
