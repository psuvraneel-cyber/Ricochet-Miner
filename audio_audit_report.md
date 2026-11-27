# Ricochet Miner — Forensic Audio, Music & DSP Audit Report

**Audit Scope:** Read-only diagnostic audit of `src/audio/`, `scripts/generate-audio-sfx.py`, `src/assets/audio/`, `src/main.ts`, `src/physics/PhysicsEngine.ts`, `src/core/`, `src/sdk/`, `src/ui/`, and `dist/crazygames` (`release/ricochet-miner-crazygames.zip`).  
**Verification Basis:** Line-by-line code inspection, `vitest run tests/audio.test.ts` (6/6 mock tests passed), `ffmpeg volumedetect` analysis of all 18 `.ogg` assets, and headless Chromium Playwright inspection of `dist/crazygames` (0 runtime errors, `AudioContext` created lazily on first gesture at `44100 Hz`, all 18 `.ogg` files served HTTP `200`).

---

## 1. Executive Verdict

| Pillar | Score (1–10) | Summary |
| :--- | :---: | :--- |
| **(a) Current SFX** | **3.5 / 10** | All 18 `.ogg` assets are offline `numpy` sine/noise math (`scripts/generate-audio-sfx.py`), not recorded/foley samples; iOS Safari cannot decode `.ogg` Vorbis and silently drops to single-oscillator fallbacks; 11 block materials share 4 sounds; ~20 UI/Stage-2 mechanics are completely silent. |
| **(b) Current Music** | **4.0 / 10** | All 6 biomes share the same 4-bar (`64`-step) 8th-note rhythmic phrasing, identical dry synth-drum timbres, and static dynamics; boss ostinato fires on every 16th note non-stop; biome/intensity switches snap mid-bar; custom BGM hook breaks `isRunning()` and overlaps procedural synth. |
| **(c) Mix & Technical Robustness** | **4.5 / 10** | Good dual-bus intent, **but** fails CrazyGames `muteAudio` & `adStarted` requirements, misses iOS `'interrupted'` recovery, leaks permanent `StereoPannerNode`s on every drum/arp note in `MusicEngine`, lacks a brickwall master limiter, and drops high-priority cues under global 45–48ms throttles. |

### Top 5 Reasons Current Audio Drags Down Perceived Quality
1. **"Programmer Synth" Sonic Signature (`scripts/generate-audio-sfx.py` + `AudioEngine.ts`):** Every `.ogg` file is generated from `np.sin` sweeps and 6 dB/oct `one_pole_lp`/`one_pole_hp` noise (`max_volume` up to `0.0 dBFS`, `mean_volume` `-7.1` to `-13.9 dB`). Without real rock/metal/glass transients or round-robin layers, rapid ricochets read as synthetic beeps and static bursts.
2. **iOS Safari `.ogg` Decode Failure (`src/audio/AudioEngine.ts:1-18, 319-323`):** All 18 imported SFX assets are Vorbis `.ogg` only, with zero `.mp3`/`.m4a`/`.wav` fallback. On iOS WebKit, `decodeAudioData` rejects `.ogg` silently (`catch {}`), leaving `sampleBuffers.size === 0` and forcing mobile Safari users onto raw Web Audio oscillator fallbacks (`AudioEngine.ts:695-1347`).
3. **CrazyGames SDK Compliance Gaps (`src/sdk/adapters/CrazyGamesAdapter.ts:19-46, 163-180`):** The adapter never reads `SDK.game.settings.muteAudio`, never subscribes to `SDK.game.addSettingsChangeListener`, and never passes `adStarted` in `SDK.ad.requestAd`.
4. **Silent Stage 2 Mechanics, Sawblade Passives & UI (`src/main.ts`, `src/ui/`):** 7 of 9 sawblade skin passives (Magma burn, Frost chill, Toxic acid, Void phase-pierce, Emerald gyro, Copper/Gold perks), multi-orb volley shots 2..N, weak-point reticle locks, falling boss shards, elevator jumps, and nearly all UI clicks/modals emit zero audio.
5. **Web Audio Graph Leaks & Collision Pile-Ups (`src/audio/MusicEngine.ts:629-635`, `src/audio/AudioEngine.ts:430-465`):** `MusicEngine` leaks orphaned `StereoPannerNode`s into `rhythmDryBus`/`melodyBus` on every snare, hi-hat, and counter-arp (`~6–12` leaked nodes/sec permanently), while `AudioEngine` stacks 4–11 simultaneous voices on block kills, crits, and vaults without bus ducking or brickwall limiting.

---

## 2. Category 1 — MASSIVE OVERHAUL REQUIRED

These systems cannot be rescued by parameter tweaks; they require real studio/foley audio assets or architectural replacement.

### 2.1 Replace Synthetic `.ogg` Library (`scripts/generate-audio-sfx.py` & `src/assets/audio/*.ogg`)
Every `.ogg` asset measured via `ffmpeg volumedetect` shows hot, over-compressed synthetic waveforms generated strictly by Python `numpy` math (`SR=44100`, mono):

