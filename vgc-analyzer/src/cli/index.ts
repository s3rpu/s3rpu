#!/usr/bin/env node
import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import { loadTeamFile, validateTeam } from '../sim/team.js';
import { runBattle } from '../sim/battle.js';
import { simulateMatch } from '../sim/monteCarlo.js';
import { runMetaGauntlet } from '../sim/gauntlet.js';
import { currentVgcFormat, listVgcFormats } from '../data/formats.js';
import { updateMeta, getSnapshotOrSeed } from '../meta/store.js';
import { buildCoreMeta, buildSyntheticMetaTeams } from '../meta/metaEngine.js';
import { computeDefensiveCoverage, computeOffensiveCoverage } from '../team/typeChart.js';
import { findRedundancies } from '../team/redundancy.js';
import { findSynergies } from '../team/synergy.js';
import { computeSpeedTiers } from '../team/speedTiers.js';
import { suggestTeamSpreads } from '../team/optimizer.js';
import { suggestNextMember } from '../team/suggest.js';
import { generateReport } from '../report/markdown.js';

const program = new Command();
program.name('vgc').description('Analizador competitivo de Pokemon VGC').version('0.1.0');

program
  .command('formats')
  .description('Lista los formatos VGC disponibles en el motor y cual se usa por defecto')
  .action(() => {
    console.log('Formato vigente detectado:', currentVgcFormat());
    console.log('Formatos VGC disponibles:');
    for (const f of listVgcFormats()) console.log(`  ${f.id}  ${f.name}`);
  });

const sim = program.command('sim').description('Simulador de combates (@pkmn/sim)');

sim
  .command('battle')
  .description('Simula un unico combate entre dos equipos')
  .requiredOption('-1, --team-a <path>', 'archivo del equipo A (export de Showdown)')
  .requiredOption('-2, --team-b <path>', 'archivo del equipo B (export de Showdown)')
  .option('-f, --format <format>', 'formato a usar', currentVgcFormat())
  .action(async (o) => {
    const teamA = loadTeamFile(o.teamA);
    const teamB = loadTeamFile(o.teamB);
    const result = await runBattle(teamA, teamB, { format: o.format });
    console.log(`Ganador: ${result.winner === 'p1' ? 'Equipo A' : result.winner === 'p2' ? 'Equipo B' : 'Empate'} en ${result.turns} turnos`);
    console.log('Sobrevivientes A:', result.survivors.p1.join(', ') || '(ninguno)');
    console.log('Sobrevivientes B:', result.survivors.p2.join(', ') || '(ninguno)');
  });

sim
  .command('montecarlo')
  .description('Simula N combates entre dos equipos y agrega estadisticas (win rate, lineas comunes, MVPs)')
  .requiredOption('-1, --team-a <path>', 'archivo del equipo A')
  .requiredOption('-2, --team-b <path>', 'archivo del equipo B')
  .option('-n, --n <number>', 'cantidad de combates', '50')
  .option('-f, --format <format>', 'formato a usar', currentVgcFormat())
  .action(async (o) => {
    const teamA = loadTeamFile(o.teamA);
    const teamB = loadTeamFile(o.teamB);
    const summary = await simulateMatch(teamA, teamB, { n: parseInt(o.n, 10), format: o.format });
    console.log(`Win rate A: ${(summary.winRateA * 100).toFixed(1)}% | B: ${(summary.winRateB * 100).toFixed(1)}% | empates: ${summary.ties}`);
    console.log(`Turnos promedio: ${summary.avgTurns.toFixed(1)}`);
    console.log('\nLineas de juego mas comunes:');
    summary.commonLines.forEach((l) => console.log(`  ${(l.rate * 100).toFixed(0)}% — ${l.line}`));
    console.log('\nMVPs equipo A (mayor tasa de supervivencia):');
    summary.mvpA.forEach((m) => console.log(`  ${m.species}: ${(m.survivalRate * 100).toFixed(0)}%`));
    console.log('\nPrimeras bajas equipo A (mayor tasa de caer primero):');
    summary.liabilityA.filter((l) => l.firstFaintRate > 0).forEach((l) => console.log(`  ${l.species}: ${(l.firstFaintRate * 100).toFixed(0)}%`));
  });

