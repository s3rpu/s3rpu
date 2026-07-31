import type { VgcTeam } from '../types/team.js';
import type { NamedTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';
import { suggestSpread, suggestSpreadAlternatives } from './optimizer.js';
import { runMetaGauntlet } from '../sim/gauntlet.js';

export interface TuneLogEntry {
  species: string;
  tried: boolean;
  kept: 'primaria' | 'alternativa' | 'sin alternativa aplicable';
  winRateWithPrimary?: number;
  winRateWithAlternative?: number;
  detail: string;
}

export interface TuneResult {
  team: VgcTeam;
  log: TuneLogEntry[];
  winRateBefore: number;
  winRateAfter: number;
}

/**
 * Ajusta el spread (SP/naturaleza) de cada miembro probando de verdad la
 * alternativa "velocidad vs. bulk" contra el motor de combate, en vez de
 * asumir que la heuristica de `suggestSpread` siempre acierta. Es un ascenso
 * por coordenadas: fija todos los miembros salvo uno, prueba su alternativa
 * en combates reales contra el gauntlet del meta, y se queda con lo que
 * gane mas; repite para el siguiente miembro sobre el equipo ya ajustado.
 */
export async function tuneTeamSpreads(
  baselineTeam: VgcTeam,
  metaTop: CoreMetaEntry[],
  metaTeams: NamedTeam[],
  opts: { battlesPerOpponent?: number; format?: string } = {},
): Promise<TuneResult> {
  const n = opts.battlesPerOpponent ?? 8;
  // Arranca de la sugerencia "estandar" del optimizador (rol-consciente), no
  // del spread que traiga el archivo de entrada, para tener una base
  // consistente sobre la cual probar la alternativa velocidad/bulk.
  let team: VgcTeam = baselineTeam.map((p) => {
    const primary = suggestSpread(p, baselineTeam, metaTop);
    return { ...p, nature: primary.nature, evs: { ...primary.evs } };
  });
  const log: TuneLogEntry[] = [];

  const baseline = await runMetaGauntlet(team, metaTeams, { n, format: opts.format });
  const winRateBefore = baseline.overallWinRate;
  let currentWinRate = winRateBefore;

  for (let i = 0; i < team.length; i++) {
    const member = team[i]!;
    const alternatives = suggestSpreadAlternatives(member, team, metaTop);
    if (alternatives.length < 2) {
      log.push({ species: member.species, tried: false, kept: 'sin alternativa aplicable', detail: 'Este rol no tiene una alternativa velocidad/bulk clara (p.ej. ya invierte en ambas ofensivas o no pega).' });
      continue;
    }
    const alt = alternatives[1]!;

    const teamWithAlt: VgcTeam = team.map((p, idx) => (idx === i ? { ...p, nature: alt.nature, evs: { ...alt.evs } } : p));
    const resultAlt = await runMetaGauntlet(teamWithAlt, metaTeams, { n, format: opts.format });

    if (resultAlt.overallWinRate > currentWinRate) {
      log.push({
        species: member.species,
        tried: true,
        kept: 'alternativa',
        winRateWithPrimary: currentWinRate,
        winRateWithAlternative: resultAlt.overallWinRate,
        detail: `${alt.justification.join(' ')} Mejoro el win rate del equipo de ${(currentWinRate * 100).toFixed(1)}% a ${(resultAlt.overallWinRate * 100).toFixed(1)}%.`,
      });
      team = teamWithAlt;
      currentWinRate = resultAlt.overallWinRate;
    } else {
      log.push({
        species: member.species,
        tried: true,
        kept: 'primaria',
        winRateWithPrimary: currentWinRate,
        winRateWithAlternative: resultAlt.overallWinRate,
        detail: `Se probo la alternativa velocidad/bulk y NO mejoro (${(resultAlt.overallWinRate * 100).toFixed(1)}% vs ${(currentWinRate * 100).toFixed(1)}% actual); se mantiene el spread original.`,
      });
    }
  }

  return { team, log, winRateBefore, winRateAfter: currentWinRate };
}
