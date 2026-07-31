import type { VgcTeam } from '../types/team.js';
import { gen } from '../data/dex.js';

export interface RedundancyFinding {
  role: string;
  members: string[];
  note: string;
}

const REDUNDANCY_MOVE_GROUPS: { role: string; moves: string[] }[] = [
  { role: 'Redirección (Follow Me / Rage Powder)', moves: ['Follow Me', 'Rage Powder'] },
  { role: 'Trick Room', moves: ['Trick Room'] },
  { role: 'Tailwind', moves: ['Tailwind'] },
  { role: 'Spore/sueño en el primer turno', moves: ['Spore', 'Sleep Powder', 'Grass Whistle'] },
  { role: 'Fake Out', moves: ['Fake Out'] },
];

/** Detecta roles duplicados dentro del equipo que normalmente no aportan valor por repetirse (p.ej. dos seteadores de Trick Room). */
export function findRedundancies(team: VgcTeam): RedundancyFinding[] {
  const findings: RedundancyFinding[] = [];

  for (const group of REDUNDANCY_MOVE_GROUPS) {
    const members = team.filter((p) => p.moves.some((m) => group.moves.includes(m))).map((p) => p.species);
    if (members.length >= 2) {
      findings.push({
        role: group.role,
        members,
        note: `${members.length} miembros comparten este rol; en dobles rara vez conviene llevar mas de uno salvo redundancia deliberada contra Taunt/Encore.`,
      });
    }
  }

  // Intimidate duplicado: valioso tenerlo, pero dos usuarios compitiendo por el mismo slot de switch-in es redundante.
  const intimidateUsers = team.filter((p) => p.ability === 'Intimidate').map((p) => p.species);
  if (intimidateUsers.length >= 2) {
    findings.push({
      role: 'Intimidate',
      members: intimidateUsers,
      note: 'Dos usuarios de Intimidate compiten por el mismo rol de entrada; considera diversificar (p.ej. uno de ellos como atacante puro).',
    });
  }

  // Pokemon Champions: solo se puede Mega Evolucionar UN pokemon por combate
  // (recurso compartido del equipo, via el Omni Ring). Llevar 2+ portadores
  // de Mega Piedra a la MISMA alineacion de 4 suele ser un objeto desperdiciado.
  const megaHolders = team.filter((p) => gen().items.get(p.item)?.megaStone).map((p) => p.species);
  if (megaHolders.length >= 2) {
    findings.push({
      role: 'Mega Piedra duplicada',
      members: megaHolders,
      note: `${megaHolders.length} miembros llevan Mega Piedra, pero solo uno puede Mega Evolucionar por combate; si los 4 elegidos incluyen a ambos, uno esta llevando un objeto sin usar salvo que sea flexibilidad deliberada de Team Preview.`,
    });
  }

  // Mismo tipo ofensivo primario duplicado en exceso (3+) reduce cobertura de tipos.
  const typeCounts = new Map<string, string[]>();
  for (const p of team) {
    const sp = gen().species.get(p.species);
    for (const t of sp?.types ?? []) {
      typeCounts.set(t, [...(typeCounts.get(t) ?? []), p.species]);
    }
  }
  for (const [type, members] of typeCounts) {
    if (members.length >= 3) {
      findings.push({
        role: `Tipo ${type} sobrerrepresentado`,
        members,
        note: `${members.length} miembros comparten el tipo ${type}: comparten debilidades frente a un mismo tipo de ataque rival.`,
      });
    }
  }

  return findings;
}
