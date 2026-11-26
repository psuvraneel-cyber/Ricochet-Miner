import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST_DIR = path.join(ROOT, 'dist', 'standalone');
const READY_DIR = path.join(ROOT, 'marketing-assets', 'ready');
const COVERS_DIR = path.join(READY_DIR, 'covers');
const SHOTS_DIR = path.join(READY_DIR, 'screenshots');
const VIDEOS_DIR = path.join(READY_DIR, 'videos');
const TMP_VIDEO_DIR = path.join(ROOT, 'marketing-assets', '.tmp-video');

const SAVE_KEY = 'ricochet_miner_save_v1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const rel = reqPath === '/' ? 'index.html' : reqPath.replace(/^\/+/, '');
      const fullPath = path.join(rootDir, rel);
      if (!fullPath.startsWith(rootDir) || !fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(fullPath).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, url: `http://127.0.0.1:${addr.port}/` });
    });
  });
}

function buildSaveData(overrides = {}) {
  const now = Date.now();
  const todayUtc = new Date(now).toISOString().slice(0, 10);
  return {
    version: 1,
    saveTimestamp: now,
    coins: 12450,
    totalCoinsEarned: 85000,
    shards: 14,
    prestigeLevel: 0,
    relicGems: 0,
    ascensionTier: 0,
    ascensionRecords: [],
    unlockedAchievements: [],
    claimedAchievements: [],
    runsCompleted: 14,
    recentRunEarnings: [900, 1100, 1400],
    recentRunCoinsPerMin: 800,
    maxDepthMeters: 492,
    unlockedBiomeIndex: 2,
    selectedBiomeIndex: 0,
    bossGateHpByBiome: {},
    upgrades: {
      damage: 4,
      bounces: 4,
      multiorb: 3,
      orbsize: 2,
      luck: 4,
      orevalue: 3,
      ...overrides.upgrades,
    },
    unlockedSkins: ['steel_sawblade', 'copper_gear', 'emerald_buzzsaw', 'magma_cutter', 'frost_star'],
    equippedSkin: 'magma_cutter',
    skinRvProgress: {},
    overdrivePasses: 0,
    stats: {
      tntDetonated: 28,
      bumpersHit: 42,
      blocksDestroyed: 412,
      vaultsBroken: 5,
      maxBounceCombo: 34,
      runsCompleted: 14,
      ...overrides.stats,
    },
    loginStreak: {
      day: 3,
      lastClaimDate: todayUtc,
      claimedToday: true,
    },
    dailyQuests: {
      dateKey: todayUtc,
      quests: [],
      megaChestClaimed: false,
    },
    settings: {
      muted: true,
      sfxMuted: false,
      musicMuted: false,
      musicVolume: 'high',
      aimMode: 'slingshot',
      localeOverride: 'en',
      ...overrides.settings,
    },
    ftueDone: true,
    lastActiveTimestamp: now,
    ...overrides,
    // Ensure nested upgrades/stats merge cleanly without being overwritten by top-level spread
    ...(overrides.upgrades
      ? {
          upgrades: {
            damage: 4,
            bounces: 4,
            multiorb: 3,
            orbsize: 2,
            luck: 4,
            orevalue: 3,
            ...overrides.upgrades,
          },
        }
      : {}),
  };
}

async function createSeededContext(browser, width, height, saveOverrides, recordVideoDir = null) {
  const ctxOpts = {
    viewport: { width, height },
    deviceScaleFactor: 1,
    ...(recordVideoDir
      ? {
          recordVideo: {
            dir: recordVideoDir,
            size: { width, height },
          },
        }
      : {}),
  };
  const context = await browser.newContext(ctxOpts);
  const saveJson = JSON.stringify(buildSaveData(saveOverrides));
  await context.addInitScript(
    ({ key, val }) => {
      try {
        window.localStorage.setItem(key, val);
      } catch {
        // ignore
      }
      const injectCursorCss = () => {
        if (!document.head) return;
        const st = document.createElement('style');
        st.textContent = 'html, body, canvas, * { cursor: none !important; }';
        document.head.appendChild(st);
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', injectCursorCss, { once: true });
      } else {
        injectCursorCss();
      }
    },
    { key: SAVE_KEY, val: saveJson }
  );
  const page = await context.newPage();
  return { context, page };
}

