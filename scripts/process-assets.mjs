import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, 'raw-assets');
const OUT_DIR = path.join(ROOT, 'src', 'assets');
fs.mkdirSync(OUT_DIR, { recursive: true });

const WEBP_OPTS = { quality: 88, alphaQuality: 100 };

function clampByte(v) {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Removes #FF00FF magenta background with smooth alpha feathering and
 * a 2px boundary color de-spill pass so zero pink fringe remains.
 */
function chromaKeyMagenta(data, width, height, options = {}) {
  const { maskBottomRightPct = 0.06 } = options;
  const out = Buffer.from(data);

  const maskStartX = Math.floor(width * (1 - maskBottomRightPct));
  const maskStartY = Math.floor(height * (1 - maskBottomRightPct));

  // Pass 1: Key magenta + mask bottom-right corner mark
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (maskBottomRightPct > 0 && x >= maskStartX && y >= maskStartY) {
        out[idx + 3] = 0;
        continue;
      }

      const r = out[idx];
      const g = out[idx + 1];
      const b = out[idx + 2];
      const a = out[idx + 3];
      if (a === 0) continue;

      const minRB = Math.min(r, b);
      const magentaNess = minRB - g;

      // Strong magenta background
      if (r > 165 && b > 165 && g < 135 && magentaNess > 45) {
        if (magentaNess >= 95) {
          out[idx + 3] = 0;
        } else {
          const factor = (95 - magentaNess) / 50;
          out[idx + 3] = clampByte(a * factor);
        }
      } else if (magentaNess > 28 && r > 120 && b > 120 && g < 120) {
        // Anti-aliased magenta fringe transition
        const factor = Math.max(0, Math.min(1, (85 - magentaNess) / 57));
        out[idx + 3] = clampByte(a * factor);
      }
    }
  }

  // Pass 2: 2px boundary spill suppression (clamp r & b toward g/outline near transparent pixels)
  const alphaCopy = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    alphaCopy[i] = out[i * 4 + 3];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      const a = alphaCopy[i];
      if (a === 0) continue;

      let nearTransparent = a < 250;
      if (!nearTransparent) {
        for (let dy = -2; dy <= 2 && !nearTransparent; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (alphaCopy[ny * width + nx] < 180) {
              nearTransparent = true;
              break;
            }
          }
        }
      }

      if (nearTransparent) {
        const r = out[idx];
        const g = out[idx + 1];
        const b = out[idx + 2];
        if (r > g + 10 && b > g + 10) {
          const cap = Math.min(g + 6, Math.round((r + b) * 0.25));
          out[idx] = Math.min(r, cap);
          out[idx + 2] = Math.min(b, cap);
        }
      }
    }
  }

  return out;
}

/**
 * Removes #00FF00 chroma-key green background strictly via BFS flood-fill starting from
 * the outer borders of each cell, keeping enclosed green details (e.g. Vault chest emeralds)
 * 100% opaque while smoothly feathering and de-spilling exterior boundary edges.
 */
function chromaKeyGreenFloodFill(data, width, height) {
  const out = Buffer.from(data);
  const total = width * height;
  const visited = new Uint8Array(total);
  const isBg = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isChromaGreen = (pixelIdx) => {
    const idx = pixelIdx * 4;
    const a = out[idx + 3];
    if (a === 0) return true;
    const r = out[idx];
    const g = out[idx + 1];
    const b = out[idx + 2];
    const maxRB = Math.max(r, b);
    const greenNess = g - maxRB;
    return g > 115 && greenNess > 28 && maxRB < 190;
  };

  const enqueue = (px) => {
    if (px < 0 || px >= total || visited[px]) return;
    if (!isChromaGreen(px)) return;
    visited[px] = 1;
    queue[tail++] = px;
  };

  // Seed flood-fill from all 4 outer perimeter borders of the cell
  for (let x = 0; x < width; x++) {
    enqueue(x);
    enqueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    enqueue(y * width);
    enqueue(y * width + (width - 1));
  }

  while (head < tail) {
    const curr = queue[head++];
    isBg[curr] = 1;
    const cx = curr % width;
    const cy = (curr - cx) / width;
    if (cx > 0) enqueue(curr - 1);
    if (cx < width - 1) enqueue(curr + 1);
    if (cy > 0) enqueue(curr - width);
    if (cy < height - 1) enqueue(curr + width);
  }

  // Pass 1: Clear verified exterior chroma-green pixels cleanly, feather edge pixels
  for (let i = 0; i < total; i++) {
    if (!isBg[i]) continue;
    const idx = i * 4;
    const r = out[idx];
    const g = out[idx + 1];
    const b = out[idx + 2];
    const maxRB = Math.max(r, b);
    const greenNess = g - maxRB;
    if (greenNess >= 70 && g > 140) {
      out[idx + 3] = 0;
    } else {
      const factor = Math.max(0, Math.min(1, (70 - greenNess) / 42));
      out[idx + 3] = clampByte(out[idx + 3] * factor * 0.45);
    }
  }

  // Pass 2: 2px boundary spill suppression ONLY around pixels bordering cleared exterior BG
  const alphaCopy = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    alphaCopy[i] = out[i * 4 + 3];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const idx = i * 4;
      const a = alphaCopy[i];
      if (a === 0) continue;

      let nearClearedExterior = isBg[i] || a < 245;
      if (!nearClearedExterior) {
        for (let dy = -2; dy <= 2 && !nearClearedExterior; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -2; dx <= 2; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const ni = ny * width + nx;
            if (isBg[ni] || alphaCopy[ni] < 180) {
              nearClearedExterior = true;
              break;
            }
          }
        }
      }

      if (nearClearedExterior) {
        const r = out[idx];
        const g = out[idx + 1];
        const b = out[idx + 2];
        const maxRB = Math.max(r, b);
        if (g > maxRB + 4) {
          out[idx + 1] = Math.min(g, maxRB + 2);
        }
      }
    }
  }

  return out;
}

