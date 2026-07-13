# v1.0.1 issue drafts

Post these with the **pgrootkop-cmyk** account (`gh auth login`, then run the commands below).
Milestone first:

```sh
gh api repos/pgrootkop-cmyk/com.dreame.vacuum.cloud/milestones \
  -f title="v1.0.1" \
  -f description="Stabilization release: fix v1.0.0 test regressions before promoting to stable."
```

Then for each issue: `gh issue create --repo pgrootkop-cmyk/com.dreame.vacuum.cloud --milestone v1.0.1 --title "..." --body-file <section>`.
Existing issues to add to the milestone instead of duplicating: **#38** (widgets), **#40** (Australia region).

---

## Issue 1 — Multi-floor: "Switch to floor" does not switch the map on the device, creates phantom maps

**Source:** forum posts [#80](https://community.homey.app/t/152442/80), [#82](https://community.homey.app/t/152442/82), [#83](https://community.homey.app/t/152442/83), [#95](https://community.homey.app/t/152442/95) — 3 independent reporters (X50 Ultra, D10 Plus Gen 2). App version: v1.0.0 test.

Symptoms:
- Running the "Switch to floor" flow card starts a **new mapping run** instead of selecting the saved map; the Dreame app stays on the previous map selection.
- Failed switches create duplicate phantom floors ("I now already have three floors with the same rooms").
- Robot got lost after multi-floor use: cleaning took 220 min instead of 78.
- Shortcuts still execute against the previously selected map after a floor switch.
- Workaround confirmed by reporter: selecting the map in the Dreame phone app first makes the flow work.

Also requested (forum [#88](https://community.homey.app/t/152442/88)): an option to **disable multi-floor management** entirely.

## Issue 2 — CleanGenius mode cannot be set via flow cards

**Source:** forum [#77](https://community.homey.app/t/152442/77), [#91](https://community.homey.app/t/152442/91) (X50 Ultra, v1.0.0).

Changing CleanGenius settings via flow does nothing; every setting results in "vacuum & mop" instead of "mop after vacuum".

## Issue 3 — Dock state capability stuck on "idle"; "Dock state changed" trigger never fires

**Source:** forum [#80](https://community.homey.app/t/152442/80) (X50 Ultra, v1.0.0).

The dock state capability never leaves "idle", so the new v1.0.0 trigger card is dead.

## Issue 4 — "Room cleaning finished" trigger never fires

**Source:** forum [#94](https://community.homey.app/t/152442/94) (L20 Ultra).

The per-room finished trigger never fires, so room-by-room automations can't advance. (Zone/waypoint finished triggers were fixed in v0.0.32; the room variant appears broken.)

## Issue 5 — "Clean rooms" card: selecting a second room by name removes the first; per-card suction/water settings ignored

**Source:** forum [#79](https://community.homey.app/t/152442/79), [#80](https://community.homey.app/t/152442/80), [#85](https://community.homey.app/t/152442/85) (X50 Ultra, v1.0.0).

- Multi-select by room name is impossible: picking "Woonkamer" after "Keuken" removes "Keuken". Works with the room-IDs card.
- Per-card suction/water overrides are not applied ("clean room strong suction" stays on standard).

## Issue 6 — Shortcuts flow card: autocomplete list is empty

**Source:** forum [#105](https://community.homey.app/t/152442/105) (2026-07-12, latest post).

The "run shortcut" action shows an empty shortcuts list even though the user has many shortcuts in the Dreame app. Possibly related: shortcuts don't follow the selected map (forum #95/#97).

## Issue 7 — Sweeping / Sweeping & Mopping swapped again on L20 Ultra in v1.0.0 (regression of #36)

**Source:** forum [#75](https://community.homey.app/t/152442/75) (L20 Ultra, v1.0.0); regression of #36 (fixed in v0.0.33 for v0.0.x).

- "Set cleaning mode to Sweeping & Mopping" switches the robot to Sweeping and vice versa.
- "Start with Sweeping" card starts the last-used cleaning task instead of sweeping.

Root cause area: combo-dock (mop_pad_lifting) wire values 0/2 swap; verify detection logic against Tasshack v1.0.11.
