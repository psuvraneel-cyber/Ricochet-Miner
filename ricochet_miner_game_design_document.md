# Game Design Document: Ricochet Miner

**Version:** 1.0 (Production Specification)  
**Genre:** Hybrid-Casual 2D Physics Action / Incremental Mining  
**Target Platforms:** Web HTML5 (Desktop, Mobile Web, Tablet, Chromebook) — CrazyGames, Poki, GameDistribution, Yandex Games, GamePix, Y8  
**Target Rating:** PEGI 12 / All Ages  
**Primary Objective:** Maximize portal QA approval rate, Top-20% Click-Through Rate (CTR), player retention, and ad monetization yield across web gaming portals.

---

## 1. Executive Summary & Publishing Strategy

### 1.1 High-Concept Pitch
**Ricochet Miner** is a tactile, one-input 2D drag-and-launch physics game wrapped in a persistent mining-upgrade loop. Players aim and fire heavy cyber-sawblade orbs down vertical mine shafts packed with destructible ore blocks, pinball bumpers, splitter prisms, and chain-reacting TNT crates. Each 20-to-40-second run generates explosive visual feedback and ore coins that immediately fuel tangible upgrades, unlocking deeper, visually distinct underground biomes and boss vaults.

### 1.2 Target Commercial KPIs
Every design decision in this document is engineered to surpass the automated and editorial monetization gates of Tier-1 web portals (including CrazyGames' Basic Launch scoring gates and Poki's playtest benchmarks):

| Metric | Portal Benchmark (Minimum) | Ricochet Miner Target | Primary Design Driver |
| :--- | :--- | :--- | :--- |
| **Load Time (to First Input)** | $\le 10\text{ s}$ | $\le 3.5\text{ s}$ | Initial bundle $\le 2.5\text{ MB}$, procedural vector art |
| **Gameplay Conversion (1m+)** | $\ge 80\%$ | $\ge 86\%$ | 0-click launch directly into Shaft 1; guaranteed Upgrade 1 after Run 1 |
| **Average Session Playtime** | $\ge 10\text{ min}$ | $16\text{--}24\text{ min}$ | 20--40 s snappy runs, 6 escalating upgrades, 6 biomes, fast-drop elevators |
| **Day-1 (D1) Retention** | $10\%\text{--}15\%$ | $\ge 14\%$ | Cloud + local auto-save, Offline Idle Drill, 7-day login streak, daily quests |
| **Storefront CTR** | Top $20\%$ in category | Top $10\%$ in category | High-contrast single-focal-point cover art + kinetic 18 s hover video |
| **Rewarded Video (RV) Opt-in** | $15\%\text{--}25\%$ | $\ge 35\%$ | Contextual high-urgency triggers ($2\times$ loot, +1 launch near vault, offline $2\times$) |

### 1.3 Multi-Portal Distribution & Exclusivity Strategy
A critical legal and commercial distinction exists among major web portals: **Poki requires web exclusivity** (typically a 5-year default term for browser distribution, while permitting Steam/iOS/Android), whereas **CrazyGames, GameDistribution, Yandex Games, GamePix, and Y8 are non-exclusive**.

To avoid contract violations while maximizing lifetime revenue, release follows a **Two-Track Go-To-Market Gate**:

1. **Track A (Poki Exclusivity Evaluation — Weeks 1 to 2):** Submit the playable vertical slice to Poki's developer team first. If Poki approves the game for global launch with a strong traffic projection, publish exclusively on Poki for Web (retaining $50\%$ ad revenue share on Poki traffic and $100\%$ on self-driven traffic).
2. **Track B (Multi-Portal Scaling — Default Broad Strategy):** If opting for non-exclusive distribution (or if Poki declines), simultaneously deploy tailored single-SDK builds to **CrazyGames** (primary Tier-1 Western traffic), **Yandex Games** (high-volume CIS/MENA/global traffic + IAP option), **GameDistribution** (syndication across $1,000+$ partner sites), **GamePix**, and **Y8** using the Unified Portal SDK Bridge defined in Section 9.

---

## 2. Core Gameplay Loop & Mechanics

### 2.1 Zero-Friction Onboarding (First 60 Seconds)
To maximize Gameplay Conversion and satisfy CrazyGames' Full Implementation mandate (*land players directly in gameplay with 0 clicks*):

* **0.0 s (Load Complete):** No splash logos, no title wall, no login gate, no tutorial modal. The camera opens directly on **Shaft 1 (Sunlit Quarry)** with the launcher armed at the top of the shaft.
* **0.5 s (Visual Prompt):** A translucent, pulsing animated hand icon demonstrates a downward pull gesture with a live dotted aiming trajectory pointing straight toward a clustered TNT crate surrounded by gold ore blocks.
* **3.0 s (First Shot):** The moment the player drags and releases, the prompt vanishes permanently. The orb slams into the TNT crate, triggering an immediate chain explosion, hit-stop frame, screen shake, and a shower of 40--55 coins.
* **25.0 s (First Upgrade Hook):** When Run 1 ends, the **Upgrade Drawer** slides smoothly up at the bottom of the screen. The *Drill Damage* upgrade button pulses green at a cost of $25$ coins—guaranteed affordable from Run 1. Tapping it immediately enlarges the sawblade's visual glow and enables a 1-tap **Launch Again** action.

### 2.2 Core Game Loops

* **Micro Loop (20--40 seconds per run):**  
  Aim Trajectory $\to$ Release to Launch $\to$ Ricochet & Chain Detonations $\to$ Collect Falling Coins & Shards $\to$ Energy Depletes $\to$ Run Summary & Optional Rewarded Video $\to$ 1-Tap Upgrade / Relaunch.
* **Meso Loop (10--25 minutes per session):**  
  Upgrade Core Stats $\to$ Push Deeper Into Shaft $\to$ Shatter Biome Bedrock Boss Gate $\to$ Unlock New Biome & Fast-Drop Elevator $\to$ Complete Daily Quests $\to$ Unlock Cosmetic Sawblade Skins.
* **Macro Loop (Multi-Day Retention):**  
  Return to Collect Offline Idle Drill Earnings $\to$ Claim 7-Day Login Streak Reward $\to$ Reach $1,300\text{ m}$ Quantum Core $\to$ Trigger Core Overclock Prestige for permanent Relic Gems and Mythic Skins.

