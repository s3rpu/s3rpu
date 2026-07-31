import { readdirSync } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { NamedTeam } from '../types/team.js';
import { loadTeamFile } from '../sim/team.js';

/**
 * Carga una "distribucion del meta" configurable: un directorio con un
 * archivo .txt (export de Showdown) por equipo rival — de torneo, de
 * ladder, o los que el usuario quiera — en vez de (o ademas de) los
 * equipos sinteticos generados a partir de las stats de uso.
 *
 * No existe "el mejor equipo posible" en abstracto: solo el que mejor
 * responde a una distribucion esperada de rivales. Esto le da al usuario
 * control real sobre esa distribucion en vez de asumir que el dataset de
 * uso (o su semilla offline) la representa fielmente.
 */
export function loadNamedTeamsFromDir(dir: string): NamedTeam[] {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.txt'));
  if (files.length === 0) {
    throw new Error(`No se encontraron archivos .txt de equipos en ${dir}`);
  }
  return files.map((f) => ({
    label: basename(f, extname(f)),
    team: loadTeamFile(join(dir, f)),
  }));
}
