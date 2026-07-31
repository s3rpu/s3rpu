/**
 * En Pokemon Champions estos son "Stat Points" (SP): 0-32 por stat, maximo
 * 66 en total. Se mantiene el nombre `evs`/`EVSpread` por compatibilidad con
 * el formato de exportacion de Showdown (que sigue usando el campo `evs`),
 * pero la escala y la formula de calculo NO son las de los EVs clasicos
 * (ver `data/dex.ts#calcStat`).
 */
export interface EVSpread {
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

export interface VgcPokemon {
  name: string;
  species: string;
  item: string;
  ability: string;
  level: number;
  /** Stat Points (SP), 0-32 por stat, <=66 en total. Ver nota en `EVSpread`. */
  evs: EVSpread;
  /** Vestigial: en Pokemon Champions las IVs no existen (siempre 31). Se conserva por compatibilidad con Teams.pack/export. */
  ivs: EVSpread;
  nature: string;
  moves: string[];
  teraType?: string;
  gender?: string;
}

export type VgcTeam = VgcPokemon[];

export interface NamedTeam {
  label: string;
  team: VgcTeam;
}