### 2.3 Controls & Input Specifications
All inputs are designed around a single universal mechanic that plays identically on desktop mice, laptop trackpads, mobile touchscreens, and Chromebooks:

| Platform / Input | Aim Action | Launch Action | Cancel Shot | Secondary Shortcuts |
| :--- | :--- | :--- | :--- | :--- |
| **Mouse (Desktop)** | Left-click + drag downward/backward (slingshot) or drag toward target (toggleable in Settings; **Slingshot Pull** is default for mobile ergonomics) | Release mouse button | Drag back within $16\text{ px}$ deadzone of launcher origin | `R` to quick-relaunch after run ends; `M` to toggle mute |
| **Touch (Mobile/Tablet)** | Single-finger touch + drag anywhere on playfield (relative drag so finger never occludes the launcher) | Lift finger | Drag back to deadzone | Tap UI buttons directly |
| **Keyboard Fallback** | `Left`/`Right` Arrow or `A`/`D` (auto-adapts to AZERTY `Q`/`D` via `event.code`) to rotate aim angle | `Space` or `Enter` to fire at max power | N/A | `1`--`6` to buy upgrades when drawer is open |

**Strict Input Compliance Rules:**
* **Forbidden Keys:** Never bind `Escape` (exits browser fullscreen), `Ctrl+W` / `Cmd+W` (closes tab), `F5`, or `Tab`.
* **Pointer Isolation:** Apply CSS `touch-action: none; user-select: none; -webkit-user-select: none;` to the canvas container, and prevent default on `contextmenu` and `wheel` events to stop accidental right-click menus, text highlighting, or mobile swipe-to-refresh.
* **Device Detection:** Never detect mobile UI solely via `ontouchstart` or `navigator.maxTouchPoints` (touchscreen laptops would misidentify as phones). Use the host platform's SDK device-type API with viewport aspect-ratio fallback.

### 2.4 Physics & Ballistics Specification
Generic physics engines (Box2D/Matter.js) frequently suffer from tunneling at high speeds and corner-snagging on tiled grids. Ricochet Miner uses a **custom deterministic 2D circle-vs-AABB and circle-vs-circle swept collision solver** running on a fixed timestep.

* **Fixed Timestep (Refresh-Rate Independence):**  
  Physics ticks execute at a fixed interval $\Delta t = \frac{1}{120}\text{ s}$ ($120\text{ Hz}$). Frame delta time from `requestAnimationFrame` is clamped at $\Delta t_{\max} = 0.05\text{ s}$ and consumed via an accumulator loop, with linear position interpolation for rendering. This guarantees identical physics on $60\text{ Hz}$, $120\text{ Hz}$, $144\text{ Hz}$, and $165\text{ Hz}$ displays.
* **Launch Velocity & Aiming Bounds:**  
  * Aim angle $\theta$ is clamped to downward angles between $12^{\circ}$ and $168^{\circ}$ below the horizontal so orbs cannot get trapped bouncing horizontally along the ceiling.
  * Launch speed $v_0 = 920\text{ px/s}$ (in logical coordinates, shaft width $W = 540\text{ px}$).
  * Gravity acceleration $g = 480\text{ px/s}^2$ downward (tuned light enough for sweeping pinball arcs, heavy enough to drive players deeper).
* **Restitution & Velocity Management:**  
  * Standard block/wall restitution $e = 0.96$.
  * Pinball bumper restitution $e_{\text{bumper}} = 1.25$ (capped at terminal speed $v_{\max} = 1,450\text{ px/s}$).
  * **Minimum Speed Floor:** If orb speed drops below $v_{\min} = 420\text{ px/s}$, a gentle velocity normalization boosts it back to $420\text{ px/s}$ along its movement vector to keep gameplay snappy.
  * **Anti-Softlock Failsafe:** If an orb collides with side walls $4$ consecutive times without hitting a block (shallow horizontal trap), an automatic downward angular deflection of $\Delta \theta = 8^{\circ}$ is injected. If any orb remains active for $> 25\text{ s}$ without destroying a block, a visible "Overheat Recall" rapidly drains its remaining bounces.
* **Bounce Stamina ($B_{\max}$) & Cleave Mechanic:**  
  * Each orb spawns with a Bounce Stamina pool $B_{\max}$ determined by the player's *Max Bounces* upgrade.
  * Colliding with a block deals Drill Damage $D$ and consumes $1$ bounce—**unless** the orb's damage exceeds the block's remaining HP by at least $2\times$ ($D \ge 2 \cdot \text{HP}_{\text{rem}}$), in which case the orb **Cleaves** straight through the block without losing velocity or bounce stamina! This makes upgrading Drill Damage feel viscerally powerful.
  * Colliding with shaft walls consumes $0.5$ bounce (rounded cleanly via integer half-steps, i.e., $2$ wall hits $= 1$ bounce) to discourage wasteful wall-only bounces while keeping ricochet bank shots rewarding.
  * When an orb reaches $0$ bounces, it shatters in a spark burst. The run concludes when all active orbs in the volley expire.
* **Aiming Trajectory Preview:**  
  A live raycast displays $14$ evenly spaced glowing dots predicting the initial gravitational arc plus the exact reflection vector off the first solid surface.

---

## 3. Level Architecture, Entities & Biome Progression

### 3.1 Responsive Shaft Architecture
* **Logical Playfield:** Width $W = 540\text{ px}$ divided into $9$ columns of $60\text{ px} \times 60\text{ px}$ tile cells. Shaft height extends infinitely downward in dynamically generated $12$-row procedural chunks ($720\text{ px}$ per chunk, where $1\text{ row} = 2.5\text{ m}$ of depth).
* **Viewport Adaptation:**
  * **Desktop Landscape (16:9):** The $540\text{ px}$ mining shaft sits centered at full vertical height. The left flanking panel displays live **Depth Meter, Biome Progress Bar, and Active Daily Quests**; the right flanking panel displays the **Quick Upgrade Panel & Skin/Audio Controls** against layered parallax cavern artwork (never plain black bars).
  * **Mobile Portrait (9:16):** The $540\text{ px}$ shaft fills $100\%$ of horizontal screen width. Compact HUD pills float cleanly in the top safe area; the Upgrade Drawer slides up cleanly between runs.
