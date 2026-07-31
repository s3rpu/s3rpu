import { readFileSync } from 'node:fs';
import { Teams, TeamValidator } from '@pkmn/sim';
import type { VgcPokemon, VgcTeam } from '../types/team.js';
import { currentVgcFormat } from '../data/formats.js';

/** Parsea texto en formato de exportacion de Showdown a un VgcTeam tipado. */
export function parseTeamText(text: string): VgcTeam {
  const parsed = Teams.import(text.trim());
  if (!parsed || parsed.length === 0) {
    throw new Error('No se pudo interpretar el equipo: formato de exportacion invalido o vacio.');
  }
  return parsed.map((p) => ({
    name: p.name || p.species,
    species: p.species,
    item: p.item ?? '',
    ability: p.ability ?? '',
    level: p.level ?? 50,
    evs: {
      hp: p.evs?.hp ?? 0,
      atk: p.evs?.atk ?? 0,
      def: p.evs?.def ?? 0,
      spa: p.evs?.spa ?? 0,
      spd: p.evs?.spd ?? 0,
      spe: p.evs?.spe ?? 0,
    },
    ivs: {
      hp: p.ivs?.hp ?? 31,
      atk: p.ivs?.atk ?? 31,
      def: p.ivs?.def ?? 31,
      spa: p.ivs?.spa ?? 31,
      spd: p.ivs?.spd ?? 31,
      spe: p.ivs?.spe ?? 31,
    },
    nature: p.nature || 'Hardy',
    moves: p.moves ?? [],
    teraType: p.teraType,
    gender: p.gender,
  }));
}

export function loadTeamFile(path: string): VgcTeam {
  return parseTeamText(readFileSync(path, 'utf-8'));
}

export function teamToShowdownSets(team: VgcTeam) {
  return team.map((p) => ({
    name: p.name,
    species: p.species,
    item: p.item,
    ability: p.ability,
    moves: p.moves,
    nature: p.nature,
    evs: p.evs,
    ivs: p.ivs,
    level: p.level,
    teraType: p.teraType,
    gender: p.gender,
  }));
}

export function packTeam(team: VgcTeam): string {
  return Teams.pack(teamToShowdownSets(team) as any);
}

export function exportTeamText(team: VgcTeam): string {
  return Teams.export(teamToShowdownSets(team) as any);
}

export interface ValidationResult {
  valid: boolean;
  problems: string[];
}

/** Valida legalidad de un equipo contra las reglas del formato (clonacion, items, nivel, movimientos legales, etc). */
export function validateTeam(team: VgcTeam, format = currentVgcFormat()): ValidationResult {
  const validator = new TeamValidator(format);
  const problems = validator.validateTeam(teamToShowdownSets(team) as any);
  return { valid: !problems || problems.length === 0, problems: problems ?? [] };
}
