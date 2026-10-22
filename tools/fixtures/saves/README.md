# Save fixtures (plan §3.5 rule 8; owner WP1)

Each `*.json` here is one save a browser may hold when Phase 7 boots for the first time: an rc4 blob
(save v1), a v2 blob, both, a corrupt one or none. `tools/save-migrate.mjs` (WP7) seeds them, boots the
game and checks the result with `check.mjs` next to this file; `tools/quest-derive.mjs` (WP1) runs the
same fixtures through the pure migration and derivation in Node. `npm run playtest -- --save
tools/fixtures/saves/rc4-mid.json` plays on from one.

| File | §3.5 rule 8 case |
|---|---|
| `fresh.json` | fresh (no save) |
| `rc4-mid.json` | mid-route (7 stamps, one skipped, M1 geprüft, M2 bereit, M3 in Arbeit) |
| `rc4-18of18.json` | 18/18 with the Startprüfung signed (Entdecker: still not armed, D23) |
| `rc4-finale-dusk.json` | finale ended + dusk (lands grounded, sky day, the lift-off still ahead, D38) |
| `rc4-entscheider.json` | Entscheider, six ◆ + F3 (the Bodencrew supplies AKKU and NAV at once: armed) |
| `rc4-griffe.json` | griffe ◆ earned (a retired station: to `legacy`, test entry in `retired`) |
| `corrupt.json` | corrupt JSON (read-only, nothing written) |
| `v2-present.json` | v2 already present (v2 wins, v1 untouched) |
| `rc4-unknown-field.json` | a v1 blob with unknown fields (kept) |

## Format

```jsonc
{
  "name": "rc4-mid",
  "rule": "§3.5 rule 8 · mid-route",
  "about": "one line for the report",
  "params": "mode=entdecker",               // appended to the harness URL (with ?skipIntro=1)
  "retired": [],                            // test entries for src/systems/retired.ts: the harness adds
                                            // `&retired=<id,id>` (params.ts; union with RETIRED)
  "storage": {                              // localStorage keys under the prefix 'emai-academy-island/v1:'
    "progress": { "v": 1, … },              // an object/array/number is stored as JSON.stringify(value),
    "progress.v2": "…"                      // a string is stored raw (that is how corrupt.json is corrupt)
  },
  "expect": { … }                           // see below; every field is optional
}
```

## What the harness does (one fresh browser context per fixture)

1. `addInitScript` writes `storage` into localStorage once (guard it, so the reload in step 4 does not
   re-seed), then open `/?skipIntro=1&<params>[&retired=…]` and wait for `__academy.ready`.
2. Read `before = { v1, v2 }` (the raw strings of the two keys **as seeded**) and
   `save = __academy.ext('save')()` → `checkFixture(fx, { save, before, after: null }, 'boot')`.
3. A short v2 session: change something persistent, e.g.
   `__academy.game.progress.setZoneValue('world', 'p7.test', 1)`, then wait ≥ 300 ms (saves are debounced).
4. Reload (same URL), wait for `ready`, read `after = { v1, v2 }` and `save` again →
   `checkFixture(fx, { save, before, after }, 'reload')`.
5. Report the returned failure strings (empty = pass) and the `notes` (adjustments, see below).

`checkFixture(fx, obs, phase)` returns `{ failures: string[], notes: string[] }`.

## `__academy.ext('save')()` (src/core/quest/wire.ts)

`{ key, v1Key, source: 'fresh'|'v1'|'v2'|'corrupt'|'error', readOnly, error, retired: string[],
revs: { '<area>.<station>': rev }, kinds: { '<area>': 'lobe'|'hall'|'site' }, systemAreas: { M1:
'sensordom', … }, data: <the v2 data in memory>, quest: <ctx.quest.snapshot()>, islandStamps, allStamps, pool, stars }`

## `expect` fields

| Field | Meaning |
|---|---|
| `source` | at boot: where the save came from (`fresh`, `v1` migrated, `v2` as stored, `corrupt`, `error` = migrate threw). After the reload a migrated save reads `v2` |
| `readOnly` | the failure path (rule 2): the game runs in memory and never writes |
| `v2Written` | after the session the v2 key holds a `v: 2` blob (false: the v2 key is unchanged) |
| `v1Unchanged` | the v1 key is byte-identical after the session (checked for every fixture anyway) |
| `islandStamps`, `allStamps` | earned (not skipped) stamps, scope `'island'` / `'all'` |
| `legacyStamps`, `legacyChallenges`, `legacyPredictions` | exact id sets in `data.legacy` |
| `secrets` | number of found secrets |
| `mode` | the saved audience mode |
| `flight`, `liftoffSeen` | `quest.flight.state`, `quest.flight.liftoffSeen` |
| `start` | `{ glideSeen, probestart }` of the quest snapshot |
| `systems` | partial `{ M1: 'geprueft', AKKU: 'bereit', T3: 'aus', … }` |
| `lift`, `energy`, `nav` | `quest.start.lift`, `quest.start.energy` (partial), `quest.start.nav` (partial) |
| `startklar`, `armed`, `kielOpen`, `regionOpen`, `f3Signed` | the quest snapshot's flags |
| `crew` | the exact `quest.groundCrew` list as `"<id>:<reason>"` strings, sorted |
| `world` | exact values of island keys in `data.zoneData.world` (`sky`, `logoShown`, `liftAt` …) |
| `worldAbsent` | island keys that must be gone (`ascentSeen`) |
| `keep` | `[{ "path": ["zoneData", "world", "p7.quest", "seenBeats"], "value": ["M1"] }]`: deep-equal values at array paths of `data` (unknown fields survive) |
| `pool`, `stars` | the star pool (84) and the mastery stars (pool stations + F1) |

## Adjustments (so the fixtures stay valid while stations retire and goals change)

The rc4 blobs hold rc4 stamps. When a later WP retires a station (WP5 `regelgarten.tausend-welten`, WP8
`greifwerkstatt.griffe`) or bumps a station's `rev` (WP6, WP8), the effective lists in `save.retired`
and `save.revs` grow. `check.mjs` then adjusts instead of failing: an extra retired stamp that the
fixture holds is expected in `legacy` and no longer in the stamp counts or `logoShown`; the derived
system checks of its area (and the gate flags) are skipped; a record whose `rev` changed is expected in
`legacy.challenges` and the `stars` check is skipped. Each adjustment is reported as a note.
