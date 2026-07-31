// `pokemon-showdown` es CommonJS y re-exporta parte de su API con un patron
// (`__reExport` tras asignar `module.exports`) que el interop ESM de Node no
// analiza estaticamente, asi que un `import { Dex } from ...` con nombre
// falla en runtime aunque tsc lo tipe bien. Se importa el default y se
// desestructura en runtime.
import ShowdownPS from 'pokemon-showdown';
import type { ModdedDex } from 'pokemon-showdown/dist/sim/dex.js';
const { Dex: ShowdownDex } = ShowdownPS;

/**
 * Motor de datos: acceso tipado a especies, movimientos, objetos, habilidades
 * y tipos, sobre el motor OFICIAL de Pokemon Showdown (paquete `pokemon-showdown`,
 * no `@pkmn/sim`: al momento de escribir esto, `@pkmn/sim` todavia no sincronizo
 * el mod "champions" que agrega Pokemon Champions, mientras que el paquete
 * `pokemon-showdown` (mantenido por Smogon) ya lo trae).
 *
 * Todo aca es "mod-aware": `Dex.forFormat(formatId)` devuelve el Dex correcto
 * para el formato/Reglamento pedido (con Megas, banlist, etc. ya aplicados).
 */
export const ALL_TYPES = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark',
  'Steel', 'Fairy',
] as const;
export type TypeName = (typeof ALL_TYPES)[number];

const dexCache = new Map<string, ModdedDex>();
let activeFormat: string | undefined;

/** Fija el formato activo para el resto de la sesion del CLI (un formato por invocacion). */
export function setActiveFormat(formatId: string): void {
  activeFormat = formatId;
}

function requireActiveFormat(): string {
  if (!activeFormat) {
    throw new Error('No hay formato activo. Llama a setActiveFormat(formatId) antes de usar el motor de datos.');
  }
  return activeFormat;
}

/** Dex del formato activo (o el indicado), con mods aplicados (Megas, banlist, etc). */
export function dex(formatId?: string): ModdedDex {
  const id = formatId ?? requireActiveFormat();
  let d = dexCache.get(id);
  if (!d) {
    d = ShowdownDex.forFormat(id);
    dexCache.set(id, d);
  }
  return d;
}

/** Alias corto compatible con el resto del codigo (equivalente a "la generacion activa"). */
export function gen(): ModdedDex {
  return dex();
}

/** Multiplicador de daño que el tipo atacante `attacker` inflige a un pokemon con tipos `defenderTypes`. */
export function typeEffectiveness(attacker: TypeName, defenderTypes: readonly string[]): number {
  let mult = 1;
  const atkType = dex().types.get(attacker);
  if (!atkType?.exists) return mult;
  const effectiveness = atkType.damageTaken as unknown as Record<string, number>;
  // damageTaken usa codigos: 0 normal, 1 super efectivo (2x), 2 no muy efectivo (0.5x), 3 inmune (0x)
  for (const def of defenderTypes) {
    const code = effectiveness[def];
    if (code === 1) mult *= 2;
    else if (code === 2) mult *= 0.5;
    else if (code === 3) mult *= 0;
  }
  return mult;
}

/**
 * Calcula el stat real de un pokemon bajo las reglas de Pokemon Champions:
 * IVs no existen (siempre equivalen a 31), y los EVs clasicos fueron
 * reemplazados por "Puntos de Estadistica" (Stat Points, SP) de 0 a 32 por
 * stat que se SUMAN directo al stat base (formula lineal, sin division entre
 * 4 como en los juegos principales). Formula tomada del mod `champions` real
 * (data/mods/champions/scripts.ts, rama estandar sin "Level Clause Mod",
 * que es la que usan Reg M-A/M-B a nivel 50 fijo):
 *   HP  = base + SP + 75
 *   otro = (base + SP + 20) * 1.1 si la naturaleza sube ese stat,
 *          (base + SP + 20) * 0.9 si la naturaleza lo baja, truncado hacia abajo.
 */
export function calcStat(
  stat: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe',
  base: number,
  sp: number,
  natureName: string,
): number {
  if (stat === 'hp') return base + sp + 75;
  let value = base + sp + 20;
  const nature = dex().natures.get(natureName);
  if (nature?.plus === stat) value = Math.trunc(value * 1.1);
  else if (nature?.minus === stat) value = Math.trunc(value * 0.9);
  return value;
}

export const MAX_SP_PER_STAT = 32;
export const MAX_SP_TOTAL = 66;