* **Dynamic Camera Tracking:** During a launch, the camera smoothly tracks the vertical centroid of the lowest active orb (with a look-ahead bias of $+160\text{ px}$ downward so players always see upcoming TNT crates and bumpers).

### 3.2 Block & Interactive Entity Catalog
Every entity uses distinct geometric silhouettes, high-contrast colors, and crack-overlay stages ($75\%$, $50\%$, $25\%$ HP) so gameplay is $100\%$ readable on small screens and while muted.

| Entity | Silhouette & Color | HP Multiplier ($M_{\text{type}}$) | Coin Multiplier ($M_{\text{ore}}$) | Special Mechanic | Muted Visual Feedback |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Strata Stone** | Beveled square (Biome-tinted) | $1.0$ | $1.0$ | Standard destructible filler block | Dust puff + 3 crack stages |
| **Reinforced Granite** | Thick riveted hex-block (Dark slate) | $2.5$ | $1.8$ | Blocks direct paths; encourages bank shots | Metallic sparks + dent flash |
| **Ore Vein (Gold / Gem)** | Embedded sparkling crystal cluster | $1.4$ | $3.5$ | Primary coin generator | Shimmer gleam + coin burst |
| **TNT Crate** | Bright crimson box with yellow hazard stripes | $0.5$ | $1.5$ | Explodes in a $2.5$-tile radius dealing $3.5 \times D$ damage; **chains** other TNT crates | $35\text{ ms}$ hit-stop, shockwave ring, heavy shake |
| **Pinball Bumper** | Glowing neon circle with outer ring | Indestructible (vanishes after 5 hits) | $0.5$ per hit | Restores $+2$ Bounce Stamina to hitting orb and boosts velocity by $1.25\times$ | Expanding neon ring + "+2" floating text |
| **Splitter Prism** | Translucent cyan diamond | $0.4$ | $1.0$ | Shatters on hit and spawns $1$ temporary clone orb with $50\%$ of current remaining bounces (max $12$ active orbs on screen for performance) | Prismatic rainbow flash + twin trail split |
| **Laser Drill Cell** | Yellow/black striped horizontal emitter | $1.0$ | $1.5$ | Fires a high-energy beam clearing all blocks in its horizontal row for $2.5 \times D$ damage | Full-width laser flash + molten embers |
| **Vault Chest** | Ornate gold/purple $2 \times 1$ double block | $4.5$ | $12.0$ | Spawns every $50\text{ m}$; drops huge coin fountain + guaranteed Skin Shard | Golden light rays + confetti coins |
| **Bedrock Boss Gate** | Full-width armored barrier at biome boundary | $8.0$ (per weak-point core, $3$ cores) | $25.0$ | Guards entry to the next biome; HP persists across runs until broken! | Persistent cracks + boss HP bar at top |

*Design Note on Persistent Boss Gate HP:* Allowing the Bedrock Boss Gate's damage to persist across consecutive runs creates a massive "just one more run" hook—and sets up the highest-converting Rewarded Video trigger (*+1 Extra Launch* when the gate is below $15\%$ HP).

### 3.3 Biome Progression & Fast-Drop Elevator
Every biome refreshes the visual palette, introduces a signature environmental gimmick, and steps up the coin economy multiplier ($M_{\text{biome}}$):

| # | Biome Name | Depth Range | Visual Palette | Biome Coin Multiplier ($M_{\text{biome}}$) | Signature Gimmick |
| :---: | :--- | :---: | :--- | :---: | :--- |
| 1 | **Sunlit Quarry** | $0\text{ m} \text{ to } 150\text{ m}$ | Warm terracotta, gold, sky-blue accents | $1\times$ | Generous TNT clusters; wide corridors for immediate mastery |
| 2 | **Crystal Caverns** | $150\text{ m} \text{ to } 350\text{ m}$ | Deep indigo, electric cyan, magenta crystals | $3\times$ | Introduces **Splitter Prisms** for chaotic multi-orb combos |
| 3 | **Magma Foundry** | $350\text{ m} \text{ to } 600\text{ m}$ | Obsidian charcoal, molten orange, glowing amber | $10\times$ | Introduces **Laser Drill Cells** and high-density TNT chains |
| 4 | **Subzero Abyss** | $600\text{ m} \text{ to } 900\text{ m}$ | Midnight navy, glacial frost white, ice blue | $35\times$ | **Frost Blocks** slide $1$ tile when hit, opening surprise ricochet lanes |
| 5 | **Cyber Neon Vault** | $900\text{ m} \text{ to } 1,300\text{ m}$ | Matte violet-black, acid lime, synthwave pink | $120\times$ | **Warp Portals** teleport orbs to deeper chambers with bonus bounce energy |
| 6 | **Quantum Core** | $1,300\text{ m}+$ | Cosmic void black, radiant gold, prismatic white | $400\times \cdot 1.15^{k}$ | Endless prestige strata ($k = \lfloor (d - 1300)/250 \rfloor$); dense Vault Chests |

**Fast-Drop Elevator Mechanic:**  
Once a player shatters a Biome's Bedrock Boss Gate, they permanently unlock that biome's **Elevator Checkpoint**. Before launching, players can select any unlocked biome checkpoint (defaulting automatically to their deepest unlocked biome) to drop straight into high-value strata. This prevents early-biome tedium and keeps every run strictly within the sweet spot of $20\text{--}40\text{ seconds}$.

---

## 4. Economy, Progression & Mathematical Balancing

All formulas below have been calibrated to guarantee that:
1. Run 1 always yields an immediate upgrade.
2. Mid-game progression maintains a tight cadence of $1\text{--}3$ runs per upgrade.
3. Biome multipliers stay tightly synchronized with exponential upgrade costs so players neither hit impossible walls nor trivialize late-game content.

### 4.1 Block HP & Coin Yield Formulas
For a block at depth $d$ (in meters) inside biome $b$:

$$\text{HP}(d) = \left\lfloor 10 \cdot (1 + 0.015d)^{1.35} \cdot M_{\text{type}} \right\rfloor$$

