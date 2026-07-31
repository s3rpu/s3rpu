export interface ChecksAndCounters {
  /** [winRate del counter, KOed/switched-out %, rating promedio] tal como lo publica Smogon. */
  [counterSpecies: string]: [number, number, number];
}

export interface PokemonUsageStats {
  species: string;
  usagePercent: number;
  rawCount: number;
  abilities: Record<string, number>;
  items: Record<string, number>;
  spreads: Record<string, number>;
  moves: Record<string, number>;
  teammates: Record<string, number>;
  checksAndCounters: ChecksAndCounters;
}

export interface MetaSnapshot {
  format: string;
  /** ISO timestamp de cuando se genero/actualizo este snapshot. */
  updatedAt: string;
  /** 'live' si vino de Smogon Stats, 'seed' si es el dataset curado que trae la herramienta por defecto. */
  source: 'live' | 'seed';
  month?: string;
  battles?: number;
  pokemon: PokemonUsageStats[];
}
