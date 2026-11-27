# CrazyGames Pre-Submission Red-Team Audit & Go/No-Go Certification — Ricochet Miner

**Audit Date:** 2026-11-27  
**Target Artifact:** `release/ricochet-miner-crazygames.zip` (`dist/crazygames/` production bundle)  
**Supporting Artifacts Verified:** `release/ricochet-miner-standalone.zip`, `marketing-assets/ready/covers/*`, `marketing-assets/ready/screenshots/*`, `marketing-assets/ready/videos/*`  
**Audit Method:** Two-pass adversarial red-team inspection (baseline audit -> full P0/P1 remediation across source, tests, & capture scripts -> clean rebuild of CrazyGames & Standalone bundles + marketing assets -> post-fix Playwright `DPR: 1` re-certification under `/subpath/game/` iframe simulation).

---

## 1. FINAL VERDICT: `GO`

**Unconditional `GO` for CrazyGames Basic Launch Submission.**  
Every P0 rejection blocker and P1 UX/visual/localization polish gap surfaced during the baseline red-team pass has been fixed in source, unit-tested, rebuilt into `release/ricochet-miner-crazygames.zip`, and re-verified on unpacked Chromium (`devicePixelRatio: 1`) with zero console/HTTP errors, zero leaked audio nodes, zero clipped modals, and clean marketing captures.

| Evaluation Dimension | Score (1–10) | Justification |
| :--- | :---: | :--- |
| **Visual Appeal & Art Cohesion** | **9.0 / 10** | Native painterly Biome 1–6 block sets, timber/steel/obsidian/quantum shaft framing, glowing bumpers, weak-point 2.0x Boss Gate reticles, and reflected seamless rock flanks across all 6 biomes. Zero chroma-key halos or Gemini watermarks observed. |
| **Core Gameplay & Active Agency** | **9.0 / 10** | Crisp single-aim ricochet physics, deterministic at 60/144/165 Hz (`fps-check.ts`), meaningful mid-flight agency via **Mag-Pulse Slam (`Space`)** and **Overclock Spin (`E`)**, plus Companion Drone, 9 Sawblade passives, 10 Vault Relics, 6 Biomes, and endless Tier I–IV+ Hall of Ascension. |
| **Audio & Game-Feel Juice** | **9.0 / 10** | 49 audio cues decoded with `0` HTTP 404s and `0` `decodeFailures`; 4 biome-reactive BGM tracks (`bgm_surface`, `bgm_deep`, `bgm_biome_5`, `bgm_biome_6`); static stereo pan buckets eliminate per-hit `StereoPannerNode` allocations (`10` total across 60s chaos vs. `1161` baseline). |
| **Expected CrazyGames Engagement** | **8.8 / 10** | `724ms` boot-to-playable (`1.75 MB` initial download), 1-click aim & launch right into TNT clusters (Run 1 yields 49–79 coins, affording immediate Lv 1–2 Damage upgrade at 25c), healthy geometric progression to Biome 1 Boss Gate by Run 5, and full 9-locale coverage (`en`, `ru`, `es`, `pt`, `fr`, `de`, `tr`, `ja`, `ko`). |
| **Technical & Policy Compliance** | **9.5 / 10** | Full CrazyGames SDK v3 lifecycle (`init`, `loadingStart`/`Stop`, `gameplayStart`/`Stop`), zero dead `(AD)` buttons in `disabled`/AdBlock modes, strict `?muteAudio=true` & listener priority (`masterGain === 0`), zero custom fullscreen buttons, `20px` shop banner margin & auto-hide `< 490px` height. |

---

## 2. CrazyGames Compliance Scorecard (Pillars 1, 2, and 5)

