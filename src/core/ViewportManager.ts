import { PHYSICS_CONFIG } from '../config/gameConfig';

export interface ViewportLayout {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  scale: number;
  shaftX: number;
  shaftWidthPx: number;
  topOffsetPx: number;
  isPortrait: boolean;
}

const TIMBER_BEAM_WORLD_W = 24;

export class ViewportManager {
  private canvas: HTMLCanvasElement;
  private layout: ViewportLayout;
  private onResizeCb: ((layout: ViewportLayout) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.layout = this.computeLayout();
    this.applyCanvasSize();
    window.addEventListener('resize', this.handleResize);
  }

  onResize(cb: (layout: ViewportLayout) => void): void {
    this.onResizeCb = cb;
  }

  getLayout(): ViewportLayout {
    return this.layout;
  }

  private handleResize = (): void => {
    this.layout = this.computeLayout();
    this.applyCanvasSize();
    this.onResizeCb?.(this.layout);
  };

  private computeLayout(): ViewportLayout {
    const cssWidth = Math.max(320, window.innerWidth);
    const cssHeight = Math.max(400, window.innerHeight);
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const isPortrait = cssHeight > cssWidth * 1.05;

    // Reserve room for left/right timber beams (24px world each) so lanterns & beams never clip
    const totalWorldW = PHYSICS_CONFIG.SHAFT_WIDTH + TIMBER_BEAM_WORLD_W * 2;
    const widthRatio = cssWidth < 1100 ? 0.44 : 0.48;
    const scale = isPortrait
      ? cssWidth / totalWorldW
      : Math.min(cssWidth * widthRatio, 560) / PHYSICS_CONFIG.SHAFT_WIDTH;
    const shaftWidthPx = PHYSICS_CONFIG.SHAFT_WIDTH * scale;
    const shaftX = (cssWidth - shaftWidthPx) * 0.5;
    // Offset playable world cleanly below top HUD bar on vertical/portrait phones so the drill turret stays 100% visible
    const topOffsetPx = isPortrait
      ? Math.round(Math.min(106, Math.max(86, cssHeight * 0.105)))
      : 0;

    return {
      cssWidth,
      cssHeight,
      dpr,
      scale,
      shaftX,
      shaftWidthPx,
      topOffsetPx,
      isPortrait,
    };
  }

  private applyCanvasSize(): void {
    const { cssWidth, cssHeight, dpr, shaftX, shaftWidthPx, topOffsetPx } = this.layout;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    if (typeof document !== 'undefined') {
      const rootStyle = document.documentElement.style;
      rootStyle.setProperty('--rm-shaft-x', `${Math.round(shaftX)}px`);
      rootStyle.setProperty('--rm-shaft-w', `${Math.round(shaftWidthPx)}px`);
      rootStyle.setProperty('--rm-top-offset', `${Math.round(topOffsetPx)}px`);
    }
  }

  clientToWorld(clientX: number, clientY: number, cameraY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const { shaftX, scale, topOffsetPx } = this.layout;
    return {
      x: (cssX - shaftX) / scale,
      y: (cssY - topOffsetPx) / scale + cameraY,
    };
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
  }
}