| File (`src/assets/audio/`) | Duration | Mean / Max dBFS | Size | DSP Root Cause of Synthetic Sound (`scripts/generate-audio-sfx.py`) |
| :--- | :---: | :---: | :---: | :--- |
| `sfx_tnt_explosion.ogg` | `0.72s` | `-7.1 / 0.0 dB` | `10,358 B` | `sub_boom` sine (`125->24 Hz`) + single-pole LP/HP white noise (`soft_clip` drive `1.85`); lacks real concussive transient & multi-band room tail (`:163-177`). |
| `sfx_laser.ogg` | `0.40s` | `-9.3 / 0.0 dB` | `7,563 B` | 2-op FM (`180 Hz` mod, index `4.0`) + `1850->210 Hz` sweep (`soft_clip` `1.65`); harsh compressed mid-high buzz (`:193-198`). |
| `sfx_lightning.ogg` | `0.26s` | `-12.6 / 0.0 dB` | `6,314 B` | Hard `np.sign(np.sin(...))` aliased square wave + `one_pole_hp(noise, 1900)` with **no low-pass ceiling**; fizzing `4–22 kHz` aliasing (`:211-215`). |
| `sfx_magpulse.ogg` | `0.42s` | `-8.0 / -0.5 dB` | `7,760 B` | Sine drop (`175->34 Hz`) + sine rise (`220->990 Hz`) + two static sines (`659.25/987.77 Hz`); reads as sci-fi UI swell, not kinetic slam (`:218-225`). |
| `sfx_overclock.ogg` | `0.50s` | `-8.8 / -0.6 dB` | `8,792 B` | `np.tanh(sin(140->880Hz)*2.2)` + two-note lock (`1046.5/1567.98 Hz`); boxy turbine sweep (`:228-238`). |
| `sfx_hit_stone.ogg` | `0.16s` | `-11.0 / -0.7 dB` | `5,326 B` | `195->62 Hz` sine + 6 dB/oct filtered noise (`650–3400 Hz`); lacks sharp mineral chisel transient (`:102-106`). |
| `sfx_hit_granite.ogg` | `0.21s` | `-10.6 / -0.4 dB` | `5,938 B` | Three static sine partials (`790, 1245, 2130 Hz`); sounds like a hollow tin bell rather than heavy basalt (`:109-117`). |
| `sfx_hit_ore.ogg` | `0.22s` | `-13.5 / -1.6 dB` | `5,723 B` | Fixed C6-G6-E7 triad (`1046.5, 1567.98, 2637 Hz`) clashes with `PENTATONIC_HZ` when pitch-shifted by `comboRate` (`:120-128`, `AudioEngine.ts:788, 811`). |
| `sfx_hit_frost.ogg` | `0.24s` | `-13.9 / -0.6 dB` | `6,326 B` | Two fixed sines (`2480, 3720 Hz`) + 6 dB/oct HP noise (`2200–7200 Hz`); thin metallic chirp rather than crisp ice crack (`:131-136`). |
| `sfx_break_rock.ogg` | `0.35s` | `-11.5 / -0.5 dB` | `7,107 B` | 5 deterministic pebble offsets (`35..220ms`) with sine+noise blobs; single variant repeats identically on every break (`:139-152`). |
| `sfx_coin.ogg` | `0.20s` | `-10.6 / -1.0 dB` | `5,677 B` | 2-step E6->B6 (`1318.51->1975.53 Hz`) sine blip + `4200 Hz` 12ms noise click (`:180-190`). |
| `sfx_crit.ogg` | `0.28s` | `-10.7 / -0.2 dB` | `6,419 B` | `240->65 Hz` sine + static sines (`1180, 1765, 2945 Hz`) (`:247-255`). |
| `sfx_launch.ogg` | `0.26s` | `-12.3 / -0.7 dB` | `6,320 B` | `170->52 Hz` sine + `240->920 Hz` sine whir + noise (`:85-89`). |
| `sfx_wall_hit.ogg` | `0.14s` | `-12.4 / -0.7 dB` | `5,260 B` | `310->125 Hz` sine + `1980/3120 Hz` static sines (`:92-99`). |
| `sfx_bumper.ogg` | `0.24s` | `-10.2 / -0.8 dB` | `5,234 B` | 2-op FM (`587.33->880 Hz`) + `1318.51 Hz` sine (`:155-160`). |
| `sfx_portal.ogg` | `0.36s` | `-11.9 / -0.7 dB` | `7,254 B` | `260->1120 Hz` sine + `14 Hz` vibrato chord (`587.33/880 Hz`) (`:201-208`). |
| `sfx_drone_shot.ogg` | `0.15s` | `-12.4 / -0.7 dB` | `5,153 B` | `1420->320 Hz` sine pew + `2800 Hz` noise tick (`:241-244`). |
| `sfx_pickup.ogg` | `0.26s` | `-11.4 / -1.2 dB` | `5,520 B` | 3-note arpeggio (`659.25, 880, 1318.51 Hz`) (`:258-265`). |

### 2.2 Browser-Universal Audio Format Architecture (iOS Safari Failure)
- **Root Cause (`src/audio/AudioEngine.ts:1-18, 40-59`):** `AudioEngine` statically imports 18 `.ogg` files and removes the format-agnostic discovery pattern. Apple iOS WebKit (all browsers on iOS) does not reliably decode Ogg Vorbis in `AudioContext.decodeAudioData()`, silently triggering the empty `catch {}` at `AudioEngine.ts:321-323`.
- **Required Overhaul:** Ship `.mp3` (universal across Chrome, Firefox, Edge, Safari, iOS WebKit) or dual-format `.ogg`/`.mp3` via capability check (`new Audio().canPlayType('audio/ogg; codecs="vorbis"')`), preferring single `.mp3` (or `.m4a` + `.mp3`) mastered cleanly to stay well inside the CrazyGames bundle budget.

### 2.3 Music Engine Overhaul: Procedural Fatigue vs. Real Multi-Biome Loops (`src/audio/MusicEngine.ts`)
- **Monotonous Structure (`MusicEngine.ts:43-321`):** Every biome is a `64`-step (`4`-bar) pattern repeated as Section A (`0..63`) and Section B (`64..127`). All 6 `lead` and `leadB` melodies share the exact same rhythmic template (`note-rest-note-rest...` for 13 steps + 3-step rest on beat 4).
- **Thin Timbres & Inaudible Mobile Kick (`MusicEngine.ts:722-1017`):**
  - `triggerBass` (`:722-753`) runs `triangle` + `sine` at the *same* octave (`freq`), filtered down to `freq * 2.1`—no sub-octave weight and no mid-range presence on mobile phone speakers.
  - `triggerKick` (`:941-953`) is a pure `sine` (`132->42 Hz`) with **zero** click/beater transient above `200 Hz`, rendering the kick practically invisible on mobile/laptop speakers.
  - All 6 biomes use identical synthesized kick/snare/hat timbres (`:941-1000`), giving Biome 4 (*Frost Depths*) and Biome 1 (*Sunlit Quarry*) the exact same drum kit as Biome 5 (*Warp Abyss*).
  - `triggerOstinatoPulse` (`:715-719, 1002-1017`) fires on **every single 16th note** (`128 BPM` = `8.53 notes/sec`) continuously during Boss Gate encounters with zero rests—severe ear fatigue.