| Requirement | Status | Concrete Post-Fix Evidence |
| :--- | :---: | :--- |
| **ZIP Root & Relative Paths** | **PASS** | Unpacked `release/ricochet-miner-crazygames.zip` places `index.html` at archive root; `vite.config.ts` uses `base: './'`; served under nested subpath `/subpath/game/` with `httpErrors: []`. |
| **Zero Dev / Raw Leaks** | **PASS** | `FINAL_FILE_COUNT=176` (`1 .html`, `1 .js`, `2 .woff2`, `124 .webp`, `15 .mp3`, `33 .wav`). Zero `.ogg`, zero `.map`, zero `raw-assets/`, `raw-audio/`, `marketing-assets/`, `DebugOverlay`, `qaButtonCount: 0`. |
| **Bundle Size & Initial Download Caps** | **PASS** | ZIP: `7,105,845 B` (`6.78 MB`); Unzipped: `7,489,489 B` (`7.14 MB` vs. `250 MB` limit). First `gameplayStart`: `1,832,267 B` (`1.75 MB` vs. `20 MB` Mobile Homepage cap); `bootToPlayableMs: 724`. |
| **External Network & Console Safety** | **PASS** | Only external request: `https://sdk.crazygames.com/crazygames-sdk-v3.js`. `consoleErrors: []`, `pageErrors: []`, `httpErrors: []`. Incognito `localStorage` `SecurityError` boots cleanly with zero errors. |
| **SDK v3 Init, Timeout & Event Sequence** | **PASS** | `CrazyGamesAdapter.ts` awaits `SDK.init()` before cloud load/gameplay with 3000ms timeout (`tests/sdk-compliance.test.ts` 11/11 passed). Live trace: `init -> loadingStart -> loadingStop -> gameplayStart -> gameplayStop -> gameplayStart` (`OfflineModal` defers `gameplayStart` until `[data-act="collect"]`). |
| **Platform Mute Priority (`?muteAudio=true`)** | **PASS** | `adblockAndMute.muteCheck` verified `masterGainValue: 0` and `hudShowsMuted: true` even after clicking `[data-hud="mute"]`. |
| **Zero Prohibited Browser APIs / Controls** | **PASS** | `Select-String` across `src/**/*.ts` found `0` matches for `maxTouchPoints`, `ontouchstart`, `requestFullscreen`, `Escape`, or external `https?://` store/promo links. Non-Escape pause works via HUD button & `P` (`pauseModalVisible: true`); `Space` blurs focused HUD buttons (`spaceAfterMuteBtnToggledMute: false`). |
| **Localization (All 9 Locales)** | **PASS** | `src/i18n/translations.ts` defines all 210 keys explicitly across `en`, `ru`, `es`, `pt`, `fr`, `de`, `tr`, `ja`, `ko` with zero `...EN_STRINGS` fallbacks; Playwright Settings sweep confirmed `hasUndefined: false` for all 9 locales. |
| **Zero Dead Ad Buttons & Gameplay Ad Ban** | **PASS** | `basicLaunchDisabled` (`environment: 'disabled'`): `upgAdBtns: 0`, `skinAdBtns: 0`, `bannerVisibleInDisabled: "hidden"`. `adblockAndMute`: `adblockShopAdBtns: 0`, `adblockSkinAdBtns: 0`. During `RUNNING`: `activeAdButtonsInRunning: 0`. |
| **In-Game Shop Banner Rules** | **PASS** | `#rm-shop-banner-slot` (`430x50` on `907x510`, `320x50` on `360x800`, hidden `0px` `< 490px` height & `< 320px` width): `borderStyle: "none"`, `text: ""`, `gapFromScrollArea: 20` (`20px`), `minGapFromButtons: 27.8px`, `bannersCleared: 2` on modal close. |
| **60/144/165 Hz Physics Determinism** | **PASS** | Fixed-timestep accumulator in `GameLoop.ts` + deterministic run (`tmp-preflight/fps-check.ts`): identical final state at 60/144/165 fps (`{"x":407.4,"y":462.5791,"bouncesLeft":0,"destroyed":17}`). |
| **60s Chromebook Stress & Audio Leak Check** | **PASS** | `60s` Multi-Orb + TNT + Drone stress run: `3611` frames, `p50Ms: 16.7`, `p95Ms: 16.7`, `maxMs: 33.4`, `heapDeltaMB: 0` (`10.00 MB` flat), `createdContexts: 1`, `stereoPannersCreated: 10`, `decodeFailures: 0`. |
| **3 Mandatory CrazyGames Covers** | **PASS** | Verified exact dimensions & `channels=3` (`hasAlpha=false`): `cover_landscape_1920x1080.png` (`4,725,654 B`), `cover_portrait_800x1200.png` (`2,309,547 B`), `cover_square_800x800.png` (`1,534,434 B`). Zero borders, zero unrequested promo text, zero watermarks. |
| **2 Mandatory Preview Videos (`16:9` & `2:3`)** | **PASS** | `ffmpeg` inspection: `ricochet_miner_preview_16x9_1080p.mp4` (`1920x1080`, `h264 High`, `yuv420p`, `30 fps`, `18.50s`, `19.39 MB`); `ricochet_miner_preview_2x3_portrait.mp4` (`800x1200`, `h264 High`, `yuv420p`, `30 fps`, `18.50s`, `9.83 MB`). Zero black frames, zero letterboxing, zero cursor, zero frozen Perk Draft modals. |

