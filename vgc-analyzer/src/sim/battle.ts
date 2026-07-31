import ShowdownPS from 'pokemon-showdown';
import RandomPlayerAIModule from 'pokemon-showdown/dist/sim/tools/random-player-ai.js';
const { BattleStream, getPlayerStreams, Teams } = ShowdownPS;
const { RandomPlayerAI } = RandomPlayerAIModule;
import type { VgcTeam } from '../types/team.js';
import { teamToShowdownSets } from './team.js';
import { currentVgcFormat } from '../data/formats.js';

export interface BattleOptions {
  format?: string;
  maxTurns?: number;
}

export interface BattleResult {
  winner: 'p1' | 'p2' | 'tie';
  turns: number;
  log: string[];
  /** IDs (lowercase) de los pokemon de cada bando que quedaron con vida al terminar. */
  survivors: { p1: string[]; p2: string[] };
  /** IDs de los pokemon que fueron debilitados, en orden de caida. */
  faintOrder: { side: 'p1' | 'p2'; species: string; turn: number }[];
}

/**
 * Simula un unico combate VGC (2v2 dobles) entre dos equipos usando el motor
 * de Pokemon Showdown. Ni la batalla (orden de resolucion de turnos/tie
 * breaks) ni la IA de cada jugador reciben una semilla fija, asi que cada
 * llamada produce variabilidad real de IA/orden, tal como pide el spec para
 * las simulaciones de N combates.
 */
export async function runBattle(
  teamA: VgcTeam,
  teamB: VgcTeam,
  opts: BattleOptions = {},
): Promise<BattleResult> {
  const format = opts.format ?? currentVgcFormat();
  const stream = new BattleStream({ keepAlive: false });
  const streams = getPlayerStreams(stream);

  const spec = { formatid: format };
  const p1spec = { name: 'Team A', team: Teams.pack(teamToShowdownSets(teamA) as any) };
  const p2spec = { name: 'Team B', team: Teams.pack(teamToShowdownSets(teamB) as any) };

  const p1 = new RandomPlayerAI(streams.p1);
  const p2 = new RandomPlayerAI(streams.p2);

  const log: string[] = [];
  const faintOrder: BattleResult['faintOrder'] = [];
  let turn = 0;
  let winner: BattleResult['winner'] = 'tie';

  const collector = (async () => {
    for await (const chunk of streams.omniscient) {
      log.push(chunk);
      for (const line of chunk.split('\n')) {
        if (line.startsWith('|turn|')) {
          turn = parseInt(line.split('|')[2] ?? '0', 10) || turn;
        } else if (line.startsWith('|faint|')) {
          const ident = line.split('|')[2] ?? '';
          const side = ident.startsWith('p1') ? 'p1' : 'p2';
          const species = ident.split(': ')[1] ?? ident;
          faintOrder.push({ side, species, turn });
        } else if (line.startsWith('|win|')) {
          const name = line.split('|')[2];
          winner = name === 'Team A' ? 'p1' : name === 'Team B' ? 'p2' : 'tie';
        } else if (line.startsWith('|tie|')) {
          winner = 'tie';
        }
      }
    }
  })();

  await Promise.all([
    p1.start(),
    p2.start(),
    streams.omniscient.write(
      `>start ${JSON.stringify(spec)}\n>player p1 ${JSON.stringify(p1spec)}\n>player p2 ${JSON.stringify(p2spec)}`,
    ),
    collector,
  ]);

  const faintedP1 = new Set(faintOrder.filter((f) => f.side === 'p1').map((f) => f.species));
  const faintedP2 = new Set(faintOrder.filter((f) => f.side === 'p2').map((f) => f.species));
  const survivors = {
    p1: teamA.map((p) => p.species).filter((s) => !faintedP1.has(s)),
    p2: teamB.map((p) => p.species).filter((s) => !faintedP2.has(s)),
  };

  return { winner, turns: turn, log, survivors, faintOrder };
}