- **Required Overhaul:** Replace the procedural step-sequencer BGM with **3–6 mastered studio `.mp3`/`.wav` stems or seamless dual-deck Web Audio crossfaded loops** (see Section 6, Track B), OR rewrite the sequencer with true multi-bar phrasing, biome-specific drum synthesis, and non-16th-note boss ostinatos.

### 2.4 Master Bus Architecture & Brickwall Limiter (`src/audio/AudioEngine.ts:218-290`)
- **Current Graph:**
  - `sfxGain` (`0.75`) -> `WaveShaperNode` (`tanh(1.45x)/tanh(1.45)`) + parallel `caveDelay` (`46ms`, `2100 Hz` LP, `0.16` wet) -> `sfxCompressor` (`threshold -10`, `ratio 4.5`, `attack 0.003`, `release 0.095`) -> `ctx.destination`.
  - `musicDuckGain` (`1.0`) -> `musicGain` (`0.28` high / `0.14` low) -> `musicCompressor` (`threshold -14`, `ratio 3`, `attack 0.008`, `release 0.15`) -> `ctx.destination`.
- **Clipping Math:** `sfxCompressor` (`ratio 4.5`, `attack 3ms`) is a gentle bus compressor, **not** a brickwall limiter, and `sfxCompressor` + `musicCompressor` sum directly into `ctx.destination` with no shared master limiter. On a chaotic Multi-Orb frame (`playExplosion` `0.92` + `sub` `0.22` + `playHit` `0.68*1.3` + `crit` `0.42` + `playCrunch` `0.68` + `playCoin` `0.42`), pre-bus sum exceeds `3.4`, `caveWet` adds `0.16 * 2.55 = 0.41` past the `WaveShaperNode`, and 3ms attack transients + `musicCompressor` sum above `0 dBFS` at `ctx.destination`.
- **Required Overhaul:** Route `sfxCompressor` and `musicCompressor` into a unified `masterBus` -> `DynamicsCompressorNode` brickwall safety limiter (`threshold: -1.5`, `knee: 0`, `ratio: 20`, `attack: 0.001`, `release: 0.05`) -> `ctx.destination`.

---

## 3. Category 2 — NEEDS TO BE CHANGED / FIXED

### 3.1 Complete Event-to-Audio Coverage Map

