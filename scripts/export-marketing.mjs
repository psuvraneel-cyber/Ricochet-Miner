import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC_DIR = path.join(ROOT, 'marketing-assets');
const OUT_DIR = path.join(SRC_DIR, 'ready', 'covers');
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

async function classifySources() {
  if (!fs.existsSync(SRC_DIR)) {
    throw new Error(`Missing marketing-assets directory: ${SRC_DIR}`);
  }
  const entries = fs.readdirSync(SRC_DIR, { withFileTypes: true });
  let square = null;
  let landscape = null;
  let portrait = null;

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!IMAGE_EXTS.has(ext)) continue;

    const fullPath = path.join(SRC_DIR, entry.name);
    const meta = await sharp(fullPath).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (w <= 0 || h <= 0) continue;

    const ratio = w / h;
    if (ratio >= 0.9 && ratio <= 1.1 && !square) {
      square = { path: fullPath, name: entry.name, width: w, height: h };
    } else if (ratio >= 1.4 && !landscape) {
      landscape = { path: fullPath, name: entry.name, width: w, height: h };
    } else if (ratio <= 0.8 && !portrait) {
      portrait = { path: fullPath, name: entry.name, width: w, height: h };
    }
  }

  if (!square || !landscape || !portrait) {
    throw new Error(
      `Expected square, landscape, and portrait key-art images in ${SRC_DIR}. Found: square=${Boolean(
        square
      )}, landscape=${Boolean(landscape)}, portrait=${Boolean(portrait)}`
    );
  }
  return { square, landscape, portrait };
}

async function exportCover(src, outName, targetW, targetH) {
  const outPath = path.join(OUT_DIR, outName);
  // Trim 2% top/left and 6% bottom/right (92%x92%) to strip any bottom-right corner mark cleanly
  const cropW = Math.floor(src.width * 0.92);
  const cropH = Math.floor(src.height * 0.92);
  const left = Math.floor(src.width * 0.02);
  const top = Math.floor(src.height * 0.02);

  await sharp(src.path)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(targetW, targetH, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: '#120d0a' })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  const verify = await sharp(outPath).metadata();
  if (verify.width !== targetW || verify.height !== targetH || verify.hasAlpha) {
    throw new Error(
      `Verification failed for ${outName}: got ${verify.width}x${verify.height}, hasAlpha=${verify.hasAlpha}`
    );
  }
  const kb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[PASS] ${outName}: ${verify.width}x${verify.height} (RGB, ${kb} KB)`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const { square, landscape, portrait } = await classifySources();
  console.log('Classified sources:');
  console.log(`  Square:    ${square.name} (${square.width}x${square.height})`);
  console.log(`  Landscape: ${landscape.name} (${landscape.width}x${landscape.height})`);
  console.log(`  Portrait:  ${portrait.name} (${portrait.width}x${portrait.height})`);

  const jobs = [
    [square, 'icon_512x512.png', 512, 512],
    [square, 'cover_square_800x800.png', 800, 800],
    [square, 'icon_1024x1024.png', 1024, 1024],
    [landscape, 'cover_landscape_1920x1080.png', 1920, 1080],
    [landscape, 'cover_landscape_1280x720.png', 1280, 720],
    [landscape, 'yandex_cover_800x470.png', 800, 470],
    [landscape, 'yandex_hero_1560x520.png', 1560, 520],
    [portrait, 'cover_portrait_800x1200.png', 800, 1200],
    [portrait, 'cover_portrait_600x900.png', 600, 900],
  ];

  for (const [src, name, w, h] of jobs) {
    await exportCover(src, name, w, h);
  }
  console.log(`\nExported ${jobs.length} portal covers to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
