import { MockAdapter } from '../sdk/adapters/MockAdapter';
import { PlatformSDK } from '../sdk/PlatformSDK';
import type { SaveData } from '../sdk/SaveManager';

export interface DebugActions {
  getSave: () => SaveData;
  onAddCoins: (amount: number) => void;
  onUnlockAllBiomes: () => void;
  onSimulateOneShotClear: () => void;
  onSimulateElevatorClear: () => void;
  onResetSave: () => void;
}

export class DebugOverlay {
  private panel: HTMLElement | null = null;

  constructor(root: HTMLElement, actions: DebugActions) {
    if (!__DEV_MODE__) return;

    const toggle = document.createElement('button');
    toggle.className = 'rm-btn';
    toggle.textContent = 'QA';
    toggle.style.cssText = 'position:absolute;top:62px;right:12px;min-height:32px;min-width:38px;padding:4px 8px;font-size:11px;z-index:50;';
    root.appendChild(toggle);

    this.panel = document.createElement('div');
    this.panel.style.cssText = 'position:absolute;top:100px;right:12px;background:rgba(15,23,42,0.95);border:1px solid #38bdf8;border-radius:10px;padding:10px;display:none;flex-direction:column;gap:6px;z-index:50;pointer-events:auto;width:190px;font-size:12px;';
    this.panel.innerHTML = `
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="coins">+10K Coins</button>
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="biomes">Unlock Biomes</button>
      <button class="rm-btn rm-btn-gold" style="min-height:30px;font-size:11px;" data-qa="oneshot">Sim 0m One-Shot Clear</button>
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="elevclear">Sim Elevator Clear</button>
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="aderr">Toggle AdError</button>
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="adblk">Toggle AdBlock</button>
      <button class="rm-btn" style="min-height:30px;font-size:11px;" data-qa="reset">Reset Save</button>
    `;
    root.appendChild(this.panel);

    toggle.addEventListener('click', () => {
      if (!this.panel) return;
      this.panel.style.display = this.panel.style.display === 'none' ? 'flex' : 'none';
    });

    this.panel.querySelector('[data-qa="coins"]')?.addEventListener('click', () => actions.onAddCoins(10000));
    this.panel.querySelector('[data-qa="biomes"]')?.addEventListener('click', actions.onUnlockAllBiomes);
    this.panel.querySelector('[data-qa="oneshot"]')?.addEventListener('click', () => {
      if (this.panel) this.panel.style.display = 'none';
      actions.onSimulateOneShotClear();
    });
    this.panel.querySelector('[data-qa="elevclear"]')?.addEventListener('click', () => {
      if (this.panel) this.panel.style.display = 'none';
      actions.onSimulateElevatorClear();
    });
    this.panel.querySelector('[data-qa="reset"]')?.addEventListener('click', actions.onResetSave);

    const adapter = PlatformSDK.getAdapter();
    this.panel.querySelector('[data-qa="aderr"]')?.addEventListener('click', () => {
      if (adapter instanceof MockAdapter) {
        adapter.simulateAdError = !adapter.simulateAdError;
      }
    });
    this.panel.querySelector('[data-qa="adblk"]')?.addEventListener('click', () => {
      if (adapter instanceof MockAdapter) {
        adapter.simulateAdBlock = !adapter.simulateAdBlock;
      }
    });
  }
}
