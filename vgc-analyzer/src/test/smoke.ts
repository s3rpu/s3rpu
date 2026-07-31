import { loadTeamFile, validateTeam } from '../sim/team.js';
import { runBattle } from '../sim/battle.js';
import { currentVgcFormat } from '../data/formats.js';
import { setActiveFormat } from '../data/dex.js';
import { getSnapshotOrSeed } from '../meta/store.js';
import { buildCoreMeta, buildSyntheticMetaTeams } from '../meta/metaEngine.js';

/**
 * Smoke test de punta a punta: valida que el acceso a datos, el simulador de
 * combates (motor oficial pokemon-showdown, mod `champions`) y el motor de
 * meta funcionan juntos para Pokemon Champions VGC. No reemplaza una suite
 * de tests real, pero sirve para detectar roturas rapido (`npm test`).
 */
async function main() {
  const format = currentVgcFormat();
  setActiveFormat(format);
  console.log('== Etapa 1: acceso a datos ==');
  console.log('Formato VGC vigente detectado:', format);

  console.log('\n== Etapa 2: simulador de un combate ==');
  const teamA = loadTeamFile('examples/team-balance-core.txt');
  const teamB = loadTeamFile('examples/team-rain-weather.txt');
  console.log('Equipo A:', teamA.map((p) => p.species).join(', '));
  console.log('Equipo B:', teamB.map((p) => p.species).join(', '));

  const va = validateTeam(teamA, format);
  const vb = validateTeam(teamB, format);
  if (!va.valid || !vb.valid) throw new Error(`Equipo de ejemplo invalido: ${[...va.problems, ...vb.problems].join('; ')}`);

  const result = await runBattle(teamA, teamB, { format });
  console.log(`Ganador: ${result.winner} en ${result.turns} turnos`);

  console.log('\n== Etapa 3: motor de meta ==');
  const snapshot = getSnapshotOrSeed(format);
  const core = buildCoreMeta(snapshot, 5);
  console.log('Top 5 del meta:', core.map((c) => c.species).join(', '));

  const metaTeams = buildSyntheticMetaTeams(snapshot, { teamCount: 2, teamSize: 6 });
  for (const t of metaTeams) {
    const v = validateTeam(t.team, format);
    if (!v.valid) throw new Error(`Equipo sintetico ${t.label} invalido: ${v.problems.join('; ')}`);
  }
  console.log(`${metaTeams.length} equipos sinteticos del meta generados y validados OK.`);

  console.log('\nSmoke test OK.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