$$\text{CoinValue}(d) = \left\lfloor 4 \cdot (1 + 0.008d) \cdot M_{\text{biome}} \cdot M_{\text{ore}} \cdot M_{\text{val}}(L_{\text{val}}) \right\rfloor$$

Where:
* $M_{\text{type}}$ and $M_{\text{ore}}$ come from the Entity Catalog (Section 3.2).
* $M_{\text{biome}}$ comes from the Biome Progression Table (Section 3.3).
* $M_{\text{val}}(L_{\text{val}})$ is the player's *Ore Value* upgrade multiplier.

### 4.2 Core Upgrade Specifications
Upgrade costs follow a clean geometric curve:

$$C(L) = \left\lfloor C_0 \cdot r^{L - 1} \right\rfloor$$

where $L$ is the current level ($L = 1$ buys Level $2$).

| Upgrade Name | Base Cost ($C_0$) | Growth Rate ($r$) | Max Level ($L_{\max}$) | Effect Formula at Level $L$ | Gameplay Feel Impact |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **Drill Damage** | $25$ | $1.35$ | $40$ | $D(L) = 10 + 6(L-1) + 0.35(L-1)^2$ | Enables one-shot **Cleaves** through blocks |
| **Max Bounces** | $30$ | $1.36$ | $30$ | $B_{\max}(L) = 8 + 2(L-1)$ | Extends run chain-reaction duration |
| **Multi-Orb Volley** | $180$ | $2.90$ | $6$ | $N_{\text{orbs}}(L) = L$ (fires in $0.12\text{ s}$ burst) | Massive visual spectacle & clearing power |
| **Orb Size & Blast** | $40$ | $1.38$ | $20$ | $R(L) = 14 + 0.75(L-1)\text{ px}$; TNT radius $+3\%$ per $L$ | Easier bumper hits & wider cleave corridor |
| **TNT & Bumper Luck** | $50$ | $1.37$ | $20$ | Spawn weight $+1.5\%$ per $L$ (base $8\%$ TNT, $6\%$ Bumper) | Turns shafts into explosive pinball cascades |
| **Ore Value** | $35$ | $1.36$ | $35$ | $M_{\text{val}}(L) = 1 + 0.25(L-1) + 0.02(L-1)^2$ | Accelerates coin generation across all biomes |

### 4.3 Economy Sanity Check Across Game Stages

| Stage / Biome | Typical Upgrade Level ($L$) | Typical Block HP ($M_{\text{type}}=1$) | Drill Damage $D(L)$ | Est. Coins Per Run | Next Upgrade Cost Range | Runs Per Upgrade |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Run 1 (Quarry, $10\text{ m}$)** | $1$ | $12$ | $10$ | $40\text{--}60$ | $25\text{--}35$ | $0.5\text{--}1.0$ |
| **Late Quarry ($120\text{ m}$)** | $6$ | $38$ | $49$ | $220\text{--}400$ | $115\text{--}250$ | $1.0$ |
| **Crystal Caverns ($250\text{ m}$)** | $12$ | $82$ | $118$ | $1,800\text{--}3,800$ | $700\text{--}2,200$ | $1.0\text{--}1.5$ |
| **Magma Foundry ($480\text{ m}$)** | $18$ | $174$ | $213$ | $14,000\text{--}28,000$ | $5,000\text{--}18,000$ | $1.0\text{--}2.0$ |
| **Subzero Abyss ($750\text{ m}$)** | $25$ | $302$ | $356$ | $90,000\text{--}190,000$ | $35,000\text{--}140,000$ | $1.5\text{--}2.0$ |
| **Cyber Vault ($1,100\text{ m}$)** | $32$ | $484$ | $532$ | $550,000\text{--}1.1\text{M}$ | $280,000\text{--}950,000$ | $1.5\text{--}2.5$ |
| **Quantum Core ($1,350\text{ m}+$)** | $38$ | $627$ | $711$ | $2.8\text{M}\text{--}5.5\text{M}$ | $1.6\text{M}\text{--}3.5\text{M}$ | $2.0\text{--}3.0$ |

### 4.4 Core Overclock (Prestige System)
Upon reaching $1,300\text{ m}$, players unlock **Core Overclock**:
* Resets the 6 core upgrades and returns to Shaft 1 while keeping all unlocked Skins, Daily Streak, and Achievements.
* Awards permanent **Relic Gems** granting a global $+50\%$ Damage and $+50\%$ Coin multiplier per Overclock level, ensuring dedicated players can play for $10+$ hours without running out of progression.

---

## 5. Retention & Meta-Systems

### 5.1 Unlockable Sawblade Skins (12 Launch Skins)
Skins modify the orb silhouette, spinning blade geometry, impact spark hue, and motion ribbon trail. Keeping them cosmetic (or offering a 1-run Super-Blade trial) preserves balance while driving strong collection motivation.
* **4 Milestone Skins:** Unlocked by shattering Biome Boss Gates (Crystal Saw, Magma Core, Frost Shuriken, Neon Disk).
* **4 Mastery / Quest Skins:** Unlocked via cumulative goals (e.g., *Demolitionist* for detonating $250$ TNT crates; *Ricochet King* for achieving a $40$-bounce combo).
* **4 Ad-Unlockable / Vault Shard Skins:** Unlocked by collecting $10$ Skin Shards from Vault Chests or watching $3$ cumulative Rewarded Videos per skin (progress bar visibly fills $1/3 \to 2/3 \to 3/3$, driving high RV completion).

### 5.2 Offline Idle Drill (Primary D1 Retention Hook)
After completing Run 3, the player unlocks a passive **Auto-Drill Drone** that mines coins while the browser tab is closed:
* **Earning Rate:** $15\%$ of the player's rolling average coins-per-minute, capped at $4\text{ hours}$ of offline time.
* **Return Trigger:** Returning after $\ge 15\text{ minutes}$ displays a celebratory **"Welcome Back!"** modal showing the accumulated coin pile with two clear buttons: **Collect** and **Collect $2\times$ (Watch Ad)**.