async function openGamePage(page, url) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: 'html, body, canvas, * { cursor: none !important; }' });
  await page.waitForSelector('[data-title="play"]', { state: 'visible', timeout: 10000 });
}

async function clickSafe(page, selector) {
  const loc = page.locator(selector).first();
  await loc.waitFor({ state: 'visible', timeout: 8000 });
  await loc.click({ force: true });
}

async function smoothSlingshotRelease(page, fromX, fromY, toX, toY, steps = 14, sweepPoints = []) {
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  for (const pt of sweepPoints) {
    await page.mouse.move(pt.x, pt.y, { steps: Math.max(4, Math.floor(steps / 2)) });
    await page.waitForTimeout(80);
  }
  await page.mouse.move(toX, toY, { steps });
  await page.waitForTimeout(160);
  await page.mouse.up();
}

async function captureScreenshots(browser, baseUrl) {
  fs.mkdirSync(SHOTS_DIR, { recursive: true });
  const W = 1280;
  const H = 720;

  // 1. 01_title_screen.png
  {
    const { context, page } = await createSeededContext(browser, W, H, {
      maxDepthMeters: 492,
      ascensionTier: 1,
      ascensionRecords: [
        { tier: 1, titleKey: 'asc_tier_1_title', blocksSmashed: 412, maxCombo: 64, timestamp: Date.now() - 3600000 },
      ],
      unlockedBiomeIndex: 2,
    });
    await openGamePage(page, baseUrl);
    await page.waitForTimeout(650);
    await page.screenshot({ path: path.join(SHOTS_DIR, '01_title_screen.png') });
    await context.close();
  }

  // 2. 02_mid_run_ricochet_tnt.png (poll burst & pick highest action variance frame)
  {
    const { context, page } = await createSeededContext(browser, W, H, {
      unlockedBiomeIndex: 1,
      selectedBiomeIndex: 0,
      equippedSkin: 'magma_cutter',
      upgrades: { damage: 4, bounces: 5, multiorb: 3, orbsize: 3, luck: 5, orevalue: 3 },
    });
    await openGamePage(page, baseUrl);
    await clickSafe(page, '[data-title="play"]');
    await page.waitForTimeout(450);

    // Pull slightly up-right so trajectory aims down-left/center into FTUE TNT cluster
    await smoothSlingshotRelease(page, W * 0.5, H * 0.36, W * 0.5 + 14, H * 0.36 - 95, 10);

    let bestBuf = null;
    let bestScore = -1;
    for (let i = 0; i < 7; i++) {
      await page.waitForTimeout(110);
      const buf = await page.screenshot();
      const stats = await sharp(buf).stats();
      const score = stats.channels[0].stdev + stats.channels[1].stdev + stats.channels[2].stdev;
      if (score > bestScore) {
        bestScore = score;
        bestBuf = buf;
      }
    }
    if (bestBuf) {
      await sharp(bestBuf).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(SHOTS_DIR, '02_mid_run_ricochet_tnt.png'));
    }
    await context.close();
  }

  // 3. 03_shop_skins.png
  {
    const { context, page } = await createSeededContext(browser, W, H, {
      coins: 18500,
      shards: 14,
      unlockedBiomeIndex: 3,
      equippedSkin: 'magma_cutter',
    });
    await openGamePage(page, baseUrl);
    await clickSafe(page, '[data-title="play"]');
    await page.waitForTimeout(400);
    await clickSafe(page, '[data-hud="shop"]');
    await page.waitForTimeout(250);
    await clickSafe(page, '[data-tab="skins"]');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS_DIR, '03_shop_skins.png') });
    await context.close();
  }

  // 4. 04_boss_gate_fight.png (Biome 2 Crystal Cavern or Biome 1 Bedrock Boss Gate with active Boss HP bar)
  {
    const { context, page } = await createSeededContext(browser, W, H, {
      unlockedBiomeIndex: 0,
      selectedBiomeIndex: 0,
      equippedSkin: 'frost_star',
      upgrades: { damage: 14, bounces: 16, multiorb: 4, orbsize: 4, luck: 4, orevalue: 4 },
    });
    await openGamePage(page, baseUrl);
    await clickSafe(page, '[data-title="play"]');
    await page.waitForTimeout(400);
    await smoothSlingshotRelease(page, W * 0.5, H * 0.36, W * 0.5 - 8, H * 0.36 - 98, 8);
    // Toggle 2x speed so orbs reach 150m Bedrock Boss Gate quickly
    await page.waitForTimeout(150);
    const speedBtn = page.locator('[data-hud="speed"]');
    if (await speedBtn.isVisible()) {
      await speedBtn.click();
    }

    let capturedBoss = false;
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(120);
      const gateVisible = await page.evaluate(() => {
        const el = document.querySelector('.rm-gate-hp-bar');
        return Boolean(el && getComputedStyle(el).display !== 'none');
      });
      if (gateVisible) {
        await page.waitForTimeout(160);
        await page.screenshot({ path: path.join(SHOTS_DIR, '04_boss_gate_fight.png') });
        capturedBoss = true;
        break;
      }
    }
    if (!capturedBoss) {
      await page.screenshot({ path: path.join(SHOTS_DIR, '04_boss_gate_fight.png') });
    }
    await context.close();
  }

  // 5. 05_hall_of_ascension.png
  {
    const { context, page } = await createSeededContext(browser, W, H, {
      maxDepthMeters: 1550,
      unlockedBiomeIndex: 5,
      ascensionTier: 1,
      ascensionRecords: [
        { tier: 1, titleKey: 'asc_tier_1_title', blocksSmashed: 412, maxCombo: 64, timestamp: Date.now() - 3600000 },
      ],
      unlockedAchievements: ['chain_detonator', 'combo_master'],
      claimedAchievements: ['chain_detonator'],
    });
    await openGamePage(page, baseUrl);
    await clickSafe(page, '[data-title="achievements"]');
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(SHOTS_DIR, '05_hall_of_ascension.png') });
    await context.close();
  }

  // Verify all 5 screenshots
  const expectedShots = [
    '01_title_screen.png',
    '02_mid_run_ricochet_tnt.png',
    '03_shop_skins.png',
    '04_boss_gate_fight.png',
    '05_hall_of_ascension.png',
  ];
  for (const name of expectedShots) {
    const full = path.join(SHOTS_DIR, name);
    const meta = await sharp(full).metadata();
    if (meta.width !== W || meta.height !== H) {
      throw new Error(`Screenshot ${name} expected ${W}x${H}, got ${meta.width}x${meta.height}`);
    }
    const kb = (fs.statSync(full).size / 1024).toFixed(1);
    console.log(`[PASS] screenshot ${name}: ${meta.width}x${meta.height} (${kb} KB)`);
  }
}