/**
 * Removes or heals the bottom-right Gemini 4-point corner watermark across different art types:
 * - 'black': clears detected corner zone to pure #000000 for additive sheets
 * - 'chroma_green' | 'chroma_magenta': clears corner zone to pure chroma key
 * - 'opaque_inpaint': detects bright desaturated 4-point star pixels inside bottom-right 11%x11%
 *   and heals them from clean neighboring opaque pixels without punching transparency holes
 */
function removeBottomRightWatermark(data, width, height, mode = 'opaque_inpaint') {
  const out = Buffer.from(data);
  const startX = Math.floor(width * 0.89);
  const startY = Math.floor(height * 0.89);

  if (mode === 'black' || mode === 'chroma_green' || mode === 'chroma_magenta') {
    const rFill = mode === 'chroma_magenta' ? 255 : 0;
    const gFill = mode === 'chroma_green' ? 255 : 0;
    const bFill = mode === 'chroma_magenta' ? 255 : 0;
    for (let y = startY; y < height; y++) {
      for (let x = startX; x < width; x++) {
        const p = (y * width + x) * 4;
        out[p] = rFill;
        out[p + 1] = gFill;
        out[p + 2] = bFill;
        out[p + 3] = 255;
      }
    }
    return out;
  }

  // Sample median luminance outside the immediate corner cluster to distinguish star glare cleanly
  const lumSamples = [];
  const sampleMinX = Math.max(0, startX - Math.floor(width * 0.08));
  const sampleMinY = Math.max(0, startY - Math.floor(height * 0.08));
  for (let y = sampleMinY; y < startY; y += 2) {
    for (let x = sampleMinX; x < startX; x += 2) {
      const p = (y * width + x) * 4;
      if (out[p + 3] < 200) continue;
      lumSamples.push(0.299 * out[p] + 0.587 * out[p + 1] + 0.114 * out[p + 2]);
    }
  }
  lumSamples.sort((a, b) => a - b);
  const localMedian = lumSamples.length > 0 ? lumSamples[Math.floor(lumSamples.length * 0.5)] : 80;

  const mask = new Uint8Array(width * height);
  for (let y = startY; y < height; y++) {
    for (let x = startX; x < width; x++) {
      const p = (y * width + x) * 4;
      if (out[p + 3] < 120) continue;
      const r = out[p];
      const g = out[p + 1];
      const b = out[p + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC > 0 ? (maxC - minC) / maxC : 0;
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum > localMedian + 28 && sat < 0.28) {
        mask[y * width + x] = 1;
      }
    }
  }

  // Dilate star mask by 2px to cover anti-aliased bright halo
  const dilated = new Uint8Array(mask);
  for (let y = startY; y < height; y++) {
    for (let x = startX; x < width; x++) {
      if (!mask[y * width + x]) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ny = y + dy;
          const nx = x + dx;
          if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
            dilated[ny * width + nx] = 1;
          }
        }
      }
    }
  }

  // Clone-heal flagged star pixels from clean left/upper neighbor rock/texture bands
  const shiftX = Math.max(12, Math.floor(width * 0.08));
  for (let y = startY; y < height; y++) {
    for (let x = startX; x < width; x++) {
      if (!dilated[y * width + x]) continue;
      let sx = Math.max(0, x - shiftX);
      let sy = y;
      if (dilated[sy * width + sx]) {
        sx = x;
        sy = Math.max(0, y - shiftX);
      }
      const dst = (y * width + x) * 4;
      const src = (sy * width + sx) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3];
    }
  }

  return out;
}

/**
 * Finds tight non-transparent bounding box of an RGBA buffer.
 */
