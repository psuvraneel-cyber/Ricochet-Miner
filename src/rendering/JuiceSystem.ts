export interface Shockwave {
  active: boolean;
  x: number;
  y: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface LaserBeam {
  active: boolean;
  y: number;
  life: number;
  maxLife: number;
  color: string;
}

const SHOCKWAVE_POOL_SIZE = 16;
const LASER_POOL_SIZE = 8;

export class JuiceSystem {
  private hitStopTimer = 0;
  private shakeX = 0;
  private shakeY = 0;
  private shakeMagnitude = 0;
  private vignetteAlpha = 0;
  private shockwaves: Shockwave[] = [];
  private shockwaveCursor = 0;
  private laserBeams: LaserBeam[] = [];
  private laserCursor = 0;
  private shakeOffset = { x: 0, y: 0 };

  constructor() {
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      this.shockwaves.push({
        active: false,
        x: 0,
        y: 0,
        maxRadius: 60,
        life: 0,
        maxLife: 0.28,
        color: '#fb923c',
      });
    }
    for (let i = 0; i < LASER_POOL_SIZE; i++) {
      this.laserBeams.push({
        active: false,
        y: 0,
        life: 0,
        maxLife: 0.22,
        color: '#facc15',
      });
    }
  }

  triggerHitStop(seconds: number): void {
    this.hitStopTimer = Math.max(this.hitStopTimer, Math.min(0.05, seconds));
  }

  triggerShake(magnitudePx: number): void {
    this.shakeMagnitude = Math.min(8, Math.max(this.shakeMagnitude, magnitudePx));
  }

  triggerVignette(alpha: number = 0.35): void {
    this.vignetteAlpha = Math.max(this.vignetteAlpha, alpha);
  }

  addShockwave(x: number, y: number, maxRadius: number, color: string = '#fb923c'): void {
    const sw = this.shockwaves[this.shockwaveCursor];
    this.shockwaveCursor = (this.shockwaveCursor + 1) % SHOCKWAVE_POOL_SIZE;
    sw.active = true;
    sw.x = x;
    sw.y = y;
    sw.maxRadius = maxRadius;
    sw.life = 0.28;
    sw.maxLife = 0.28;
    sw.color = color;
  }

  addLaserBeam(y: number, color: string = '#facc15'): void {
    const lb = this.laserBeams[this.laserCursor];
    this.laserCursor = (this.laserCursor + 1) % LASER_POOL_SIZE;
    lb.active = true;
    lb.y = y;
    lb.life = 0.22;
    lb.maxLife = 0.22;
    lb.color = color;
  }

  consumeHitStop(dt: number): boolean {
    if (this.hitStopTimer > 0) {
      this.hitStopTimer = Math.max(0, this.hitStopTimer - dt);
      return true;
    }
    return false;
  }

  update(dt: number): void {
    if (this.shakeMagnitude > 0.1) {
      const angle = Math.random() * Math.PI * 2;
      this.shakeX = Math.cos(angle) * this.shakeMagnitude;
      this.shakeY = Math.sin(angle) * this.shakeMagnitude;
      this.shakeMagnitude *= Math.pow(0.001, dt);
    } else {
      this.shakeMagnitude = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }

    if (this.vignetteAlpha > 0) {
      this.vignetteAlpha = Math.max(0, this.vignetteAlpha - dt * 1.4);
    }

    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      sw.life -= dt;
      if (sw.life <= 0) {
        sw.active = false;
      }
    }

    for (let i = 0; i < LASER_POOL_SIZE; i++) {
      const lb = this.laserBeams[i];
      if (!lb.active) continue;
      lb.life -= dt;
      if (lb.life <= 0) {
        lb.active = false;
      }
    }
  }

  getShakeOffset(): { x: number; y: number } {
    this.shakeOffset.x = this.shakeX;
    this.shakeOffset.y = this.shakeY;
    return this.shakeOffset;
  }

  getVignetteAlpha(): number {
    return this.vignetteAlpha;
  }

  renderWorldEffects(ctx: CanvasRenderingContext2D, shaftWidth: number): void {
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      const sw = this.shockwaves[i];
      if (!sw.active) continue;
      const progress = 1 - sw.life / sw.maxLife;
      const radius = sw.maxRadius * progress;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.85;
      ctx.strokeStyle = sw.color;
      ctx.lineWidth = 4 * (1 - progress) + 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = 0; i < LASER_POOL_SIZE; i++) {
      const lb = this.laserBeams[i];
      if (!lb.active) continue;
      const alpha = lb.life / lb.maxLife;
      ctx.save();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = lb.color;
      ctx.fillRect(0, lb.y - 10 * alpha, shaftWidth, 20 * alpha);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, lb.y - 3 * alpha, shaftWidth, 6 * alpha);
      ctx.restore();
    }
  }

  clear(): void {
    this.hitStopTimer = 0;
    this.shakeMagnitude = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.vignetteAlpha = 0;
    for (let i = 0; i < SHOCKWAVE_POOL_SIZE; i++) {
      this.shockwaves[i].active = false;
    }
    for (let i = 0; i < LASER_POOL_SIZE; i++) {
      this.laserBeams[i].active = false;
    }
  }
}
