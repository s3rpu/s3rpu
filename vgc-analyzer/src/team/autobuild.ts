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
  /** Especie por la que se ramifico esta variante (el candidato alternativo probado en el primer hueco libre). */
  branchedOn: string;
  team: VgcTeam;
  steps: AutoBuildStep[];
}

/**
 * Genera varios equipos completos DISTINTOS a partir del mismo nucleo:
 * en vez de completar con un unico camino voraz (como `buildTeamAround`),
 * prueba los top `variants` candidatos para el primer hueco libre y, para
 * cada uno, completa el resto de forma voraz. No es busqueda exhaustiva
 * (eso no es viable: hay combinaciones practicamente ilimitadas de
 * movimientos/objetos/EVs) — es una muestra razonable de variantes
 * genuinamente distintas, pensada para evaluarlas con combates reales
 * despues (ver `sim/gauntlet.ts`) en vez de confiar solo en la heuristica.
 */
export function buildTeamVariants(
  core: VgcTeam,
  metaTop: CoreMetaEntry[],
  snapshot: MetaSnapshot,
  opts: { targetSize?: number; variants?: number } = {},
): TeamVariant[] {
  const targetSize = opts.targetSize ?? 6;
  const variantCount = opts.variants ?? 4;

  if (core.length >= targetSize) {
    return [{ branchedOn: core[core.length - 1]?.species ?? '', team: core, steps: [] }];
  }

  const branchCandidates = suggestNextMember(core, metaTop, snapshot, variantCount);
  const variants: TeamVariant[] = [];

  for (const candidate of branchCandidates) {
    const stats = findUsageStats(snapshot, candidate.species);
    if (!stats) continue;

    const usedItems = new Set(core.map((p) => p.item).filter(Boolean));
    const firstSet = buildCommonSet(stats, usedItems);
    const partial: VgcTeam = [...core, firstSet];

    const { team, steps } = buildTeamAround(partial, metaTop, snapshot, targetSize);
    variants.push({
      branchedOn: candidate.species,
      team,
      steps: [{ species: candidate.species, reasons: candidate.reasons }, ...steps],
    });
  }

  return variants;
}
