import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NamedTeam, VgcPokemon, VgcTeam } from '../types/team.js';
import type { CoreMetaEntry } from '../meta/metaEngine.js';
import type { MetaSnapshot } from '../meta/types.js';
import { buildCommonSet } from '../meta/buildSet.js';
import { buildTeamVariants } from './autobuild.js';
import { runMetaGauntlet } from '../sim/gauntlet.js';
import { checkTeamLegality, canLearnMove, isItemUsable } from './legality.js';
import { MOVE_CANDIDATES, ITEM_CANDIDATES, NATURE_CANDIDATES } from './mutationPools.js';
import { gen, MAX_SP_PER_STAT, MAX_SP_TOTAL } from '../data/dex.js';

export interface GenerationStat {
  generation: number;
  bestFitness: number;
  avgFitness: number;
  bestTeamSpecies: string[];
  timestamp: string;
}

export interface Checkpoint {
  generation: number;
  population: VgcTeam[];
  fitness: number[];
  history: GenerationStat[];
}

export interface EvolveOptions {
  format: string;
  metaTeams: NamedTeam[];
  metaTop: CoreMetaEntry[];
  snapshot: MetaSnapshot;
  checkpointPath: string;
  populationSize?: number;
  eliteCount?: number;
  quickBattles?: number;
  finalBattles?: number;
  maxGenerations?: number;
  maxDurationMs?: number;
  seedTeam?: VgcTeam;
  onGeneration?: (stat: GenerationStat, shouldStop: () => boolean) => void;
}

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function pick<T>(arr: readonly T[]): T {
  return arr[randInt(arr.length)]!;
}

function loadCheckpoint(path: string): Checkpoint | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Checkpoint;
  } catch {
    return undefined;
  }
}

function saveCheckpoint(path: string, cp: Checkpoint): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cp, null, 2), 'utf-8');
}

/** Arma un individuo inicial aleatorio: 6 especies distintas del pool del meta, sets base via buildCommonSet. */
function randomIndividual(metaTop: CoreMetaEntry[], snapshot: MetaSnapshot, size = 6): VgcTeam | undefined {
  const pool = [...metaTop];
  const team: VgcTeam = [];
  const usedItems = new Set<string>();
  while (team.length < size && pool.length > 0) {
    const idx = randInt(pool.length);
    const entry = pool.splice(idx, 1)[0]!;
    const stats = snapshot.pokemon.find((p) => p.species === entry.species);
    if (!stats) continue;
    const set = buildCommonSet(stats, usedItems);
    usedItems.add(set.item);
    team.push(set);
  }
  return team.length === size ? team : undefined;
}

type MutationKind = 'species' | 'move' | 'item' | 'sp' | 'nature';

function mutateSP(member: VgcPokemon): VgcPokemon {
  const keys: (keyof VgcPokemon['evs'])[] = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'];
  const from = pick(keys);
  const to = pick(keys.filter((k) => k !== from));
  const evs = { ...member.evs };
  if (evs[from] <= 0) return member;
  const amount = Math.min(evs[from], 1 + randInt(8));
  evs[from] -= amount;
  evs[to] = Math.min(MAX_SP_PER_STAT, evs[to] + amount);
  const total = Object.values(evs).reduce((a, b) => a + b, 0);
  if (total > MAX_SP_TOTAL) return member;
  return { ...member, evs };
}

function mutateMove(member: VgcPokemon, format: string): VgcPokemon {
  if (member.moves.length === 0) return member;
  const slot = randInt(member.moves.length);
  const candidates = MOVE_CANDIDATES.filter((m) => !member.moves.includes(m));
  for (let tries = 0; tries < 6; tries++) {
    const candidate = pick(candidates);
    if (canLearnMove(member, candidate, format)) {
      const moves = [...member.moves];
      moves[slot] = candidate;
      return { ...member, moves };
    }
  }
  return member;
}

function mutateItem(member: VgcPokemon, teamItemsExceptSelf: Set<string>): VgcPokemon {
  // Nunca mutar el objeto de un pokemon que Mega evoluciona (la Mega Piedra es obligatoria).
  if (gen().items.get(member.item)?.megaStone) return member;
  const candidates = ITEM_CANDIDATES.filter((i) => isItemUsable(i) && !teamItemsExceptSelf.has(i) && i !== member.item);
  if (candidates.length === 0) return member;
  return { ...member, item: pick(candidates) };
}

function mutateNature(member: VgcPokemon): VgcPokemon {
  return { ...member, nature: pick(NATURE_CANDIDATES) };
}

function mutateSpecies(team: VgcTeam, slot: number, metaTop: CoreMetaEntry[], snapshot: MetaSnapshot): VgcPokemon | undefined {
  const currentSpecies = new Set(team.map((p) => p.species));
  const candidates = metaTop.filter((e) => !currentSpecies.has(e.species));
  if (candidates.length === 0) return undefined;
  const entry = pick(candidates);
  const stats = snapshot.pokemon.find((p) => p.species === entry.species);
  if (!stats) return undefined;
  const usedItems = new Set(team.filter((_, i) => i !== slot).map((p) => p.item));
  return buildCommonSet(stats, usedItems);
}

/** Aplica UNA mutacion aleatoria a una copia del equipo; si el resultado no es legal, devuelve el original sin cambios. */
function mutate(team: VgcTeam, format: string, metaTop: CoreMetaEntry[], snapshot: MetaSnapshot): VgcTeam {
  const slot = randInt(team.length);
  const kinds: MutationKind[] = ['species', 'move', 'item', 'sp', 'nature'];
  const kind = pick(kinds);
  const member = team[slot]!;
  let mutated: VgcPokemon | undefined;

  switch (kind) {
    case 'species':
      mutated = mutateSpecies(team, slot, metaTop, snapshot);
      break;
    case 'move':
      mutated = mutateMove(member, format);
      break;
    case 'item':
      mutated = mutateItem(member, new Set(team.filter((_, i) => i !== slot).map((p) => p.item)));
      break;
    case 'sp':
      mutated = mutateSP(member);
      break;
    case 'nature':
      mutated = mutateNature(member);
      break;
  }
  if (!mutated) return team;

  const candidate = team.map((p, i) => (i === slot ? mutated! : p));
  return checkTeamLegality(candidate, format).valid ? candidate : team;
}

