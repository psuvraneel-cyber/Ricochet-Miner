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
  const keyed = chromaKeyMagenta(cellData, info.width, info.height, {
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
 * Crops bottom 8%, resizes to targetW x targetH, and applies a vertical
 * crossfade blend at the top/bottom seam so vertical tiling is seamless.
 */
async function processSeamlessVerticalTexture({
  srcName,
  outName,
  targetW,
  targetH,
  blendPx,
  trimHorizontalWhite = false,
}) {
  const srcPath = path.join(RAW_DIR, srcName);
  const meta = await sharp(srcPath).metadata();
  const cropH = Math.floor(meta.height * 0.92); // Remove bottom 8% mark
  let left = 0;
  let cropW = meta.width;
  if (trimHorizontalWhite) {
    // Trim outer 5% white/transparent border artifacts on timber beam
    left = Math.floor(meta.width * 0.05);
    cropW = Math.floor(meta.width * 0.9);
  }

  const { data, info } = await sharp(srcPath)
    .extract({ left, top: 0, width: cropW, height: cropH })
    .resize(targetW, targetH, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  const w = info.width;
  const h = info.height;

  // Crossfade top blendPx rows with bottom blendPx rows for seamless vertical repeat
  for (let y = 0; y < blendPx; y++) {
    const t = y / blendPx; // 0 at top edge, 1 at blendPx
    const mirrorY = h - blendPx + y;
    for (let x = 0; x < w; x++) {
      const topIdx = (y * w + x) * 4;
      const botIdx = (mirrorY * w + x) * 4;
      for (let c = 0; c < 4; c++) {
        const blended = Math.round(out[botIdx + c] * (1 - t) + out[topIdx + c] * t);
        out[topIdx + c] = blended;
      }
    }
  }

  const outPath = path.join(OUT_DIR, outName);
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .webp(WEBP_OPTS)
    .toFile(outPath);
  const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`[WEBP] ${outName} -> ${sizeKb} KB`);
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
  });

  await processSeamlessVerticalTexture({
    srcName: 'env_rock_flank.png',
    outName: 'env_rock_flank.webp',
    targetW: 512,
    targetH: 768,
    blendPx: 48,
    trimHorizontalWhite: false,
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

  console.log('Done processing all assets!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