async function recordChoreographedVideo(browser, baseUrl, width, height, outFileName) {
  fs.mkdirSync(VIDEOS_DIR, { recursive: true });
  fs.mkdirSync(TMP_VIDEO_DIR, { recursive: true });

  const { context, page } = await createSeededContext(
    browser,
    width,
    height,
    {
      coins: 25000,
      shards: 14,
      unlockedBiomeIndex: 2,
      selectedBiomeIndex: 0,
      equippedSkin: 'steel_sawblade',
      upgrades: { damage: 5, bounces: 5, multiorb: 3, orbsize: 3, luck: 5, orevalue: 4 },
    },
    TMP_VIDEO_DIR
  );

  await openGamePage(page, baseUrl);
  // Click PLAY right away (initial boot/title will be trimmed out with -ss 0.9)
  await clickSafe(page, '[data-title="play"]');
  await page.waitForTimeout(450);

  const cx = width * 0.5;
  const cy = height * 0.34;

  // 0:00 - 0:02: Smooth sweeping trajectory drag onto TNT cluster
  await smoothSlingshotRelease(
    page,
    cx,
    cy,
    cx + 22,
    cy - 92,
    14,
    [
      { x: cx - 55, y: cy - 75 },
      { x: cx + 48, y: cy - 82 },
    ]
  );

  // 0:02 - 0:08.5: Multi-orb ricochet + TNT explosion payoff
  await page.waitForTimeout(6700);
  const recallBtn = page.locator('[data-hud="recall"]');
  if (await recallBtn.isVisible()) {
    await recallBtn.click();
    await page.waitForTimeout(500);
  }
  const summaryRelaunch = page.locator('[data-sum="relaunch"]');
  if (await summaryRelaunch.isVisible()) {
    await summaryRelaunch.click();
    await page.waitForTimeout(450);
  }

  // 0:07.5 - 0:11.5: Open Shop, buy upgrade, switch to Skins tab, equip Molten Magma Cutter, close
  const shopBtn = page.locator('[data-hud="shop"]');
  if (await shopBtn.isVisible()) {
    await shopBtn.click();
    await page.waitForTimeout(550);
    const buyBtn = page.locator('[data-buy]').first();
    if (await buyBtn.isVisible()) {
      await buyBtn.click();
      await page.waitForTimeout(500);
    }
    const skinsTab = page.locator('[data-tab="skins"]');
    if (await skinsTab.isVisible()) {
      await skinsTab.click();
      await page.waitForTimeout(750);
      const magmaEquip = page.locator('[data-equip="magma_cutter"]');
      if (await magmaEquip.isVisible()) {
        await magmaEquip.click();
        await page.waitForTimeout(600);
      }
    }
    const closeBtn = page.locator('[data-act="close"]');
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await page.waitForTimeout(400);
    }
  }

  // 0:11.5 - 0:13.5: Use Elevator -> Biome 2 (Crystal Cavern)
  const elevBtn = page.locator('[data-hud="elevator"]');
  if (await elevBtn.isVisible()) {
    await elevBtn.click();
    await page.waitForTimeout(600);
    const biome1Btn = page.locator('[data-biome="1"]');
    if (await biome1Btn.isVisible()) {
      await biome1Btn.click();
      await page.waitForTimeout(450);
    }
  }

  // 0:14.5 - 0:19.0: Deep biome sweep aim & release smashing crystal/ore blocks
  await smoothSlingshotRelease(
    page,
    cx,
    cy,
    cx - 26,
    cy - 96,
    12,
    [{ x: cx + 42, y: cy - 82 }]
  );
  await page.waitForTimeout(7800);

  const videoObj = page.video();
  await context.close();
  const rawWebm = await videoObj.path();

  const outMp4 = path.join(VIDEOS_DIR, outFileName);
  const scaleW = width === 1280 ? 1920 : width;
  const scaleH = height === 720 ? 1080 : height;

  execFileSync(
    ffmpegPath,
    [
      '-y',
      '-ss',
      '0.9',
      '-i',
      rawWebm,
      '-t',
      '19.0',
      '-vf',
      `scale=${scaleW}:${scaleH}:flags=lanczos`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-crf',
      '20',
      '-preset',
      'medium',
      '-movflags',
      '+faststart',
      '-an',
      outMp4,
    ],
    { stdio: 'pipe' }
  );

  // Clean temp webm
  if (fs.existsSync(rawWebm)) fs.unlinkSync(rawWebm);

  // Verify MP4 via ffmpeg probe stderr
  let probeOut = '';
  try {
    execFileSync(ffmpegPath, ['-i', outMp4], { stdio: 'pipe' });
  } catch (e) {
    probeOut = e.stderr ? e.stderr.toString() : '';
  }
  const durMatch = probeOut.match(/Duration:\s*(\d+):(\d+):(\d+\.\d+)/);
  const durSec = durMatch
    ? Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
    : 0;
  const mb = (fs.statSync(outMp4).size / (1024 * 1024)).toFixed(2);
  console.log(`[PASS] video ${outFileName}: ${scaleW}x${scaleH}, duration=${durSec.toFixed(2)}s, size=${mb} MB`);
}

