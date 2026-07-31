import type { VgcTeam } from '../types/team.js';
import type { MetaSnapshot } from '../meta/types.js';
import { buildCoreMeta, buildSyntheticMetaTeams } from '../meta/metaEngine.js';
import { computeDefensiveCoverage, computeOffensiveCoverage } from '../team/typeChart.js';
import { findRedundancies } from '../team/redundancy.js';
import { findSynergies } from '../team/synergy.js';
import { computeSpeedTiers } from '../team/speedTiers.js';
import { suggestTeamSpreads } from '../team/optimizer.js';
import { suggestNextMember } from '../team/suggest.js';
import { runMetaGauntlet, type GauntletResult } from '../sim/gauntlet.js';
import { validateTeam } from '../sim/team.js';
import { ALL_TYPES } from '../data/dex.js';

export interface ReportOptions {
  format: string;
  topN?: number;
  gauntletTeams?: number;
  battlesPerOpponent?: number;
  teamLabel?: string;
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function defensiveTable(team: VgcTeam): string {
  const cov = computeDefensiveCoverage(team);
  const rows = ALL_TYPES.map((t) => {
    const c = cov.byAttackType[t]!;
    const mark = c.immune.length ? `inmune (${c.immune.join(', ')})` : c.resist.length ? `resiste (${c.resist.join(', ')})` : c.weak.length ? `**debil** (${c.weak.join(', ')})` : 'neutral';
    return `| ${t} | ${mark} |`;
  });
  return [
    '| Tipo atacante | Respuesta del equipo |',
    '|---|---|',
    ...rows,
  ].join('\n') + (cov.uncoveredWeaknesses.length ? `\n\n**Agujeros defensivos (nadie resiste ni es inmune):** ${cov.uncoveredWeaknesses.join(', ')}` : '\n\nSin agujeros defensivos evidentes: todo tipo atacante tiene al menos un resistor/inmune en el equipo.');
}

function offensiveTable(team: VgcTeam): string {
  const cov = computeOffensiveCoverage(team);
  const rows = ALL_TYPES.map((t) => {
    const attackers = cov.superEffectiveAgainst[t]!;
    return `| ${t} | ${attackers.length ? attackers.join(', ') : '—'} |`;
  });
  return [
    '| Tipo defensivo rival | Quien le pega super efectivo |',
    '|---|---|',
    ...rows,
  ].join('\n') + (cov.uncoveredOffensively.length ? `\n\n**Sin cobertura ofensiva contra:** ${cov.uncoveredOffensively.join(', ')}` : '\n\nCobertura ofensiva completa contra los 18 tipos.');
}

function gauntletSection(g: GauntletResult): string {
  const rows = g.perOpponent.map((r) => `| ${r.opponent} | ${fmtPct(r.summary.winRateA)} | ${r.summary.n} |`);
  return [
    `**Win rate global vs top del meta: ${fmtPct(g.overallWinRate)}**`,
    '',
    '| Rival (equipo sintetico del meta) | Win rate | Combates |',
    '|---|---|---|',
    ...rows,
    '',
    g.worstMatchups.length
      ? `**Matchups desfavorables:** ${g.worstMatchups.map((r) => `${r.opponent} (${fmtPct(r.summary.winRateA)})`).join(', ')}`
      : 'Sin matchups por debajo del 50% en esta muestra.',
    '',
    g.topThreats.length
      ? `**Amenazas sin respuesta clara:** ${g.topThreats.map((t) => t.species).join(', ')} (pokemon rivales que sobreviven con frecuencia en los enfrentamientos mas desfavorables).`
      : '',
  ].join('\n');
}

export async function generateReport(team: VgcTeam, snapshot: MetaSnapshot, opts: ReportOptions): Promise<string> {
  const label = opts.teamLabel ?? 'Equipo analizado';
  const topN = opts.topN ?? 25;
  const core = buildCoreMeta(snapshot, topN);
  const validation = validateTeam(team, opts.format);
  const redundancies = findRedundancies(team);
  const synergies = findSynergies(team, core);
  const speed = computeSpeedTiers(team, core.slice(0, 10));
  const spreads = suggestTeamSpreads(team, core);
  const suggestions = team.length < 6 ? suggestNextMember(team, core, snapshot) : [];

  const metaTeams = buildSyntheticMetaTeams(snapshot, { teamCount: opts.gauntletTeams ?? 6, teamSize: 6 });
  const gauntlet = await runMetaGauntlet(team, metaTeams, { n: opts.battlesPerOpponent ?? 20, format: opts.format });

  const lines: string[] = [];
  lines.push(`# Informe VGC — ${label}`);
  lines.push('');
  lines.push(`_Formato: ${opts.format} · Fuente de datos del meta: ${snapshot.source === 'live' ? 'Smogon Stats (real)' : 'dataset semilla offline'} · Actualizado: ${snapshot.updatedAt}_`);
  lines.push('');
  lines.push('## Equipo');
  lines.push('');
  lines.push(team.map((p) => `- **${p.species}** @ ${p.item} — ${p.ability} — ${p.nature} — ${p.moves.join(' / ')}`).join('\n'));
  lines.push('');
  lines.push(`**Validez de formato:** ${validation.valid ? 'legal ✅' : `problemas encontrados: ${validation.problems.join('; ')}`}`);
  lines.push('');

  lines.push('## Matriz de tipos — cobertura defensiva');
  lines.push('');
  lines.push(defensiveTable(team));
  lines.push('');
  lines.push('## Matriz de tipos — cobertura ofensiva');
  lines.push('');
  lines.push(offensiveTable(team));
  lines.push('');

  lines.push('## Redundancias de rol');
  lines.push('');
  lines.push(redundancies.length ? redundancies.map((r) => `- **${r.role}**: ${r.members.join(', ')} — ${r.note}`).join('\n') : 'No se detectaron redundancias evidentes.');
  lines.push('');

  lines.push('## Sinergias conocidas');
  lines.push('');
  const positives = synergies.filter((s) => s.kind === 'positiva');
  const missing = synergies.filter((s) => s.kind === 'faltante');
  lines.push(positives.length ? positives.map((s) => `- ✅ **${s.title}**: ${s.detail}`).join('\n') : 'No se detectaron sinergias marcadas entre los miembros actuales.');
  if (missing.length) {
    lines.push('');
    lines.push(missing.map((s) => `- ⚠️ **${s.title}**: ${s.detail}`).join('\n'));
  }
  lines.push('');

  lines.push('## Speed tiers (vs. top 10 del meta)');
  lines.push('');
  lines.push('| # | Pokemon | Origen | Velocidad real |');
  lines.push('|---|---|---|---|');
  speed.neutral.forEach((e, i) => lines.push(`| ${i + 1} | ${e.species}${e.scarfed ? ' (Scarf)' : ''} | ${e.owner} | ${e.speedStat} |`));
  lines.push('');
  const outspedRelevant = speed.outsped.filter((o) => o.fasterThreats.length > 0);
  lines.push(outspedRelevant.length
    ? outspedRelevant.map((o) => `- **${o.species}** es superado en velocidad por: ${o.fasterThreats.join(', ')}.`).join('\n')
    : 'El equipo no es superado en velocidad por ninguna de las 10 amenazas top consideradas (en neutral).');
  lines.push('');

  lines.push('## EVs / naturaleza sugeridos por miembro (con justificación)');
  lines.push('');
  for (const s of spreads) {
    lines.push(`### ${s.species}`);
    lines.push(`- Naturaleza: **${s.nature}** · Objeto sugerido: **${s.item}**`);
    lines.push(`- EVs: HP ${s.evs.hp} / Atk ${s.evs.atk} / Def ${s.evs.def} / SpA ${s.evs.spa} / SpD ${s.evs.spd} / Spe ${s.evs.spe}`);
    lines.push(`- Justificación: ${s.justification.join(' ')}`);
    lines.push('');
  }

  if (suggestions.length) {
    lines.push(`## Sugerencia de ${team.length === 5 ? '6to' : `miembro #${team.length + 1}`} pokemon`);
    lines.push('');
    suggestions.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.species}** (score ${s.score.toFixed(1)})`);
      s.reasons.forEach((r) => lines.push(`   - ${r}`));
    });
    lines.push('');
  }

  lines.push('## Simulación: win rate vs. el top del meta');
  lines.push('');
  lines.push(gauntletSection(gauntlet));
  lines.push('');

  lines.push('## Sugerencias de mejora');
  lines.push('');
  const improvementSuggestions: string[] = [];
  if (!validation.valid) improvementSuggestions.push(`Corregir problemas de legalidad: ${validation.problems.join('; ')}.`);
  const uncoveredDef = computeDefensiveCoverage(team).uncoveredWeaknesses;
  if (uncoveredDef.length) improvementSuggestions.push(`Cubrir debilidades defensivas compartidas frente a: ${uncoveredDef.join(', ')}.`);
  const uncoveredOff = computeOffensiveCoverage(team).uncoveredOffensively;
  if (uncoveredOff.length) improvementSuggestions.push(`Sumar un movimiento que golpee super efectivo a: ${uncoveredOff.join(', ')}.`);
  if (missing.length) improvementSuggestions.push(...missing.map((m) => `${m.title}: ${m.detail}`));
  if (gauntlet.worstMatchups.length) improvementSuggestions.push(`Reforzar el plan de juego contra: ${gauntlet.worstMatchups.map((m) => m.opponent).join(', ')} (win rate < 50%).`);
  if (gauntlet.topThreats.length) improvementSuggestions.push(`Preparar una respuesta directa a las amenazas recurrentes: ${gauntlet.topThreats.map((t) => t.species).join(', ')}.`);
  lines.push(improvementSuggestions.length ? improvementSuggestions.map((s) => `- ${s}`).join('\n') : '- El equipo no muestra debilidades estructurales evidentes con los chequeos actuales.');
  lines.push('');

  return lines.join('\n');
}
