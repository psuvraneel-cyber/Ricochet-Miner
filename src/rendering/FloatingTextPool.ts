export interface FloatingText {
  active: boolean;
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  scale: number;
  life: number;
  maxLife: number;
}

const TEXT_POOL_SIZE = 48;

export class FloatingTextPool {
  private pool: FloatingText[] = [];
  private cursor = 0;

  constructor() {
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      this.pool.push({
        active: false,
        x: 0,
        y: 0,
        vy: -55,
        text: '',
        color: '#fbbf24',
        scale: 1,
        life: 0,
        maxLife: 0.7,
      });
    }
  }

  spawn(x: number, y: number, text: string, color: string = '#fbbf24', scale: number = 1): void {
    const item = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % TEXT_POOL_SIZE;
    item.active = true;
    item.x = x + (Math.random() - 0.5) * 14;
    item.y = y;
    item.vy = -65;
    item.text = text;
    item.color = color;
    item.scale = scale;
    item.life = 0.75;
    item.maxLife = 0.75;
  }

  update(dt: number): void {
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      const t = this.pool[i];
      if (!t.active) continue;
      t.life -= dt;
      if (t.life <= 0) {
        t.active = false;
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= 0.96;
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      const t = this.pool[i];
      if (!t.active) continue;
      const elapsed = 1 - t.life / t.maxLife;
      const pop = elapsed < 0.16 ? 0.85 + (elapsed / 0.16) * 0.3 : 1.15 - (elapsed - 0.16) * 0.18;
      const alpha = Math.min(1, (t.life / t.maxLife) * 1.45);
      ctx.globalAlpha = alpha;
      const fontSize = Math.round(16 * t.scale * pop);
      ctx.font = `700 ${fontSize}px 'Lilita One', 'Fredoka', system-ui, sans-serif`;
      ctx.lineWidth = 3.5;
      ctx.strokeStyle = 'rgba(24, 18, 16, 0.92)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (let i = 0; i < TEXT_POOL_SIZE; i++) {
      this.pool[i].active = false;
    }
  }
}
