# Publication QA checklist

Pre-submission checks for App Store releases, distilled from Athom's review feedback
(July 2026 rejection) and the official guidelines. Run through this before every
`homey app publish` → certification submission.

Sources:
- App Store guidelines: https://apps.developer.homey.app/app-store/guidelines
- Permissions: https://apps.developer.homey.app/the-basics/app/permissions

## Hard blockers (these caused rejections)

- [ ] **No `homey:manager:api` permission.** Device-brand apps get rejected for it —
  it's reserved for Tools-category apps (HomeyScript, group apps). For widget device
  resolution use the runtime `device.__id` property (equals the UUID that
  `Homey.getDeviceIds()` returns in widgets; verified on Homey Pro, see
  `app.js _findVacuumDevice`). Never reintroduce `homey-api`/`createAppAPI` for this.
- [ ] **`README.txt` is plain text, 1–2 paragraphs.** Forbidden: markdown (`**bold**`,
  headers), numbered setup instructions, bullet-point feature lists, URLs of any kind,
  links to other App Store apps, contributor credits, changelogs. It must be an
  engaging summary of what the app does for the user — not documentation.
  (`README.md` is for GitHub only and may contain all of that.)
- [ ] **`description` in `.homeycompose/app.json` is a tagline, not a category label.**
  One short engaging sentence ("Spotless floors, without lifting a finger"), never
  "Adds support for X" or "<Brand> Vacuum Control", never repeating the app name.

## Other review rules to keep satisfied

- [ ] App name ≤ 4 words; no protocol names (Zigbee/Z-Wave/Matter) or Homey/Athom
  trademarks in the name.
- [ ] Changelog lives in `.homeychangelog.json` only (never in README.txt); write it
  for end users, not developers.
- [ ] App images: real-world/branded imagery, not a flat icon on a monochrome
  background. Driver images: actual device on white background.
- [ ] App icon: vector, transparent background, no gradients, uses the full canvas.
- [ ] No spelling errors anywhere user-visible (rejection-worthy on its own).
- [ ] `homey app validate --level publish` passes with no warnings you can't justify.

## Release train (the process that works)

1. One branch per fix/feature (`fix/vX.Y.Z-topic`), merge to `main` when done.
2. Bump `version` in **both** `app.json` and `.homeycompose/app.json`; add the
   `.homeychangelog.json` entry (user-facing wording).
3. `homey app validate` (publish level) + `homey app install` for a local smoke test.
4. `homey app publish` → creates a Build (Draft) → dashboard "Publish to Test":
   https://tools.developer.homey.app/apps/app/com.dreame.vacuum.cloud
5. Ask the affected forum users to verify on the test channel:
   https://homey.app/a/com.dreame.vacuum.cloud/test/
6. Only after confirmations: "Submit for Certification" (→ Live). Reply to reviewer
   feedback in the dashboard; every resubmission needs a new version number.

## App-specific gotchas

- Widgets resolve devices via `app.js _findVacuumDevice` matching `getData().id`
  (Dreame DID) or `device.__id` (Homey UUID). `device.id` does NOT exist at runtime.
- The capability probe must run via the relay endpoint, never the cloud cache
  (cloud cache returns error codes on cache misses → features wrongly disabled).
- Cleaning-mode wire values 0/2 are swapped per dock type with a per-device
  override setting — don't "fix" one model globally (see README.md FAQ).
