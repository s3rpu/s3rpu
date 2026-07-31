import type { VgcTeam } from '../types/team.js';
import { gen } from '../data/dex.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';

export interface SynergyFinding {
  kind: 'positiva' | 'faltante';
  title: string;
  members: string[];
  detail: string;
}

const WEATHER_SETTERS: Record<string, string> = { Drought: 'sol', Drizzle: 'lluvia', 'Sand Stream': 'arena', 'Snow Warning': 'nieve' };
const WEATHER_ABUSE_MOVES: Record<string, string> = {
  'Weather Ball': 'cualquier clima', 'Hurricane': 'lluvia', 'Solar Beam': 'sol', 'Solar Blade': 'sol', 'Eruption': 'sol',
};
const WEATHER_ABUSE_ABILITIES: Record<string, string> = {
  Chlorophyll: 'sol', 'Swift Swim': 'lluvia', 'Sand Rush': 'arena', 'Slush Rush': 'nieve',
};
const TERRAIN_SETTERS: Record<string, string> = {
  'Grassy Surge': 'cesped', 'Electric Surge': 'electrico', 'Psychic Surge': 'psiquico', 'Misty Surge': 'niebla',
};
const TERRAIN_ABUSE_MOVES: Record<string, string> = {
  'Grassy Glide': 'cesped', 'Rising Voltage': 'electrico', 'Expanding Force': 'psiquico', 'Misty Explosion': 'niebla',
};

function hasMove(p: VgcTeam[number], moves: string[]): boolean {
  return p.moves.some((m) => moves.includes(m));
}

function baseSpeed(species: string): number {
  return gen().species.get(species)?.baseStats.spe ?? 100;
}

/** Detecta sinergias conocidas del formato VGC presentes en el equipo, y avisa cuando falta la mitad de una sinergia esperable. */
export function findSynergies(team: VgcTeam, metaThreats: CoreMetaEntry[] = []): SynergyFinding[] {
  const findings: SynergyFinding[] = [];

  // Clima: seteador + abusador.
  for (const setter of team) {
    const weather = WEATHER_SETTERS[setter.ability];
    if (!weather) continue;
    const abusers = team.filter(
      (p) => p !== setter && (WEATHER_ABUSE_ABILITIES[p.ability] === weather || Object.entries(WEATHER_ABUSE_MOVES).some(([m, w]) => (w === weather || w === 'cualquier clima') && p.moves.includes(m))),
    );
    if (abusers.length > 0) {
      findings.push({
        kind: 'positiva', title: `Clima (${weather}) + abusador`,
        members: [setter.species, ...abusers.map((a) => a.species)],
        detail: `${setter.species} instala ${weather} y ${abusers.map((a) => a.species).join(', ')} lo aprovecha directamente.`,
      });
    } else {
      findings.push({
        kind: 'faltante', title: `Seteador de clima sin abusador claro`,
        members: [setter.species],
        detail: `${setter.species} pone ${weather} pero ningun otro miembro tiene habilidad/movimiento que lo explote; evalua si vale la pena el slot.`,
      });
    }
  }

  // Terreno: seteador + abusador.
  for (const setter of team) {
    const terrain = TERRAIN_SETTERS[setter.ability];
    if (!terrain) continue;
    const abusers = team.filter((p) => p !== setter && Object.entries(TERRAIN_ABUSE_MOVES).some(([m, t]) => t === terrain && p.moves.includes(m)));
    if (abusers.length > 0) {
      findings.push({
        kind: 'positiva', title: `Terreno (${terrain}) + abusador`,
        members: [setter.species, ...abusers.map((a) => a.species)],
        detail: `${setter.species} instala terreno de ${terrain} y ${abusers.map((a) => a.species).join(', ')} gana boost de daño/prioridad con él.`,
      });
    }
  }

  // Trick Room: seteador + pegadores lentos.
  const trickRoomSetters = team.filter((p) => hasMove(p, ['Trick Room']));
  if (trickRoomSetters.length > 0) {
    const slowHitters = team.filter((p) => !trickRoomSetters.includes(p) && baseSpeed(p.species) <= 60 && (p.evs.atk > 0 || p.evs.spa > 0));
    if (slowHitters.length > 0) {
      findings.push({
        kind: 'positiva', title: 'Trick Room + pegadores lentos',
        members: [...trickRoomSetters.map((p) => p.species), ...slowHitters.map((p) => p.species)],
        detail: `Bajo Trick Room, ${slowHitters.map((p) => p.species).join(', ')} (base Spe baja) pegan primero.`,
      });
    } else {
      findings.push({
        kind: 'faltante', title: 'Trick Room sin abusadores lentos evidentes',
        members: trickRoomSetters.map((p) => p.species),
        detail: 'El equipo tiene Trick Room pero ningun pegador claramente lento (base Spe <= 60) que se beneficie de invertir el orden.',
      });
    }
  }

  // Redireccion + setup.
  const redirectors = team.filter((p) => hasMove(p, ['Follow Me', 'Rage Powder']));
  if (redirectors.length > 0) {
    const setupUsers = team.filter((p) => !redirectors.includes(p) && hasMove(p, ['Nasty Plot', 'Swords Dance', 'Quiver Dance', 'Dragon Dance', 'Bulk Up', 'Calm Mind']));
    if (setupUsers.length > 0) {
      findings.push({
        kind: 'positiva', title: 'Redirección + setup',
        members: [...redirectors.map((p) => p.species), ...setupUsers.map((p) => p.species)],
        detail: `${redirectors.map((p) => p.species).join(', ')} puede absorber el ataque rival mientras ${setupUsers.map((p) => p.species).join(', ')} sube estadisticas gratis.`,
      });
    }
  }

  // Intimidate propio vs meta fisico.
  const intimidateUsers = team.filter((p) => p.ability === 'Intimidate');
  const physicalMetaShare = metaThreats.length
    ? metaThreats.filter((m) => m.roles.includes('Atacante físico')).length / metaThreats.length
    : 0;
  if (intimidateUsers.length > 0 && physicalMetaShare > 0.3) {
    findings.push({
      kind: 'positiva', title: 'Intimidate vs meta físico',
      members: intimidateUsers.map((p) => p.species),
      detail: `~${Math.round(physicalMetaShare * 100)}% del top del meta pega fisico; ${intimidateUsers.map((p) => p.species).join(', ')} devalua esos ataques -1 al entrar.`,
    });
  } else if (intimidateUsers.length === 0 && physicalMetaShare > 0.4) {
    findings.push({
      kind: 'faltante', title: 'Sin Intimidate frente a un meta muy físico',
      members: [],
      detail: `~${Math.round(physicalMetaShare * 100)}% del top del meta pega fisico y el equipo no tiene ningun usuario de Intimidate.`,
    });
  }

  return findings;
}
