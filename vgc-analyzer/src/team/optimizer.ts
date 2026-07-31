import { gen } from '../data/dex.js';
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
 * Sugiere naturaleza/EVs/objeto para un miembro puntual, en funcion de SU rol
 * dentro de ESTE equipo (no una plantilla generica): si el equipo ya tiene
 * Trick Room, ajusta velocidad hacia abajo; si el equipo no tiene control de
 * velocidad propio, prioriza velocidad para superar amenazas del meta.
 */
export function suggestSpread(member: VgcPokemon, team: VgcTeam, metaThreats: CoreMetaEntry[]): OptimizerSuggestion {
  const species = gen().species.get(member.species);
  const base = species?.baseStats ?? { hp: 80, atk: 80, def: 80, spa: 80, spd: 80, spe: 80 };
  const justification: string[] = [];

  const teamHasTrickRoom = team.some((p) => p.species !== member.species && p.moves.includes(TRICK_ROOM_MOVE));
  const memberSetsTrickRoom = member.moves.includes(TRICK_ROOM_MOVE);
  const teamHasSpeedControl = team.some((p) => p.moves.some((m) => SPEED_CONTROL_MOVES.includes(m)));

  // El tipo ofensivo (fisico/especial) se decide primero por el moveset real
  // (un Amoonguss con solo movimientos especiales/estado no es "fisico" solo
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
    // Abusador de Trick Room: 0 IVs/EVs de velocidad para actuar lo antes posible bajo TR, todo a ataque + bulk.
    evs = isPhysical
      ? { hp: 236, atk: 252, def: 4, spa: 0, spd: 0, spe: 0 }
      : { hp: 236, atk: 0, def: 0, spa: 252, spd: 4, spe: 0 };
    nature = isPhysical ? 'Brave' : 'Quiet';
    justification.push(`El equipo ya pone Trick Room: se minimiza Velocidad (0 EVs, nature ${nature}) para actuar primero bajo TR y se maximiza ${isPhysical ? 'Ataque' : 'Ataque Especial'} + bulk.`);
  } else if (memberSetsTrickRoom) {
    evs = { hp: 252, atk: 0, def: 4, spa: 0, spd: 252, spe: 0 };
    nature = 'Sassy';
    item = item.startsWith('Choice') ? 'Sitrus Berry' : item;
    justification.push('Es el seteador de Trick Room del equipo: prioriza sobrevivir (bulk) para llegar a poner la pantalla, no velocidad.');
  } else if (isSupportSet || (isBulky && statusMoveCount >= 1 && physicalMoveCount + specialMoveCount <= 2)) {
    evs = { hp: 244, atk: 0, def: isPhysical ? 4 : 132, spa: 0, spd: isPhysical ? 132 : 4, spe: 4 };
    nature = isPhysical ? 'Careful' : 'Calm';
    justification.push('Set de soporte/tanque (mayoria de movimientos de estado): se reparte bulk en ambas defensas (HP + la defensa opuesta a su propio tipo de ataque) para aguantar golpes de ambos lados en vez de invertir en ataque.');
  } else if (isFast && !teamHasSpeedControl) {
    const fastestThreat = [...metaThreats].sort((a, b) => (gen().species.get(b.species)?.baseStats.spe ?? 0) - (gen().species.get(a.species)?.baseStats.spe ?? 0))[0];
    evs = isPhysical ? { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 } : { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 };
    nature = isPhysical ? 'Jolly' : 'Timid';
    justification.push(`El equipo no tiene control de velocidad propio (Tailwind/Icy Wind/etc.): se maximiza Velocidad (nature ${nature}) para adelantarse a amenazas del meta como ${fastestThreat?.species ?? 'los scarfeados rivales'}.`);
  } else if (isPhysical) {
    evs = { hp: 4, atk: 252, def: 0, spa: 0, spd: 0, spe: 252 };
    nature = 'Adamant';
    justification.push('Atacante físico estandar: Ataque y Velocidad al tope para maximizar daño y ordenar turnos a favor.');
  } else {
    evs = { hp: 4, atk: 0, def: 0, spa: 252, spd: 0, spe: 252 };
    nature = 'Modest';
    justification.push('Atacante especial estandar: Ataque Especial y Velocidad al tope para maximizar daño y ordenar turnos a favor.');
  }

  const total = evs.hp + evs.atk + evs.def + evs.spa + evs.spd + evs.spe;
  if (total > 508) {
    const scale = 508 / total;
    (Object.keys(evs) as (keyof EVSpread)[]).forEach((k) => {
      evs[k] = Math.floor((evs[k] * scale) / 4) * 4;
    });
  }

  return { species: member.species, nature, evs, item, justification };
}

export function suggestTeamSpreads(team: VgcTeam, metaThreats: CoreMetaEntry[]): OptimizerSuggestion[] {
  return team.map((m) => suggestSpread(m, team, metaThreats));
}