---

## 3. P0 — HARD REJECTION BLOCKERS (All Baseline Blockers Fixed & Verified)

During the initial baseline audit, **3 P0 blockers** were identified and fixed before final packaging:

1. **P0 [RESOLVED] — `AudioEngine.ts` Per-Call `StereoPannerNode` Leak (`1161` nodes / 60s):**
   - **Baseline Defect:** `playHit`, `playCrunch`, and `playPassiveCue` in `src/audio/AudioEngine.ts` called `ctx.createStereoPanner()` per SFX trigger and passed that node into `playSample(..., destNode)`, which bypassed `ownDest` cleanup and could leak active Web Audio nodes under Chromebook memory pressure.
   - **Fix Applied:** Replaced dynamic panner creation in `src/audio/AudioEngine.ts` with 7 pre-allocated static stereo pan buckets (`[-0.42, -0.28, -0.14, 0, 0.14, 0.28, 0.42]`) routed directly to `sfxGain`, removed `[dest]` from `registerVoice` `extraNodes`, and added regression test in `tests/audio.test.ts`.
   - **Post-Fix Verification:** Live 60s chaotic Playwright run measured `stereoPannersCreated: 10` total (`heapDeltaMB: 0`, `p95Ms: 16.7`).

2. **P0 [RESOLVED] — Frozen `VAULT RELIC DRAFT` Modal in Marketing Preview Videos & `04_boss_gate_fight.png`:**
   - **Baseline Defect:** `scripts/capture-marketing.mjs` never clicked `[data-perk]` when a Relic Draft triggered mid-shot, freezing `04_boss_gate_fight.png`, `16x9` frames `10.0s–18.4s`, and `2x3` frames `5.0s–18.4s` behind the modal.
   - **Fix Applied:** Added `dismissPerkDraftIfOpen` and `waitHandlingPerks` helpers in `scripts/capture-marketing.mjs` (plus relaunch handling) and re-ran `npm run marketing:capture`.
   - **Post-Fix Verification:** Visually inspected `04_boss_gate_fight.png` and keyframes (`t0.0`, `t5.0`, `t10.0`, `t15.0`, `t18.3` across both MP4s) — active Boss Gate battle, Crystal Caverns, Elevator modal, and Run Complete flow smoothly with zero frozen drafts.

