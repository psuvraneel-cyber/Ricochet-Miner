import {
  ARTIFACTS,
  type ArtifactId,
  type ArtifactSpec,
  calcRelicPotencyMult,
} from '../config/gameConfig';

export class ArtifactSystem {
  private stacks = new Map<ArtifactId, number>();

  resetRun(): void {
    this.stacks.clear();
  }

  getStack(id: ArtifactId): number {
    return this.stacks.get(id) ?? 0;
  }

  addArtifact(id: ArtifactId): number {
    const spec = ARTIFACTS.find((a) => a.id === id);
    const max = spec?.maxStacks ?? 4;
    const next = Math.min(max, this.getStack(id) + 1);
    this.stacks.set(id, next);
    return next;
  }

  getAllStacks(): Partial<Record<ArtifactId, number>> {
    const out: Partial<Record<ArtifactId, number>> = {};
    for (const [id, count] of this.stacks.entries()) {
      if (count > 0) out[id] = count;
    }
    return out;
  }

  getActiveEntries(): Array<{ spec: ArtifactSpec; stacks: number }> {
    const list: Array<{ spec: ArtifactSpec; stacks: number }> = [];
    for (const spec of ARTIFACTS) {
      const count = this.getStack(spec.id);
      if (count > 0) list.push({ spec, stacks: count });
    }
    return list;
  }

  rollDraftChoices(count: number = 3, rng: () => number = Math.random): ArtifactSpec[] {
    const eligible = ARTIFACTS.filter((a) => this.getStack(a.id) < a.maxStacks);
    const pool = eligible.length >= count ? [...eligible] : [...ARTIFACTS];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.min(count, pool.length));
  }

  getPotencyMultiplier(relicForgeLevel: number): number {
    return calcRelicPotencyMult(relicForgeLevel);
  }
}