function writeManifest() {
  const rows = [];
  const addFiles = (dir, category, portalMap) => {
    for (const file of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, file);
      const sizeBytes = fs.statSync(full).size;
      const sizeStr =
        sizeBytes >= 1024 * 1024
          ? `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`
          : `${(sizeBytes / 1024).toFixed(1)} KB`;
      rows.push({
        category,
        file: path.relative(READY_DIR, full).replace(/\\/g, '/'),
        sizeStr,
        mapping: portalMap(file),
      });
    }
  };

  addFiles(COVERS_DIR, 'Cover / Icon', (f) => {
    if (f.includes('1920x1080')) return 'CrazyGames Mandatory Landscape (16:9), HD Banners';
    if (f.includes('1280x720')) return 'Poki Landscape Cover, Standard 16:9';
    if (f.includes('800x1200')) return 'CrazyGames Mandatory Portrait (2:3)';
    if (f.includes('600x900')) return 'Poki / Mobile Portrait (2:3)';
    if (f.includes('800x800')) return 'CrazyGames Mandatory Square (1:1)';
    if (f.includes('512x512')) return 'Yandex / Poki / itch.io Square Icon (1:1)';
    if (f.includes('1024x1024')) return 'GameDistribution High-Res Icon (1:1)';
    if (f.includes('800x470')) return 'Yandex Games Catalog Cover';
    if (f.includes('1560x520')) return 'Yandex Games Hero Banner';
    return 'Portal Cover';
  });

  addFiles(SHOTS_DIR, 'Screenshot', (f) => {
    if (f.startsWith('01_')) return 'Title Screen (All Portals)';
    if (f.startsWith('02_')) return 'Core Ricochet + TNT Action (All Portals)';
    if (f.startsWith('03_')) return 'Sawblade Skins & Upgrades Shop (All Portals)';
    if (f.startsWith('04_')) return 'Bedrock Boss Gate Fight (All Portals)';
    return 'Hall of Ascension Endgame (All Portals)';
  });

  addFiles(VIDEOS_DIR, 'Preview Video', (f) =>
    f.includes('16x9')
      ? 'CrazyGames Mandatory Landscape Video (16:9) + Poki/Yandex'
      : 'CrazyGames Mandatory Portrait Video (2:3)'
  );

  const md = [
    '# Ricochet Miner — Marketing & Storefront Package',
    '',
    'Generated from production build (`dist/standalone`) with zero dev QA overlays and zero OS cursor.',
    '',
    '| Category | File | Size | Portal Field Mapping |',
    '| :--- | :--- | :--- | :--- |',
    ...rows.map((r) => `| ${r.category} | \`${r.file}\` | ${r.sizeStr} | ${r.mapping} |`),
    '',
  ].join('\n');

  fs.writeFileSync(path.join(READY_DIR, 'MANIFEST.md'), md, 'utf8');
  console.log(`[PASS] Wrote ${path.join(READY_DIR, 'MANIFEST.md')}`);
}

async function main() {
  console.log('Building production standalone bundle (zero QA overlay)...');
  execSync('npm run build:standalone', { cwd: ROOT, stdio: 'inherit' });

  const { server, url } = await startStaticServer(DIST_DIR);
  const browser = await chromium.launch({ headless: true });

  try {
    await captureScreenshots(browser, url);
    await recordChoreographedVideo(browser, url, 1280, 720, 'ricochet_miner_preview_16x9_1080p.mp4');
    await recordChoreographedVideo(browser, url, 800, 1200, 'ricochet_miner_preview_2x3_portrait.mp4');
    writeManifest();
  } finally {
    await browser.close();
    server.close();
    if (fs.existsSync(TMP_VIDEO_DIR)) {
      fs.rmSync(TMP_VIDEO_DIR, { recursive: true, force: true });
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
