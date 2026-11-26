export type ParticleKind = 'shard' | 'spark' | 'smoke' | 'confetti';

export interface Particle {
  active: boolean;
  kind: ParticleKind;
  additive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  vr: number;
  drag: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
}

const POOL_CAPACITY = 480;

export class ParticlePool {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this.pool.push({
        active: false,
        kind: 'shard',
        additive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
        rotation: 0,
        vr: 0,
        drag: 0.985,
        color: '#ffffff',
        alpha: 1,
        life: 0,
        maxLife: 0.4,
        gravity: 300,
      });
    }
  }

  emitBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speedMin: number = 80,
    speedMax: number = 280,
    size: number = 4,
    maxLife: number = 0.45,
    kind: ParticleKind = 'shard',
    additive: boolean = false
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_CAPACITY;

      const angle = (Math.PI * 2 * i) / Math.max(1, count) + (Math.random() - 0.5) * 0.6;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.active = true;
      p.kind = kind;
      p.additive = additive;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - (kind === 'smoke' ? 25 : 48);
      p.size = size * (0.7 + Math.random() * 0.65);
      p.rotation = Math.random() * Math.PI * 2;
      p.vr = (Math.random() - 0.5) * 14;
      p.drag = kind === 'smoke' ? 0.92 : kind === 'spark' ? 0.96 : 0.985;
      p.color = color;
      p.alpha = 1;
      p.life = maxLife * (0.75 + Math.random() * 0.45);
      p.maxLife = p.life;
      p.gravity = kind === 'smoke' ? -45 : kind === 'spark' ? 210 : 420;
    }
  }

  emitSparks(x: number, y: number, count: number, color: string = '#fde047'): void {
    this.emitBurst(x, y, count, color, 140, 420, 3.2, 0.28, 'spark', true);
  }

  emitDirectionalBurst(
    x: number,
    y: number,
    angleRad: number,
    spreadRad: number,
    count: number,
    color: string = '#fde047',
    speedMin: number = 140,
    speedMax: number = 320,
    size: number = 3.5,
    maxLife: number = 0.24,
    kind: ParticleKind = 'spark',
    additive: boolean = true
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_CAPACITY;

      const t = count > 1 ? i / (count - 1) - 0.5 : 0;
      const angle = angleRad + t * spreadRad + (Math.random() - 0.5) * 0.2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.active = true;
      p.kind = kind;
      p.additive = additive;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.size = size * (0.75 + Math.random() * 0.5);
      p.rotation = angle;
      p.vr = (Math.random() - 0.5) * 10;
      p.drag = 0.95;
      p.color = color;
      p.alpha = 1;
      p.life = maxLife * (0.8 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.gravity = 180;
    }
  }

  emitRockShards(x: number, y: number, count: number, color: string): void {
    this.emitBurst(x, y, count, color, 80, 290, 5.2, 0.48, 'shard', false);
  }

  emitSmokePuff(x: number, y: number, count: number, color: string = '#475569'): void {
    this.emitBurst(x, y, count, color, 30, 110, 9.5, 0.55, 'smoke', false);
  }

  update(dt: number): void {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const damp = Math.pow(p.drag, dt * 60);
      p.vx *= damp;
      p.vy = p.vy * damp + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.vr * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    // Pass 1: Non-additive solid chunks, smoke puffs & confetti
    ctx.save();
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this.pool[i];
      if (!p.active || p.additive) continue;
      ctx.globalAlpha = p.kind === 'smoke' ? p.alpha * 0.45 : p.alpha;
      ctx.fillStyle = p.color;
      if (p.kind === 'smoke') {
        const expand = 1 + (1 - p.alpha) * 1.1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * expand, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        const half = p.size * 0.5;
        ctx.beginPath();
        ctx.moveTo(-half, -half * 0.6);
        ctx.lineTo(half * 0.8, -half);
        ctx.lineTo(half, half * 0.7);
        ctx.lineTo(-half * 0.7, half);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(24, 18, 16, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
    }

    // Pass 2: Additive luminescent spark streaks
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this.pool[i];
      if (!p.active || !p.additive) continue;
      ctx.globalAlpha = Math.min(1, p.alpha * 1.15);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1.5, p.size * 0.65);
      ctx.lineCap = 'round';
      const tailX = p.x - p.vx * 0.032;
      const tailY = p.y - p.vy * 0.032;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
  }

  clear(): void {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this.pool[i].active = false;
    }
  }
}
