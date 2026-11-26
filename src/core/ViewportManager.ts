import { PHYSICS_CONFIG } from '../config/gameConfig';

export interface ViewportLayout {
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  scale: number;
  shaftX: number;
  shaftWidthPx: number;
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

    // Reserve room for left/right timber beams (24px world each) so lanterns & beams never clip on narrow portrait screens
    const totalWorldW = PHYSICS_CONFIG.SHAFT_WIDTH + TIMBER_BEAM_WORLD_W * 2;
    const scale = isPortrait
      ? cssWidth / totalWorldW
      : Math.min(cssWidth * 0.48, 560) / PHYSICS_CONFIG.SHAFT_WIDTH;
    const shaftWidthPx = PHYSICS_CONFIG.SHAFT_WIDTH * scale;
    const shaftX = (cssWidth - shaftWidthPx) * 0.5;

    return {
      cssWidth,
      cssHeight,
      dpr,
      scale,
      shaftX,
      shaftWidthPx,
      isPortrait,
    };
  }

  private applyCanvasSize(): void {
    const { cssWidth, cssHeight, dpr } = this.layout;
    this.canvas.width = Math.round(cssWidth * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
  }

  clientToWorld(clientX: number, clientY: number, cameraY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = clientX - rect.left;
    const cssY = clientY - rect.top;
    const { shaftX, scale } = this.layout;
    return {
      x: (cssX - shaftX) / scale,
      y: cssY / scale + cameraY,
    };
  }

  destroy(): void {
    window.removeEventListener('resize', this.handleResize);
  }
}