#### A. Existing Audio Methods & Exact Call Sites
| Method (`file:line`) | Implementation / DSP Parameters | Trigger Call Sites |
| :--- | :--- | :--- |
| `unlock()` (`AudioEngine.ts:172-180`) | Creates `AudioContext`, builds routing, resumes `'suspended'`, starts music fade-in (`0.6s` linear to `0.28`/`0.14`). | `main.ts:462` (`onAimStart`), `:1544` (`onUserGesture`), `:1547` (`onPlay`), `:1556` (Title mute), `:1584` (`onToggleMusic`), `:1591` (`onSetMusicVolume`). |
| `playLaunch()` (`AudioEngine.ts:686-722`) | `sfx_launch` (`vol=0.78`, `±4%`); fallback tri `185->58 Hz` (`0.26`) + BP noise `1100->3200 Hz` (`0.18`). | `main.ts:905` (`launchVolley` — **only orb #1**). |
| `playWallHit()` (`AudioEngine.ts:724-770`) | Throttle `45ms` (`'wallHit'`); `sfx_wall_hit` (`vol=0.45*norm`, rate `0.94+norm*0.12`, `±6%`); fallback tri `290->110 Hz` + BP `2200 Hz Q=2.6`. | `main.ts:549` (`onWallHit`). |
| `playHit()` (`AudioEngine.ts:772-844`) | Throttle `48ms` (`'blockHit'`); 4 `.ogg`s (`granite`/`frost`/`ore`/`stone`) at `rate=1+min(10,combo)*0.018` + **always** layers `PENTATONIC_HZ` osc + `sfx_crit` if `cleaved`. | `main.ts:559-565` (`onBlockHit`, non-`boss_armor`). |
| `playCrunch()` (`AudioEngine.ts:846-883`) | Throttle `48ms` (`'crunch'`); `sfx_break_rock` (`vol=0.68`, rate `1.24` frost/`1.1` ore/`0.85` granite/`1.0` rest) + layers `sfx_hit_frost`/`sfx_hit_ore`. | `main.ts:593` (`onBlockDestroyed` when `!isTnt`). |
| `playBumper()` (`AudioEngine.ts:885-919`) | Throttle `45ms` (`'bumper'`); `sfx_bumper` (`vol=0.65`, rate `1+min(8,combo)*0.032`, `±3%`); fallback sine `740->1320 Hz` + tri `1480 Hz`. | `main.ts:705` (`onBumperHit`). |
| `playExplosion()` (`AudioEngine.ts:921-958`) | Throttle `65ms` (`'explosion'`); `sfx_tnt_explosion` (`vol=0.92`, `±6%`) + **always** layers sine sub `105->24 Hz` (`0.22`/`0.34`). | `main.ts:648` (`onTntExplode`: TNT & `volatile_gold`). |
| `playCoin()` (`AudioEngine.ts:960-990`) | Throttle `48ms` (`'coin'`); streak `<=420ms` (`0..12`, `rate=1+streak*0.032`); `sfx_coin` (`vol=0.42`, `±3%`); fallback `1318.51->1975.53 Hz` sine. | `main.ts:642` (`onBlockDestroyed` if `coins > 0`). |
| `playLaserBeam()` (`AudioEngine.ts:992-1012`) | Throttle `80ms` (`'laser'`); `sfx_laser` (`vol=0.78`, `±4%`); fallback raw sawtooth `1680->220 Hz`. | `main.ts:715` (`onLaserFire`). |
| `playPortalWarp()` (`AudioEngine.ts:1014-1034`) | Throttle `90ms` (`'portal'`); `sfx_portal` (`vol=0.74`, `±4%`); fallback sine `320->1180 Hz`. | `main.ts:720` (`onPortalWarp`). |
| `playArmorClang()` (`AudioEngine.ts:1036-1055`) | Throttle `65ms` (`'armorClang'`); `sfx_hit_granite` (`vol=0.56`, rate `1.28`, `±5%`); fallback tri `980 Hz`. | `main.ts:557` (`onBlockHit` on `boss_armor`). |
| `playCritHit()` (`AudioEngine.ts:1057-1084`) | Throttle `60ms` (`'crit'`); `sfx_crit` (`vol=0.85` weak/`0.65` crit, rate `1.12`/`1.0`); fallback tri `1480->740` or `1180->590 Hz`. | `main.ts:689` (`onBlockCrit`), `:695` (`onBossWeakPointHit`). |
| `playDroneShot()` (`AudioEngine.ts:1086-1106`) | Throttle `125ms` (`'droneShot'`); `sfx_drone_shot` (`vol=0.34`, `±6%`); fallback sine `1420->360 Hz`. | `main.ts:700` (`onDroneShot`). |
| `playPickup()` (`AudioEngine.ts:1108-1116`) | Throttle `65ms` (`'pickup'`); `sfx_pickup` (`vol=0.72`, rate `1.18`/`1.08`/`1.0`); fallback `playUpgrade()`. | `main.ts:667, 670, 676` (`onPickupCollected`). |
| `playPerkOpen()` (`AudioEngine.ts:1118-1137`) | Unthrottled; `sfx_pickup` (`vol=0.65`, rate `0.85`) + 4 sines `[440, 554.37, 659.25, 880]` (`50ms` stagger). | `main.ts:861` (`openPerkDraft`). |
| `playPerkSelect()` (`AudioEngine.ts:1139-1144`) | Unthrottled; `sfx_crit` (`vol=0.55`, rate `1.05`) + calls `playUpgrade()`. | `main.ts:869` (`openPerkDraft` `onSelect`). |
| `playRecall()` (`AudioEngine.ts:1146-1165`) | Unthrottled; `sfx_portal` (`vol=0.62`, rate `1.32`); fallback tri `340->1240 Hz`. | `main.ts:338` (`HUDController` `onRecall`). |
| `playUpgrade()` (`AudioEngine.ts:1167-1187`) | Unthrottled; `sfx_pickup` (`vol=0.48`, rate `1.06`) + 4 triangles `[523.25, 659.25, 783.99, 1046.5]` (`42ms` stagger). | `main.ts:365, 373, 389, 526, 1392, 1402, 1418, 1427, 1436, 1475`. |
| `playFanfare()` (`AudioEngine.ts:1189-1209`) | Unthrottled; `duck(550)` + 5 raw tri/sine osc `[523.25..1318.51]` (`60ms` stagger). No sample. | `main.ts:634` (vault), `:754` (elevator B6), `:764` (boss gate B1–5). |
| `playVictoryFanfare()` (`AudioEngine.ts:1214-1251`) | Unthrottled; `duck(1100)` + 4 saw+LP + 4 octave sine `[392..783.99]` (`110ms` stagger). No sample. | `main.ts:741` (ascension), `:1526` (debug sim). |
| `playClick()` (`AudioEngine.ts:1253-1268`) | Unthrottled; single sine `760 Hz` (`vol=0.06`, `40ms` decay). No sample. | `main.ts:322` (aim mode), `:335` (2x speed), `:1411` (equip skin). |
| `playMagPulse()` (`AudioEngine.ts:1270-1301`) | Throttle `110ms` (`'magPulse'`); `sfx_magpulse` (`vol=0.85`) + sine sub `150->38 Hz` (`0.18`). | `main.ts:820` (`activateMagPulse`). |
| `playOverclock()` (`AudioEngine.ts:1303-1326`) | Unthrottled; `sfx_overclock` (`vol=0.85`); fallback saw+LP `220->880 Hz`. | `main.ts:849` (`activateOverclock`). |
| `playLightning()` (`AudioEngine.ts:1328-1347`) | Throttle `70ms` (`'lightning'`); `sfx_lightning` (`vol=0.65`, `±8%`); fallback raw square `1240->340 Hz`. | `main.ts:683` (`onLightningArc`). |
| `updateMusicState()` (`AudioEngine.ts:539-545`) | Updates `MusicEngine` biome + intensity (`chill`/`aiming`/`running`) + `bossActive`. | `main.ts:997-1001` (every `fixedUpdate`, 120 Hz). |

#### B. Silent / Unwired Gameplay, Stage 2 & UI Events
1. **Aiming Drag Ticks & Launch Anticipation:** `InputManager.ts:196-271` (`updateAimFromPointer`) & `main.ts:469-501` (`onAimUpdate`) emit **zero audio** on angle sweeps, deadzone cancel (`InputManager.ts:208, 243`), or target lock.
2. **Multi-Orb Volley Orbs 2..N:** `spawnLauncherOrb` (`main.ts:946-983`, looped at `:1022`) fires silent orbs after orb #1 (`playLaunch()` is only at `main.ts:905`).
3. **Boss Weak-Point Reticle Cycle & Phase 2 Transition:** `main.ts:1060-1074` cycles `activeWeakPointCoreIndex` and activates `bossPhase2Active` with **zero audio**.
4. **Boss Shard Spawn & Non-Lethal Hit:** Shard spawn (`main.ts:1076-1095`) is silent; non-lethal shard hit (`PhysicsEngine.ts:442-462`) calls `damageBlockDirect` without `onBlockHit`, emitting **zero audio** (and `toSfxMaterial` at `main.ts:788-804` has no `'boss_shard'` case).
5. **7 of 9 Sawblade Skin Passives (`gameConfig.ts:39-48`):**
   - `thermite_edge` (Magma Cutter burn application & 3s DoT tick, `PhysicsEngine.ts:134-149, 772-775`): silent.
   - `shatter_chill` (Frost Star ice-splash, `PhysicsEngine.ts:659-662, 950-975`): silent.
   - `corrosive_splash` (Toxic Drill acid splash & granite pierce, `PhysicsEngine.ts:798-799, 950-975`): silent.
   - `phase_cleave` (Void Reaper phase-through cleaved blocks, `PhysicsEngine.ts:542-544, 663-665`): silent.
   - `ricochet_gyro` (Emerald Buzzsaw first wall bonus bounce, `PhysicsEngine.ts:188-195`): silent.
   - `prospectors_teeth` / `midas_magnetism` (Copper Gear / Gold Chakram): no distinct coin/magnet cue.
6. **Companion Drone Magnet Vacuum:** `PhysicsEngine.ts:1213-1222` magnetizes coins silently; only beam fire has `playDroneShot()`.
7. **Recall Vacuum Collection & Overclock Ready:** Coins hitting the HUD coin pill (`main.ts:1184-1187`) emit **zero audio** (`playCoin` fires at block break instead); `OVERCLOCK READY!` recharge (`main.ts:621`) is silent; `onOrbExpired` (`PhysicsEngine.ts:225, 312, 571`) is unwired in `main.ts`.
8. **Elevator Jump & Biome Unlock:** `RetentionModals.ts:159-193`, `main.ts:396-408`, and `showBiomeUnlockModal` (`RetentionModals.ts:230-266`, `main.ts:1338`) emit **zero audio**.
9. **Offline Idle Drill Collect (`RetentionModals.ts:20-55`, `main.ts:279-292`):** Both `Collect` and `Collect 2x` emit **zero audio**.
10. **Insufficient Coins / Disabled / Maxed Clicks:** `ShopOverlay.ts:200, 241`, `RetentionModals.ts:140`, `HUDController.ts:395, 413`, and `Digit1-6` (`main.ts:522-528`) emit **zero error feedback**.
11. **Perk Draft Hover (`PerkDraftModal.ts:36`) & Modal Open/Close Transitions + General UI Buttons:** `TitleOverlay.ts:102-121`, `ShopOverlay.ts:272-283`, `SettingsModal.ts:125-156`, `HUDController.ts:161, 247-253`, `RunSummaryModal.ts:122-135`, `AscensionVictoryModal.ts:113-134`, `AchievementsModal.ts:150`, and `RetentionModals.ts:85, 147, 182, 212-227` emit **zero UI click/transition audio**.

#### C. Recycled / Mismatched Cues
- **11 Materials -> 4 Hit Sounds (`AudioEngine.ts:790-797`):** `vault`, `crystal`, and `ore` all play `sfx_hit_ore`; `tnt` (wood crate), `laser` (plasma), `splitter` (prism), `boss_core`, and `strata` all play `sfx_hit_stone`; `boss_armor` (`playArmorClang`, `:1039`) recycles `sfx_hit_granite` at `1.28x` rate.
- **All Block Breaks -> `sfx_break_rock` (`AudioEngine.ts:856-862`):** `granite`, `vault`, `boss_core`, `tnt_plank`, `splitter`, and `laser` all use `sfx_break_rock`.
- **3 Pickups + Perk Open + Upgrade -> `sfx_pickup` (`AudioEngine.ts:1108-1187`):** `split`, `magnet`, and `overclock` pickups only pitch-shift `sfx_pickup` (`1.0`, `1.08`, `1.18`); `playPerkOpen` (`:1121`) and `playUpgrade` (`:1170`) reuse it too.
- **`playRecall` -> `sfx_portal` (`AudioEngine.ts:1149`):** Recycles warp portal sound at `1.32x` rate.
- **`playUpgrade` -> 9 Progression Actions (`main.ts:365, 373, 389, 526, 1392, 1402, 1418, 1427, 1436, 1475`):** Prestige, Mastery Feat claims, Daily Login, Mega Chest, Skin unlocks, and Shop upgrades all share one chime.

#### D. Collision / Double-Fire Bugs
1. **Block Kill Stack (`PhysicsEngine.ts:793 -> 805 -> 938`, `main.ts:559, 593, 642`):** Killing a block fires `onBlockHit` (`playHit`) + `onBlockDestroyed` (`playCrunch` + `playCoin`) on the exact same synchronous tick—stacking up to **6 voices** (`sfx_hit_*` + pentatonic osc + `sfx_crit` + `sfx_break_rock` + `sfx_hit_ore/frost` + `sfx_coin`) at identical `ctx.currentTime`.
2. **Boss Weak-Point / Crit Collision (`PhysicsEngine.ts:786-793`):**
   - If `precision_lens` (`critChance > 0`) triggers on a Weak Point (`:786`), it fires `onBlockCrit` (`playCritHit(false)`) instead of `onBossWeakPointHit`.
   - Immediately after `onBlockCrit`/`onBossWeakPointHit` (`:788/790`), line `:793` fires `onBlockHit` (`playHit`), stacking `sfx_crit` + `sfx_hit_stone` + osc (+ another `sfx_crit` if cleaved!) at `t=0`.
3. **Overclock Battery + `overclock_surge` Triple-Fire (`main.ts:676-678, 849-854`):** Collecting `pickup_overclock` plays `playPickup('overclock')`, immediately calls `activateOverclock()` (`playOverclock()`), and if `overclock_surge > 0`, immediately calls `activateMagPulse()` (`playMagPulse()`)—firing 3 full-scale hero SFX on the same frame.
4. **Vault Break + Perk Draft (`main.ts:634, 638, 642, 861`):** Fires `playCrunch` + `playFanfare` (5 oscs) + `playCoin` + `playPerkOpen` (`sfx_pickup` + 4 oscs) = **12 voices** in a single frame against a 16-voice cap.
5. **`playPerkSelect` (`AudioEngine.ts:1139-1144`):** Plays `sfx_crit` AND calls `this.playUpgrade()` (`sfx_pickup` + 4 oscs) simultaneously (**6 voices** for 1 click).

---

### 3.2 Critical Technical, SDK & Memory Bugs (`file:line`)

| Severity | Bug & Exact Location | Impact |
| :---: | :--- | :--- |
| **P0** | **CrazyGames `muteAudio` missing (`CrazyGamesAdapter.ts:19-46, 1-303`, `PlatformSDK.ts:14-40`)** | Never reads `SDK.game.settings.muteAudio` or subscribes to `addSettingsChangeListener`; CrazyGames portal mute button is non-functional (hard QA rejection). |
| **P0** | **CrazyGames `adStarted` callback unwired (`CrazyGamesAdapter.ts:163-180`)** | Interface declares `adStarted?: () => void` (`:31`), but `requestAd` omits it from the object passed to `SDK.ad.requestAd`. |
| **P0** | **iOS Safari `'interrupted'` AudioContext state ignored (`AudioEngine.ts:176, 189, 383, 679`)** | Only checks `ctx.state === 'suspended'`; iOS WebKit sets `state === 'interrupted'` after calls/Siri/backgrounding, so audio stays permanently dead after resuming. |
| **P0** | **`MusicEngine` permanent `StereoPannerNode` leak (`MusicEngine.ts:629-635, 930, 957, 987`)** | Every snare, hi-hat, and counter-arp creates a `StereoPannerNode` connected to `rhythmDryBus`/`melodyBus` that is **never disconnected** (`~6–12` permanently leaked live nodes/sec). No music voice disconnects on `onended`. |
| **P0** | **Custom BGM breaks `isRunning()` & overlaps synth (`MusicEngine.ts:456-462, 500, 511-515`)** | When `customBuffer` loads, `start()` returns at `:514` without setting `schedulerId`, so `isRunning()` (`:500`) returns `false` forever. `updateMusicState` (`main.ts:997`) re-runs `syncMusicPlayback(true)` at 120 Hz, resetting the 0.6s fade-in ramp continuously. Also `setCustomTrackBuffer` (`:459`) does not clear an already-running `schedulerId`, playing MP3 + synth simultaneously. |
| **P1** | **`pauseForAd()` overwrites its own 50ms fade ramp (`AudioEngine.ts:563-567, 665, 675`)** | `linearRampToValueAtTime(0, now+0.05)` at `:565` is immediately overwritten by `setSystemMuted(true)` -> `syncGainLevels(false)` -> `setTargetAtTime(0, now, 0.015)` at `:485`, and `ctx.suspend()` at `:676` freezes mid-playback SFX buffers until post-ad `ctx.resume()`. |
| **P1** | **Voice-stealing gain-click bug (`AudioEngine.ts:430-443`)** | `oldest.gainNode.gain.setValueAtTime(oldest.gainNode.gain.value, t)` reads static base value instead of current automated envelope value, causing gain jumps/clicks on steal, and steals shared `[dest]` panner while companion noise/oscillator nodes are still playing (`:766, 840, 916, 954`). |
| **P1** | **Global single-bucket throttles swallow priority cues (`AudioEngine.ts:399-407, 726, 780, 848, 962`)** | A `strata` hit blocks a `vault`/`boss_core` hit within `48ms`; 10 TNT chain blocks drop 9 crunches & coins; throttles use `performance.now()` so `2x` game speed (`GameLoop.ts:38`) hits the same real-time wall. |
| **P1** | **`unlock()` omitted on HUD/hotkey mute & non-aim UI (`main.ts:313-316, 517-520`)** | Toggling mute in HUD or pressing `M` never calls `this.audio.unlock()`, so unmuting before aiming leaves AudioContext uninitialized. |
| **P2** | **Duplicate `StereoPannerNode` allocations in `playHit` (`AudioEngine.ts:346, 807`)** | One cleaved `playHit` allocates up to 3 separate `StereoPannerNode` instances on the same `worldX`. |

---

## 4. Category 3 — NEEDS TO BE IMPROVED / TUNED

1. **Musical Pitch Climbing (`AudioEngine.ts:788, 809-811, 970`):**
   - `playHit` shifts the `.ogg` sample linearly (`1 + min(10, combo) * 0.018` = `+2.86` semitones) while the layered oscillator jumps across `PENTATONIC_HZ` (`0..21` semitones)—producing dissonant beat frequencies. Map **both** (or sample-only once replaced) to musical pentatonic semitone steps: `Math.pow(2, PENTATONIC_SEMITONES[step] / 12)`.
   - `playCoin` uses linear `1 + coinStreak * 0.032` (`1.000` to `1.384` microtonal drift). Replace with quantized pentatonic steps `[0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]`.
2. **Panning Curve (`AudioEngine.ts:417`):** `((worldX / 540) * 2 - 1) * 0.65` linear panning creates abrupt L/R hops on narrow mobile screens (`540px` shaft). Soften to `±0.42` for gameplay impacts and keep sub-bass (`<140 Hz`, TNT/Mag-Pulse) strictly dead-center (`pan = 0`) so bass energy never pulls to one ear.
3. **Ducking Curves (`AudioEngine.ts:524-534, 648-651`):** `duck()` dips `musicDuckGain` to `0.45` (`-6.9 dB`) only on `playFanfare`, `playVictoryFanfare`, and `runTntCount >= 2`. Add light micro-ducking (`0.72` over `140ms`) on **first** TNT blast, `playMagPulse()`, `playOverclock()`, and Boss Gate core breaks.
4. **Modal Low-Pass Muffles & State Mixing (`MusicEngine.ts:323-327, 590-608`):** `PAUSED`, `SHOP`, `PERK_DRAFT`, and `RUN_SUMMARY` all play at full `chill` gain (`0.28`). Add a dedicated modal filter/gain state (`cutoff: 650–850 Hz`, `musicModalGain: 0.55`) during `PAUSED`, `SHOP`, and `PERK_DRAFT` so overlays feel tactile and cohesive.
5. **Biome Crossfades & `120 Hz` Polling (`main.ts:997-1001`, `MusicEngine.ts:644-655`):** `fixedUpdate` calls `updateMusicState` 120 times/sec, and `MusicEngine` snaps biomes on `phraseStep % 8 === 0` with instant BPM/key jumps (`114->118->122->108->124->128 BPM`). Gate calls in `main.ts` to state/biome changes only, and crossfade (`1.2s–1.8s` equal-power) on biome boundaries or use a unified tempo/bridge transition.
6. **Velocity & Pitch-Jitter Range (`AudioEngine.ts:727, 787`):** `velScale` clamps to `[0.7, 1.3]` and pitch jitter is `±3%–6%`. Widen pitch jitter slightly (`±6%–8%` on non-pitched rocks/impacts) with 3–4 round-robin sample variations so 10-orb cascades never machine-gun.

---

## 5. Category 4 — NEEDS TO BE REMOVED / CLEANED UP

1. **Dead / Orphaned Code (`AudioEngine.ts:550-553`, `MusicEngine.ts:487-489`):**
   - `AudioEngine.updateAmbience()` (`:550-553`) has zero callers in `src/`. Remove.
   - `MusicEngine.setBossActive()` (`:487-489`) is bypassed by `setGameState()`. Remove or consolidate.
2. **Harsh / Redundant Synth Overlays (`AudioEngine.ts:813-825, 930-940, 1122-1136, 1142, 1171-1186`):**
   - Remove the always-on raw oscillator inside `playHit()` (`:813-825`) once real tuned samples are in place (keep only as fallback when `!playedFoley`).
   - Remove the double-stack in `playPerkSelect()` (`:1142-1143`) where `sfx_crit` + `playUpgrade()` fire together; give Perk Select its own dedicated sample.
   - Remove `sfx_pickup` layering in `playPerkOpen()` (`:1121`) + 4 raw sine oscillators (`:1124-1136`).
3. **Broken Raw Loop & Dead `OPTIONAL_BGM_GLOB` Assumptions (`MusicEngine.ts:29-36, 568-577`):**
   - `OPTIONAL_BGM_GLOB` currently matches **0 files** (`src/assets/` has no `bgm_*` files) and only picks `globEntries[0]` (`:362-365`) rather than per-biome tracks.
   - `src.loop = true` (`:573`) produces audible MP3 encoder-gap hiccups on loop boundaries; replace with seamless scheduled crossfade or gapless WAV/AAC loop scheduling.
4. **Stale Comments & Test Drift (`AudioEngine.ts:396`, `tests/audio.test.ts:310`):**
   - JSDoc at `AudioEngine.ts:396` and test description at `tests/audio.test.ts:310` say `55ms`, while `DEFAULT_THROTTLE_MS = 50` (`AudioEngine.ts:70`) and individual calls hardcode `45`/`48`/`65`/`70`/`80`/`90`/`110`/`125` ms.
   - `AudioEngine.ts:216` couples `AudioContext` `GainNode` creation order to hardcoded array indices `gains[0..2]` in `tests/audio.test.ts:197-199, 229, 260, 299`—fragile if inserting a master bus or modal gain node; expose explicit bus getters for tests instead.

---

## 6. Prioritized Audio Transformation Roadmap (P0 / P1 / P2)

**Bundle Headroom Calculation (`dist/crazygames` & `release/ricochet-miner-crazygames.zip`):**
- Current `dist/crazygames` unzipped: **`2.00 MB`** (`2,100,729 B`, including `115.28 KB` across 18 `.ogg` files).
- Current `release/ricochet-miner-crazygames.zip`: **`1.77 MB`** (`1,856,894 B`).
- CrazyGames limit (`scripts/package-portals.mjs:7`): **`20.00 MB`**.
- **Available Budget: `18.00 MB` unzipped / `18.23 MB` zipped** (recommended target: **total audio footprint `<= 5.5 MB`** so final `.zip` stays `~7.2 MB` for instant mobile homepage loading).

### Track A — Immediate Code & DSP Fixes

| Priority | Action Item & Target Files | Verification Criteria |
| :---: | :--- | :--- |
| **P0** | **CrazyGames Compliance (`CrazyGamesAdapter.ts`, `PlatformSDK.ts`, `main.ts`):** Read `SDK.game.settings.muteAudio` on init, subscribe to `addSettingsChangeListener` (strictly overriding in-game mute/volume), and wire `adStarted` in `requestAd()`. | Unit test mocks `muteAudio: true` & `adStarted`; audio stays silenced even if user toggles in-game SFX/Music ON. |
| **P0** | **iOS Safari `'interrupted'` & `unlock()` (`AudioEngine.ts`):** Treat `state === 'suspended' \|\| state === 'interrupted'` in `unlock()`, `armIosResume()`, `ensureSfxContext()`, and `syncSuspendState()`. Call `audio.unlock()` on HUD mute (`main.ts:313`) and `KeyM` (`main.ts:517`). | Simulated `'interrupted'` state invokes `ctx.resume()` on next `touchend`/`pointerdown`. |
| **P0** | **Fix `MusicEngine` Node Leaks & Custom BGM Bug (`MusicEngine.ts`):** Stop creating per-note `StereoPannerNode`s (use 3 pre-allocated static panners: center/left/right) and disconnect all nodes on `onended`. Fix `isRunning()` for `customBuffer`, stop procedural `schedulerId` in `setCustomTrackBuffer()`, and replace `src.loop = true` with dual-deck crossfade looping. | `nodeCount` stays constant across 5 minutes of simulated playback; `isMusicPlaying()` stays `true` with `customBuffer`. |
| **P0** | **Add Master Bus + Brickwall Limiter (`AudioEngine.ts`):** Sum `sfxCompressor` + `musicCompressor` -> `masterGain` -> `masterLimiter` (`threshold -1.5`, `knee 0`, `ratio 20`, `attack 0.001`, `release 0.05`) -> `destination`. Fix `pauseForAd()` ramp overwrite & flush `activeVoices` cleanly before `ctx.suspend()`. | 6 granite hits + 3 TNTs + BGM peaks never exceed `-1.0 dBFS`; zero post-ad ghost audio tails. |
| **P1** | **Priority Throttling, Polyphony & Musical Pitch (`AudioEngine.ts`, `PhysicsEngine.ts`, `main.ts`):** Replace global `blockHit`/`crunch` throttles with priority-aware per-material/per-tier buckets (`boss_core`/`vault`/`tnt` bypass `strata` throttle; cap polyphony at `24` with priority stealing & smooth zero-crossing fade-out); quantize coin & combo pitch to `PENTATONIC_SEMITONES`. Fix `onBlockCrit` vs `onBossWeakPointHit` double-fire (`PhysicsEngine.ts:786-793`) & `playPerkSelect` double-stack. | Vault/crit/TNT cues never dropped by strata spam; zero dissonant sample-vs-osc beat clashes. |
| **P1** | **Wire All Missing Stage 2, Passive & UI Hooks (`main.ts`, `PhysicsEngine.ts`, `ui/*.ts`):** Wire clicks/open/close/errors across all UI modals; add cues for aim ticks (deg-quantized `3°`), multi-orb volley spawns 2..N, weak-point lock/cycle, boss phase 2 & shard hit/salvage, Overclock ready, orb expire, elevator jump, offline collect, and all 9 sawblade passives (burn, chill, acid, void phase, gyro). | 100% of interactive gameplay & UI actions produce distinct, non-overlapping feedback. |
| **P2** | **Modal Low-Pass Sweeps & Biome Crossfades (`MusicEngine.ts`, `main.ts`):** Only call `updateMusicState()` on state/biome/boss transitions (not 120 Hz); add `750 Hz` LP + `-5 dB` dip in `PAUSED`/`SHOP`/`PERK_DRAFT`/`RUN_SUMMARY`; smooth biome transitions. | Zero abrupt mid-bar BPM/key cuts; clean modal depth feel. |

---

### Track B — Real Studio `.wav`/`.mp3` Asset Replacement & `ffmpeg` Mastering Pipeline

Replace Python-generated `.ogg` synth files with real studio/foley `.wav` sources mastered via `ffmpeg` (`44.1 kHz`, `-16 LUFS` SFX / `-20 LUFS` BGM, `-1.0 dBTP` true peak, `libmp3lame` VBR/CBR for universal Chrome + iOS Safari compatibility).

| Category | Minimal Asset List (Count) | Target Format & Spec | Est. Footprint |
| :--- | :--- | :--- | :---: |
| **Core Impacts (Round-Robin)** | `hit_sandstone_1..3`, `hit_granite_1..3`, `hit_crystal_1..3`, `hit_ore_1..2`, `hit_wood_1..2` (vault/TNT), `hit_armor_1..2`, `wall_ricochet_1..2` (**17** files) | `.mp3` mono `128 kbps`, `0.12–0.25s`, zero DC offset, 2ms tail fade | `~95 KB` |
| **Breaks & Pickups** | `break_stone_1..2`, `break_crystal`, `coin_clink` (pitched pentatonically), `pickup_split`, `pickup_magnet`, `pickup_overclock`, `bumper_pinball` (**8** files) | `.mp3` mono `128 kbps`, `0.18–0.40s` | `~65 KB` |
| **Explosions, Skills & Combat** | `tnt_blast_1..2`, `laser_beam`, `portal_warp`, `lightning_arc`, `mag_pulse`, `overclock_rev`, `drone_pew`, `crit_anvil`, `weakpoint_lock`, `turret_launch`, `recall_whoosh`, `burn_sizzle`, `acid_splash`, `void_phase` (**15** files) | `.mp3` stereo/mono `160 kbps`, `0.15–0.90s` | `~180 KB` |
| **UI & Fanfares** | `ui_click`, `ui_hover`, `ui_error_buzz`, `ui_modal_open`, `upgrade_buy`, `perk_open`, `perk_select`, `boss_fanfare`, `victory_fanfare` (**9** files) | `.mp3` stereo `160 kbps`, `0.06–2.20s` | `~140 KB` |
| **BGM Loops (3–6 Biome Themes)** | `bgm_quarry_crystal` (`0–350m`), `bgm_magma_frost` (`350–900m`), `bgm_cyber_quantum` (`900m+`) (or 6 individual 32-bar seamless loops, **3–6** files) | `.mp3` / `.m4a` stereo `112–128 kbps`, `~30–45s` loop-trimmed (`-af loudnorm=I=-20:TP=-1.5`) | `~2.4–4.2 MB` |
| **TOTAL** | **52–55 studio assets** | **Universal iOS Safari + Chrome/Firefox** | **`~2.9–4.7 MB`** |

#### `ffmpeg` Mastering Pipeline Commands (Reference Spec for Track B)
1. **SFX Master (`-16 LUFS` integrated / `-1.0 dBTP`, mono `44.1 kHz`, trimmed silence):**
   ```bash
   ffmpeg -i raw_sfx.wav -ac 1 -ar 44100 -af "silenceremove=start_periods=1:start_threshold=-50dB,loudnorm=I=-16:TP=-1.0:LRA=7" -c:a libmp3lame -b:a 128k sfx_out.mp3
   ```
2. **BGM Master (`-20 LUFS` integrated / `-1.5 dBTP`, stereo `44.1 kHz`, exact bar-length trim for crossfade deck):**
   ```bash
   ffmpeg -i raw_bgm.wav -ac 2 -ar 44100 -af "loudnorm=I=-20:TP=-1.5:LRA=9" -c:a libmp3lame -b:a 128k bgm_biome_1.mp3
   ```
3. **Post-Master Verification Criteria:**
   - Total `dist/crazygames` unzipped `<= 7.5 MB` (leaving `>12.5 MB` under CrazyGames' `20 MB` ceiling).
   - `vitest run` passes with updated real bus assertions (no hardcoded `gains[0..2]` fragility).
   - Playwright check on Chromium + WebKit confirms `getLoadedSampleCount() === 49` (zero decode errors), zero `StereoPannerNode` growth over 60s playback, and CrazyGames `muteAudio: true` silences 100% of audio.
