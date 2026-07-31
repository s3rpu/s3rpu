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

export interface TeamVariant {
  /** Camino de especies por el que se ramifico esta variante (los huecos donde se probaron alternativas, no solo la mejor). */
  branchedOn: string;
  team: VgcTeam;
  steps: AutoBuildStep[];
}

/**
 * Genera varios equipos completos DISTINTOS a partir del mismo nucleo:
 * en vez de completar con un unico camino voraz (como `buildTeamAround`),
 * ramifica en los primeros `branchDepth` huecos libres probando hasta
 * `branchWidth` candidatos en cada uno (arbol de busqueda acotado), y
 * completa el resto de cada rama de forma voraz. No es busqueda exhaustiva
 * (eso no es viable: hay combinaciones practicamente ilimitadas de
 * movimientos/objetos/EVs) — es una muestra razonable y MAS AMPLIA que
 * ramificar solo el primer hueco, pensada para evaluar cada variante con
 * combates reales despues (ver `sim/gauntlet.ts`) en vez de confiar solo en
 * la heuristica de cobertura/sinergia.
 */
export function buildTeamVariants(
  core: VgcTeam,
  metaTop: CoreMetaEntry[],
  snapshot: MetaSnapshot,
  opts: { targetSize?: number; branchWidth?: number; branchDepth?: number; maxVariants?: number } = {},
): TeamVariant[] {
  const targetSize = opts.targetSize ?? 6;
  const branchWidth = Math.max(1, opts.branchWidth ?? 3);
  const branchDepth = Math.max(1, opts.branchDepth ?? 2);
  const maxVariants = opts.maxVariants ?? 16;

  const results: TeamVariant[] = [];

  function finish(partial: VgcTeam, branchedSteps: AutoBuildStep[]) {
    const { team, steps } = buildTeamAround(partial, metaTop, snapshot, targetSize);
    results.push({
      branchedOn: branchedSteps.map((s) => s.species).join(' > ') || partial[partial.length - 1]?.species || '',
      team,
      steps: [...branchedSteps, ...steps],
    });
  }

  function recurse(partial: VgcTeam, branchedSteps: AutoBuildStep[], depthRemaining: number) {
    if (results.length >= maxVariants) return;
    if (partial.length >= targetSize || depthRemaining <= 0) {
      finish(partial, branchedSteps);
      return;
    }

    const candidates = suggestNextMember(partial, metaTop, snapshot, branchWidth);
    if (candidates.length === 0) {
      finish(partial, branchedSteps);
      return;
    }

    for (const candidate of candidates) {
      if (results.length >= maxVariants) break;
      const stats = findUsageStats(snapshot, candidate.species);
      if (!stats) continue;

      const usedItems = new Set(partial.map((p) => p.item).filter(Boolean));
      const set = buildCommonSet(stats, usedItems);
      const nextPartial: VgcTeam = [...partial, set];
      recurse(nextPartial, [...branchedSteps, { species: candidate.species, reasons: candidate.reasons }], depthRemaining - 1);
    }
  }

  recurse(core, [], branchDepth);
  return results;
}