### 5.3 7-Day Login Calendar & Rotating Daily Quests
* **7-Day Login Streak:** Escalating rewards—Day 1 ($300\text{ Coins}$), Day 2 ($+1\text{ Free Damage Upgrade}$), Day 3 ($5\text{ Skin Shards}$), Day 4 ($1,500\text{ Coins}$), Day 5 (*Overdrive Blade 3-Run Pass*), Day 6 ($10\text{ Skin Shards}$), Day 7 (**Exclusive Golden Cyber-Saw Skin**). Uses platform server time where available (e.g., Yandex `ysdk.serverTime()`) with safe local UTC date fallback.
* **3 Daily Quests:** Auto-refreshed every $24\text{ hours}$ (e.g., *"Detonate 20 TNT Crates"*, *"Hit 35 Pinball Bumpers"*, *"Destroy 120 Ore Blocks"*). Completing all $3$ unlocks a **Daily Mega Chest** containing coins + Skin Shards.

### 5.4 Auto-Save & Cloud Persistence
* **Save Triggers:** Automatically serialize game state (`JSON` payload $\le 8\text{ KB}$) immediately after every run ends, every upgrade purchase, and every skin/quest claim.
* **Dual-Layer Storage:** Write simultaneously to `localStorage` (wrapped in `try/catch` for Safari private browsing/sandboxed iframes) and the active platform's Cloud Data SDK (CrazyGames `data.setItem`, Yandex `player.setData`). On load, compare `saveTimestamp` and `totalCoinsEarned` to resolve conflicts in favor of the furthest progress.

---

## 6. Monetization & Ad Revenue Architecture

The monetization model prioritizes **Rewarded Video (RV)** over intrusive interstitials, maximizing eCPM and ARPDAU while protecting session playtime and Day-1 retention.

### 6.1 Rewarded Video Placements (Target: $65\%+$ of Ad Revenue)

| Placement ID | Trigger Condition | Player Reward | Cooldown / Cap | UX & Compliance Rule |
| :--- | :--- | :--- | :--- | :--- |
| `rv_double_run` | Run ends with earnings $\ge 1.2\times$ the player's rolling 3-run average | $2\times$ total coins earned in that run | Once every 2 runs | Side-by-side with equal-visibility "Continue" button; no deceptive delay |
| `rv_extra_launch` | Run ends while a **Vault Chest** or **Bedrock Boss Gate** is visible on screen at $\le 20\%$ HP | Fires $+1$ bonus orb immediately from current shaft state without resetting block damage | Once per run | High-urgency 5-second visual highlight; instant skip option |
| `rv_free_upgrade` | Player opens Upgrade Drawer and lacks $10\%\text{--}35\%$ of the cost for their cheapest affordable tier | Grants $1$ free level of that upgrade immediately | Once every 4 runs | Clear video badge on the upgrade card |
| `rv_overdrive_trial` | Offered on pre-launch HUD once every 6 runs | Next run uses a $+40\%$ size blazing Super-Orb with $+100\%$ TNT spawn rate | Once every 6 runs | Showcases high-level power fantasy to drive upgrade motivation |
| `rv_offline_double` | Player returns after $\ge 15\text{ min}$ offline | $2\times$ Offline Idle Drill coin payout | Once per return session | Primary D1 monetization spike |
| `rv_skin_progress` | Inside Skin Shop | Adds $+1/3$ unlock progress toward selected premium skin | Unlimited (player-initiated) | Never interrupts gameplay |

**Reward Verification Mandate:** Never grant a reward until the platform SDK's `adFinished` / `onRewarded` callback fires cleanly. If the user closes an ad early or the ad errors out, gracefully resume the game without granting the reward and display a non-intrusive toast (*"Watch full video to claim reward"* or *"No ad available right now"*).

### 6.2 Midgame Interstitials (Commercial Breaks)
* **New-Player Grace Period:** Zero midgame ads during the first $180\text{ seconds}$ ($3\text{ minutes}$) of a player's first session. This protects 1-minute Gameplay Conversion and hooks the player before introducing ad friction.
* **Strict Cooldown Timer:** Minimum $150\text{ seconds}$ ($2.5\text{ minutes}$) between midgame ads.
* **Rewarded Ad Relief Rule:** Watching *any* Rewarded Video automatically resets the midgame ad cooldown timer back to $150\text{ seconds}$ (explicitly recommended by Poki and CrazyGames to reward opt-in users).
* **Transition Timing:** Triggered strictly when tapping **Relaunch** after a completed run—never mid-trajectory, never while aiming, and never right after opening the Upgrade Drawer.
* **Pre-Ad Cue:** Display a clean $0.4\text{ s}$ *"Short Break..."* transition state before invoking the ad call so players are never startled.

### 6.3 Banner Ads (Platform-Conditional)
* **CrazyGames:** Request a responsive banner (`requestResponsiveBanner`) strictly inside a dedicated safe container on the **Skin Shop / Daily Quest overlay**—never during active gameplay. Clear the banner immediately upon returning to the shaft.
* **Yandex Games:** Enable platform sticky banner only if viewport height permits without compressing the active shaft aspect ratio beyond $2:1$.
* **Poki / GameDistribution:** Banner calls are disabled via the platform adapter.

### 6.4 AdBlock & Ad-Error Resilience
* Games **must remain $100\%$ playable with AdBlock enabled** (mandatory on CrazyGames).
* Never display anti-AdBlock nag walls. If the SDK detects AdBlock or fails to fill an ad, gracefully hide or grey out Rewarded Video buttons with a subtle label (*"Ad Unavailable"*) and continue the gameplay loop immediately without hanging.

---

## 7. High-CTR Storefront & Marketing Assets Specification

Because portal discovery algorithms heavily weight **Click-Through Rate (CTR)** alongside **1-Minute Conversion**, cover art and hover videos are treated as core product features rather than afterthoughts.

### 7.1 Mandatory Asset Dimensions Matrix

