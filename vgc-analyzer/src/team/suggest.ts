import type { VgcTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';
import { buildCommonSet } from '../meta/buildSet.js';
import { computeDefensiveCoverage, computeOffensiveCoverage } from './typeChart.js';
import { findSynergies } from './synergy.js';
import type { MetaSnapshot } from '../meta/types.js';
import { findUsageStats } from '../meta/metaEngine.js';

export interface SuggestionCandidate {
  species: string;
  score: number;
  reasons: string[];
}

/** Sugiere candidatos para completar el equipo (6to miembro u otros huecos), rankeados por cobertura + sinergia aportada. */
export function suggestNextMember(
  core: VgcTeam,
  metaTop: CoreMetaEntry[],
  snapshot: MetaSnapshot,
  count = 5,
): SuggestionCandidate[] {
  const currentSpecies = new Set(core.map((p) => p.species));
  const defBefore = computeDefensiveCoverage(core);
  const offBefore = computeOffensiveCoverage(core);
  const synergyBefore = findSynergies(core, metaTop).filter((s) => s.kind === 'positiva').length;

  const candidates: SuggestionCandidate[] = [];

  for (const entry of metaTop) {
    if (currentSpecies.has(entry.species)) continue;
    const stats = findUsageStats(snapshot, entry.species);
    if (!stats) continue;

    const candidateSet = buildCommonSet(stats);
    const hypothetical = [...core, candidateSet];

    const defAfter = computeDefensiveCoverage(hypothetical);
    const offAfter = computeOffensiveCoverage(hypothetical);
    const synergyAfter = findSynergies(hypothetical, metaTop).filter((s) => s.kind === 'positiva').length;

    const defFixed = defBefore.uncoveredWeaknesses.filter((t) => !defAfter.uncoveredWeaknesses.includes(t));
    const offFixed = offBefore.uncoveredOffensively.filter((t) => !offAfter.uncoveredOffensively.includes(t));
    const synergyGain = synergyAfter - synergyBefore;

    const usagePoints = entry.usagePercent * 4; // preferir mons realmente relevantes en el meta actual
    const score = defFixed.length * 3 + offFixed.length * 2 + synergyGain * 2 + usagePoints;

    const reasons: string[] = [];
    if (defFixed.length) reasons.push(`Tapa debilidad defensiva del equipo a: ${defFixed.join(', ')}.`);
    if (offFixed.length) reasons.push(`Agrega cobertura ofensiva contra: ${offFixed.join(', ')}.`);
    if (synergyGain > 0) reasons.push(`Suma ${synergyGain} sinergia(s) conocida(s) nueva(s) con el nucleo actual (roles: ${entry.roles.join(', ')}).`);
    reasons.push(`Uso actual en el meta: ${(entry.usagePercent * 100).toFixed(1)}% (rank #${entry.rank}).`);

    candidates.push({ species: entry.species, score, reasons });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, count);
}
