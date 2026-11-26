import { PHYSICS_CONFIG } from '../config/gameConfig';
import { clamp, degToRad } from '../utils/math';

export interface AimFeedback {
  mode: 'slingshot' | 'direct';
  dragging: boolean;
  canceled: boolean;
  originWorld: { x: number; y: number };
  currentWorld: { x: number; y: number };
  deadzoneWorldRadius: number;
}

export interface InputCallbacks {
  canAim: () => boolean;
  getAimMode: () => 'slingshot' | 'direct';
  getLauncherPos: () => { x: number; y: number };
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  onAimStart: () => void;
  onAimUpdate: (angleRad: number | null, canceled: boolean, feedback?: AimFeedback | null) => void;
  onLaunch: (angleRad: number) => void;
  onQuickRelaunch: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onBuyUpgradeSlot: (slotIndex: number) => void;
}

export class InputManager {
  private canvas: HTMLCanvasElement;
  private callbacks: InputCallbacks;
  private activePointerId: number | null = null;
  private dragStartCss = { x: 0, y: 0 };
  private currentAngleRad: number = Math.PI / 2;
  private isDragging = false;
  private isCanceled = false;
  private locked = false;

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.bind();
  }

  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked && this.isDragging) {
      this.releasePointerCaptureSafe(this.activePointerId);
      this.isDragging = false;
      this.activePointerId = null;
      this.callbacks.onAimUpdate(null, true, null);
    }
  }

  getCurrentAngleRad(): number {
    return this.currentAngleRad;
  }

  getIsDragging(): boolean {
    return this.isDragging;
  }

  private bind(): void {
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerCancel);
    window.addEventListener('blur', this.onWindowBlur);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
  }

  private releasePointerCaptureSafe(pointerId: number | null): void {
    if (pointerId === null) return;
    try {
      if (this.canvas.hasPointerCapture?.(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      // Ignore synthetic or detached pointer errors
    }
  }

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onWheel = (e: WheelEvent): void => {
    if (e.target === this.canvas) {
      e.preventDefault();
    }
  };

  private onWindowBlur = (): void => {
    if (this.isDragging) {
      this.releasePointerCaptureSafe(this.activePointerId);
      this.isDragging = false;
      this.activePointerId = null;
      this.isCanceled = true;
      this.callbacks.onAimUpdate(null, true, null);
    }
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.locked || !this.callbacks.canAim()) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (this.isDragging || this.activePointerId !== null) return;

    this.activePointerId = e.pointerId;
    this.dragStartCss = { x: e.clientX, y: e.clientY };
    this.isDragging = true;
    this.isCanceled = true;

    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }

    this.callbacks.onAimStart();
    this.updateAimFromPointer(e.clientX, e.clientY);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.locked) return;
    if (this.isDragging) {
      if (e.pointerId !== this.activePointerId) return;
      this.updateAimFromPointer(e.clientX, e.clientY);
      return;
    }

    // Smooth desktop hover preview when in direct mode
    if (
      e.pointerType === 'mouse' &&
      this.callbacks.getAimMode() === 'direct' &&
      this.callbacks.canAim() &&
      e.target === this.canvas
    ) {
      this.updateHoverDirectAim(e.clientX, e.clientY);
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging || e.pointerId !== this.activePointerId) return;
    this.releasePointerCaptureSafe(this.activePointerId);
    this.isDragging = false;
    this.activePointerId = null;

    if (this.locked || this.isCanceled) {
      this.callbacks.onAimUpdate(null, true, null);
      return;
    }

    const angle = this.currentAngleRad;
    this.callbacks.onAimUpdate(null, false, null);
    this.callbacks.onLaunch(angle);
  };

  private onPointerCancel = (e: PointerEvent): void => {
    if (!this.isDragging || e.pointerId !== this.activePointerId) return;
    this.releasePointerCaptureSafe(this.activePointerId);
    this.isDragging = false;
    this.activePointerId = null;
    this.isCanceled = true;
    this.callbacks.onAimUpdate(null, true, null);
  };

  private computeWorldDeadzoneRadius(): number {
    const p0 = this.callbacks.clientToWorld(0, 0);
    const p1 = this.callbacks.clientToWorld(Math.max(PHYSICS_CONFIG.CANCEL_DEADZONE_PX, 18), 0);
    return Math.max(18, Math.abs(p1.x - p0.x));
  }

  private updateHoverDirectAim(clientX: number, clientY: number): void {
    const world = this.callbacks.clientToWorld(clientX, clientY);
    const launcher = this.callbacks.getLauncherPos();
    if (world.y <= launcher.y - 6) return;
    const aimDx = world.x - launcher.x;
    const aimDy = Math.max(20, world.y - launcher.y);
    const rawAngle = Math.atan2(aimDy, aimDx);
    const minRad = degToRad(PHYSICS_CONFIG.MIN_AIM_DEG);
    const maxRad = degToRad(PHYSICS_CONFIG.MAX_AIM_DEG);
    this.currentAngleRad = clamp(rawAngle, minRad, maxRad);
    this.callbacks.onAimUpdate(this.currentAngleRad, false, null);
  }

  private updateAimFromPointer(clientX: number, clientY: number): void {
    const mode = this.callbacks.getAimMode();
    const dxCss = clientX - this.dragStartCss.x;
    const dyCss = clientY - this.dragStartCss.y;
    const distCss = Math.hypot(dxCss, dyCss);
    const originWorld = this.callbacks.clientToWorld(this.dragStartCss.x, this.dragStartCss.y);
    const currentWorld = this.callbacks.clientToWorld(clientX, clientY);
    const deadzoneWorldRadius = this.computeWorldDeadzoneRadius();

    if (mode === 'slingshot') {
      const cancelDeadzone = Math.max(PHYSICS_CONFIG.CANCEL_DEADZONE_PX, 18);
      // Cancel cleanly inside deadzone or when dragging below horizontal toward blocks
      if (distCss < cancelDeadzone || dyCss > 22) {
        this.isCanceled = true;
        this.callbacks.onAimUpdate(null, true, {
          mode,
          dragging: true,
          canceled: true,
          originWorld,
          currentWorld,
          deadzoneWorldRadius,
        });
        return;
      }

      // Smooth continuous pull-back vector (zero dy=0 fold, zero abrupt 12deg horizontal snap)
      const aimDx = -dxCss;
      const aimDy = Math.max(24, 28 - dyCss);
      this.isCanceled = false;
      const rawAngle = Math.atan2(aimDy, aimDx);
      const minRad = degToRad(PHYSICS_CONFIG.MIN_AIM_DEG);
      const maxRad = degToRad(PHYSICS_CONFIG.MAX_AIM_DEG);
      this.currentAngleRad = clamp(rawAngle, minRad, maxRad);
      this.callbacks.onAimUpdate(this.currentAngleRad, false, {
        mode,
        dragging: true,
        canceled: false,
        originWorld,
        currentWorld,
        deadzoneWorldRadius,
      });
      return;
    }

    // Direct aim toward pointer in world coordinates
    const launcher = this.callbacks.getLauncherPos();
    const distToLauncher = Math.hypot(currentWorld.x - launcher.x, currentWorld.y - launcher.y);
    if (currentWorld.y < launcher.y - 12 || (distCss < 6 && distToLauncher < 18)) {
      this.isCanceled = true;
      this.callbacks.onAimUpdate(null, true, {
        mode,
        dragging: true,
        canceled: true,
        originWorld: launcher,
        currentWorld,
        deadzoneWorldRadius: 22,
      });
      return;
    }

    this.isCanceled = false;
    const aimDx = currentWorld.x - launcher.x;
    const aimDy = Math.max(20, currentWorld.y - launcher.y);
    const rawAngle = Math.atan2(aimDy, aimDx);
    const minRad = degToRad(PHYSICS_CONFIG.MIN_AIM_DEG);
    const maxRad = degToRad(PHYSICS_CONFIG.MAX_AIM_DEG);
    this.currentAngleRad = clamp(rawAngle, minRad, maxRad);
    this.callbacks.onAimUpdate(this.currentAngleRad, false, {
      mode,
      dragging: true,
      canceled: false,
      originWorld: launcher,
      currentWorld,
      deadzoneWorldRadius: 22,
    });
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.locked) return;

    if (
      e.code === 'Space' ||
      e.code === 'ArrowLeft' ||
      e.code === 'ArrowRight' ||
      e.code === 'ArrowUp' ||
      e.code === 'ArrowDown'
    ) {
      e.preventDefault();
    }

    if (e.code === 'KeyM') {
      this.callbacks.onToggleMute();
      return;
    }
    if (e.code === 'KeyP') {
      this.callbacks.onTogglePause();
      return;
    }
    if (e.code === 'KeyR') {
      this.callbacks.onQuickRelaunch();
      return;
    }

    if (e.code >= 'Digit1' && e.code <= 'Digit6') {
      const idx = Number(e.code.slice(5)) - 1;
      this.callbacks.onBuyUpgradeSlot(idx);
      return;
    }

    if (!this.callbacks.canAim()) return;

    const minRad = degToRad(PHYSICS_CONFIG.MIN_AIM_DEG);
    const maxRad = degToRad(PHYSICS_CONFIG.MAX_AIM_DEG);
    const step = degToRad(4);

    if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'KeyQ') {
      this.currentAngleRad = clamp(this.currentAngleRad + step, minRad, maxRad);
      this.callbacks.onAimStart();
      this.callbacks.onAimUpdate(this.currentAngleRad, false, null);
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      this.currentAngleRad = clamp(this.currentAngleRad - step, minRad, maxRad);
      this.callbacks.onAimStart();
      this.callbacks.onAimUpdate(this.currentAngleRad, false, null);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      this.callbacks.onAimUpdate(null, false, null);
      this.callbacks.onLaunch(this.currentAngleRad);
    }
  };

  destroy(): void {
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('blur', this.onWindowBlur);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
  }
}
