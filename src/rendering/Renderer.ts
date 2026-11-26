import {
  PHYSICS_CONFIG,
  getMuzzlePosition,
  type BiomeSpec,
  type SkinSpec,
} from '../config/gameConfig';
import type { AimFeedback } from '../core/InputManager';
import type { ViewportLayout } from '../core/ViewportManager';
import { formatCompact } from '../utils/format';
import { BiomeTheme } from '../world/BiomeTheme';
import type { BlockEntity, CoinDrop, Orb } from '../world/Entities';
import type { FloatingTextPool } from './FloatingTextPool';
import type { JuiceSystem } from './JuiceSystem';
import type { ParticlePool } from './ParticlePool';
import { SpriteAtlas, sharedSpriteAtlas } from './SpriteAtlas';

export interface RenderSceneState {
  cameraY: number;
  baseDepthMeters: number;
  launcherX: number;
  launcherY: number;
  aimAngleRad: number | null;
  isAimingState?: boolean;
  loadedOrbRadius?: number;
  turretRecoil?: number;
  trajectoryDots: Array<{ x: number; y: number }>;
  trajectoryImpact: { x: number; y: number } | null;
  trajectorySecondImpact?: { x: number; y: number } | null;
  trajectoryBounceIdx?: number;
  aimFeedback?: AimFeedback | null;
  orbs: readonly Orb[];
  entities: readonly BlockEntity[];
  coins: readonly CoinDrop[];
  skin: SkinSpec;
  particles: ParticlePool;
  floatingText: FloatingTextPool;
  juice: JuiceSystem;
  timeS: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas: SpriteAtlas = sharedSpriteAtlas;
  private lastFrameMs = typeof performance !== 'undefined' ? performance.now() : Date.now();

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not initialize 2D canvas context');
    this.ctx = ctx;
  }

  async preloadAssets(): Promise<void> {
    await this.atlas.loadAll();
  }

  getLogoEmblemUrl(): string {
    return this.atlas.getLogoEmblemUrl();
  }

  render(layout: ViewportLayout, scene: RenderSceneState): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const rawDt = Math.min(0.05, Math.max(0.001, (nowMs - this.lastFrameMs) * 0.001));
    this.lastFrameMs = nowMs;

    const ctx = this.ctx;
    const { cssWidth, cssHeight, dpr, scale, shaftX, topOffsetPx } = layout;
    const snapCamY = Math.round(scene.cameraY * scale) / scale;
    const viewDepth =
      scene.baseDepthMeters +
      (snapCamY / PHYSICS_CONFIG.TILE_SIZE) * PHYSICS_CONFIG.METERS_PER_ROW;
    const biome = BiomeTheme.getBiomeAtDepth(viewDepth);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // 1. Subterranean Desktop Flanks (env_rock_flank.webp tiled at 0.65x parallax)
    this.renderRockFlanks(
      ctx,
      cssWidth,
      cssHeight,
      shaftX,
      layout.shaftWidthPx,
      snapCamY,
      scene.baseDepthMeters,
      scale,
      biome,
      layout.isPortrait,
      topOffsetPx
    );

    // 2. Shaft World Transform (supports top HUD clearance & micro zoom-punch)
    const shake = scene.juice.getShakeOffset();
    const zoom = scene.juice.getZoomScale();
    const beamWidthPx = 26 * scale;
    const viewWorldTop = snapCamY - topOffsetPx / scale;
    const viewWorldH = cssHeight / scale + topOffsetPx / scale;

    ctx.save();
    ctx.beginPath();
    ctx.rect(shaftX - beamWidthPx, 0, layout.shaftWidthPx + beamWidthPx * 2, cssHeight);
    ctx.clip();

    if (zoom !== 1) {
      const zcx = shaftX + layout.shaftWidthPx * 0.5;
      const zcy = topOffsetPx + (cssHeight - topOffsetPx) * 0.42;
      ctx.translate(zcx, zcy);
      ctx.scale(zoom, zoom);
      ctx.translate(-zcx, -zcy);
    }

    ctx.translate(shaftX + shake.x * scale, topOffsetPx + shake.y * scale);
    ctx.scale(scale, scale);
    ctx.translate(0, -snapCamY);

    // Inner shaft depth + volumetric sunbeams
    this.renderShaftInterior(ctx, viewWorldTop, viewWorldH, biome, scene.timeS);

    // Entities (WebP sprites + dynamic effects)
    const minVisibleY = viewWorldTop - 90;
    const maxVisibleY = snapCamY + cssHeight / scale + 90;
    for (let i = 0; i < scene.entities.length; i++) {
      const block = scene.entities[i];
      if (!block.alive) continue;
      if (block.y + block.height < minVisibleY || block.y > maxVisibleY) continue;
      this.renderEntity(ctx, block, biome, scene.timeS, rawDt);
    }

    // Golden Aim Trajectory & 2nd-Bounce Bank Preview
    if (scene.aimAngleRad !== null && scene.trajectoryDots.length > 0) {
      this.renderTrajectory(
        ctx,
        scene.trajectoryDots,
        scene.trajectoryImpact,
        scene.trajectorySecondImpact ?? null,
        scene.trajectoryBounceIdx ?? scene.trajectoryDots.length,
        scene.timeS
      );
    }

    // Ceiling Steel Girder, Rotating Drill Turret & Loaded Blade Preview
    this.renderLauncher(
      ctx,
      scene.launcherX,
      scene.launcherY,
      scene.aimAngleRad,
      scene.turretRecoil ?? 0,
      Boolean(scene.isAimingState),
      scene.skin,
      scene.loadedOrbRadius ?? 14,
      scene.timeS
    );

    if (scene.aimFeedback) {
      this.renderAimFeedback(ctx, scene.aimFeedback, scene.timeS);
    }

    // Spinning 3D Metallic Coins + Magnet Trails
    for (let i = 0; i < scene.coins.length; i++) {
      const c = scene.coins[i];
      if (!c.alive) continue;
      const spinPhase = scene.timeS * 8.5 + i * 1.17;
      const spinX = Math.max(0.24, Math.abs(Math.cos(spinPhase)));

      ctx.save();
      if (c.magnetized) {
        const tailX = c.x - c.vx * 0.035;
        const tailY = c.y - c.vy * 0.035;
        ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(251, 191, 36, 0.25)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 10.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.translate(c.x, c.y);
      ctx.scale(spinX, 1);

      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181210';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-0.5, -0.5, 4.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#fffbeb';
      ctx.fillRect(-1.1, -3, 2.2, 6);
      ctx.restore();
    }

    // Spinning Sawblade Orbs (prop_sawblade.webp) & Comet Ribbon Trails
    for (let i = 0; i < scene.orbs.length; i++) {
      const orb = scene.orbs[i];
      if (!orb.alive) continue;
      this.renderOrb(ctx, orb, scene.skin);
    }

    // World Effects, Particles & Floating Text
    scene.juice.renderWorldEffects(ctx, PHYSICS_CONFIG.SHAFT_WIDTH);
    scene.particles.render(ctx);
    scene.floatingText.render(ctx);

    // Timber Shaft Beams (env_timber_beam.webp) & Swaying Lanterns (prop_lantern.webp)
    this.renderTimberShaftFrame(ctx, viewWorldTop, viewWorldH, biome, scene.timeS);

    ctx.restore();

    // 3. True Radial Screen Vignette + Impact Edge Pulse
    const vigAlpha = scene.juice.getVignetteAlpha();
    const cx = cssWidth * 0.5;
    const cy = cssHeight * 0.5;
    const outerR = Math.hypot(cx, cy);
    const vig = ctx.createRadialGradient(cx, cy, outerR * 0.52, cx, cy, outerR);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(0.82, 'rgba(8, 6, 5, 0.22)');
    vig.addColorStop(1, vigAlpha > 0.01 ? `rgba(249, 115, 22, ${Math.min(0.45, vigAlpha * 1.15).toFixed(2)})` : 'rgba(8, 6, 5, 0.52)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.restore();
  }

  private renderRockFlanks(
    ctx: CanvasRenderingContext2D,
    cssWidth: number,
    cssHeight: number,
    shaftX: number,
    shaftW: number,
    cameraY: number,
    baseDepthMeters: number,
    scale: number,
    biome: BiomeSpec,
    isPortrait: boolean,
    topOffsetPx: number
  ): void {
    ctx.fillStyle = biome.index === 0 ? '#16110e' : biome.palette.bgBottom;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (isPortrait) return;

    const rightX = shaftX + shaftW;
    const rightW = cssWidth - rightX;
    const flankTex = this.atlas.getEnvRockFlank(biome);

    if (flankTex) {
      const tileW = Math.max(shaftX, rightW, 320);
      const texW = flankTex.width || 512;
      const texH = flankTex.height || 768;
      const tileH = Math.round((texH / texW) * tileW);
      const scrollY = (cameraY * 0.65 * scale) % tileH;

      // Left flank
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, shaftX, cssHeight);
      ctx.clip();
      for (let y = -scrollY - tileH; y < cssHeight + tileH; y += tileH) {
        ctx.drawImage(flankTex, shaftX - tileW, y, tileW, tileH + 1);
      }
      ctx.restore();

      // Right flank (horizontally mirrored for natural variety)
      ctx.save();
      ctx.beginPath();
      ctx.rect(rightX, 0, rightW, cssHeight);
      ctx.clip();
      ctx.translate(rightX + tileW, 0);
      ctx.scale(-1, 1);
      for (let y = -scrollY - tileH; y < cssHeight + tileH; y += tileH) {
        ctx.drawImage(flankTex, 0, y, tileW, tileH + 1);
      }
      ctx.restore();
    }

    // Soft radial/edge vignette focusing attention onto the central mine shaft
    const leftVig = ctx.createLinearGradient(0, 0, shaftX, 0);
    leftVig.addColorStop(0, 'rgba(6, 5, 4, 0.72)');
    leftVig.addColorStop(0.75, 'rgba(6, 5, 4, 0.22)');
    leftVig.addColorStop(1, 'rgba(6, 5, 4, 0.05)');
    ctx.fillStyle = leftVig;
    ctx.fillRect(0, 0, shaftX, cssHeight);

    const rightVig = ctx.createLinearGradient(rightX, 0, cssWidth, 0);
    rightVig.addColorStop(0, 'rgba(6, 5, 4, 0.05)');
    rightVig.addColorStop(0.25, 'rgba(6, 5, 4, 0.22)');
    rightVig.addColorStop(1, 'rgba(6, 5, 4, 0.72)');
    ctx.fillStyle = rightVig;
    ctx.fillRect(rightX, 0, rightW, cssHeight);

    // Uniform mathematical depth ruler along far-left edge (10m, 20m, 30m...)
    this.renderDepthRuler(ctx, cssHeight, cameraY, baseDepthMeters, scale, topOffsetPx);
  }

  private renderDepthRuler(
    ctx: CanvasRenderingContext2D,
    cssHeight: number,
    cameraY: number,
    baseDepthMeters: number,
    scale: number,
    topOffsetPx: number
  ): void {
    const pxPerMeter = PHYSICS_CONFIG.TILE_SIZE / PHYSICS_CONFIG.METERS_PER_ROW;
    const minDepth = Math.max(0, Math.floor((baseDepthMeters + cameraY / pxPerMeter) / 10) * 10);
    const maxDepth = minDepth + Math.ceil(cssHeight / (pxPerMeter * scale * 10)) * 10 + 10;

    ctx.save();
    ctx.font = '700 12px "Lilita One", "Fredoka", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let d = minDepth; d <= maxDepth; d += 5) {
      const worldY = (d - baseDepthMeters) * pxPerMeter;
      const screenY = topOffsetPx + (worldY - cameraY) * scale;
      if (screenY < Math.max(58, topOffsetPx + 20) || screenY > cssHeight - 16) continue;

      const isMajor = d % 10 === 0;
      ctx.fillStyle = isMajor ? '#fde68a' : 'rgba(226, 232, 240, 0.55)';
      ctx.fillRect(0, screenY - 1, isMajor ? 14 : 7, 2);
      if (isMajor && d > 0) {
        ctx.strokeStyle = '#181210';
        ctx.lineWidth = 3.5;
        ctx.strokeText(`${d}m`, 18, screenY);
        ctx.fillText(`${d}m`, 18, screenY);
      }
    }
    ctx.restore();
  }

  private renderShaftInterior(
    ctx: CanvasRenderingContext2D,
    cameraY: number,
    viewH: number,
    biome: BiomeSpec,
    timeS: number
  ): void {
    ctx.fillStyle = biome.index === 0 ? '#1e1612' : biome.palette.bgBottom;
    ctx.fillRect(0, cameraY, PHYSICS_CONFIG.SHAFT_WIDTH, viewH);

    // Diagonal volumetric sunbeams / biome energy rays
    ctx.save();
    for (let i = 0; i < 3; i++) {
      const rx = 70 + i * 165 + Math.sin(timeS * 0.4 + i) * 12;
      const rg = ctx.createLinearGradient(rx, cameraY, rx + 90, cameraY + viewH * 0.75);
      rg.addColorStop(0, this.hexToRgba(biome.palette.glow, 0.14));
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx - 30, cameraY);
      ctx.lineTo(rx + 42, cameraY);
      ctx.lineTo(rx + 150, cameraY + viewH);
      ctx.lineTo(rx + 40, cameraY + viewH);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Subtle tile grid
    const ts = PHYSICS_CONFIG.TILE_SIZE;
    const startY = Math.floor(cameraY / ts) * ts;
    const endY = cameraY + viewH + ts;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.globalAlpha = 0.04;
    ctx.lineWidth = 1;
    for (let x = ts; x < PHYSICS_CONFIG.SHAFT_WIDTH; x += ts) {
      ctx.beginPath();
      ctx.moveTo(x, startY);
      ctx.lineTo(x, endY);
      ctx.stroke();
    }
    for (let y = startY; y <= endY; y += ts) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(PHYSICS_CONFIG.SHAFT_WIDTH, y);
      ctx.stroke();
    }

    // Slow drifting ambient dust motes
    for (let i = 0; i < 18; i++) {
      const mx =
        (((i * 89 + Math.sin(timeS * 0.7 + i) * 20) % PHYSICS_CONFIG.SHAFT_WIDTH) +
          PHYSICS_CONFIG.SHAFT_WIDTH) %
        PHYSICS_CONFIG.SHAFT_WIDTH;
      const my = cameraY + (((i * 67 + timeS * (10 + (i % 4) * 3)) % viewH) + viewH) % viewH;
      ctx.globalAlpha = 0.28 + 0.25 * Math.sin(timeS * 2 + i);
      ctx.fillStyle = biome.palette.glow;
      ctx.beginPath();
      ctx.arc(mx, my, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private renderTimberShaftFrame(
    ctx: CanvasRenderingContext2D,
    cameraY: number,
    viewH: number,
    biome: BiomeSpec,
    timeS: number
  ): void {
    const beamW = 24;
    const beamTex = this.atlas.getEnvTimberBeam(biome);
    ctx.save();

    if (beamTex) {
      const texW = beamTex.width || 128;
      const texH = beamTex.height || 512;
      const tileH = Math.round((texH / texW) * beamW);
      const startY = Math.floor((cameraY - 20) / tileH) * tileH;
      const endY = cameraY + viewH + tileH;

      for (let y = startY; y < endY; y += tileH) {
        ctx.drawImage(beamTex, -beamW, y, beamW, tileH + 1);
        ctx.drawImage(beamTex, PHYSICS_CONFIG.SHAFT_WIDTH, y, beamW, tileH + 1);
      }
    } else {
      ctx.fillStyle = '#6b3e1e';
      ctx.fillRect(-beamW, cameraY - 20, beamW, viewH + 40);
      ctx.fillRect(PHYSICS_CONFIG.SHAFT_WIDTH, cameraY - 20, beamW, viewH + 40);
    }

    // Wall Lanterns (prop_lantern.webp) centered strictly on timber support beams so they never overlap Col 0 or Col 8
    const step = PHYSICS_CONFIG.TILE_SIZE * 5;
    const startLanternY = Math.floor(cameraY / step) * step + 120;
    const lanternTex = this.atlas.getPropLantern();

    for (let sy = startLanternY; sy < cameraY + viewH + step; sy += step) {
      const flicker = 0.85 + 0.15 * Math.sin(timeS * 11 + sy);
      const swayRad = Math.sin(timeS * 2.4 + sy * 0.01) * 0.035; // +-2 degrees

      for (const lx of [-beamW * 0.5, PHYSICS_CONFIG.SHAFT_WIDTH + beamW * 0.5]) {
        // Additive golden light pool casting softly inward over the shaft
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const glow = ctx.createRadialGradient(lx, sy + 16, 2, lx, sy + 16, 86 * flicker);
        glow.addColorStop(0, this.hexToRgba(biome.palette.glow, 0.3 * flicker));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lx, sy + 16, 86 * flicker, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Iron mounting hook centered on timber beam
        ctx.strokeStyle = '#181210';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(lx, sy - 4);
        ctx.lineTo(lx, sy + 2);
        ctx.stroke();

        // Swaying lantern sprite sized to stay strictly within beam bounds (no Col 0 / Col 8 overlap)
        if (lanternTex) {
          ctx.save();
          ctx.translate(lx, sy);
          ctx.rotate(swayRad);
          const rawAspect = (lanternTex.width || 100) / (lanternTex.height || 160);
          const lw = Math.min(beamW - 4, 30 * rawAspect);
          const lh = lw / rawAspect;
          ctx.drawImage(lanternTex, -lw * 0.5, 0, lw, lh);
          ctx.restore();
        }
      }
    }
    ctx.restore();
  }

  private renderTrajectory(
    ctx: CanvasRenderingContext2D,
    dots: Array<{ x: number; y: number }>,
    impactPoint: { x: number; y: number } | null,
    secondImpactPoint: { x: number; y: number } | null,
    bounceStartIdx: number,
    timeS: number
  ): void {
    const pulseOffset = (timeS * 5) % 1;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const isPostBounce = i >= bounceStartIdx;
      const alpha =
        (isPostBounce ? 0.62 : 1) *
        (1 - i / (dots.length + 3)) *
        (0.78 + 0.22 * Math.sin((i - pulseOffset) * 1.4));
      ctx.fillStyle = isPostBounce
        ? `rgba(56, 189, 248, ${alpha.toFixed(2)})`
        : `rgba(255, 224, 102, ${alpha.toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, Math.max(1.8, (isPostBounce ? 3.5 : 4.6) - i * 0.14), 0, Math.PI * 2);
      ctx.fill();
    }

    if (impactPoint) {
      ctx.save();
      const ringR = 8.5 + Math.sin(timeS * 8) * 1.8;
      ctx.strokeStyle = 'rgba(255, 216, 77, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(impactPoint.x, impactPoint.y, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 216, 77, 0.35)';
      ctx.beginPath();
      ctx.arc(impactPoint.x, impactPoint.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (secondImpactPoint) {
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(secondImpactPoint.x, secondImpactPoint.y, 6.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderLauncher(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    aimAngleRad: number | null,
    turretRecoil: number,
    isAimingState: boolean,
    skin: SkinSpec,
    loadedOrbRadius: number,
    timeS: number
  ): void {
    const angle = aimAngleRad ?? Math.PI * 0.5;
    const rx = x - Math.cos(angle) * turretRecoil * 6;
    const ry = y - Math.sin(angle) * turretRecoil * 6;
    const pivotY = ry + PHYSICS_CONFIG.MUZZLE_PIVOT_OFFSET_Y;

    // Render loaded sawblade inside turret muzzle jaws before firing
    if (isAimingState) {
      const muzzle = getMuzzlePosition(x, y, angle);
      const loadedR = Math.min(18, loadedOrbRadius);
      ctx.save();
      ctx.fillStyle = 'rgba(251, 191, 36, 0.24)';
      ctx.beginPath();
      ctx.arc(muzzle.x, muzzle.y, loadedR + 4, 0, Math.PI * 2);
      ctx.fill();

      const bladeImg = this.atlas.getPropSawblade(skin);
      ctx.translate(muzzle.x, muzzle.y);
      ctx.rotate(timeS * 4.5);
      if (bladeImg) {
        ctx.drawImage(bladeImg, -loadedR, -loadedR, loadedR * 2, loadedR * 2);
      } else {
        ctx.fillStyle = skin.primaryColor;
        ctx.beginPath();
        ctx.arc(0, 0, loadedR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Idle ready sight chevrons when not actively dragging yet
      if (aimAngleRad === null) {
        ctx.save();
        for (let i = 0; i < 3; i++) {
          const cy = muzzle.y + 20 + i * 16;
          const alpha = 0.28 + 0.24 * Math.sin(timeS * 5 - i * 0.9);
          ctx.strokeStyle = `rgba(255, 224, 102, ${alpha.toFixed(2)})`;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(muzzle.x - 6, cy - 4);
          ctx.lineTo(muzzle.x, cy + 2);
          ctx.lineTo(muzzle.x + 6, cy - 4);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    ctx.save();
    // Riveted dark-steel horizontal ceiling girder
    const railGrad = ctx.createLinearGradient(0, y - 42, 0, y - 24);
    railGrad.addColorStop(0, '#475569');
    railGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = railGrad;
    ctx.fillRect(0, y - 42, PHYSICS_CONFIG.SHAFT_WIDTH, 16);
    ctx.strokeStyle = '#181210';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(0, y - 42, PHYSICS_CONFIG.SHAFT_WIDTH, 16);

    for (let rxPos = 24; rxPos < PHYSICS_CONFIG.SHAFT_WIDTH; rxPos += 48) {
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.arc(rxPos, y - 34, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const turretTex = this.atlas.getPropTurret();
    ctx.translate(rx, pivotY);
    ctx.rotate(angle - Math.PI * 0.5);

    if (turretTex) {
      const th = 66;
      const tw = ((turretTex.width || 180) / (turretTex.height || 220)) * th;
      ctx.drawImage(turretTex, -tw * 0.5, 0, tw, th);
    } else {
      ctx.fillStyle = '#d97706';
      ctx.strokeStyle = '#181210';
      ctx.lineWidth = 2.5;
      ctx.fillRect(-14, 0, 28, 34);
      ctx.strokeRect(-14, 0, 28, 34);
    }

    ctx.restore();
  }

  private renderAimFeedback(ctx: CanvasRenderingContext2D, fb: AimFeedback, timeS: number): void {
    if (!fb.dragging) return;
    ctx.save();
    if (fb.mode === 'slingshot') {
      const ringColor = fb.canceled
        ? 'rgba(248, 113, 113, 0.9)'
        : 'rgba(255, 224, 102, 0.72)';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = 2.2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(fb.originWorld.x, fb.originWorld.y, fb.deadzoneWorldRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (fb.canceled) {
        const cx = fb.originWorld.x;
        const cy = fb.originWorld.y;
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.8;
        ctx.beginPath();
        ctx.moveTo(cx - 6, cy - 6);
        ctx.lineTo(cx + 6, cy + 6);
        ctx.moveTo(cx + 6, cy - 6);
        ctx.lineTo(cx - 6, cy + 6);
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(fb.originWorld.x, fb.originWorld.y);
        ctx.lineTo(fb.currentWorld.x, fb.currentWorld.y);
        ctx.stroke();

        const handleR = 6 + Math.sin(timeS * 8) * 0.8;
        ctx.fillStyle = '#fde047';
        ctx.strokeStyle = '#181210';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(fb.currentWorld.x, fb.currentWorld.y, handleR, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else if (fb.canceled) {
      const cx = fb.currentWorld.x;
      const cy = fb.currentWorld.y;
      ctx.strokeStyle = '#f87171';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(cx, cy, 16, 0, Math.PI * 2);
      ctx.moveTo(cx - 5, cy - 5);
      ctx.lineTo(cx + 5, cy + 5);
      ctx.moveTo(cx + 5, cy - 5);
      ctx.lineTo(cx - 5, cy + 5);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderEntity(
    ctx: CanvasRenderingContext2D,
    b: BlockEntity,
    biome: BiomeSpec,
    timeS: number,
    rawDt: number
  ): void {
    const targetX = b.x;
    const visX = b.renderX ?? targetX;
    const nextVisX =
      Math.abs(targetX - visX) < 0.4 ? targetX : visX + (targetX - visX) * Math.min(1, rawDt * 24);
    b.renderX = nextVisX;
    const drawX = nextVisX;
    const cx = drawX + b.width * 0.5;
    const cy = b.y + b.height * 0.5;

    if (b.kind === 'portal_entry' || b.kind === 'portal_exit') {
      ctx.save();
      const isEntry = b.kind === 'portal_entry';
      const portalTex = this.atlas.getPropPortal(isEntry);
      ctx.translate(cx, cy);

      const pulse = 1 + Math.sin(timeS * 4.5 + b.id) * 0.08;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const aura = ctx.createRadialGradient(0, 0, b.radius * 0.2, 0, 0, b.radius * 1.45 * pulse);
      aura.addColorStop(0, isEntry ? 'rgba(34, 211, 238, 0.55)' : 'rgba(251, 146, 60, 0.55)');
      aura.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, b.radius * 1.45 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.rotate(timeS * (isEntry ? 2.4 : -2.4));
      if (portalTex) {
        const size = b.radius * 2.55;
        ctx.drawImage(portalTex, -size * 0.5, -size * 0.5, size, size);
      } else {
        ctx.strokeStyle = isEntry ? '#28e0d8' : '#fb923c';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    if (b.kind === 'bumper') {
      ctx.save();
      const isAmber = b.id % 2 === 0;
      const bumperTex = this.atlas.getPropBumper(isAmber);
      const squash = b.hitFlashTimer > 0 ? 1.22 : 1 + Math.sin(timeS * 5 + b.id) * 0.03;
      ctx.translate(cx, cy);
      ctx.scale(squash, squash);
      if (bumperTex) {
        const size = b.radius * 2.45;
        ctx.drawImage(bumperTex, -size * 0.5, -size * 0.5, size, size);
      } else {
        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      if (b.hitFlashTimer > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, b.radius * 1.15, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    const sprite = this.atlas.getBlockSprite(b.kind, biome, b.col, b.row);
    ctx.save();

    if (b.kind === 'boss_core') {
      const pulse = 0.55 + 0.35 * Math.sin(timeS * 5 + b.id);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const coreGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, b.width * 0.78);
      coreGlow.addColorStop(0, `rgba(251, 146, 60, ${(0.55 * pulse).toFixed(2)})`);
      coreGlow.addColorStop(0.6, `rgba(244, 63, 94, ${(0.28 * pulse).toFixed(2)})`);
      coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, b.width * 0.78, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (b.kind === 'vault') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const vGlow = ctx.createRadialGradient(cx, cy, 4, cx, cy, b.width * 0.7);
      vGlow.addColorStop(0, 'rgba(250, 204, 21, 0.32)');
      vGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = vGlow;
      ctx.beginPath();
      ctx.arc(cx, cy, b.width * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (sprite) {
      ctx.drawImage(sprite, drawX, b.y, b.width, b.height);
    } else {
      ctx.fillStyle = biome.palette.strataFill;
      ctx.fillRect(drawX, b.y, b.width, b.height);
    }

    if (b.kind === 'laser') {
      const glint = 0.55 + 0.45 * Math.sin(timeS * 8 + b.id);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(253, 224, 71, ${(0.65 * glint).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(drawX + 5, cy, 4.5, 0, Math.PI * 2);
      ctx.arc(drawX + b.width - 5, cy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (b.kind === 'boss_core') {
      ctx.save();
      ctx.strokeStyle = 'rgba(253, 186, 116, 0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, b.width * 0.34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Hit flash overlay
    if (b.hitFlashTimer > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(drawX + 2, b.y + 2, b.width - 4, b.height - 4);
    }

    // Progressive jagged organic fissure cracks + SINGLE bold outlined centered HP numeral
    if (Number.isFinite(b.hp) && b.maxHp > 0) {
      const ratio = b.hp / b.maxHp;
      if (ratio < 1) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(drawX + 2, b.y + 2, b.width - 4, b.height - 4);
        ctx.clip();

        ctx.strokeStyle = 'rgba(24, 18, 16, 0.78)';
        ctx.lineWidth = 3.2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this.traceJaggedCracks(ctx, drawX, b.y, b.width, b.height, cx, cy, ratio, b.id);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(255, 224, 102, 0.92)';
        ctx.lineWidth = 1.6;
        this.traceJaggedCracks(ctx, drawX, b.y, b.width, b.height, cx, cy, ratio, b.id);
        ctx.stroke();
        ctx.restore();
      }

      if (b.kind !== 'tnt' && (b.hp < b.maxHp || b.hp >= 10)) {
        const label = formatCompact(Math.ceil(b.hp));
        ctx.font = '700 17px "Lilita One", "Fredoka", system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = '#181210';
        ctx.strokeText(label, cx, cy + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(label, cx, cy + 1);
      }
    }

    ctx.restore();
  }

  private traceJaggedCracks(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    cx: number,
    cy: number,
    ratio: number,
    seed: number
  ): void {
    const jitter = ((seed % 5) - 2) * 1.4;
    ctx.beginPath();
    if (ratio <= 0.78) {
      ctx.moveTo(x + 6, y + 6);
      ctx.lineTo(x + w * 0.28 + jitter, y + h * 0.34);
      ctx.lineTo(x + w * 0.42 - jitter, y + h * 0.3);
      ctx.lineTo(cx, cy);
    }
    if (ratio <= 0.5) {
      ctx.moveTo(x + w - 6, y + 8);
      ctx.lineTo(x + w * 0.72 - jitter, y + h * 0.28);
      ctx.lineTo(x + w * 0.58 + jitter, y + h * 0.44);
      ctx.lineTo(cx - 2, cy + 2);
    }
    if (ratio <= 0.25) {
      ctx.moveTo(x + 8, y + h - 6);
      ctx.lineTo(x + w * 0.32 - jitter, y + h * 0.68);
      ctx.lineTo(x + w * 0.46 + jitter, y + h * 0.56);
      ctx.lineTo(cx + 3, cy - 2);
      ctx.moveTo(cx + 4, cy + 3);
      ctx.lineTo(x + w * 0.76, y + h * 0.76);
      ctx.lineTo(x + w - 7, y + h - 9);
    }
  }

  private renderOrb(ctx: CanvasRenderingContext2D, orb: Orb, skin: SkinSpec): void {
    const lowBounces = orb.bouncesLeft <= 2 || orb.overheatDraining;
    const trailColor = lowBounces ? '#f59e0b' : orb.isOverdrive ? '#fde047' : skin.trailColor;
    const comboScale = 1 + Math.min(0.4, orb.comboCount * 0.025);

    // Luminous gold-orange curved comet ribbon trail
    if (orb.trail.length > 1) {
      ctx.save();
      for (let i = 1; i < orb.trail.length; i++) {
        const prev = orb.trail[i - 1];
        const curr = orb.trail[i];
        const t = i / orb.trail.length;
        ctx.strokeStyle = trailColor;
        ctx.globalAlpha = t * 0.72;
        ctx.lineWidth = orb.radius * 1.2 * comboScale * t;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Bounce energy perimeter arc
    const bounceRatio = Math.max(0, Math.min(1, orb.bouncesLeft / Math.max(1, orb.maxBounces)));
    ctx.save();
    ctx.strokeStyle = lowBounces ? '#f59e0b' : '#ffe066';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(orb.x, orb.y, orb.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * bounceRatio);
    ctx.stroke();

    // Spinning sawblade sprite (prop_sawblade.webp)
    ctx.translate(orb.x, orb.y);
    ctx.rotate(orb.rotation);
    const bladeTex = this.atlas.getPropSawblade(skin);
    if (bladeTex) {
      const size = orb.radius * 2.45;
      ctx.drawImage(bladeTex, -size * 0.5, -size * 0.5, size, size);
    } else {
      ctx.fillStyle = skin.primaryColor;
      ctx.beginPath();
      ctx.arc(0, 0, orb.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private hexToRgba(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    if (clean.length !== 6) return `rgba(255, 191, 71, ${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
}
