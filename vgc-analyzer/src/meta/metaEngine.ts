import type { MetaSnapshot, PokemonUsageStats } from './types.js';
import type { NamedTeam } from '../types/team.js';
import { classifyRoles, type Role } from './roles.js';
import { buildCommonSet } from './buildSet.js';

export interface CoreMetaEntry {
  rank: number;
  species: string;
  usagePercent: number;
  roles: Role[];
  commonSet: { ability: string; item: string; moves: string[]; spread: string | undefined };
  topCounters: { species: string; winRate: number }[];
}

/** Calcula el "core meta": los N pokemon mas usados, su rol competitivo y sus counters mas comunes. */
export function buildCoreMeta(snapshot: MetaSnapshot, topN = 25): CoreMetaEntry[] {
  return snapshot.pokemon.slice(0, topN).map((mon, i) => ({
    rank: i + 1,
    species: mon.species,
    usagePercent: mon.usagePercent,
    roles: classifyRoles(mon),
    commonSet: {
      ability: Object.entries(mon.abilities).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      item: Object.entries(mon.items).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '',
      moves: Object.entries(mon.moves).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m]) => m),
      spread: Object.entries(mon.spreads).sort((a, b) => b[1] - a[1])[0]?.[0],
    },
    // "Checks and Counters" de Smogon: mayor winrate primero = mayor amenaza para este pokemon.
    topCounters: Object.entries(mon.checksAndCounters)
      .sort((a, b) => b[1][0] - a[1][0])
      .slice(0, 3)
      .map(([species, [winRate]]) => ({ species, winRate })),
  }));
}

export function findUsageStats(snapshot: MetaSnapshot, species: string): PokemonUsageStats | undefined {
  return snapshot.pokemon.find((p) => p.species.toLowerCase() === species.toLowerCase());
}

/**
 * Genera equipos "sinteticos" representativos del meta a partir de los datos
 * de uso reales: arranca de los pokemon mas usados y completa cada equipo
 * siguiendo su grafo de compañeros de equipo (Teammates %) mas frecuentes.
 * No son equipos copiados de un jugador puntual — son una reconstruccion
 * razonable pensada para el "gauntlet" contra el meta (parte 2 del spec).
 */
export function buildSyntheticMetaTeams(
  snapshot: MetaSnapshot,
  opts: { teamCount?: number; teamSize?: number; pool?: number } = {},
): NamedTeam[] {
  const teamCount = opts.teamCount ?? 8;
  const teamSize = opts.teamSize ?? 6;
  const poolSize = opts.pool ?? 30;

  const pool = snapshot.pokemon.slice(0, poolSize);
  const bySpecies = new Map(pool.map((p) => [p.species, p]));
  const used = new Set<string>();
  const teams: NamedTeam[] = [];

  for (const seed of pool) {
    if (used.has(seed.species)) continue;
    if (teams.length >= teamCount) break;

    const members: PokemonUsageStats[] = [seed];
    used.add(seed.species);

    while (members.length < teamSize) {
      const candidateScores = new Map<string, number>();
      for (const m of members) {
        for (const [teammate, weight] of Object.entries(m.teammates)) {
          if (used.has(teammate) || !bySpecies.has(teammate)) continue;
          candidateScores.set(teammate, (candidateScores.get(teammate) ?? 0) + weight);
        }
      }
      let next: string | undefined = [...candidateScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (!next) {
        next = pool.find((p) => !used.has(p.species))?.species;
      }
      if (!next) break;
      members.push(bySpecies.get(next)!);
      used.add(next);
    }

    if (members.length >= 2) {
      teams.push({
        label: `Meta Team #${teams.length + 1} (core: ${seed.species})`,
        team: assignSetsAvoidingItemClash(members),
      });
    }
  }

  return teams;
}

const FALLBACK_ITEMS = ['Sitrus Berry', 'Leftovers', 'Life Orb', 'Focus Sash', 'Covert Cloak', 'Safety Goggles', 'Mystic Water'];

/** Arma los sets del equipo evitando repetir objeto (Item Clause); si el fallback de datos de uso no alcanza, usa una lista generica. */
function assignSetsAvoidingItemClash(members: PokemonUsageStats[]): NamedTeam['team'] {
  const usedItems = new Set<string>();
  const sets = members.map((m) => {
    const set = buildCommonSet(m, usedItems);
    // Si species != m.species, buildCommonSet resolvio una forma Mega a su
    // especie base + Mega Piedra requerida: ese objeto no es sustituible.
    const itemIsMandatory = set.species !== m.species;
    if (!itemIsMandatory && usedItems.has(set.item)) {
      set.item = FALLBACK_ITEMS.find((i) => !usedItems.has(i)) ?? set.item;
    }
    usedItems.add(set.item);
    return set;
  });
  return sets;
}
