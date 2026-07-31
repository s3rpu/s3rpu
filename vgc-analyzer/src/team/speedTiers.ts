import { calcStat, gen, MAX_SP_PER_STAT } from '../data/dex.js';
import type { VgcPokemon, VgcTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';

export interface SpeedEntry {
  species: string;
  owner: 'equipo' | 'meta';
  baseSpeed: number;
  /** Velocidad real a nivel 50 con la naturaleza/EVs/IVs indicados, sin modificadores de turno. */
  speedStat: number;
  scarfed: boolean;
}

export interface SpeedTierReport {
  neutral: SpeedEntry[];
  /** Orden bajo Trick Room (el mas lento actua primero). */
  trickRoom: SpeedEntry[];
  /** Para cada miembro del equipo: amenazas del meta mas rapidas que el en condiciones neutrales. */
  outsped: { species: string; fasterThreats: string[] }[];
}

function estimateMetaSpeed(entry: CoreMetaEntry): { baseSpeed: number; speedStat: number; scarfed: boolean } {
  const species = gen().species.get(entry.species);
  const baseSpeed = species?.baseStats.spe ?? 0;
  const spread = entry.commonSet.spread;
  let nature = 'Hardy';
  let sp = MAX_SP_PER_STAT;
  if (spread) {
    const [n, spPart] = spread.split(':');
    nature = n || 'Hardy';
    const parts = (spPart ?? '').split('/').map(Number);
    sp = parts[5] ?? 0;
  }
  const scarfed = entry.commonSet.item === 'Choice Scarf';
  let speedStat = calcStat('spe', baseSpeed, sp, nature);
  if (scarfed) speedStat = Math.floor(speedStat * 1.5);
  return { baseSpeed, speedStat, scarfed };
}

function ownSpeed(p: VgcPokemon): { baseSpeed: number; speedStat: number; scarfed: boolean } {
  const species = gen().species.get(p.species);
  const baseSpeed = species?.baseStats.spe ?? 0;
  const scarfed = p.item === 'Choice Scarf';
  let speedStat = calcStat('spe', baseSpeed, p.evs.spe, p.nature);
  if (scarfed) speedStat = Math.floor(speedStat * 1.5);
  return { baseSpeed, speedStat, scarfed };
}

/** Compara la velocidad real del equipo contra las amenazas top del meta, en neutral y en Trick Room. */
export function computeSpeedTiers(team: VgcTeam, metaThreats: CoreMetaEntry[]): SpeedTierReport {
  const teamEntries: SpeedEntry[] = team.map((p) => ({ species: p.species, owner: 'equipo', ...ownSpeed(p) }));
  const metaEntries: SpeedEntry[] = metaThreats.map((m) => ({ species: m.species, owner: 'meta', ...estimateMetaSpeed(m) }));

  const all = [...teamEntries, ...metaEntries];
  const neutral = [...all].sort((a, b) => b.speedStat - a.speedStat);
  const trickRoom = [...all].sort((a, b) => a.speedStat - b.speedStat);

  const outsped = teamEntries.map((t) => ({
    species: t.species,
    fasterThreats: metaEntries.filter((m) => m.speedStat > t.speedStat).map((m) => m.species),
  }));

  return { neutral, trickRoom, outsped };
}
