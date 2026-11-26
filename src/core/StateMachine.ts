export type GameState =
  | 'BOOT'
  | 'TITLE'
  | 'AIMING'
  | 'RUNNING'
  | 'PAUSED'
  | 'RUN_SUMMARY'
  | 'ASCENSION_VICTORY'
  | 'SHOP'
  | 'AD_PAUSED';

export type StateChangeListener = (next: GameState, prev: GameState) => void;

export class StateMachine {
  private current: GameState = 'BOOT';
  private pausedFrom: GameState | null = null;
  private listeners: StateChangeListener[] = [];

  get state(): GameState {
    return this.current;
  }

  onChange(listener: StateChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  transition(next: GameState): void {
    if (next === this.current) return;
    const prev = this.current;
    this.current = next;
    for (const listener of this.listeners) {
      listener(next, prev);
    }
  }

  pauseForAd(): void {
    if (this.current === 'AD_PAUSED') return;
    this.pausedFrom = this.current;
    this.transition('AD_PAUSED');
  }

  resumeFromAd(): void {
    if (this.current !== 'AD_PAUSED') return;
    const target = this.pausedFrom ?? 'AIMING';
    this.pausedFrom = null;
    this.transition(target);
  }
}
