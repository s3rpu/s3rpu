import type { PokemonUsageStats } from './types.js';
import type { VgcPokemon } from '../types/team.js';

function top(record: Record<string, number>, n = 1): string[] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

function parseSpread(spread: string | undefined): { nature: string; evs: VgcPokemon['evs'] } {
  if (!spread) return { nature: 'Hardy', evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 } };
  const [nature, evsPart] = spread.split(':');
  const [hp, atk, def, spa, spd, spe] = (evsPart ?? '').split('/').map((v) => parseInt(v, 10) || 0);
  return { nature: nature || 'Hardy', evs: { hp: hp ?? 0, atk: atk ?? 0, def: def ?? 0, spa: spa ?? 0, spd: spd ?? 0, spe: spe ?? 0 } };
}

/** Construye un set "estandar del meta" (el mas usado) para un pokemon, a partir de sus stats de uso.
 * `excludeItems` evita elegir un objeto ya asignado a otro miembro del mismo equipo (Item Clause de VGC). */
export function buildCommonSet(mon: PokemonUsageStats, excludeItems?: Set<string>): VgcPokemon {
  const { nature, evs } = parseSpread(top(mon.spreads, 1)[0]);
  const moves = top(mon.moves, 4);
  const rankedItems = Object.entries(mon.items).sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const item = (excludeItems ? rankedItems.find((i) => !excludeItems.has(i)) : rankedItems[0]) ?? rankedItems[0] ?? '';
  return {
    name: mon.species,
    species: mon.species,
    item,
    ability: top(mon.abilities, 1)[0] ?? '',
    level: 50,
    evs,
    ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 },
    nature,
    moves,
  };
}
