import { gen } from '../data/dex.js';
import { validateTeam } from '../sim/team.js';
import type { VgcPokemon } from '../types/team.js';

/**
 * Chequea si `moveName` es aprendible por `member` en el formato activo,
 * usando el validador real (no una copia de las tablas de aprendizaje —
 * esas cambian por mod/generacion y el validador ya las conoce). Se valida
 * un equipo de 1 solo miembro y se filtran los mensajes que NO son sobre
 * este movimiento puntual (p.ej. "trae al menos 6 pokemon").
 */
export function canLearnMove(member: VgcPokemon, moveName: string, format: string): boolean {
  const probe: VgcPokemon = { ...member, moves: [moveName] };
  const problems = validateTeam([probe], format).problems;
  return !problems.some((p) => p.includes("can't learn") || p.toLowerCase().includes('invalid move'));
}

/** Objeto legal en este formato (no "Past"/no-estandar) segun el dex activo. */
export function isItemUsable(itemName: string): boolean {
  const item = gen().items.get(itemName);
  return !!item?.exists && !item.isNonstandard;
}

/** Movimiento existe en este formato (chequeo barato antes de gastar una validacion completa). */
export function moveExists(moveName: string): boolean {
  return !!gen().moves.get(moveName)?.exists;
}

/** Habilidad legal para esta especie puntual (una de sus habilidades posibles). */
export function abilityExistsFor(species: string, abilityName: string): boolean {
  const sp = gen().species.get(species);
  if (!sp?.exists) return false;
  return Object.values(sp.abilities).some((a) => a === abilityName);
}

export interface TeamLegalityCheck {
  valid: boolean;
  problems: string[];
}

export function checkTeamLegality(team: VgcPokemon[], format: string): TeamLegalityCheck {
  const problems = validateTeam(team, format).problems;
  return { valid: problems.length === 0, problems };
}