3. **P0 [RESOLVED] — Shop Banner Separation (`8px` < `15–20px` Minimum) & Mobile Description Truncation:**
   - **Baseline Defect:** `#rm-shop-banner-slot` sat only `8px` below `.rm-scroll-area` on desktop modals, squeezed the 4th card at `800x450`, and `.rm-upg-desc` had `text-overflow: ellipsis` cutting off mobile descriptions on `360x800` and `390x844`. Also `freeUpgradeCandidate` `AdButton` lacked visible `labelHtml`, and green checkmark icon blended on gold `EQUIPPED` button (`03_shop_skins.png`).
   - **Fix Applied:** Added `margin: 12px auto 0 auto` (`margin: 0` when `.suppressed`) on `.rm-banner-slot` in `src/ui/styles.ts` (`8px` flex gap + `12px` = `20px`), raised `MIN_VIEWPORT_HEIGHT_FOR_BANNER_PX` to `490` in `src/ui/ShopOverlay.ts`, removed `nowrap/ellipsis` on upgrade descriptions, passed `i18n.t('free_short')` to free-upgrade `AdButton`, and added a dark `#1a1310` casing stroke to `check` in `src/ui/icons.ts`.
   - **Post-Fix Verification:** Measured `gapFromScrollArea: 20`, `minGapFromButtons: 27.8px`; `vp_360x800_shop.png` renders all upgrade descriptions untruncated; `vp_800x450_shop.png` hides the banner cleanly (`bannerH: 0`); `03_shop_skins.png` check icon is crisp.

**Remaining Open P0 Blockers:** **0.**

---

## 4. P1 — HIGH-IMPACT ENGAGEMENT / POLISH GAPS (All Fixed & Verified)

1. **P1 [RESOLVED] — `Space` Key Accidentally Toggling Focused Mute Button (`InputManager.ts`):**
   - **Baseline Defect:** After clicking HUD Mute or Speed buttons, pressing `Space` triggered browser button activation instead of launching or casting Mag-Pulse.
   - **Fix Applied:** `src/core/InputManager.ts` blurs any focused `HTMLButtonElement` and calls `e.preventDefault()` on `Space`/`Enter`.
   - **Post-Fix Verification:** `spaceAfterMuteBtnToggledMute: false`, `runningBarVisibleAfterSpace: "flex"`.

2. **P1 [RESOLVED] — Horizontal Rock-Flank Tiling Seam (`Renderer.ts`):**
   - **Baseline Defect:** Repeating `env_flank_b*.webp` vertically without parity reflection created subtle horizontal seams in Biome 1/5/6 flanks.
   - **Fix Applied:** Alternating vertical reflection (`ctx.scale(1, -1)`) on odd tiles in `renderRockFlanks()` (`src/rendering/Renderer.ts`).
   - **Post-Fix Verification:** Inspected `01_title_screen.png`, `biome_5_aim.png`, `biome_6_aim.png` — completely seamless vertical rock transitions.

3. **P1 [RESOLVED] — Depth Ruler Tick Collision on Narrow Landscapes & Stacked Gate HUD (`Renderer.ts`, `HUDController.ts`, `styles.ts`):**
   - **Baseline Defect:** `10m`/`140m` ticks overlapped `.rm-hud-left` badges at `821x462` and stacked with `BEDROCK GATE (3/3)` in Boss Gate captures; `.rm-gate-hp-bar` sat mid-shaft over blocks.
   - **Fix Applied:** `renderDepthRuler()` enforces `minSafeY = isPortrait ? topOffsetPx + 20 : (cssWidth < 1000 ? 182 : 158)` (`src/rendering/Renderer.ts`); `HUDController.ts` hides `bossRowEl` while `activeGate` is active; `.rm-gate-hp-bar` docks top-center in desktop landscape (`src/ui/styles.ts`).
   - **Post-Fix Verification:** Inspected updated `vp_821x462_landing.png` and `state_boss_gate.png` — zero HUD/ruler collisions and zero block occlusion.

4. **P1 [RESOLVED] — Cold-Boot Floating Logo Block Occlusion & Premature `gameplayStart` with `OfflineModal` (`main.ts`):**
   - **Baseline Defect:** Floating brand banner obscured top-row blocks on cold boot `AIMING`, and `OfflineModal` allowed `gameplayStart` to fire before offline earnings collection.
   - **Fix Applied:** Removed `showFloatingIntroBanner()` from cold-boot `AIMING`, deferred `PlatformSDK.gameplayStart()` when `offlineCoins > 0` until `OfflineModal` `collect` closes back to aiming (`src/main.ts`).
   - **Post-Fix Verification:** `vp_907x510_landing.png` shows unobstructed blocks and clean FTUE pill; `offlineModalDeferredStart` confirmed `eventsWhileOfflineOpen: ["init", "loadingStart", "loadingStop"]` -> `["gameplayStart"]` after collect.

