import type { PokemonUsageStats } from './types.js';
import { gen } from '../data/dex.js';

export type Role =
  | 'Seteador de clima'
  | 'Abusador de clima'
  | 'Seteador de terreno'
  | 'Abusador de terreno'
  | 'Trick Room (seteador)'
  | 'Trick Room (abusador)'
  | 'Control de velocidad'
  | 'Redirección'
  | 'Intimidate'
  | 'Pivote'
  | 'Setup sweeper'
  | 'Choice lock'
  | 'Mega evolucionador'
  | 'Soporte (pantallas/Helping Hand)'
  | 'Tanque/Muro'
  | 'Atacante físico'
  | 'Atacante especial';

const WEATHER_SETTER_ABILITIES = new Set(['Drought', 'Drizzle', 'Sand Stream', 'Snow Warning']);
const WEATHER_ABUSE_MOVES = new Set(['Weather Ball', 'Hurricane', 'Solar Beam', 'Solar Blade', 'Eruption']);
const WEATHER_ABUSE_ABILITIES = new Set(['Chlorophyll', 'Swift Swim', 'Sand Rush', 'Slush Rush', 'Protosynthesis', 'Quick Feet']);
const TERRAIN_SETTER_ABILITIES = new Set(['Grassy Surge', 'Electric Surge', 'Psychic Surge', 'Misty Surge']);
const TERRAIN_ABUSE_MOVES = new Set(['Grassy Glide', 'Rising Voltage', 'Expanding Force', 'Misty Explosion']);
const REDIRECTION_MOVES = new Set(['Follow Me', 'Rage Powder']);
const SPEED_CONTROL_MOVES = new Set(['Tailwind', 'Icy Wind', 'Electroweb', 'Sticky Web', 'Thunder Wave', 'Bleakwind Storm']);
const PIVOT_MOVES = new Set(['U-turn', 'Volt Switch', 'Parting Shot', 'Flip Turn', 'Teleport']);
const SETUP_MOVES = new Set(['Nasty Plot', 'Swords Dance', 'Quiver Dance', 'Dragon Dance', 'Bulk Up', 'Calm Mind']);
const SUPPORT_MOVES = new Set(['Light Screen', 'Reflect', 'Helping Hand', 'Aromatic Mist']);
const TANK_ITEMS = new Set(['Leftovers', 'Rocky Helmet', 'Assault Vest', 'Sitrus Berry']);
const TANK_ABILITIES = new Set(['Unaware', 'Regenerator']);

function topKeys(record: Record<string, number>, min = 0.15): string[] {
  return Object.entries(record).filter(([, v]) => v >= min).map(([k]) => k);
}

/** Clasifica un pokemon del meta en uno o mas roles competitivos, a partir de sus movimientos/habilidad/item mas usados. */
export function classifyRoles(mon: PokemonUsageStats): Role[] {
  const ability = topKeys(mon.abilities, 0)[0] ?? '';
  const item = topKeys(mon.items, 0)[0] ?? '';
  const moves = new Set(topKeys(mon.moves, 0.15));
  const roles: Role[] = [];

  if (WEATHER_SETTER_ABILITIES.has(ability)) roles.push('Seteador de clima');
  if (WEATHER_ABUSE_ABILITIES.has(ability) || [...moves].some((m) => WEATHER_ABUSE_MOVES.has(m))) roles.push('Abusador de clima');
  if (TERRAIN_SETTER_ABILITIES.has(ability)) roles.push('Seteador de terreno');
  if ([...moves].some((m) => TERRAIN_ABUSE_MOVES.has(m))) roles.push('Abusador de terreno');
  if (moves.has('Trick Room')) roles.push('Trick Room (seteador)');
  if ([...moves].some((m) => SPEED_CONTROL_MOVES.has(m))) roles.push('Control de velocidad');
  if ([...moves].some((m) => REDIRECTION_MOVES.has(m))) roles.push('Redirección');
  if (ability === 'Intimidate') roles.push('Intimidate');
  if ([...moves].some((m) => PIVOT_MOVES.has(m))) roles.push('Pivote');
  if ([...moves].some((m) => SETUP_MOVES.has(m))) roles.push('Setup sweeper');
  if (item.startsWith('Choice')) roles.push('Choice lock');
  if (gen().items.get(item)?.megaStone) roles.push('Mega evolucionador');
  if ([...moves].some((m) => SUPPORT_MOVES.has(m))) roles.push('Soporte (pantallas/Helping Hand)');
  if (TANK_ITEMS.has(item) || TANK_ABILITIES.has(ability)) roles.push('Tanque/Muro');

  if (roles.length === 0 || (!roles.includes('Setup sweeper') && !roles.includes('Tanque/Muro'))) {
    // Heuristica de respaldo: physical vs special segun que stat ofensiva domina el spread mas comun.
    const spread = topKeys(mon.spreads, 0)[0];
    if (spread) {
      const [, evs] = spread.split(':');
      const [, atk, , spa] = (evs ?? '').split('/').map(Number);
      roles.push((atk ?? 0) >= (spa ?? 0) ? 'Atacante físico' : 'Atacante especial');
    }
  }

  return roles;
}

/** Detecta si un pokemon es un buen "abusador de Trick Room": lento y con buen poder ofensivo. */
export function looksLikeTrickRoomAbuser(baseSpe: number): boolean {
  return baseSpe <= 60;
}
