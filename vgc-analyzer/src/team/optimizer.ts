import { gen, MAX_SP_PER_STAT, MAX_SP_TOTAL } from '../data/dex.js';
import type { EVSpread, VgcPokemon, VgcTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';

export interface OptimizerSuggestion {
  species: string;
  nature: string;
  evs: EVSpread;
  item: string;
  justification: string[];
}

const TRICK_ROOM_MOVE = 'Trick Room';
const SPEED_CONTROL_MOVES = ['Tailwind', 'Icy Wind', 'Electroweb', 'Sticky Web', 'Thunder Wave'];

/**
 * Sugiere naturaleza/Puntos de Estadistica (SP)/objeto para un miembro
 * puntual, en funcion de SU rol dentro de ESTE equipo (no una plantilla
 * generica): si el equipo ya tiene Trick Room, ajusta velocidad hacia abajo;
 * si el equipo no tiene control de velocidad propio, prioriza velocidad para
 * superar amenazas del meta.
 *
 * IMPORTANTE (Pokemon Champions): los EVs 0-252 de los juegos principales no
 * existen aca. Cada Pokemon reparte 66 "Stat Points" (SP) entre sus 6 stats,
 * maximo 32 por stat, y la formula es LINEAL (cada SP suma 1 punto de stat
 * directo, sin el "entre 4" ni los rendimientos decrecientes de los EVs
 * clasicos). Eso cambia la estrategia optima: en vez de repartir en
 * incrementos de a 4 buscando breakpoints, lo que mas rinde es llevar 1-2
 * stats clave al tope (32) y volcar el resto en otro stat, sin puntos
 * "desperdiciados" a mitad de camino.
 */
export function suggestSpread(member: VgcPokemon, team: VgcTeam, metaThreats: CoreMetaEntry[]): OptimizerSuggestion {
  const species = gen().species.get(member.species);
  const base = species?.baseStats ?? { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };
  const justification: string[] = [];

  const teamHasTrickRoom = team.some((p) => p.species !== member.species && p.moves.includes(TRICK_ROOM_MOVE));
  const memberSetsTrickRoom = member.moves.includes(TRICK_ROOM_MOVE);
  const teamHasSpeedControl = team.some((p) => p.moves.some((m) => SPEED_CONTROL_MOVES.includes(m)));

  // El tipo ofensivo (fisico/especial) se decide primero por el moveset real
  // (un Pokemon con solo movimientos especiales/estado no es "fisico" solo
  // porque su Atk base empate o supere a su SpA); si no hay ataques
  // categorizables se cae al stat base como ultimo recurso.
  const categories = member.moves.map((m) => gen().moves.get(m)?.category).filter((c) => !!c);
  const physicalMoveCount = categories.filter((c) => c === 'Physical').length;
  const specialMoveCount = categories.filter((c) => c === 'Special').length;
  const statusMoveCount = categories.filter((c) => c === 'Status').length;
  const isPhysical = physicalMoveCount !== specialMoveCount ? physicalMoveCount > specialMoveCount : base.atk >= base.spa;
  const isSupportSet = statusMoveCount >= 2 && physicalMoveCount + specialMoveCount <= 2;
  const isBulky = base.hp + base.def + base.spd >= 300 || base.hp + base.spa + base.spd >= 300;
  const isFast = base.spe >= 100;

  let evs: EVSpread = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  let nature = 'Hardy';
  let item = member.item || 'Sitrus Berry';

  if (teamHasTrickRoom && !memberSetsTrickRoom && base.spe <= 70) {
    // Abusador de Trick Room: 0 SP de velocidad para actuar lo antes posible bajo TR, el resto a ataque + HP.
    evs = isPhysical
      ? { hp: 32, atk: 32, def: 2, spa: 0, spd: 0, spe: 0 }
      : { hp: 32, atk: 0, def: 0, spa: 32, spd: 2, spe: 0 };
    nature = isPhysical ? 'Brave' : 'Quiet';
    justification.push(`El equipo ya pone Trick Room: se llevan a 0 los SP de Velocidad para actuar primero bajo TR, maximizando HP y ${isPhysical ? 'Ataque' : 'Ataque Especial'} (32 SP cada uno, el tope).`);
  } else if (memberSetsTrickRoom) {
    evs = { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 };
    nature = 'Sassy';
    item = item.startsWith('Choice') ? 'Sitrus Berry' : item;
    justification.push('Es el seteador de Trick Room del equipo: maximiza HP y Defensa Especial (32 SP cada uno) para sobrevivir hasta poner la pantalla, sin invertir en Velocidad.');
  } else if (isSupportSet || (isBulky && statusMoveCount >= 1 && physicalMoveCount + specialMoveCount <= 2)) {
    evs = isPhysical
      ? { hp: 32, atk: 0, def: 2, spa: 0, spd: 32, spe: 0 }
      : { hp: 32, atk: 0, def: 32, spa: 0, spd: 2, spe: 0 };
    nature = isPhysical ? 'Careful' : 'Calm';
    justification.push(`Set de soporte/tanque (mayoria de movimientos de estado): 32 SP en HP y 32 en la defensa opuesta a su propio tipo de ataque (la que mas necesita, ya que no invierte en pegar), sin Velocidad.`);
  } else if (isFast && !teamHasSpeedControl) {
    const fastestThreat = [...metaThreats].sort((a, b) => (gen().species.get(b.species)?.baseStats.spe ?? 0) - (gen().species.get(a.species)?.baseStats.spe ?? 0))[0];
    evs = isPhysical ? { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 } : { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 };
    nature = isPhysical ? 'Jolly' : 'Timid';
    justification.push(`El equipo no tiene control de velocidad propio (Tailwind/Icy Wind/etc.): se maximiza Velocidad (32 SP, nature ${nature}) para adelantarse a amenazas del meta como ${fastestThreat?.species ?? 'los rivales con Choice Scarf'}.`);
  } else if (isPhysical) {
    evs = { hp: 2, atk: 32, def: 0, spa: 0, spd: 0, spe: 32 };
    nature = 'Adamant';
    justification.push('Atacante físico estandar: Ataque y Velocidad al tope (32 SP cada uno) para maximizar daño y ordenar turnos a favor.');
  } else {
    evs = { hp: 2, atk: 0, def: 0, spa: 32, spd: 0, spe: 32 };
    nature = 'Modest';
    justification.push('Atacante especial estandar: Ataque Especial y Velocidad al tope (32 SP cada uno) para maximizar daño y ordenar turnos a favor.');
  }

  evs = clampToStatPointBudget(evs);

  return { species: member.species, nature, evs, item, justification };
}

/** Recorta cada stat a MAX_SP_PER_STAT y, si el total excede MAX_SP_TOTAL, reduce el ultimo stat asignado. */
function clampToStatPointBudget(evs: EVSpread): EVSpread {
  const capped = { ...evs };
  for (const k of Object.keys(capped) as (keyof EVSpread)[]) {
    capped[k] = Math.max(0, Math.min(MAX_SP_PER_STAT, capped[k]));
  }
  let total = Object.values(capped).reduce((a, b) => a + b, 0);
  if (total > MAX_SP_TOTAL) {
    let excess = total - MAX_SP_TOTAL;
    for (const k of Object.keys(capped) as (keyof EVSpread)[]) {
      if (excess <= 0) break;
      const reduce = Math.min(capped[k], excess);
      capped[k] -= reduce;
      excess -= reduce;
    }
  }
  return capped;
}

export function suggestTeamSpreads(team: VgcTeam, metaThreats: CoreMetaEntry[]): OptimizerSuggestion[] {
  return team.map((m) => suggestSpread(m, team, metaThreats));
}
