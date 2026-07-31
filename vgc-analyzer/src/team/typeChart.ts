import type { TypeName } from '@pkmn/data';
import { ALL_TYPES, gen, typeEffectiveness } from '../data/dex.js';
import type { VgcTeam } from '../types/team.js';

export interface DefensiveCoverage {
  /** Para cada tipo atacante: cuantos miembros del equipo son debiles (>1x), resistentes (<1x) o inmunes (0x). */
  byAttackType: Record<TypeName, { weak: string[]; resist: string[]; immune: string[]; neutral: string[] }>;
  /** Tipos atacantes para los que NINGUN miembro del equipo resiste o es inmune (agujero defensivo). */
  uncoveredWeaknesses: TypeName[];
}

export interface OffensiveCoverage {
  /** Para cada tipo defensivo, si el equipo tiene al menos un movimiento de la lista de ataque que le pega super efectivo. */
  superEffectiveAgainst: Record<TypeName, string[]>;
  /** Tipos defensivos contra los que NINGUN miembro del equipo tiene un movimiento super efectivo (agujero ofensivo). */
  uncoveredOffensively: TypeName[];
}

function speciesTypes(species: string): TypeName[] {
  const sp = gen().species.get(species);
  return (sp?.types ?? []) as TypeName[];
}

function moveTypes(team: VgcTeam): Map<string, TypeName[]> {
  const map = new Map<string, TypeName[]>();
  for (const p of team) {
    const types = new Set<TypeName>();
    for (const moveName of p.moves) {
      const move = gen().moves.get(moveName);
      if (move && move.category !== 'Status') types.add(move.type as TypeName);
    }
    map.set(p.species, [...types]);
  }
  return map;
}

/** Matriz defensiva: por cada tipo atacante del juego, como responde cada miembro del equipo. */
export function computeDefensiveCoverage(team: VgcTeam): DefensiveCoverage {
  const byAttackType = {} as DefensiveCoverage['byAttackType'];
  const uncoveredWeaknesses: TypeName[] = [];

  for (const atk of ALL_TYPES) {
    const weak: string[] = [];
    const resist: string[] = [];
    const immune: string[] = [];
    const neutral: string[] = [];
    for (const p of team) {
      const mult = typeEffectiveness(atk, speciesTypes(p.species));
      if (mult === 0) immune.push(p.species);
      else if (mult > 1) weak.push(p.species);
      else if (mult < 1) resist.push(p.species);
      else neutral.push(p.species);
    }
    byAttackType[atk] = { weak, resist, immune, neutral };
    if (resist.length === 0 && immune.length === 0) uncoveredWeaknesses.push(atk);
  }

  return { byAttackType, uncoveredWeaknesses };
}

/** Cobertura ofensiva: que tipos defensivos puede golpear super efectivo el equipo, segun sus movimientos ofensivos. */
export function computeOffensiveCoverage(team: VgcTeam): OffensiveCoverage {
  const movesBySpecies = moveTypes(team);
  const superEffectiveAgainst = {} as OffensiveCoverage['superEffectiveAgainst'];
  const uncoveredOffensively: TypeName[] = [];

  for (const defType of ALL_TYPES) {
    const attackers: string[] = [];
    for (const p of team) {
      const types = movesBySpecies.get(p.species) ?? [];
      const best = Math.max(0, ...types.map((t) => typeEffectiveness(t, [defType])));
      if (best > 1) attackers.push(p.species);
    }
    superEffectiveAgainst[defType] = attackers;
    if (attackers.length === 0) uncoveredOffensively.push(defType);
  }

  return { superEffectiveAgainst, uncoveredOffensively };
}