5. **P1 [RESOLVED] — Partial Localizations & Hardcoded English HUD Strings (`translations.ts`, `main.ts`):**
   - **Baseline Defect:** `es`, `pt`, `fr`, `de`, `tr`, `ja`, `ko` relied on `...EN_STRINGS` fallbacks for >140 keys, and `'Super-Orb Armed!'` / `'to Biome X Boss'` were unlocalized.
   - **Fix Applied:** Added `free_short`, `super_orb_armed`, and `boss_progress_fmt` (210 total keys) across all 9 locales with zero `...EN_STRINGS` spread fallbacks in `src/i18n/translations.ts`, wired in `src/main.ts`.
   - **Post-Fix Verification:** `npm run typecheck` passed (`Record<Locale, Record<TranslationKey, string>>` strict type check) and Playwright checked all 9 locales in live Settings (`hasUndefined: false`).

**Remaining Open P1 Gaps:** **0.**

---

## 5. P2 — NICE-TO-HAVE POST-LAUNCH IMPROVEMENTS

1. **Synthesized / Mixed Audio Track in Preview MP4s:** `ricochet_miner_preview_16x9_1080p.mp4` and `ricochet_miner_preview_2x3_portrait.mp4` meet CrazyGames video specs cleanly as video-only MP4s (`Stream #0:0 h264 yuv420p`), and CrazyGames auto-mutes hover previews by default; adding an optional crisp stereo SFX+BGM mix track in Full Launch marketing updates would further boost unmuted detail-page playback.
2. **Portrait Running Skill Dock Wrapping at `<= 800px` Width:** In the `800x1200` preview frame (`2x3_t10.0.png`), `.rm-running-skills` cleanly wraps `[Recall]` onto a second compact line when long active cooldown labels appear; tightening button horizontal padding by ~4px in portrait would keep all 4 running controls on a single line.
3. **Biome 2–4 Midgame Balance Telemetry Tuning:** Playtest simulation (`tests/autonomous-playtest.test.ts`, 55 runs, 6/6 biomes unlocked) shows Run 20 (`Cyber` -> `Quantum`) smoothly paces to completion by Run 29, while late-run coin reserves accumulate up to `24.1M` before Run 30 upgrade bursts; high-tier upgrade sinks could be expanded post-launch for extra 60+ run depth.

---

## 6. Multi-Viewport & Marketing Visual Findings (`DPR: 1`)

- **Desktop Non-Fullscreen (`907x510`, `821x462`, `1077x606`, `1216x684`):**
  - Zero horizontal/vertical scrollbars across all viewports (`scrollW === innerW`, `scrollH === innerH`).
  - `907x510`: Shop modal fits cleanly (`modalFitsViewport: true`) with `430x50` banner slot separated by `20px` from scroll area and `27.8px` from upgrade buttons.
  - `821x462`: Narrow-width HUD badge wrap drops `FULL-SHAFT RUN` cleanly above `minSafeY = 182px` (`10m` omitted, `20m` clear below); Shop suppresses banner slot cleanly (`bannerVisible: "hidden"`, `bannerH: 0`).
- **Desktop Fullscreen (`1280x720`, `1920x1080`):** Generous flanking cave art with alternating vertical mirror reflection; sharp block HP fonts, golden ores, bumpers, and docked right-hand Arcade Console.
- **Mobile & Tablet (`390x844`, `360x800`, `800x450`, `1080x607`):**
  - `390x844` & `360x800`: Ceiling drill turret sits completely unobstructed below top HUD (`hudTopBottom: 70`, `ftueTop: 179–190`); Shop upgrade cards wrap descriptions in full with zero `...` truncation; mobile banner (`320x50` / `326.5x50`) fits inside modal bounds.
  - `800x450`: Banner suppresses (`bannerH: 0`), preventing bottom modal crowding; zero scrollbars.
  - `1080x607`: Balanced tablet framing (`hudTopBottom: 50`, `consoleTop: 329`).