sim
  .command('gauntlet')
  .description('Enfrenta un equipo contra todos los equipos sinteticos del top del meta')
  .requiredOption('-t, --team <path>', 'archivo del equipo a evaluar')
  .option('-n, --n <number>', 'combates por rival', '20')
  .option('--teams <number>', 'cantidad de equipos rivales del meta a generar', '6')
  .option('-f, --format <format>', 'formato a usar', currentVgcFormat())
  .action(async (o) => {
    const team = loadTeamFile(o.team);
    const format = o.format;
    const snapshot = getSnapshotOrSeed(format);
    const metaTeams = buildSyntheticMetaTeams(snapshot, { teamCount: parseInt(o.teams, 10), teamSize: 4 });
    const result = await runMetaGauntlet(team, metaTeams, { n: parseInt(o.n, 10), format });
    console.log(`Win rate global vs top del meta: ${(result.overallWinRate * 100).toFixed(1)}%\n`);
    for (const r of result.perOpponent) {
      console.log(`${r.opponent}: ${(r.summary.winRateA * 100).toFixed(1)}%`);
    }
    if (result.worstMatchups.length) {
      console.log('\nMatchups desfavorables:');
      result.worstMatchups.forEach((m) => console.log(`  ${m.opponent}: ${(m.summary.winRateA * 100).toFixed(1)}%`));
    }
    if (result.topThreats.length) {
      console.log('\nAmenazas sin respuesta clara:');
      result.topThreats.forEach((t) => console.log(`  ${t.species}`));
    }
  });

const meta = program.command('meta').description('Motor de datos del meta (uso, sets, roles, counters)');

meta
  .command('update')
  .description('Actualiza el snapshot local del meta desde Smogon Stats (o usa el dataset semilla si no hay red)')
  .option('-f, --format <format>', 'formato a actualizar', currentVgcFormat())
  .option('-m, --month <YYYY-MM>', 'mes de Smogon Stats a usar (por defecto, el mes calendario anterior)')
  .action(async (o) => {
    const { snapshot, usedFallback, error } = await updateMeta(o.format, { month: o.month });
    if (usedFallback) {
      console.warn(`No se pudo obtener Smogon Stats en vivo (${error}). Se uso el dataset semilla offline.`);
    }
    console.log(`Meta actualizado: ${snapshot.pokemon.length} pokemon | fuente: ${snapshot.source} | timestamp: ${snapshot.updatedAt}`);
  });

meta
  .command('top')
  .description('Muestra el "core meta": top N pokemon, su rol y sus counters mas comunes')
  .option('-f, --format <format>', 'formato', currentVgcFormat())
  .option('-n, --n <number>', 'cuantos mostrar', '25')
  .action((o) => {
    const snapshot = getSnapshotOrSeed(o.format);
    const core = buildCoreMeta(snapshot, parseInt(o.n, 10));
    console.log(`Meta ${o.format} — fuente: ${snapshot.source} (actualizado ${snapshot.updatedAt})\n`);
    for (const c of core) {
      console.log(`#${c.rank} ${c.species} — ${(c.usagePercent * 100).toFixed(1)}% uso`);
      console.log(`   roles: ${c.roles.join(', ') || '(sin clasificar)'}`);
      console.log(`   set comun: ${c.commonSet.item} | ${c.commonSet.moves.join(' / ')}`);
      console.log(`   counters: ${c.topCounters.map((t) => `${t.species} (${(t.winRate * 100).toFixed(0)}%)`).join(', ')}`);
    }
  });

const team = program.command('team').description('Constructor de equipos con validacion de sinergia');

