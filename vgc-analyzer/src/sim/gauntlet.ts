import type { NamedTeam, VgcTeam } from '../types/team.js';
import { simulateMatch, type MatchupSummary } from './monteCarlo.js';

export interface GauntletOpponentResult {
  opponent: string;
  summary: MatchupSummary;
}

export interface GauntletResult {
  overallWinRate: number;
  perOpponent: GauntletOpponentResult[];
  /** Oponentes del meta contra los que el equipo pierde mas de la mitad de las veces. */
  worstMatchups: GauntletOpponentResult[];
  /** Amenazas individuales que mas veces provocaron la primera baja, agregado entre todos los rivales. */
  topThreats: { species: string; totalFirstFaints: number }[];
}

/** Enfrenta un equipo contra todos los equipos "top" del meta (no solo un rival) y agrega resultados. */
export async function runMetaGauntlet(
  team: VgcTeam,
  metaTeams: NamedTeam[],
  opts: { n?: number; format?: string; concurrency?: number } = {},
): Promise<GauntletResult> {
  const perOpponent: GauntletOpponentResult[] = [];
  for (const opp of metaTeams) {
    const summary = await simulateMatch(team, opp.team, opts);
    perOpponent.push({ opponent: opp.label, summary });
  }

  const totalWins = perOpponent.reduce((s, r) => s + r.summary.teamAWins, 0);
  const totalGames = perOpponent.reduce((s, r) => s + r.summary.n, 0);

  // "Amenaza" = pokemon rival que sobrevive con frecuencia en los enfrentamientos que mas perdemos:
  // sobrevivencia del rival ponderada por que tan desfavorable es ese matchup para nosotros.
  const threatCounts = new Map<string, number>();
  for (const r of perOpponent) {
    const lossWeight = 1 - r.summary.winRateA;
    for (const mvp of r.summary.mvpB) {
      threatCounts.set(mvp.species, (threatCounts.get(mvp.species) ?? 0) + mvp.survivalRate * lossWeight * r.summary.n);
    }
  }
  const topThreats = [...threatCounts.entries()]
    .map(([species, totalFirstFaints]) => ({ species, totalFirstFaints }))
    .sort((a, b) => b.totalFirstFaints - a.totalFirstFaints)
    .filter((t) => t.totalFirstFaints > 0)
    .slice(0, 8);

  return {
    overallWinRate: totalWins / (totalGames || 1),
    perOpponent,
    worstMatchups: perOpponent.filter((r) => r.summary.winRateA < 0.5).sort((a, b) => a.summary.winRateA - b.summary.winRateA),
    topThreats,
  };
}
