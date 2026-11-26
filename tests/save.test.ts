import { describe, expect, it } from 'vitest';
import {
  SaveManager,
  createDefaultSave,
  parseAndMigrateSave,
  resolveSaveConflict,
} from '../src/sdk/SaveManager';

describe('SaveManager & Cloud Conflict Resolution', () => {
  it('recovers gracefully from corrupted JSON in localStorage', () => {
    const mem = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    mem.set('ricochet_miner_save_v1', '{broken-json!!!');
    const mgr = new SaveManager(fakeStorage);
    const loaded = mgr.loadLocal(5000);
    expect(loaded.version).toBe(1);
    expect(loaded.coins).toBe(0);
    expect(loaded.unlockedSkins).toContain('steel_sawblade');
  });

  it('migrates partial saves and fills missing fields', () => {
    const partial = JSON.stringify({ coins: 420, upgrades: { damage: 5 } });
    const migrated = parseAndMigrateSave(partial, 1000);
    expect(migrated.coins).toBe(420);
    expect(migrated.upgrades.damage).toBe(5);
    expect(migrated.upgrades.bounces).toBe(1);
  });

  it('resolves local vs cloud conflicts in favor of furthest progress', () => {
    const local = createDefaultSave(1000);
    local.totalCoinsEarned = 500;
    const cloud = createDefaultSave(900);
    cloud.totalCoinsEarned = 1200;

    const winner = resolveSaveConflict(local, cloud);
    expect(winner.totalCoinsEarned).toBe(1200);
  });

  it('resetProgress wipes all progress cleanly back to Run 1 defaults', () => {
    const mem = new Map<string, string>();
    const fakeStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
    };
    const mgr = new SaveManager(fakeStorage);
    const save = createDefaultSave(1000);
    save.coins = 50000;
    save.maxDepthMeters = 450;
    save.upgrades.damage = 12;
    save.unlockedSkins.push('void_reaper');
    mgr.saveLocal(save);

    const reset = mgr.resetProgress(2000);
    expect(reset.coins).toBe(0);
    expect(reset.maxDepthMeters).toBe(0);
    expect(reset.upgrades.damage).toBe(1);
    expect(reset.unlockedSkins).toEqual(['steel_sawblade']);

    const reloaded = mgr.loadLocal(3000);
    expect(reloaded.coins).toBe(0);
    expect(reloaded.maxDepthMeters).toBe(0);
  });
});
