import { Dex as SimDex } from '@pkmn/sim';
import { Generations, type Generation } from '@pkmn/data';
import type { TypeName } from '@pkmn/data';

/** Motor de datos: acceso tipado a especies, movimientos, objetos, habilidades y tipos. */
const generations = new Generations(SimDex as any);

let cachedGen: Generation | undefined;

/** Generacion activa (Gen 9, la generacion vigente de VGC). */
export function gen(): Generation {
  if (!cachedGen) cachedGen = generations.get(9);
  return cachedGen;
}

export const ALL_TYPES: TypeName[] = [
  'Normal', 'Fire', 'Water', 'Electric', 'Grass', 'Ice', 'Fighting', 'Poison',
  'Ground', 'Flying', 'Psychic', 'Bug', 'Rock', 'Ghost', 'Dragon', 'Dark',
  'Steel', 'Fairy',
];

/** Multiplicador de daño que el tipo atacante `attacker` inflige a un pokemon con tipos `defenderTypes`. */
export function typeEffectiveness(attacker: TypeName, defenderTypes: readonly TypeName[]): number {
  let mult = 1;
  const atkType = gen().types.get(attacker);
  if (!atkType) return mult;
  const effectiveness = atkType.effectiveness as unknown as Record<string, number>;
  for (const def of defenderTypes) {
    const eff = effectiveness[def];
    if (typeof eff === 'number') mult *= eff;
  }
  return mult;
}

export function speciesExists(name: string): boolean {
  return !!gen().species.get(name)?.exists;
}

export function calcStat(
  stat: 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe',
  base: number,
  iv: number,
  ev: number,
  level: number,
  natureName: string,
): number {
  const nature = gen().natures.get(natureName);
  return gen().stats.calc(stat, base, iv, ev, level, nature);
}
