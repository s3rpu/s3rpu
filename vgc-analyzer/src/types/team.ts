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
  evs: EVSpread;
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
