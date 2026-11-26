import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const PORTALS = ['crazygames', 'poki', 'gamedistribution', 'yandex', 'standalone'];
const MAX_BUNDLE_BYTES = 5 * 1024 * 1024; // 5 MB strict ceiling

const arg = process.argv[2] || 'all';
const targets = arg === 'all' ? PORTALS : [arg];

const rootDir = process.cwd();
const releaseDir = path.join(rootDir, 'release');
fs.mkdirSync(releaseDir, { recursive: true });

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const ALLOWED_SDK_PREFIXES = {
  crazygames: ['https://sdk.crazygames.com/'],
  poki: ['https://game-cdn.poki.com/'],
  gamedistribution: ['https://html5.api.gamedistribution.com/'],
  yandex: ['https://yandex.ru/games/sdk/'],
  standalone: [],
};

function auditDist(platform, distDir) {
  const files = walkFiles(distDir);
  let totalBytes = 0;
  let hasRootIndexHtml = false;
  const allowedPrefixes = ALLOWED_SDK_PREFIXES[platform] ?? [];

  for (const file of files) {
    const rel = path.relative(distDir, file).replace(/\\/g, '/');
    if (rel === 'index.html') hasRootIndexHtml = true;
    if (rel.includes('art-reference') || rel.includes('raw-assets') || rel.endsWith('.jpg') || rel.endsWith('.png')) {
      throw new Error(`[${platform}] Forbidden raw/reference image "${rel}" found in dist`);
    }

    const stat = fs.statSync(file);
    totalBytes += stat.size;
    const ext = path.extname(file);
    if (ext === '.html' || ext === '.js' || ext === '.css') {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes('"/assets/') || content.includes("'/assets/")) {
        throw new Error(`[${platform}] Forbidden root-relative /assets/ path in ${file}`);
      }
      if (content.includes('Toggle AdError') || content.includes('Toggle AdBlock')) {
        throw new Error(`[${platform}] DebugOverlay leaked into production build: ${file}`);
      }
      if (content.includes('fonts.googleapis.com')) {
        throw new Error(`[${platform}] Forbidden external Google Fonts link in ${file}`);
      }
      const urls = content.match(/https?:\/\/[^\s"'<>`]+/g) ?? [];
      for (const url of urls) {
        const allowed = allowedPrefixes.some((p) => url.startsWith(p));
        if (!allowed) {
          throw new Error(`[${platform}] Forbidden external URL "${url}" in ${rel}`);
        }
      }
    }
  }

  if (!hasRootIndexHtml) {
    throw new Error(`[${platform}] Missing root index.html in ${distDir}`);
  }
  if (totalBytes > MAX_BUNDLE_BYTES) {
    throw new Error(`[${platform}] Unzipped size ${totalBytes} exceeds 5 MB limit`);
  }
  return totalBytes;
}

async function buildPortal(platform) {
  const distDir = path.join(rootDir, 'dist', platform);
  console.log(`\n=== Building portal: ${platform} ===`);
  execSync('npx vite build --mode production', {
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_PLATFORM: platform,
      VITE_OUT_DIR: distDir,
    },
  });

  const unzippedBytes = auditDist(platform, distDir);

  const zip = new JSZip();
  for (const file of walkFiles(distDir)) {
    const rel = path.relative(distDir, file).replace(/\\/g, '/');
    zip.file(rel, fs.readFileSync(file));
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  if (zipBuffer.length > MAX_BUNDLE_BYTES) {
    throw new Error(`[${platform}] ZIP size ${zipBuffer.length} exceeds 5 MB limit`);
  }

  const zipName = `ricochet-miner-${platform === 'gamedistribution' ? 'gd' : platform}.zip`;
  const zipPath = path.join(releaseDir, zipName);
  fs.writeFileSync(zipPath, zipBuffer);

  console.log(
    `[PASS] ${platform}: unzipped=${(unzippedBytes / 1024).toFixed(1)} KB, zip=${(
      zipBuffer.length / 1024
    ).toFixed(1)} KB -> ${zipPath}`
  );
}

for (const portal of targets) {
  if (!PORTALS.includes(portal)) {
    throw new Error(`Unknown portal target: ${portal}`);
  }
  await buildPortal(portal);
}