| Platform | Asset Type | Required Dimensions | Aspect Ratio | Format / Max Size |
| :--- | :--- | :---: | :---: | :--- |
| **CrazyGames** | Landscape Cover | $1920 \times 1080\text{ px}$ | $16:9$ | PNG / JPG (High-res) |
| **CrazyGames** | Portrait Cover | $800 \times 1200\text{ px}$ | $2:3$ | PNG / JPG |
| **CrazyGames** | Square Cover | $800 \times 800\text{ px}$ | $1:1$ | PNG / JPG |
| **CrazyGames** | Landscape Hover Video | $1920 \times 1080\text{ px}$ ($1080\text{p}$) | $16:9$ | MP4 (H.264), $15\text{--}20\text{ s}$, $\le 50\text{ MB}$ |
| **CrazyGames** | Portrait Hover Video | $1080 \times 1620\text{ px}$ ($1080\text{p}$) | $2:3$ | MP4 (H.264), $15\text{--}20\text{ s}$, $\le 50\text{ MB}$ |
| **Yandex Games** | Game Icon | $512 \times 512\text{ px}$ | $1:1$ | PNG / JPG |
| **Yandex Games** | Horizontal Cover | $800 \times 470\text{ px}$ | $\approx 1.7:1$ | PNG / JPG |
| **Poki / GD / Y8** | Key Art Pack | $1920 \times 1080$, $1200 \times 1200$, $512 \times 512\text{ px}$ | $16:9$, $1:1$ | PNG / JPG |

### 7.2 High-CTR Cover Art Composition Blueprint
* **Single Bold Focal Point:** A glowing electric-cyan cyber-sawblade orb frozen mid-impact smashing directly through a gleaming golden crystal vein and a red TNT crate, erupting with high-contrast amber sparks and flying gold coins toward the viewer.
* **Color Contrast Strategy:** Deep midnight-indigo cavern background ($< 15\%$ luminance) behind ultra-saturated cyan, crimson, and gold foreground elements ($> 85\%$ saturation) so the thumbnail pops unmistakably on both dark-mode (CrazyGames) and light-mode (Poki/Yandex) portal grids.
* **Typography:** Bold, metallic-extruded stylized logo **"RICOCHET MINER"** positioned cleanly in the upper-third (Landscape/Portrait) or center-bottom (Square), verified legible when scaled down to $160 \times 90\text{ px}$ mobile thumbnails.
* **Strict Platform Prohibitions:**
  * **Zero** decorative borders, frames, or baked-in rounded corners.
  * **Zero** promotional callouts (*"PLAY NOW"*, *"NEW"*, *"FREE"*, *"UPDATE"*).
  * **Zero** UI HUD clutter (no health bars, settings gears, or mouse cursors) and zero external store/social logos.
  * **Honest Representation:** Visual style matches actual gameplay shaders/colors so high CTR converts cleanly into $\ge 85\%$ 1-minute retention.

### 7.3 18-Second Hover Preview Video Storyboard
Portal users hover over thumbnails for $2\text{--}5\text{ seconds}$ before clicking, making the opening frames decisive:

* **$0.0\text{ s} \text{ to } 1.5\text{ s}$ (Instant Hook):** Starts directly on the bright cover key art, which immediately shatters away like ore blocks into live gameplay—**zero black fade-in, zero studio logo**.
* **$1.5\text{ s} \text{ to } 6.5\text{ s}$ (Core Mechanic Clarity):** Clean custom aiming line pulls back and fires a spinning orb into a glowing pinball bumper $\to$ ricochets straight into a 3-crate TNT chain reaction with punchy hit-stop, screen shake, and flying coins.
* **$6.5\text{ s} \text{ to } 12.5\text{ s}$ (Progression Escalation):** Quick $0.2\text{ s}$ zoom-cut to the Crystal Caverns and Magma Foundry biomes showing a **4-orb Multi-Orb Volley** hitting a Splitter Prism and filling the shaft with $8$ blazing orbs tearing through dense ore walls.
* **$12.5\text{ s} \text{ to } 18.0\text{ s}$ (Climax & Seamless Loop):** Shattering a gleaming Vault Chest into a fountain of gold coins and unlocking a radiant Neon Sawblade skin before seamlessly cutting back to the opening frame.
* **Video Compliance:** Full-bleed footage (no top/bottom black bars), OS mouse cursor completely hidden (custom in-game aiming hand shown instead), no text banners or watermarks.

### 7.4 Post-Launch Cover A/B Testing Protocol
Once approved for Full Launch on CrazyGames, run structured **Artwork Experiments** (minimum $7\text{--}14\text{ days}$ per test to account for weekend traffic shifts):
* **Variant A (Baseline):** Cyan Sawblade smashing Gold + TNT (Action Focus).
* **Variant B (Test):** Multi-Orb Chaos (3 colorful glowing blades bouncing through a Neon Crystal cavern).
* **Decision Rule:** Promote a variant only if it lifts **CTR** *without* degrading **1-Minute Conversion** or **D1 Retention**.

---

## 8. Visual Direction, Audio & "Muted-First" Juice

### 8.1 Visual Aesthetic
* **Style:** Crisp, high-contrast **Neon-Industrial Vector** art rendered procedurally via HTML5 Canvas 2D / WebGL shaders (crisp outlines, soft additive glow passes, beveled geometric blocks).
* **Advantages:** Zero compression artifacts across `devicePixelRatio` $1\times$ to $3\times$, minimal texture memory footprint ($< 1.2\text{ MB}$), and effortless palette swapping across all 6 biomes.

### 8.2 Muted-First Feedback Mandate
A large portion of browser portal players play on school Chromebooks or office devices with sound disabled. Every gameplay state must communicate clearly with **zero audio**:

* **Impact Polish:** $40\text{ ms}$ pure-white silhouette hit-flash on damaged blocks + directional micro-shake ($2\text{--}8\text{ px}$ damped spring).
* **TNT / Boss Break Juice:** $35\text{ ms}$ hit-stop freeze frame, expanding radial shockwave ring, warm screen edge vignette pulse, and pooled directional debris particles.
* **Bounce Energy Telegraphing:** An arc meter hugs the orb's perimeter showing remaining bounces; on the final $2$ bounces, the orb's trail shifts from electric cyan to pulsing warning amber.
* **Floating Combat & Loot Telemetry:** Crisp color-coded numbers (`+45` gold coins, `CRIT!` cleave tags, `+2` cyan bumper bounce boosts) rise and fade cleanly without overlapping critical sightlines.

