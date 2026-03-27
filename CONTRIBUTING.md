# Community Contribution — Feature Gaps vs Tasshack HACS Integration

**Based on:** Tasshack/dreame-vacuum v2.0.0b22  
**Tested on:** Dreame X50 Ultra (available for further testing)  
**Forum discussion:** community.homey.app/t/app-pro-dreame-vacuum-cloud/152442

---

## What's in this contribution

| File | Type | Purpose |
|------|------|---------|
| `lib/errorCodes.js` | New | 50+ error codes mapped to descriptive strings |
| `lib/cleaningModes.js` | New | Cleaning mode resolver with SWEEPING/MOPPING swap fix |
| `lib/consumables.js` | New | Consumable metadata and 6% alert threshold logic |
| `device.patch.js` | Patch guide | All changes to add to `drivers/vacuum/device.js` |
| `DreameApi.patch.js` | Patch guide | All new methods to add to `lib/DreameApi.js` |
| `.homeycompose/flow/actions/vacuum_goto_point.json` | New | Go to point card |
| `.homeycompose/flow/actions/vacuum_clean_spot.json` | New | Spot cleaning card |
| `.homeycompose/flow/actions/vacuum_clean_zones_multi.json` | New | Multi-zone batch card |
| `.homeycompose/flow/actions/vacuum_set_mopping_type.json` | New | Mop scrubbing mode card |
| `.homeycompose/flow/actions/vacuum_clean_rooms_sequence.json` | New | Room cleaning sequence card |
| `.homeycompose/flow/actions/vacuum_rename_room.json` | New | Room rename card |
| `.homeycompose/flow/triggers/vacuum_error_occurred.json` | Updated | Adds error_code, error_key, error_description tokens |
| `.homeycompose/flow/triggers/consumable_low.json` | Updated | Adds consumable_name, consumable_key, consumable_life tokens |

---

## How to apply

### Step 1 — Copy the three new lib files directly

```
lib/errorCodes.js     → copy as-is
lib/cleaningModes.js  → copy as-is
lib/consumables.js    → copy as-is
```

### Step 2 — Copy the six new flow action JSON files directly

```
.homeycompose/flow/actions/vacuum_goto_point.json          → copy as-is
.homeycompose/flow/actions/vacuum_clean_spot.json          → copy as-is
.homeycompose/flow/actions/vacuum_clean_zones_multi.json   → copy as-is
.homeycompose/flow/actions/vacuum_set_mopping_type.json    → copy as-is
.homeycompose/flow/actions/vacuum_clean_rooms_sequence.json → copy as-is
.homeycompose/flow/actions/vacuum_rename_room.json         → copy as-is
```

### Step 3 — Merge the two trigger JSON files

These add new `tokens` arrays to existing trigger cards.  
Open your current trigger JSONs and add the `tokens` block shown in each file.

### Step 4 — Apply the patch guides

`device.patch.js` and `DreameApi.patch.js` are **not standalone modules** — they are annotated guides showing exactly what to add to your existing files.

Each section starts with a comment:
```
// ── ADD TO: <location> ──────────────────────
```

Follow them top to bottom. The code is ready to copy — only the `setProperty` / `sendAction` / `sendCommand` call signatures may need adjusting to match your existing wrappers.

---

## Change-by-change notes

### Gap #1 — SWEEPING/MOPPING swap fix (Bug)

Robots with a combo dock (mop_pad_lifting) have values 0 and 2 swapped on the wire.  
This affects: X40 Ultra, X50 Ultra, L20 Ultra, and all modern combo-dock robots.

**Where:** `lib/cleaningModes.js` → `resolveCleaningModeValue(mode, hasMopPadLifting)`  
**How:** Call `detectMopPadLifting(properties)` once on connect, store with `setStoreValue('hasMopPadLifting', ...)`, then pass the stored value to `resolveCleaningModeValue` wherever you currently set the cleaning mode.

> Confirmed by Pjotr in the forum on March 21, 2026.

---

### Gap #2 — Go to point

Navigates the robot to a coordinate without cleaning. Most requested feature in the forum thread (krl69, March 21 — "the way I do it today is to create a zone as small as possible and press pause").

**New method:** `DreameApi.gotoPoint(x, y)` → MIoT siid=2, aiid=4  
**New flow card:** `vacuum_goto_point` — two number args (x, y)

---

### Gap #3 — Spot cleaning

Cleans a small area around a coordinate. Internally sends a zone with a square bounding box `[x-r, y-r, x+r, y+r]` — same approach as Tasshack.

**New method:** `DreameApi.cleanSpot(x, y, radius, repeats)` — delegates to `cleanZones()`  
**New flow card:** `vacuum_clean_spot` — four args (x, y, radius, repeats)

---

### Gap #4 — Multi-zone batch cleaning

Sends multiple zones in a single robot command instead of one at a time. Matches what Tasshack does natively via `app_zoned_clean` with a nested array.

**Updated method:** `DreameApi.cleanZones(zones)` — now accepts array of zone arrays  
**New flow card:** `vacuum_clean_zones_multi` — accepts comma-separated zone names, resolves them from stored zones, builds the batch payload

---

### Gap #5 — Descriptive error codes

Maps 50+ error integers to human-readable strings matching the Dreame Home app.  
Adds three tokens to the existing `vacuum_error_occurred` trigger: `error_code`, `error_key`, `error_description`.

**New file:** `lib/errorCodes.js`  
**Usage:** Call `resolveError(code)` in your existing error handler before firing the trigger.

---

### Gap #6 — Consumable alert at exactly 6%

Matches the Dreame Home app threshold (6%). Adds three tokens to the existing `consumable_low` trigger: `consumable_name`, `consumable_key`, `consumable_life`.

**New file:** `lib/consumables.js`  
**Usage:** Call `_checkConsumableThreshold(key, lifePercent)` wherever you currently update consumable capability values.  
**Note:** Uses a `Set` to avoid firing the same alert repeatedly within one replacement cycle.

---

### Gap #7 — Mopping type (scrub mode)

Controls mop pad movement aggressiveness: Standard / Deep / Quick.  
This is the `mopping_type` property (MIoT siid=2, piid=8) — separate from `cleaning_mode`.

**New method:** `DreameApi.setMoppingType(type)` → values {standard:0, deep:1, quick:2}  
**New flow card:** `vacuum_set_mopping_type` — dropdown with 3 options

---

### Gap #8 — Room cleaning sequence

Sends room IDs with an explicit `order` field so the robot cleans in the sequence you define.

**New method:** `DreameApi.cleanSegmentsOrdered(segmentIds, options)`  
**New flow card:** `vacuum_clean_rooms_sequence` — comma-separated room IDs in desired order

---

### Gap #9 — Room rename

Renames a room segment on the robot's internal map. Name propagates to the Dreame Home app.

**New method:** `DreameApi.renameSegment(segmentId, newName)` → MIoT siid=6, aiid=2  
**New flow card:** `vacuum_rename_room` — room ID + new name text args

---

## MIoT property/action IDs

All siid/piid/aiid values in the patch files come from Tasshack's reverse engineering of the DreameHome protocol. If your API wrapper uses different IDs or a higher-level abstraction, adjust the values accordingly — the command logic and parameter structure are correct.

## Testing

- **Dreame X50 Ultra available** for testing any of these features
- Gap #1 (swap fix) can be verified immediately — sweeping mode should actually sweep
- Gap #2 (go-to-point) can be verified by sending the robot to a known map coordinate
- Gaps #3–#4 build on the existing zone infrastructure and can reuse the same test setup