- **Gameplay & Biome States (`biome_1..6`, `state_boss_gate`, `state_run_summary`):**
  - Biomes 1–6 load distinct rock/mineral block styles and seamless flanks; Boss Gate displays top-center `BEDROCK GATE (3/3)` HP bar (`5.83K / 6.14K`) and 2.0x Crit target reticle cleanly; Run Summary modal frames `Coins Earned` and `Max Depth` cleanly at center.
- **Storefront Covers & Preview Videos (`marketing-assets/ready/`):**
  - Covers (`1920x1080`, `800x1200`, `800x800`), screenshots (`01`–`05` at `1280x720`), and both `18.50s` MP4s (`16:9` & `2:3`) show high readability, rich explosions, clear TNT/cleave/Boss Gate hooks, and strong thumbnail-to-gameplay consistency with zero misleading elements.

---

## 7. Exact Remediation Log & Final Verification Summary

| File Changed | Remediation Summary |
| :--- | :--- |
| `src/audio/AudioEngine.ts` | Replaced dynamic `StereoPannerNode` allocations with 7 static pre-allocated `sfxPanBuckets`; kept bucket references intact across voice cleanup. |
| `tests/audio.test.ts` | Added regression test verifying zero extra `StereoPannerNode` allocations across bursts of panned SFX. |
| `src/core/InputManager.ts` | Blurred focused `<button>` elements and prevented default activation on `Space`/`Enter` keydown. |
| `src/rendering/Renderer.ts` | Applied odd-tile vertical flip in `renderRockFlanks()` for seamless tiling; set `renderDepthRuler()` `minSafeY = isPortrait ? topOffsetPx + 20 : (cssWidth < 1000 ? 182 : 158)`. |
| `src/ui/ShopOverlay.ts` | Raised `MIN_VIEWPORT_HEIGHT_FOR_BANNER_PX` to `490`, added `i18n.t('free_short')` label on `freeUpgradeCandidate`, and removed description ellipsis truncation. |
| `src/ui/styles.ts` | Top-centered `.rm-gate-hp-bar` on landscape desktop (`>= 780px`); set `margin: 12px auto 0 auto` (`20px` total separation) on `.rm-banner-slot` (`0` when `.suppressed`). |
| `src/ui/HUDController.ts` | Hid `bossRowEl` while `activeGate` bar is displayed to eliminate duplicate progress rows. |
| `src/ui/icons.ts` | Added dark `#1a1310` casing stroke around green `check` icon for high contrast on gold `EQUIPPED` buttons. |
| `src/main.ts` | Removed cold-boot floating logo block occlusion; deferred `gameplayStart()` when `OfflineModal` opens until collection; localized `'Super-Orb Armed!'` & `'to Biome X Boss'`. |
| `src/i18n/translations.ts` | Added all 210 keys across all 9 supported locales with zero `...EN_STRINGS` fallbacks. |
| `scripts/capture-marketing.mjs` | Added automatic `dismissPerkDraftIfOpen` / `waitHandlingPerks` handling so Boss Gate screenshots & videos never stall on modal drafts. |

**Final Post-Edit Verification Run (`task-313` + `pillar4-eval.mjs`):**
- `npm run typecheck`: **PASS** (exit code `0`)
- `npm test` (`vitest run`): **10/10 files passed, 56/56 tests passed** (including 55-run autonomous Biome 1–6 playtest)
- `npm run build:crazygames` -> `release/ricochet-miner-crazygames.zip`: **PASS** (`7,105,845 B` zipped / `7,489,489 B` unzipped / `176` files)
- `npm run build:standalone` -> `release/ricochet-miner-standalone.zip`: **PASS** (`6939.3 KB` zipped)
- `tmp-preflight/run-audit.mjs` & `tmp-preflight/pillar4-eval.mjs`: **PASS** (0 HTTP/console/page errors across all 10 `DPR: 1` viewports, 6-run fresh curve `49 -> 870` coins reaching `149.5m`, 9/9 locales rendered clean, 49/49 audio buffers decoded cleanly).
