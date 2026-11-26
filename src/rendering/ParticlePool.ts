export interface Particle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  gravity: number;
}

const POOL_CAPACITY = 240;

export class ParticlePool {
  private pool: Particle[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 3,
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
    maxLife: number = 0.45
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % POOL_CAPACITY;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 40;
      p.size = size * (0.7 + Math.random() * 0.6);
      p.color = color;
      p.alpha = 1;
      p.life = maxLife * (0.8 + Math.random() * 0.4);
      p.maxLife = p.life;
      p.gravity = 380;
    }
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
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = Math.max(0, p.life / p.maxLife);
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size * 0.5, p.y - p.size * 0.5, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (let i = 0; i < POOL_CAPACITY; i++) {
      this.pool[i].active = false;
    }
  }
}