### 8.3 Audio Specification & Lifecycle Rules
* **Lightweight Audio Footprint ($\le 800\text{ KB}$ total):** Combine Web Audio API procedural synthesis (for pitch-escalating bounce chimes) with compressed `.ogg`/`.mp3` SFX (stone crunch, TNT bass boom, crystal shatter, coin chime, upgrade fanfare).
* **Dopamine Pitch Escalation:** Each consecutive block hit within a single orb's bounce chain ascends along a bright C-major pentatonic scale ($C_5, D_5, E_5, G_5, A_5, C_6\dots$), making long ricochet combos deeply satisfying.
* **Mandatory Audio Controls & Compliance:**
  * Persistent global **Mute/Unmute** icon always accessible in the top HUD corner.
  * Automatically mute and suspend `AudioContext` whenever `adStarted` fires or `document.visibilityState === 'hidden'`, and resume cleanly on `adFinished` / tab focus.
  * **iOS Safari Audio Fix:** Attach a one-shot `pointerdown`/`touchend` listener after every ad break or interruption to call `audioCtx.resume()`, preventing the known iOS WebKit silent-audio bug.

---

## 9. Technical Architecture & Multi-Portal SDK Abstraction

### 9.1 Tech Stack & Performance Budget
* **Language & Tooling:** TypeScript + Vite (strict relative asset paths `./assets/...` — zero root-relative `/assets/...` paths that break on CDN subpaths).
* **Rendering & Physics:** Lightweight HTML5 Canvas 2D (or PixiJS v8 WebGL with Canvas fallback) paired with a custom fixed-timestep deterministic swept-circle physics module and strict object pooling (zero per-frame garbage collection spikes).

| Resource Metric | Portal Hard Limit | Ricochet Miner Budget | Verification Method |
| :--- | :---: | :---: | :--- |
| **Initial Download (to Playable)** | $\le 20\text{ MB}$ (Mobile Homepage) / $\le 50\text{ MB}$ (Desktop) | $\le 2.5\text{ MB}$ | Chrome DevTools Network (gzipped transfer before `gameplayStart`) |
| **Total Bundle Size** | $\le 250\text{ MB}$ | $\le 6.0\text{ MB}$ | Final build `.zip` size |
| **Total File Count** | $\le 1,500\text{ files}$ | $\le 35\text{ files}$ | Bundled JS + texture atlas + audio sprites |
| **Runtime Frame Rate** | Stable $60\text{ FPS}$ on $4\text{ GB}$ RAM Chromebook | $60\text{ FPS}$ (capped at $120$ pooled particles) | Throttled $4\times$ CPU test in Chrome DevTools |
| **Heap Memory Usage** | No OOM crashes on Safari iOS / Low-RAM Android | $\le 120\text{ MB}$ | Memory Profiler snapshot over 20-minute soak test |

### 9.2 Unified Portal SDK Bridge (`PortalSDK` Adapter Pattern)
To publish seamlessly across multiple portals from a single codebase without shipping forbidden third-party scripts in any build, all platform calls route through an abstract `IPortalAdapter` interface selected at build time via `VITE_PLATFORM` (`crazygames`, `poki`, `gamedistribution`, `yandex`, `gamepix`, `y8`, `standalone`).

| Unified Method | CrazyGames SDK v3 | Poki SDK v2 | GameDistribution SDK | Yandex Games SDK v2 |
| :--- | :--- | :--- | :--- | :--- |
| `init()` | `CrazyGames.SDK.init()` | `PokiSDK.init()` | Wait for `SDK_READY` in `GD_OPTIONS` | `YaGames.init()` |
| `loadingFinished()` | `sdk.game.loadingStop()` | `PokiSDK.gameLoadingFinished()` | Handled automatically | `ysdk.features.LoadingAPI.ready()` |
| `gameplayStart()` | `sdk.game.gameplayStart()` | `PokiSDK.gameplayStart()` | Internal state tracking | `ysdk.features.GameplayAPI.start()` |
| `gameplayStop()` | `sdk.game.gameplayStop()` | `PokiSDK.gameplayStop()` | Internal state tracking | `ysdk.features.GameplayAPI.stop()` |
| `happyTime()` | `sdk.game.happytime()` (on Boss Gate / Vault break) | N/A (no-op) | N/A (no-op) | N/A (no-op) |
| `showMidgameAd()` | `sdk.ad.requestAd('midgame', cb)` | `PokiSDK.commercialBreak()` | `gdsdk.showAd()` | `ysdk.adv.showFullscreenAdv()` |
| `showRewardedAd()` | `sdk.ad.requestAd('rewarded', cb)` | `PokiSDK.rewardedBreak()` | `gdsdk.showAd('rewarded')` | `ysdk.adv.showRewardedVideo()` |
| `saveData(json)` | `sdk.data.setItem()` + `localStorage` | `localStorage` | `localStorage` | `player.setData()` + `localStorage` |
| `getLocale()` | `sdk.environment` / browser fallback | `navigator.language` | `navigator.language` | `ysdk.environment.i18n.lang` |

**Exact Event Sequencing (Zero Telemetry Drift):**
1. **Startup:** `init()` $\to$ Load core assets $\to$ `loadingFinished()` $\to$ Render Shaft 1 immediately $\to$ `gameplayStart()` on first player drag input.
2. **Run End + Midgame Ad:** `gameplayStop()` $\to$ Pause simulation & mute audio $\to$ `showMidgameAd()` $\to$ On callback: unmute & resume $\to$ `gameplayStart()` when next shot begins.
3. **Run End + Rewarded Ad:** `gameplayStop()` $\to$ Pause & mute $\to$ `showRewardedAd()` $\to$ On `rewarded === true`: grant reward & reset midgame timer $\to$ Unmute & resume.
4. **Shop / Idle Menus:** Keep `gameplayStop()` active while browsing Skin Shop or Settings; resume `gameplayStart()` when aiming returns.

### 9.3 Responsive Iframe Validation Matrix
All UI typography (minimum $14\text{ px}$ effective legibility at `devicePixelRatio: 1`), button hitboxes (minimum $44 \times 44\text{ px}$), and canvas scaling must pass visual QA without clipping or overlap across every primary portal viewport:

