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

async function removeCornerSparkle(inputPath) {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const startX = Math.floor(w * 0.89);
  const startY = Math.floor(h * 0.89);

  // Sample median luminance in nearby clean neighborhood to locate bottom-right star glare
  const samples = [];
  for (let y = Math.floor(h * 0.8); y < startY; y += 3) {
    for (let x = Math.floor(w * 0.8); x < startX; x += 3) {
      const p = (y * w + x) * 4;
      samples.push(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]);
    }
  }
  samples.sort((a, b) => a - b);
  const med = samples.length > 0 ? samples[Math.floor(samples.length * 0.5)] : 70;

  const mask = new Uint8Array(w * h);
  for (let y = startY; y < h; y++) {
    for (let x = startX; x < w; x++) {
      const p = (y * w + x) * 4;
      const maxC = Math.max(data[p], data[p + 1], data[p + 2]);
      const minC = Math.min(data[p], data[p + 1], data[p + 2]);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
      if (lum > med + 28 && sat < 0.28) mask[y * w + x] = 1;
    }
  }

  const out = Buffer.from(data);
  const shiftX = Math.max(24, Math.floor(w * 0.08));
  for (let y = startY; y < h; y++) {
    for (let x = startX; x < w; x++) {
      let hasStar = mask[y * w + x];
      if (!hasStar) {
        for (let dy = -3; dy <= 3 && !hasStar; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < h && nx >= 0 && nx < w && mask[ny * w + nx]) hasStar = 1;
          }
        }
      }
      if (!hasStar) continue;
      const sx = Math.max(0, x - shiftX);
      const dst = (y * w + x) * 4;
      const src = (y * w + sx) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = 255;
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function exportCover(src, outName, targetW, targetH) {
  const outPath = path.join(OUT_DIR, outName);
  const healedBuf = await removeCornerSparkle(src.path);
  // Subtle symmetrical trim (2% inset) preserving key art while guaranteeing zero edge mark
  const cropW = Math.floor(src.width * 0.96);
  const cropH = Math.floor(src.height * 0.96);
  const left = Math.floor(src.width * 0.02);
  const top = Math.floor(src.height * 0.02);

  await sharp(healedBuf)
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
