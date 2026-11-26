import { PHYSICS_CONFIG } from '../config/gameConfig';

export interface GameLoopCallbacks {
  onFixedUpdate: (fixedDt: number) => void;
  onRender: (alpha: number, rawDt: number) => void;
  onVisibilityBlur?: () => void;
}

const STALL_DISCARD_THRESHOLD_S = 0.25;

export class GameLoop {
  private rafId: number | null = null;
  private lastTimeMs = 0;
  private accumulator = 0;
  private running = false;
  private pausedByVisibility = false;
  private speedMultiplier = 1;
  private callbacks: GameLoopCallbacks;
  private visibilityListener: (() => void) | null = null;

  constructor(callbacks: GameLoopCallbacks) {
    this.callbacks = callbacks;
    if (typeof document !== 'undefined') {
      this.visibilityListener = () => {
        if (document.visibilityState === 'hidden') {
          this.pausedByVisibility = true;
          this.accumulator = 0;
          this.callbacks.onVisibilityBlur?.();
        } else {
          this.pausedByVisibility = false;
          this.resetAccumulator();
        }
      };
      document.addEventListener('visibilitychange', this.visibilityListener);
    }
  }

  setSpeedMultiplier(mult: number): void {
    this.speedMultiplier = Math.max(1, Math.min(4, mult));
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = performance.now();
    const tick = (nowMs: number) => {
      if (!this.running) return;

      if (this.pausedByVisibility) {
        this.lastTimeMs = nowMs;
        this.accumulator = 0;
        this.rafId = requestAnimationFrame(tick);
        return;
      }

      const unclampedDt = Math.max(0, (nowMs - this.lastTimeMs) / 1000);
      this.lastTimeMs = nowMs;

      // Discard any prior backlog after a stall (> 0.25s) and clamp frame delta to 0.05s (50ms)
      if (unclampedDt > STALL_DISCARD_THRESHOLD_S) {
        this.accumulator = 0;
      }

      const rawDt = Math.min(PHYSICS_CONFIG.MAX_FRAME_DT, unclampedDt);
      this.accumulator += rawDt * this.speedMultiplier;

      const fixedDt = PHYSICS_CONFIG.FIXED_DT;
      const maxSteps = Math.max(
        16,
        Math.ceil((PHYSICS_CONFIG.MAX_FRAME_DT * this.speedMultiplier) / fixedDt) + 2
      );
      let steps = 0;

      while (this.accumulator >= fixedDt && steps < maxSteps) {
        this.callbacks.onFixedUpdate(fixedDt);
        this.accumulator -= fixedDt;
        steps++;
      }

      // Prevent accumulator drift if step ceiling was reached
      if (steps >= maxSteps && this.accumulator > fixedDt) {
        this.accumulator = 0;
      }

      const alpha = this.accumulator / fixedDt;
      this.callbacks.onRender(alpha, rawDt);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.visibilityListener && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibilityListener);
      this.visibilityListener = null;
    }
  }

  resetAccumulator(): void {
    this.accumulator = 0;
    this.lastTimeMs = performance.now();
  }
}