function crossover(a: VgcTeam, b: VgcTeam, format: string): VgcTeam {
  const child: VgcTeam = a.map((memberA, i) => (Math.random() < 0.5 ? memberA : b[i]!));
  // Reparar duplicados de especie (Species Clause) quedandose con la primera aparicion.
  const seen = new Set<string>();
  for (let i = 0; i < child.length; i++) {
    const species = child[i]!.species;
    if (seen.has(species)) {
      child[i] = a[i]!; // vuelve al padre A en ese slot si hay choque
    } else {
      seen.add(species);
    }
  }
  return checkTeamLegality(child, format).valid ? child : a;
}

function tournamentSelect(population: VgcTeam[], fitness: number[], k = 3): VgcTeam {
  let best = randInt(population.length);
  for (let i = 1; i < k; i++) {
    const challenger = randInt(population.length);
    if (fitness[challenger]! > fitness[best]!) best = challenger;
  }
  return population[best]!;
}

/**
 * Optimizador evolutivo real: mantiene una poblacion de equipos, mide su
 * fitness con combates reales contra el gauntlet del meta, cruza y muta a
 * los mejores, descarta a los peores, y repite hasta agotar el tiempo o las
 * generaciones configuradas. Guarda checkpoint despues de cada generacion
 * para poder correr horas y resumir si se interrumpe.
 */
export async function evolveTeam(opts: EvolveOptions): Promise<Checkpoint> {
  const populationSize = opts.populationSize ?? 16;
  const eliteCount = Math.max(1, opts.eliteCount ?? Math.round(populationSize * 0.15));
  const quickBattles = opts.quickBattles ?? 6;
  const startTime = Date.now();

  let checkpoint = loadCheckpoint(opts.checkpointPath);

  if (!checkpoint) {
    const population: VgcTeam[] = [];

    if (opts.seedTeam && opts.seedTeam.length > 0) {
      const variants = buildTeamVariants(opts.seedTeam, opts.metaTop, opts.snapshot, {
        branchWidth: Math.min(4, populationSize),
        branchDepth: 2,
        maxVariants: Math.ceil(populationSize / 2),
      });
      for (const v of variants) {
        if (checkTeamLegality(v.team, opts.format).valid) population.push(v.team);
      }
    }

    while (population.length < populationSize) {
      const ind = randomIndividual(opts.metaTop, opts.snapshot);
      if (ind && checkTeamLegality(ind, opts.format).valid) population.push(ind);
    }

    checkpoint = { generation: 0, population: population.slice(0, populationSize), fitness: [], history: [] };
  }

  let stopped = false;
  const shouldStop = () => stopped;
  const sigintHandler = () => {
    stopped = true;
  };
  process.on('SIGINT', sigintHandler);

  try {
    while (true) {
      if (opts.maxGenerations != null && checkpoint.generation >= opts.maxGenerations) break;
      if (opts.maxDurationMs != null && Date.now() - startTime >= opts.maxDurationMs) break;
      if (stopped) break;

      const fitness: number[] = [];
      for (const team of checkpoint.population) {
        const result = await runMetaGauntlet(team, opts.metaTeams, { n: quickBattles, format: opts.format });
        fitness.push(result.overallWinRate);
        if (stopped) break;
      }
      // Si se interrumpio a mitad de la evaluacion, completa el resto con 0 para no romper el orden.
      while (fitness.length < checkpoint.population.length) fitness.push(0);

      const order = fitness.map((_, i) => i).sort((a, b) => fitness[b]! - fitness[a]!);
      const rankedPopulation = order.map((i) => checkpoint!.population[i]!);
      const rankedFitness = order.map((i) => fitness[i]!);

      const stat: GenerationStat = {
        generation: checkpoint.generation,
        bestFitness: rankedFitness[0]!,
        avgFitness: rankedFitness.reduce((a, b) => a + b, 0) / rankedFitness.length,
        bestTeamSpecies: rankedPopulation[0]!.map((p) => p.species),
        timestamp: new Date().toISOString(),
      };
      checkpoint.history.push(stat);
      checkpoint.population = rankedPopulation;
      checkpoint.fitness = rankedFitness;
      opts.onGeneration?.(stat, shouldStop);

      saveCheckpoint(opts.checkpointPath, checkpoint);

      if (stopped) break;
      if (opts.maxGenerations != null && checkpoint.generation + 1 >= opts.maxGenerations) break;
      if (opts.maxDurationMs != null && Date.now() - startTime >= opts.maxDurationMs) break;

      const nextPopulation: VgcTeam[] = rankedPopulation.slice(0, eliteCount);
      while (nextPopulation.length < populationSize) {
        const parentA = tournamentSelect(rankedPopulation, rankedFitness);
        const parentB = tournamentSelect(rankedPopulation, rankedFitness);
        let child = crossover(parentA, parentB, opts.format);
        if (Math.random() < 0.8) child = mutate(child, opts.format, opts.metaTop, opts.snapshot);
        nextPopulation.push(child);
      }

      checkpoint = { generation: checkpoint.generation + 1, population: nextPopulation, fitness: [], history: checkpoint.history };
    }
  } finally {
    process.off('SIGINT', sigintHandler);
  }

  return checkpoint;
}
