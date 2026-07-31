import type { VgcTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';
import type { MetaSnapshot } from '../meta/types.js';
import { findUsageStats } from '../meta/metaEngine.js';
import { buildCommonSet } from '../meta/buildSet.js';
import { suggestNextMember } from './suggest.js';

export interface AutoBuildStep {
  species: string;
  reasons: string[];
}

export interface AutoBuildResult {
  team: VgcTeam;
  steps: AutoBuildStep[];
}

/**
 * Completa un equipo (desde 1 pokemon en adelante) hasta `targetSize`,
 * agregando en cada paso el candidato mejor rankeado por `suggestNextMember`
 * (cobertura de tipos ganada + sinergias nuevas + relevancia en el meta),
 * evitando choques de Item Clause contra el equipo ya armado.
 */
export function buildTeamAround(
  core: VgcTeam,
  metaTop: CoreMetaEntry[],
  snapshot: MetaSnapshot,
  targetSize = 6,
): AutoBuildResult {
  const team: VgcTeam = [...core];
  const steps: AutoBuildStep[] = [];
  const usedItems = new Set(team.map((p) => p.item).filter(Boolean));

  while (team.length < targetSize) {
    const [top] = suggestNextMember(team, metaTop, snapshot, 1);
    if (!top) break;

    const stats = findUsageStats(snapshot, top.species);
    if (!stats) break;

    const set = buildCommonSet(stats, usedItems);
    // buildCommonSet ya evita objetos usados salvo que sea una Mega Piedra obligatoria.
    usedItems.add(set.item);
    team.push(set);
    steps.push({ species: top.species, reasons: top.reasons });
  }

  return { team, steps };
}
