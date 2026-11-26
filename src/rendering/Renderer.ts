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
    const ctx = this.ctx;
    const { cssWidth, cssHeight, dpr, scale, shaftX } = layout;
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
      layout.isPortrait
    );

    // 2. Shaft World Transform
    const shake = scene.juice.getShakeOffset();
    const beamWidthPx = 26 * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(shaftX - beamWidthPx, 0, layout.shaftWidthPx + beamWidthPx * 2, cssHeight);
    ctx.clip();

    ctx.translate(shaftX + shake.x * scale, shake.y * scale);
    ctx.scale(scale, scale);
    ctx.translate(0, -snapCamY);

    // Inner shaft depth + volumetric sunbeams
    this.renderShaftInterior(ctx, snapCamY, cssHeight / scale, biome, scene.timeS);

    // Entities (WebP sprites + dynamic effects)
    const minVisibleY = snapCamY - 90;
    const maxVisibleY = snapCamY + cssHeight / scale + 90;
    for (let i = 0; i < scene.entities.length; i++) {
      const block = scene.entities[i];
      if (!block.alive) continue;
      if (block.y + block.height < minVisibleY || block.y > maxVisibleY) continue;
      this.renderEntity(ctx, block, biome, scene.timeS);
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

    // Coins
    for (let i = 0; i < scene.coins.length; i++) {
      const c = scene.coins[i];
      if (!c.alive) continue;
      ctx.save();
      ctx.fillStyle = 'rgba(255, 216, 77, 0.28)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd84d';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#181210';
      ctx.lineWidth = 2;
      ctx.stroke();
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
    this.renderTimberShaftFrame(ctx, snapCamY, cssHeight / scale, biome, scene.timeS);

    ctx.restore();

    // 3. Screen Vignette Pulse on Explosions
    const vigAlpha = scene.juice.getVignetteAlpha();
    if (vigAlpha > 0.01) {
      ctx.fillStyle = `rgba(251, 146, 60, ${vigAlpha.toFixed(2)})`;
      ctx.fillRect(0, 0, cssWidth, 14);
      ctx.fillRect(0, cssHeight - 14, cssWidth, 14);
    }

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
    isPortrait: boolean
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
        ctx.drawImage(flankTex, shaftX - tileW, y, tileW, tileH);
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
        ctx.drawImage(flankTex, 0, y, tileW, tileH);
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
    this.renderDepthRuler(ctx, cssHeight, cameraY, baseDepthMeters, scale);
  }

  private renderDepthRuler(
    ctx: CanvasRenderingContext2D,
    cssHeight: number,
    cameraY: number,
    baseDepthMeters: number,
    scale: number
  ): void {
    const pxPerMeter = PHYSICS_CONFIG.TILE_SIZE / PHYSICS_CONFIG.METERS_PER_ROW;
    const minDepth = Math.max(0, Math.floor((baseDepthMeters + cameraY / pxPerMeter) / 10) * 10);
    const maxDepth = minDepth + Math.ceil(cssHeight / (pxPerMeter * scale * 10)) * 10 + 10;

    ctx.save();
    ctx.font = '900 12px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (let d = minDepth; d <= maxDepth; d += 5) {
      const worldY = (d - baseDepthMeters) * pxPerMeter;
      const screenY = (worldY - cameraY) * scale;
      if (screenY < 58 || screenY > cssHeight - 16) continue;

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
    const beamTex = this.atlas.getEnvTimberBeam();
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
    timeS: number
  ): void {
    const cx = b.x + b.width * 0.5;
    const cy = b.y + b.height * 0.5;

    if (b.kind === 'portal_entry' || b.kind === 'portal_exit') {
      ctx.save();
      const isEntry = b.kind === 'portal_entry';
      const portalTex = this.atlas.getPropPortal();
      ctx.translate(cx, cy);
      ctx.rotate(timeS * (isEntry ? 2.4 : -2.4));
      if (portalTex) {
        const size = b.radius * 2.5;
        ctx.drawImage(portalTex, -size * 0.5, -size * 0.5, size, size);
      } else {
        ctx.strokeStyle = isEntry ? '#28e0d8' : '#f43f5e';
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

    if (sprite) {
      if (b.kind === 'vault') {
        // Rich royal-purple & gold treasure chest silhouette with lid seam, straps & lock clasp
        const pad = 2;
        const bx = b.x + pad;
        const by = b.y + pad;
        const bw = b.width - pad * 2;
        const bh = b.height - pad * 2;
        const lidY = by + bh * 0.34;

        // Subtle gold treasure aura underneath
        ctx.fillStyle = '#4c1d95';
        ctx.fillRect(bx, by, bw, bh);
        ctx.globalAlpha = 0.25;
        ctx.drawImage(sprite, bx + 4, by + 4, bw - 8, bh - 8);
        ctx.globalAlpha = 1;

        // Upper lid shade
        ctx.fillStyle = '#6d28d9';
        ctx.fillRect(bx, by, bw, lidY - by);

        // Vertical gold chest straps
        const strapW = 7;
        ctx.fillStyle = '#d97706';
        ctx.fillRect(bx + 12, by, strapW, bh);
        ctx.fillRect(bx + bw - 12 - strapW, by, strapW, bh);

        // Lid seam + heavy gold border
        ctx.fillStyle = '#181210';
        ctx.fillRect(bx, lidY - 2, bw, 4);
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(bx, lidY - 1, bw, 2);

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);

        // Golden lock clasp centered on lid seam
        const lockW = 14;
        const lockH = 11;
        ctx.fillStyle = '#181210';
        ctx.fillRect(cx - lockW * 0.5 - 1.5, lidY - lockH * 0.5 - 1.5, lockW + 3, lockH + 3);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(cx - lockW * 0.5, lidY - lockH * 0.5, lockW, lockH);
      } else {
        ctx.drawImage(sprite, b.x, b.y, b.width, b.height);
      }
    } else {
      ctx.fillStyle = biome.palette.strataFill;
      ctx.fillRect(b.x, b.y, b.width, b.height);
    }

    // Distinct visual silhouettes for Splitter Prism, Laser Drill Cell, and Armored Granite
    if (b.kind === 'splitter') {
      // Glowing cyan crystal prism + split-beam arrows
      ctx.fillStyle = 'rgba(6, 182, 212, 0.34)';
      ctx.beginPath();
      ctx.moveTo(cx, b.y + 4);
      ctx.lineTo(b.x + b.width - 4, cy);
      ctx.lineTo(cx, b.y + b.height - 4);
      ctx.lineTo(b.x + 4, cy);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 2.8;
      ctx.stroke();

      // Inner bright prism facet + dual split arrows
      ctx.strokeStyle = '#cffafe';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(cx, b.y + 11);
      ctx.lineTo(cx, cy - 6);
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx - 11, b.y + b.height - 12);
      ctx.moveTo(cx, cy + 4);
      ctx.lineTo(cx + 11, b.y + b.height - 12);
      ctx.stroke();
    } else if (b.kind === 'laser') {
      // Industrial hazard casing + top/bottom amber stripes + glowing side emitter lenses
      const bx = b.x + 2;
      const by = b.y + 2;
      const bw = b.width - 4;
      const bh = b.height - 4;
      const bandH = 7;

      // Top & bottom amber hazard stripes
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, by, bw, bandH);
      ctx.rect(bx, by + bh - bandH, bw, bandH);
      ctx.clip();
      ctx.fillStyle = '#181210';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = '#f59e0b';
      for (let sx = -bh; sx < bw + bh; sx += 12) {
        ctx.beginPath();
        ctx.moveTo(bx + sx, by);
        ctx.lineTo(bx + sx + 6, by);
        ctx.lineTo(bx + sx - 4, by + bh);
        ctx.lineTo(bx + sx - 10, by + bh);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();

      // Glowing laser emitter lenses on left & right + subtle beam charge line
      ctx.strokeStyle = 'rgba(254, 240, 138, 0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bx + 10, cy);
      ctx.lineTo(bx + bw - 10, cy);
      ctx.stroke();

      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      ctx.fillStyle = '#fde047';
      ctx.fillRect(b.x + 2, cy - 6, 8, 12);
      ctx.fillRect(b.x + b.width - 10, cy - 6, 8, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(b.x + 3, cy - 3, 4, 6);
      ctx.fillRect(b.x + b.width - 7, cy - 3, 4, 6);
    } else if (b.kind === 'granite' && b.biomeIndex >= 1) {
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 2.5;
      ctx.strokeRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4);
    }

    // Hit flash overlay
    if (b.hitFlashTimer > 0) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.fillRect(b.x + 2, b.y + 2, b.width - 4, b.height - 4);
    }

    // Progressive molten/amber fracture lines + SINGLE bold outlined centered HP numeral
    if (Number.isFinite(b.hp) && b.maxHp > 0) {
      const ratio = b.hp / b.maxHp;
      if (ratio < 1) {
        ctx.strokeStyle = 'rgba(255, 216, 77, 0.92)';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        if (ratio <= 0.75) {
          ctx.moveTo(b.x + 8, b.y + 8);
          ctx.lineTo(cx, cy);
        }
        if (ratio <= 0.5) {
          ctx.moveTo(b.x + b.width - 8, b.y + 10);
          ctx.lineTo(cx - 4, cy + 4);
        }
        if (ratio <= 0.25) {
          ctx.moveTo(b.x + 10, b.y + b.height - 8);
          ctx.lineTo(cx + 8, cy - 4);
        }
        ctx.stroke();
      }

      if (b.kind !== 'tnt' && (b.hp < b.maxHp || b.hp >= 10)) {
        const label = formatCompact(Math.ceil(b.hp));
        ctx.font = '900 17px system-ui, sans-serif';
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
