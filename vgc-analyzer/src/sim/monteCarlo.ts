import type { VgcTeam } from '../types/team.js';
import { runBattle, type BattleResult } from './battle.js';
import { currentVgcFormat } from '../data/formats.js';

export interface MonteCarloOptions {
  n?: number;
  format?: string;
  /** Ejecuta combates en paralelo (mas rapido, pero usa mas CPU). */
  concurrency?: number;
}

export interface LineStat {
  line: string;
  count: number;
  rate: number;
}

export interface MatchupSummary {
  teamAWins: number;
  teamBWins: number;
  ties: number;
  n: number;
  winRateA: number;
  winRateB: number;
  avgTurns: number;
  /** Lideres de team preview mas comunes (primeros 2 elegidos) para cada bando, aproximado via sobrevivientes/caidas. */
  commonLines: LineStat[];
  /** Pokemon del equipo A que mas veces sobrevivio hasta el final. */
  mvpA: { species: string; survivalRate: number }[];
  /** Pokemon del equipo A que murio primero con mas frecuencia (amenaza sin respuesta). */
  liabilityA: { species: string; firstFaintRate: number }[];
  mvpB: { species: string; survivalRate: number }[];
  liabilityB: { species: string; firstFaintRate: number }[];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const cur = idx++;
      results[cur] = await fn(items[cur]!, cur);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

/** Simula N combates entre dos equipos con variabilidad de semilla de IA/orden y agrega estadisticas. */
export async function simulateMatch(
  teamA: VgcTeam,
  teamB: VgcTeam,
  opts: MonteCarloOptions = {},
): Promise<MatchupSummary> {
  const n = opts.n ?? 50;
  const format = opts.format ?? currentVgcFormat();
  const concurrency = opts.concurrency ?? 4;

  const results = await mapWithConcurrency(
    Array.from({ length: n }, (_, i) => i),
    concurrency,
    () => runBattle(teamA, teamB, { format }),
  );

  return summarize(teamA, teamB, results);
}

export function summarize(teamA: VgcTeam, teamB: VgcTeam, results: BattleResult[]): MatchupSummary {
  const n = results.length;
  const teamAWins = results.filter((r) => r.winner === 'p1').length;
  const teamBWins = results.filter((r) => r.winner === 'p2').length;
  const ties = n - teamAWins - teamBWins;
  const avgTurns = results.reduce((s, r) => s + r.turns, 0) / (n || 1);

  const lineCounts = new Map<string, number>();
  for (const r of results) {
    const key = `${r.winner === 'p1' ? 'Team A' : r.winner === 'p2' ? 'Team B' : 'Empate'} gana en ~${r.turns} turnos (ultimo en pie: ${
      r.winner === 'p1' ? r.survivors.p1[0] ?? '?' : r.survivors.p2[0] ?? '?'
    })`;
    lineCounts.set(key, (lineCounts.get(key) ?? 0) + 1);
  }
  const commonLines = [...lineCounts.entries()]
    .map(([line, count]) => ({ line, count, rate: count / n }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  function survivalStats(team: VgcTeam, side: 'p1' | 'p2') {
    return team.map((p) => {
      const survived = results.filter((r) =>
        side === 'p1' ? r.survivors.p1.includes(p.species) : r.survivors.p2.includes(p.species),
      ).length;
      return { species: p.species, survivalRate: survived / (n || 1) };
    }).sort((a, b) => b.survivalRate - a.survivalRate);
  }

  function firstFaintStats(team: VgcTeam, side: 'p1' | 'p2') {
    const firstFaintCount = new Map<string, number>();
    for (const r of results) {
      const own = r.faintOrder.filter((f) => f.side === side);
      if (own.length > 0) {
        const first = own[0]!.species;
        firstFaintCount.set(first, (firstFaintCount.get(first) ?? 0) + 1);
      }
    }
    return team
      .map((p) => ({ species: p.species, firstFaintRate: (firstFaintCount.get(p.species) ?? 0) / (n || 1) }))
      .sort((a, b) => b.firstFaintRate - a.firstFaintRate);
  }

  return {
    teamAWins,
    teamBWins,
    ties,
    n,
    winRateA: teamAWins / (n || 1),
    winRateB: teamBWins / (n || 1),
    avgTurns,
    commonLines,
    mvpA: survivalStats(teamA, 'p1'),
    liabilityA: firstFaintStats(teamA, 'p1'),
    mvpB: survivalStats(teamB, 'p2'),
    liabilityB: firstFaintStats(teamB, 'p2'),
  };
}