* **Desktop Non-Fullscreen Iframes:** $907 \times 510$, $1216 \times 684$, $1077 \times 606$, $821 \times 462$.
* **Desktop Fullscreen:** $1280 \times 720$, $1366 \times 768$, $1536 \times 864$, $1920 \times 1080$.
* **Tablet & Mobile Landscape:** $1080 \times 607$, $800 \times 450$.
* **Mobile Portrait:** $390 \times 844$, $360 \times 800$.

### 9.4 Localization Architecture
* **Icon-First UI:** $85\%$ of in-game HUD uses universal iconography (coins, pickaxe, lightning, TNT, depth meters) to minimize text bloat.
* **Launch Languages:** English (`en`, mandatory fallback), Russian (`ru`, essential for Yandex Games), Spanish (`es`), Portuguese (`pt`), French (`fr`), German (`de`), Turkish (`tr`), Japanese (`ja`), and Korean (`ko`).
* **Dynamic Auto-Switch:** Read locale from `PortalSDK.getLocale()` at boot; fall back cleanly to `en` if unsupported. All strings fit within elastic UI containers with `text-overflow` protection to handle longer German/Russian labels.

---

## 10. Multi-Portal QA & Compliance Master Checklist

Every release candidate must pass $100\%$ of these gates before upload to avoid rejection or submission throttling:

* [ ] **Relative Asset Paths Only:** Zero leading-slash paths (`/assets/...`), zero external CDN font/script fetches outside the target platform's official SDK.
* [ ] **Zero Console Errors:** Clean browser console across Chrome, Edge, Safari (macOS & iOS), and Firefox with zero uncaught promise rejections.
* [ ] **Instant Playability:** Game lands directly in Shaft 1 with $0$ clicks; initial download to `gameplayStart` is $\le 2.5\text{ MB}$.
* [ ] **No Custom Fullscreen Button (CrazyGames):** Fullscreen toggle is hidden on CrazyGames builds (platform provides native fullscreen frame); enabled only where required.
* [ ] **Zero External Links & Cross-Promo:** No itch.io links, no Discord CTAs on active HUD, no App Store/Google Play badges, no links to rival portals, and no watermarks.
* [ ] **Guest Play Without Forced Auth:** Players can play and save progress immediately without logging in (mandatory for Yandex Games and CrazyGames).
* [ ] **Audio & Ad Pause Integrity:** Gameplay physics, timers, and all sound effects/music halt $100\%$ during every midgame and rewarded ad, and resume cleanly afterward (verified on iOS Safari).
* [ ] **Tab-Visibility Pause:** Switching browser tabs or minimizing the window immediately pauses physics and mutes audio.
* [ ] **Refresh-Rate Physics Parity:** Trajectory and bounce count verified identical on $60\text{ Hz}$ and $144\text{ Hz}$ monitors.
* [ ] **AdBlock Compatibility:** Full gameplay loop, upgrades, and save persistence verified working with uBlock Origin enabled (zero hangs or anti-AdBlock walls).
* [ ] **Mobile Ergonomics:** No page scrolling, no pull-to-refresh, no text selection on long press, and no system video player hijack.
* [ ] **PEGI 12 Content Safety:** Stylized neon geometric destruction only; zero gore, profanity, gambling mechanics, or copyrighted IP assets.
* [ ] **Platform QA Tool Verification:** Tested live inside the CrazyGames QA Tool, Poki Inspector, GameDistribution Test Environment, and Yandex Games Draft Console before final submission.

---

## 11. Solo Production Roadmap & Post-Launch LiveOps

### 11.1 6-Week Solo Development Schedule

| Week | Milestone | Key Deliverables |
| :---: | :--- | :--- |
| **Week 1** | **Core Physics Vertical Slice** | Fixed-timestep swept circle-vs-AABB physics, slingshot aiming raycast, bounce stamina, cleave mechanic, basic TNT & bumper entities. |
| **Week 2** | **Biomes, Entities & Muted Juice** | Procedural chunk generator, all 6 biome palettes, Bedrock Boss Gates, Vault Chests, Splitter Prisms, Laser Drills, hit-stop, particles, procedural Web Audio SFX. |
| **Week 3** | **Economy & Retention Meta** | All 6 upgrades with balanced curves, Fast-Drop Elevator, Offline Idle Drill, 7-Day Login Streak, 3 Daily Quests, 12 Sawblade Skins, Overclock Prestige, local/cloud save. |
| **Week 4** | **SDK Bridge & Responsive Polish** | `PortalSDK` adapter builds (CrazyGames, Poki, GD, Yandex), Ad placements + cooldown timers, 9-language localization, full iframe viewport QA matrix. |
| **Week 5** | **Storefront Assets & Hard QA** | High-CTR Cover Art (16:9, 2:3, 1:1, 512x512), 18 s 1080p Landscape + Portrait hover preview videos, Chromebook $4\text{ GB}$ RAM & iOS Safari soak testing. |
| **Week 6** | **Launch & Telemetry Calibration** | Execute Track A (Poki pitch) or Track B (CrazyGames Basic Launch + GD + Yandex + GamePix + Y8 simultaneous submission). |

### 11.2 Post-Launch KPI Diagnostic & LiveOps Tuning
During the 7-to-21-day CrazyGames Basic Launch window (or Poki playtest), monitor dashboard metrics daily and apply targeted hotfixes:

* **If Conversion (1m+) $< 80\%$:** Audit network waterfall for blocking assets, reduce initial load time below $3\text{ s}$, and increase TNT density in the first 3 rows of Shaft 1 so the very first shot triggers an unforgettable explosion.
* **If Average Playtime $< 10\text{ min}$:** Reduce Bedrock Boss Gate #1 HP by $20\%$ so players reach **Crystal Caverns** (Biome 2) within $5\text{ minutes}$, and ensure the Upgrade Drawer subtly highlights affordable upgrades after every run.
* **If Day-1 Retention $< 12\%$:** Surface the **Offline Idle Drill** unlock earlier (after Run 2) and show a clear countdown teaser for the Day-2 Free Upgrade login reward before the player leaves.
* **If CTR is below Top $20\%$:** Immediately prepare a bold Cover Experiment testing a brighter focal contrast, larger sawblade silhouette, and faster action cut in the first $1.5\text{ seconds}$ of the hover preview video.