function findTightBounds(data, width, height, alphaThreshold = 12) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { left: 0, top: 0, width, height };
  }
  return {
    left: minX,
    top: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Repairs the bottom-right corner mark inside trimmed block_bedrock_core by mirroring
 * the symmetric bottom-left corner of the trimmed sprite.
 */
function repairSymmetricCorner(data, width, height) {
  const patchW = Math.floor(width * 0.22);
  const patchH = Math.floor(height * 0.22);
  for (let y = height - patchH; y < height; y++) {
    for (let x = width - patchW; x < width; x++) {
      const mirrorX = width - 1 - x;
      const dst = (y * width + x) * 4;
      const src = (y * width + mirrorX) * 4;
      data[dst] = data[src];
      data[dst + 1] = data[src + 1];
      data[dst + 2] = data[src + 2];
      data[dst + 3] = data[src + 3];
    }
  }
}

async function processSheetCell({
  sheetBuf,
  sheetW,
  sheetH,
  cols,
  rows,
  col,
  row,
  outName,
  padding,
  targetW,
  targetH,
  squareCenterPad = false,
  mirrorBottomRightCorner = false,
  maskSheetCorner = true,
  chromaMode = 'magenta',
}) {
  const cellW = Math.floor(sheetW / cols);
  const cellH = Math.floor(sheetH / rows);
  const left = col * cellW;
  const top = row * cellH;
  const extractW = col === cols - 1 ? sheetW - left : cellW;
  const extractH = row === rows - 1 ? sheetH - top : cellH;

  const { data: cellData, info } = await sharp(sheetBuf, {
    raw: { width: sheetW, height: sheetH, channels: 4 },
  })
    .extract({ left, top, width: extractW, height: extractH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const isBottomRightCell = col === cols - 1 && row === rows - 1;
  let prepData = cellData;
  if (isBottomRightCell && maskSheetCorner && chromaMode === 'green') {
    prepData = Buffer.from(cellData);
    const maskStartX = Math.floor(info.width * 0.86);
    const maskStartY = Math.floor(info.height * 0.86);
    for (let y = maskStartY; y < info.height; y++) {
      for (let x = maskStartX; x < info.width; x++) {
        const p = (y * info.width + x) * 4;
        prepData[p] = 0;
        prepData[p + 1] = 255;
        prepData[p + 2] = 0;
        prepData[p + 3] = 255;
      }
    }
  }
  const keyed =
    chromaMode === 'green'
      ? chromaKeyGreenFloodFill(prepData, info.width, info.height)
      : chromaKeyMagenta(prepData, info.width, info.height, {
        maskBottomRightPct: isBottomRightCell && maskSheetCorner ? 0.06 : 0,
      });

  const bounds = findTightBounds(keyed, info.width, info.height);
  const { data: trimmedData, info: trimmedInfo } = await sharp(keyed, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .extract(bounds)
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (mirrorBottomRightCorner) {
    repairSymmetricCorner(trimmedData, trimmedInfo.width, trimmedInfo.height);
  }

  const trimmed = sharp(trimmedData, {
    raw: { width: trimmedInfo.width, height: trimmedInfo.height, channels: 4 },
  });

  const paddedBuf = await trimmed
    .extend({
      top: padding,
      bottom: padding,
      left: padding,
      right: padding,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  let pipeline = sharp(paddedBuf);
  if (squareCenterPad && targetW && targetH) {
    pipeline = pipeline.resize(targetW, targetH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  } else if (targetW && targetH) {
    pipeline = pipeline.resize(targetW, targetH, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    });
  } else if (targetH) {
    pipeline = pipeline.resize({ height: targetH });
  } else if (targetW) {
    pipeline = pipeline.resize({ width: targetW });
  }

  const outPath = path.join(OUT_DIR, outName);
  await pipeline.webp(WEBP_OPTS).toFile(outPath);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[WEBP] ${outName} -> ${sizeKb} KB`);
}

/**
 * Crops watermark margins (plus optional custom extract box), resizes to targetW x targetH,
 * and applies wavy cosine crossfade + toroidal half-height offset for seamless vertical tiling.
 */
async function processSeamlessVerticalTexture({
  srcName,
  outName,
  targetW,
  targetH,
  blendPx,
  trimHorizontalWhite = false,
  cropTopPct = 0,
  cropBottomPct = 0.08,
  cropRightPct = 0.05,
}) {
  const srcPath = path.join(RAW_DIR, srcName);
  const meta = await sharp(srcPath).metadata();
  const top = Math.floor(meta.height * cropTopPct);
  const cropH = Math.max(32, Math.floor(meta.height * (1 - cropTopPct - cropBottomPct)));
  let left = 0;
  let cropW = Math.floor(meta.width * (1 - cropRightPct));
  if (trimHorizontalWhite) {
    left = Math.floor(meta.width * 0.05);
    cropW = Math.floor(meta.width * 0.9);
  }

  const overlap = Math.min(Math.floor(targetH * 0.2), Math.max(48, blendPx * 2));
  const { data, info } = await sharp(srcPath)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(targetW, targetH + overlap, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const w = info.width;
  const h = targetH;
  const out = Buffer.allocUnsafe(w * h * 4);
  data.copy(out, 0, 0, w * h * 4);

  // Seamlessly fold bottom overflow band [targetH .. targetH + overlap) into top [0 .. overlap)
  for (let x = 0; x < w; x++) {
    const wave = Math.round(Math.sin((x / w) * Math.PI * 4) * 10 + Math.cos((x / w) * Math.PI * 8) * 5);
    const colOverlap = Math.max(24, Math.min(overlap, overlap - 10 + wave));
    for (let y = 0; y < colOverlap; y++) {
      const t = 0.5 - 0.5 * Math.cos((Math.PI * y) / colOverlap);
      const dstIdx = (y * w + x) * 4;
      const tailY = Math.min(info.height - 1, h + y);
      const tailIdx = (tailY * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        out[dstIdx + c] = Math.round(data[tailIdx + c] * (1 - t) + out[dstIdx + c] * t);
      }
    }
  }

  // Toroidal half-height offset shifts the healed zone cleanly into continuous strata
  const shifted = Buffer.allocUnsafe(out.length);
  const halfH = Math.floor(h / 2);
  for (let y = 0; y < h; y++) {
    const srcY = (y + halfH) % h;
    out.copy(shifted, y * w * 4, srcY * w * 4, (srcY + 1) * w * 4);
  }

  const outPath = path.join(OUT_DIR, outName);
  await sharp(shifted, { raw: { width: w, height: h, channels: 4 } })
    .webp(WEBP_OPTS)
    .toFile(outPath);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[WEBP] ${outName} -> ${sizeKb} KB`);
}

/**
 * Processes an additive (#000000 pure black) VFX sprite cell cleanly with zero alpha deletion,
 * preserving glowing flame/spark falloff for Canvas 'lighter' compositing.
 */
async function processAdditiveCell({
  sheetBuf,
  sheetW,
  sheetH,
  cols,
  rows,
  col,
  row,
  outName,
  targetSize = 160,
}) {
  const cellW = Math.floor(sheetW / cols);
  const cellH = Math.floor(sheetH / rows);
  const left = col * cellW;
  const top = row * cellH;
  const extractW = col === cols - 1 ? sheetW - left : cellW;
  const extractH = row === rows - 1 ? sheetH - top : cellH;

  const { data, info } = await sharp(sheetBuf, {
    raw: { width: sheetW, height: sheetH, channels: 4 },
  })
    .extract({ left, top, width: extractW, height: extractH })
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Find tight bounding box of non-black luminance pixels
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      const lum = Math.max(data[p], data[p + 1], data[p + 2]);
      if (lum > 18) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const box =
    maxX >= minX && maxY >= minY
      ? { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 }
      : { left: 0, top: 0, width: info.width, height: info.height };

  const outPath = path.join(OUT_DIR, outName);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .extract(box)
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .resize(targetSize, targetSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .removeAlpha()
    .webp({ quality: 88 })
    .toFile(outPath);
  console.log(`[WEBP] ${outName} -> ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
}

/**
 * Connected-component extractor for asymmetric sprite sheets (e.g. env_frames_lanterns_spritesheet.png).
 */
function findConnectedComponents(data, width, height, minArea = 6000) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const regions = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx] || data[startIdx * 4 + 3] <= 24) continue;

      let head = 0;
      let tail = 0;
      queue[tail++] = startIdx;
      visited[startIdx] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const curr = queue[head++];
        const cx = curr % width;
        const cy = (curr - cx) / width;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        const neighbors = [
          cx > 0 ? curr - 1 : -1,
          cx < width - 1 ? curr + 1 : -1,
          cy > 0 ? curr - width : -1,
          cy < height - 1 ? curr + width : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && !visited[n] && data[n * 4 + 3] > 24) {
            visited[n] = 1;
            queue[tail++] = n;
          }
        }
      }

      if (area >= minArea) {
        regions.push({
          left: minX,
          top: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
          area,
        });
      }
    }
  }
  return regions;
}

async function main() {
  console.log('Processing raw-assets -> src/assets/*.webp ...');

  // 1. blocks_spritesheet.png (3x3)
  const blocksRaw = await sharp(path.join(RAW_DIR, 'blocks_spritesheet.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const blockMapping = [
    [0, 0, 'block_stone_slate.webp', false],
    [1, 0, 'block_stone_sand.webp', false],
    [2, 0, 'block_stone_granite.webp', false],
    [0, 1, 'block_ore_nuggets.webp', false],
    [1, 1, 'block_ore_gold.webp', false],
    [2, 1, 'block_ore_molten.webp', false],
    [0, 2, 'block_tnt.webp', false],
    [1, 2, 'block_frost.webp', false],
    [2, 2, 'block_bedrock_core.webp', true],
  ];

  for (const [col, row, outName, mirrorCorner] of blockMapping) {
    await processSheetCell({
      sheetBuf: blocksRaw.data,
      sheetW: blocksRaw.info.width,
      sheetH: blocksRaw.info.height,
      cols: 3,
      rows: 3,
      col,
      row,
      outName,
      padding: 2,
      targetW: 160,
      targetH: 160,
      mirrorBottomRightCorner: mirrorCorner,
      maskSheetCorner: !mirrorCorner,
    });
  }

  // 2. props_spritesheet.png (3x2)
  const propsRaw = await sharp(path.join(RAW_DIR, 'props_spritesheet.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 0,
    row: 0,
    outName: 'prop_sawblade.webp',
    padding: 4,
    targetW: 192,
    targetH: 192,
    squareCenterPad: true,
  });
  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 1,
    row: 0,
    outName: 'prop_bumper_amber.webp',
    padding: 4,
    targetW: 160,
    targetH: 160,
    squareCenterPad: true,
  });
  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 2,
    row: 0,
    outName: 'prop_bumper_cyan.webp',
    padding: 4,
    targetW: 160,
    targetH: 160,
    squareCenterPad: true,
  });
  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 0,
    row: 1,
    outName: 'prop_turret.webp',
    padding: 4,
    targetH: 220,
  });
  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 1,
    row: 1,
    outName: 'prop_lantern.webp',
    padding: 4,
    targetH: 160,
  });
  await processSheetCell({
    sheetBuf: propsRaw.data,
    sheetW: propsRaw.info.width,
    sheetH: propsRaw.info.height,
    cols: 3,
    rows: 2,
    col: 2,
    row: 1,
    outName: 'prop_portal.webp',
    padding: 4,
    targetW: 180,
    targetH: 180,
    squareCenterPad: true,
  });

  // 3. logo_emblem.png
  const logoRaw = await sharp(path.join(RAW_DIR, 'logo_emblem.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const logoKeyed = chromaKeyMagenta(logoRaw.data, logoRaw.info.width, logoRaw.info.height, {
    maskBottomRightPct: 0.08,
  });
  const logoBounds = findTightBounds(logoKeyed, logoRaw.info.width, logoRaw.info.height);
  const logoOut = path.join(OUT_DIR, 'logo_emblem.webp');
  await sharp(logoKeyed, {
    raw: { width: logoRaw.info.width, height: logoRaw.info.height, channels: 4 },
  })
    .extract(logoBounds)
    .extend({
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize({ width: 760, withoutEnlargement: true })
    .webp(WEBP_OPTS)
    .toFile(logoOut);
  console.log(`[WEBP] logo_emblem.webp -> ${(fs.statSync(logoOut).size / 1024).toFixed(1)} KB`);

  // 4. Environment seamless textures
  await processSeamlessVerticalTexture({
    srcName: 'env_timber_beam.png',
    outName: 'env_timber_beam.webp',
    targetW: 128,
    targetH: 512,
    blendPx: 24,
    trimHorizontalWhite: true,
    cropRightPct: 0,
  });

  await processSeamlessVerticalTexture({
    srcName: 'env_rock_flank.png',
    outName: 'env_rock_flank.webp',
    targetW: 512,
    targetH: 768,
    blendPx: 48,
    trimHorizontalWhite: false,
    cropBottomPct: 0.09,
    cropRightPct: 0.06,
  });

  // 5. skins_spritesheet.png (3x3) -> 9 192x192 square WebPs
  const skinsRaw = await sharp(path.join(RAW_DIR, 'skins_spritesheet.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const skinMapping = [
    [0, 0, 'skin_steel_sawblade.webp'],
    [1, 0, 'skin_copper_gear.webp'],
    [2, 0, 'skin_emerald_buzzsaw.webp'],
    [0, 1, 'skin_magma_cutter.webp'],
    [1, 1, 'skin_frost_star.webp'],
    [2, 1, 'skin_gold_chakram.webp'],
    [0, 2, 'skin_tesla_rotor.webp'],
    [1, 2, 'skin_toxic_drill.webp'],
    [2, 2, 'skin_void_reaper.webp'],
  ];

  for (const [col, row, outName] of skinMapping) {
    await processSheetCell({
      sheetBuf: skinsRaw.data,
      sheetW: skinsRaw.info.width,
      sheetH: skinsRaw.info.height,
      cols: 3,
      rows: 3,
      col,
      row,
      outName,
      padding: 4,
      targetW: 192,
      targetH: 192,
      squareCenterPad: true,
      maskSheetCorner: true,
    });
  }

  // 6. ui_modal_frame.png -> 384x384 9-slice WebP (quality 90, alphaQuality 100)
  const frameRaw = await sharp(path.join(RAW_DIR, 'ui_modal_frame.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const frameKeyed = chromaKeyMagenta(frameRaw.data, frameRaw.info.width, frameRaw.info.height, {
    maskBottomRightPct: 0,
  });
  const frameBounds = findTightBounds(frameKeyed, frameRaw.info.width, frameRaw.info.height);
  const { data: frameTrimData, info: frameTrimInfo } = await sharp(frameKeyed, {
    raw: { width: frameRaw.info.width, height: frameRaw.info.height, channels: 4 },
  })
    .extract(frameBounds)
    .raw()
    .toBuffer({ resolveWithObject: true });
  repairSymmetricCorner(frameTrimData, frameTrimInfo.width, frameTrimInfo.height);
  const frameOut = path.join(OUT_DIR, 'ui_modal_frame.webp');
  await sharp(frameTrimData, {
    raw: { width: frameTrimInfo.width, height: frameTrimInfo.height, channels: 4 },
  })
    .resize(384, 384, { fit: 'fill' })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(frameOut);
  console.log(`[WEBP] ui_modal_frame.webp -> ${(fs.statSync(frameOut).size / 1024).toFixed(1)} KB`);

  // 7. ui_icons_spritesheet.png (3x3) -> 9 128x128 WebPs
  const iconsRaw = await sharp(path.join(RAW_DIR, 'ui_icons_spritesheet.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const iconMapping = [
    [0, 0, 'icon_drill_damage.webp', false],
    [1, 0, 'icon_max_bounces.webp', false],
    [2, 0, 'icon_multiball.webp', false],
    [0, 1, 'icon_orb_size.webp', false],
    [1, 1, 'icon_luck.webp', false],
    [2, 1, 'icon_ore_value.webp', false],
    [0, 2, 'icon_trophy.webp', false],
    [1, 2, 'icon_gear_elevator.webp', false],
    [2, 2, 'icon_chest.webp', true],
  ];

  for (const [col, row, outName, mirrorCorner] of iconMapping) {
    await processSheetCell({
      sheetBuf: iconsRaw.data,
      sheetW: iconsRaw.info.width,
      sheetH: iconsRaw.info.height,
      cols: 3,
      rows: 3,
      col,
      row,
      outName,
      padding: 4,
      targetW: 128,
      targetH: 128,
      squareCenterPad: true,
      mirrorBottomRightCorner: mirrorCorner,
      maskSheetCorner: !mirrorCorner,
    });
  }

  // 8. ascension_badges_spritesheet.png (3x3) -> 9 160x160 square WebPs
  const badgesRaw = await sharp(path.join(RAW_DIR, 'ascension_badges_spritesheet.png'))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Mapping uses (col, row) for orthographic 3x3 grid matching (row, col) spec
  const badgeMapping = [
    [0, 0, 'crest_tier_1.webp'],
    [1, 0, 'crest_tier_2.webp'],
    [2, 0, 'crest_tier_3.webp'],
    [0, 1, 'crest_tier_4.webp'],
    [1, 1, 'badge_chain_detonator.webp'],
    [2, 1, 'badge_combo_master.webp'],
    [0, 2, 'badge_heavy_investor.webp'],
    [1, 2, 'badge_zero_skip.webp'],
    [2, 2, 'badge_ascension_star.webp'],
  ];

  for (const [col, row, outName] of badgeMapping) {
    const isStar = col === 2 && row === 2;
    await processSheetCell({
      sheetBuf: badgesRaw.data,
      sheetW: badgesRaw.info.width,
      sheetH: badgesRaw.info.height,
      cols: 3,
      rows: 3,
      col,
      row,
      outName,
      padding: 4,
      targetW: 160,
      targetH: 160,
      squareCenterPad: true,
      maskSheetCorner: true,
      mirrorBottomRightCorner: isStar,
    });
  }

  // 9. entities_special_spritesheet.png (3x3 on #00FF00 chroma green -> exterior flood-fill keyed)
  const specialRawPath = path.join(RAW_DIR, 'entities_special_spritesheet.png');
  if (fs.existsSync(specialRawPath)) {
    const specialRaw = await sharp(specialRawPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Mask outermost 6% bottom-right corner of the full sheet BEFORE slicing cell (2,2)
    const fullW = specialRaw.info.width;
    const fullH = specialRaw.info.height;
    const cornerStartX = Math.floor(fullW * 0.94);
    const cornerStartY = Math.floor(fullH * 0.94);
    for (let y = cornerStartY; y < fullH; y++) {
      for (let x = cornerStartX; x < fullW; x++) {
        const p = (y * fullW + x) * 4;
        specialRaw.data[p] = 0;
        specialRaw.data[p + 1] = 255;
        specialRaw.data[p + 2] = 0;
        specialRaw.data[p + 3] = 255;
      }
    }

    const specialMapping = [
      [0, 0, 'block_vault.webp', false],
      [1, 0, 'block_splitter.webp', false],
      [2, 0, 'block_laser.webp', false],
      [0, 1, 'block_boss_armor.webp', false],
      [1, 1, 'prop_portal_entry.webp', true],
      [2, 1, 'prop_portal_exit.webp', true],
      [0, 2, 'pickup_split_gem.webp', true],
      [1, 2, 'pickup_magnet_coil.webp', true],
      [2, 2, 'pickup_overclock_battery.webp', true],
    ];

    for (const [col, row, outName, squareCenter] of specialMapping) {
      await processSheetCell({
        sheetBuf: specialRaw.data,
        sheetW: specialRaw.info.width,
        sheetH: specialRaw.info.height,
        cols: 3,
        rows: 3,
        col,
        row,
        outName,
        padding: 3,
        targetW: 160,
        targetH: 160,
        squareCenterPad: squareCenter,
        maskSheetCorner: false,
        chromaMode: 'green',
      });
    }
  }

  // 10. STAGE 2 ASSETS (All 19 newly generated sprite & biome sheets)
  // 10A. coins_spritesheet.png (4x2, #FF00FF -> 96x96)
  if (fs.existsSync(path.join(RAW_DIR, 'coins_spritesheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'coins_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const coinMap = [
      [0, 0, 'coin_spin_0.webp'],
      [1, 0, 'coin_spin_1.webp'],
      [2, 0, 'coin_spin_2.webp'],
      [3, 0, 'coin_spin_3.webp'],
      [0, 1, 'icon_coin_hero.webp'],
      [1, 1, 'icon_coin_stack.webp'],
      [2, 1, 'icon_shard_crystal.webp'],
      [3, 1, 'icon_super_orb_token.webp'],
    ];
    for (const [col, row, outName] of coinMap) {
      await processSheetCell({
        sheetBuf: raw.data,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 4,
        rows: 2,
        col,
        row,
        outName,
        padding: 3,
        targetW: 96,
        targetH: 96,
        squareCenterPad: true,
        maskSheetCorner: true,
        chromaMode: 'magenta',
      });
    }
  }

  // 10B. companions_spritesheet.png (2x2, #FF00FF -> 192x192)
  if (fs.existsSync(path.join(RAW_DIR, 'companions_spritesheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'companions_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const compMap = [
      [0, 0, 'prop_drone_companion.webp'],
      [1, 0, 'prop_turret_heavy.webp'],
      [0, 1, 'vfx_overdrive_ring.webp'],
      [1, 1, 'vfx_magnet_ring.webp'],
    ];
    for (const [col, row, outName] of compMap) {
      await processSheetCell({
        sheetBuf: raw.data,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 2,
        rows: 2,
        col,
        row,
        outName,
        padding: 4,
        targetW: 192,
        targetH: 192,
        squareCenterPad: true,
        maskSheetCorner: true,
        chromaMode: 'magenta',
      });
    }
  }

  // 10C. overlay_cracks_spritesheet.png (3x1, #00FF00 flood-fill -> 160x160)
  if (fs.existsSync(path.join(RAW_DIR, 'overlay_cracks_spritesheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'overlay_cracks_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cleaned = removeBottomRightWatermark(raw.data, raw.info.width, raw.info.height, 'chroma_green');
    for (let col = 0; col < 3; col++) {
      await processSheetCell({
        sheetBuf: cleaned,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 3,
        rows: 1,
        col,
        row: 0,
        outName: `crack_stage_${col + 1}.webp`,
        padding: 4,
        targetW: 160,
        targetH: 160,
        squareCenterPad: true,
        maskSheetCorner: false,
        chromaMode: 'green',
      });
    }
  }

  // 10D. vfx_chunks_sheet.png (3x2, #FF00FF -> 96x96)
  if (fs.existsSync(path.join(RAW_DIR, 'vfx_chunks_sheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'vfx_chunks_sheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const chunkMap = [
      [0, 0, 'chunk_sandstone.webp'],
      [1, 0, 'chunk_slate.webp'],
      [2, 0, 'chunk_gold.webp'],
      [0, 1, 'chunk_crystal.webp'],
      [1, 1, 'chunk_ember.webp'],
      [2, 1, 'chunk_tnt_plank.webp'],
    ];
    for (const [col, row, outName] of chunkMap) {
      await processSheetCell({
        sheetBuf: raw.data,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 3,
        rows: 2,
        col,
        row,
        outName,
        padding: 3,
        targetW: 96,
        targetH: 96,
        squareCenterPad: true,
        maskSheetCorner: true,
        chromaMode: 'magenta',
      });
    }
  }

  // 10E. vfx_additive_sheet.png (3x2, #000000 black additive preserved -> 160x160)
  if (fs.existsSync(path.join(RAW_DIR, 'vfx_additive_sheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'vfx_additive_sheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cleaned = removeBottomRightWatermark(raw.data, raw.info.width, raw.info.height, 'black');
    const addMap = [
      [0, 0, 'vfx_spark_star.webp'],
      [1, 0, 'vfx_grind_spray.webp'],
      [2, 0, 'vfx_tnt_fireball.webp'],
      [0, 1, 'vfx_shockwave_ring.webp'],
      [1, 1, 'vfx_cleave_arc.webp'],
      [2, 1, 'vfx_lightning_bolt.webp'],
    ];
    for (const [col, row, outName] of addMap) {
      await processAdditiveCell({
        sheetBuf: cleaned,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 3,
        rows: 2,
        col,
        row,
        outName,
        targetSize: 160,
      });
    }
  }

  // 10F. ui_icons_v2_spritesheet.png (3x2, #00FF00 flood-fill -> 128x128)
  if (fs.existsSync(path.join(RAW_DIR, 'ui_icons_v2_spritesheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'ui_icons_v2_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const cleaned = removeBottomRightWatermark(raw.data, raw.info.width, raw.info.height, 'chroma_green');
    const iconV2Map = [
      [0, 0, 'icon_skill_magpulse.webp'],
      [1, 0, 'icon_skill_overclock.webp'],
      [2, 0, 'icon_leaderboard.webp'],
      [0, 1, 'icon_perk_card.webp'],
      [1, 1, 'icon_armory_skins.webp'],
      [2, 1, 'icon_drone_badge.webp'],
    ];
    for (const [col, row, outName] of iconV2Map) {
      await processSheetCell({
        sheetBuf: cleaned,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 3,
        rows: 2,
        col,
        row,
        outName,
        padding: 4,
        targetW: 128,
        targetH: 128,
        squareCenterPad: true,
        maskSheetCorner: false,
        chromaMode: 'green',
      });
    }
  }

  // 10G. ui_chrome_spritesheet.png (2x2, #00FF00 flood-fill -> 256x256, symmetrical mirror heal on Console Dock)
  if (fs.existsSync(path.join(RAW_DIR, 'ui_chrome_spritesheet.png'))) {
    const raw = await sharp(path.join(RAW_DIR, 'ui_chrome_spritesheet.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const chromeMap = [
      [0, 0, 'ui_stat_plaque.webp', false],
      [1, 0, 'ui_title_ribbon.webp', false],
      [0, 1, 'ui_sunburst_crest.webp', false],
      [1, 1, 'ui_console_dock.webp', true],
    ];
    for (const [col, row, outName, mirrorCorner] of chromeMap) {
      await processSheetCell({
        sheetBuf: raw.data,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 2,
        rows: 2,
        col,
        row,
        outName,
        padding: 4,
        targetW: 256,
        targetH: 256,
        squareCenterPad: true,
        mirrorBottomRightCorner: mirrorCorner,
        maskSheetCorner: false,
        chromaMode: 'green',
      });
    }
  }

  // 10H. env_frames_lanterns_spritesheet.png (Connected-component extraction -> 3 pillars 96x512 + 3 sconces 128x128)
  const framesPath = path.join(RAW_DIR, 'env_frames_lanterns_spritesheet.png');
  if (fs.existsSync(framesPath)) {
    const raw = await sharp(framesPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const preCleaned = removeBottomRightWatermark(raw.data, raw.info.width, raw.info.height, 'chroma_green');
    const keyed = chromaKeyGreenFloodFill(preCleaned, raw.info.width, raw.info.height);
    const regions = findConnectedComponents(keyed, raw.info.width, raw.info.height, 8000);

    const pillars = regions.filter((r) => r.height > raw.info.height * 0.55).sort((a, b) => a.left - b.left);
    const sconces = regions.filter((r) => r.height <= raw.info.height * 0.55).sort((a, b) => a.top - b.top);

    const pillarNames = ['env_beam_oak.webp', 'env_beam_steel.webp', 'env_beam_quantum.webp'];
    for (let i = 0; i < Math.min(pillars.length, pillarNames.length); i++) {
      const reg = pillars[i];
      const insetY = Math.floor(reg.height * 0.08);
      const { data: seg, info: segInfo } = await sharp(keyed, {
        raw: { width: raw.info.width, height: raw.info.height, channels: 4 },
      })
        .extract({
          left: reg.left,
          top: reg.top + insetY,
          width: reg.width,
          height: Math.max(64, reg.height - insetY * 2),
        })
        .resize(96, 512 + 96, { fit: 'fill' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      const out = Buffer.allocUnsafe(96 * 512 * 4);
      seg.copy(out, 0, 0, 96 * 512 * 4);
      const overlap = 96;
      for (let y = 0; y < overlap; y++) {
        const t = 0.5 - 0.5 * Math.cos((Math.PI * y) / overlap);
        for (let x = 0; x < 96; x++) {
          const dst = (y * 96 + x) * 4;
          const tail = ((512 + y) * 96 + x) * 4;
          for (let c = 0; c < 4; c++) {
            out[dst + c] = Math.round(seg[tail + c] * (1 - t) + out[dst + c] * t);
          }
        }
      }
      const shifted = Buffer.allocUnsafe(out.length);
      for (let y = 0; y < 512; y++) {
        const sy = (y + 256) % 512;
        out.copy(shifted, y * 96 * 4, sy * 96 * 4, (sy + 1) * 96 * 4);
      }
      const outPath = path.join(OUT_DIR, pillarNames[i]);
      await sharp(shifted, { raw: { width: 96, height: 512, channels: 4 } }).webp(WEBP_OPTS).toFile(outPath);
      console.log(`[WEBP] ${pillarNames[i]} -> ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
    }

    const sconceNames = ['prop_sconce_oil.webp', 'prop_sconce_crystal.webp', 'prop_sconce_plasma.webp'];
    for (let i = 0; i < Math.min(sconces.length, sconceNames.length); i++) {
      const reg = sconces[i];
      const outPath = path.join(OUT_DIR, sconceNames[i]);
      await sharp(keyed, { raw: { width: raw.info.width, height: raw.info.height, channels: 4 } })
        .extract(reg)
        .extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .webp(WEBP_OPTS)
        .toFile(outPath);
      console.log(`[WEBP] ${sconceNames[i]} -> ${(fs.statSync(outPath).size / 1024).toFixed(1)} KB`);
    }
  }

  // 10I. Dedicated Biome 2-6 Block Sheets (3x2 each -> 160x160)
  const biomeSheets = [
    { file: 'biome2_crystal_blocks.png', prefix: 'b2', chroma: 'magenta' },
    { file: 'biome3_magma_blocks.png', prefix: 'b3', chroma: 'magenta' },
    { file: 'biome4_subzero_blocks.png', prefix: 'b4', chroma: 'magenta' },
    { file: 'biome5_cyber_blocks.png', prefix: 'b5', chroma: 'green' },
    { file: 'biome6_quantum_blocks.png', prefix: 'b6', chroma: 'green' },
  ];
  const biomeCells = [
    [0, 0, 'stone', false],
    [1, 0, 'granite', false],
    [2, 0, 'ore_primary', false],
    [0, 1, 'ore_rare', false],
    [1, 1, 'special', false],
    [2, 1, 'boss_core', true],
  ];
  for (const sheet of biomeSheets) {
    const p = path.join(RAW_DIR, sheet.file);
    if (!fs.existsSync(p)) continue;
    const raw = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    for (const [col, row, suffix, isBoss] of biomeCells) {
      await processSheetCell({
        sheetBuf: raw.data,
        sheetW: raw.info.width,
        sheetH: raw.info.height,
        cols: 3,
        rows: 2,
        col,
        row,
        outName: `${sheet.prefix}_${suffix}.webp`,
        padding: 2,
        targetW: 160,
        targetH: 160,
        squareCenterPad: false,
        mirrorBottomRightCorner: isBoss,
        maskSheetCorner: false,
        chromaMode: sheet.chroma,
      });
    }
  }

  // 10J. Seamless Biome 1-6 Rock Flanks (512x768)
  const flankJobs = [
    { src: 'env_flank_quarry_v2.png', out: 'env_flank_b1.webp', cropTopPct: 0, cropBottomPct: 0.53, cropRightPct: 0.05 },
    { src: 'env_flank_crystal.png', out: 'env_flank_b2.webp', cropTopPct: 0, cropBottomPct: 0.09, cropRightPct: 0.06 },
    { src: 'env_flank_magma.png', out: 'env_flank_b3.webp', cropTopPct: 0, cropBottomPct: 0.09, cropRightPct: 0.06 },
    { src: 'env_flank_subzero.png', out: 'env_flank_b4.webp', cropTopPct: 0, cropBottomPct: 0.09, cropRightPct: 0.06 },
    { src: 'env_flank_cyber.png', out: 'env_flank_b5.webp', cropTopPct: 0, cropBottomPct: 0.09, cropRightPct: 0.06 },
    { src: 'env_flank_quantum.png', out: 'env_flank_b6.webp', cropTopPct: 0, cropBottomPct: 0.09, cropRightPct: 0.06 },
  ];
  for (const fj of flankJobs) {
    if (!fs.existsSync(path.join(RAW_DIR, fj.src))) continue;
    await processSeamlessVerticalTexture({
      srcName: fj.src,
      outName: fj.out,
      targetW: 512,
      targetH: 768,
      blendPx: 48,
      trimHorizontalWhite: false,
      cropTopPct: fj.cropTopPct,
      cropBottomPct: fj.cropBottomPct,
      cropRightPct: fj.cropRightPct,
    });
  }

  console.log('Done processing all assets!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