team
  .command('analyze')
  .description('Analiza un equipo: cobertura de tipos, redundancias, sinergias, speed tiers y EVs sugeridos')
  .requiredOption('-t, --team <path>', 'archivo del equipo')
  .option('-f, --format <format>', 'formato', currentVgcFormat())
  .option('-n, --n <number>', 'top N del meta a considerar', '25')
  .action((o) => {
    const t = loadTeamFile(o.team);
    const snapshot = getSnapshotOrSeed(o.format);
    const core = buildCoreMeta(snapshot, parseInt(o.n, 10));

    const validation = validateTeam(t, o.format);
    console.log(`Legalidad: ${validation.valid ? 'OK' : validation.problems.join('; ')}\n`);

    const def = computeDefensiveCoverage(t);
    console.log('Agujeros defensivos:', def.uncoveredWeaknesses.join(', ') || '(ninguno)');
    const off = computeOffensiveCoverage(t);
    console.log('Agujeros ofensivos:', off.uncoveredOffensively.join(', ') || '(ninguno)');

    const redundancies = findRedundancies(t);
    console.log('\nRedundancias:');
    redundancies.forEach((r) => console.log(`  ${r.role}: ${r.members.join(', ')} — ${r.note}`));

    const synergies = findSynergies(t, core);
    console.log('\nSinergias:');
    synergies.forEach((s) => console.log(`  [${s.kind}] ${s.title}: ${s.detail}`));

    const speed = computeSpeedTiers(t, core.slice(0, 10));
    console.log('\nSpeed tier (neutral, top 10 del meta incluido):');
    speed.neutral.forEach((e, i) => console.log(`  ${i + 1}. ${e.species} (${e.owner}) — ${e.speedStat}${e.scarfed ? ' [scarf]' : ''}`));

    console.log('\nEVs/naturaleza sugeridos:');
    const spreads = suggestTeamSpreads(t, core);
    spreads.forEach((s) => {
      console.log(`  ${s.species}: ${s.nature} | HP ${s.evs.hp}/Atk ${s.evs.atk}/Def ${s.evs.def}/SpA ${s.evs.spa}/SpD ${s.evs.spd}/Spe ${s.evs.spe} | ${s.item}`);
      console.log(`    -> ${s.justification.join(' ')}`);
    });

    if (t.length < 6) {
      console.log(`\nSugerencias para el miembro #${t.length + 1}:`);
      suggestNextMember(t, core, snapshot).forEach((s, i) => {
        console.log(`  ${i + 1}. ${s.species} (score ${s.score.toFixed(1)})`);
        s.reasons.forEach((r) => console.log(`     - ${r}`));
      });
    }
  });

team
  .command('suggest')
  .description('Sugiere el/los proximo(s) pokemon para completar un nucleo de 4-5')
  .requiredOption('-t, --team <path>', 'archivo del equipo (nucleo incompleto)')
  .option('-f, --format <format>', 'formato', currentVgcFormat())
  .action((o) => {
    const t = loadTeamFile(o.team);
    const snapshot = getSnapshotOrSeed(o.format);
    const core = buildCoreMeta(snapshot, 25);
    const suggestions = suggestNextMember(t, core, snapshot);
    suggestions.forEach((s, i) => {
      console.log(`${i + 1}. ${s.species} (score ${s.score.toFixed(1)})`);
      s.reasons.forEach((r) => console.log(`   - ${r}`));
    });
  });

program
  .command('report')
  .description('Genera un informe Markdown completo para un equipo')
  .requiredOption('-t, --team <path>', 'archivo del equipo')
  .option('-o, --out <path>', 'archivo de salida', 'report.md')
  .option('-f, --format <format>', 'formato', currentVgcFormat())
  .option('-n, --n <number>', 'top N del meta a considerar', '25')
  .option('--battles <number>', 'combates por rival en el gauntlet', '20')
  .option('--gauntlet-teams <number>', 'cantidad de equipos rivales sinteticos', '6')
  .action(async (o) => {
    const t = loadTeamFile(o.team);
    const snapshot = getSnapshotOrSeed(o.format);
    const md = await generateReport(t, snapshot, {
      format: o.format,
      topN: parseInt(o.n, 10),
      battlesPerOpponent: parseInt(o.battles, 10),
      gauntletTeams: parseInt(o.gauntletTeams, 10),
      teamLabel: o.team,
    });
    writeFileSync(o.out, md, 'utf-8');
    console.log(`Informe generado en ${o.out}`);
  });

program.parseAsync(process.argv);
