import type { MetaSnapshot, PokemonUsageStats } from './types.js';

/**
 * Dataset SEMILLA (offline) para Pokemon Champions VGC 2026 Reg M-B.
 *
 * Curado a mano a partir de reportes publicos del meta real de julio 2026
 * (Pikalytics: top de uso Garchomp/Sinistcha/Basculegion/Whimsicott/
 * Kingambit/Staraptor/Incineroar/Charizard/Raichu/Pelipper sobre ~160k
 * combates; notas de Megas dominantes como Mega Metagross/Charizard Y/
 * Aerodactyl/Tyranitar/Froslass en equipos de clima) — NO es un volcado
 * literal de una API en vivo: los movesets/items de Garchomp, Kingambit,
 * Whimsicott, Sinistcha y Basculegion vienen de notas publicas reales; el
 * resto (spreads exactos, EVs/SP, % de counters) es una reconstruccion
 * razonable. Sirve para que `vgc meta`/`vgc report` funcionen de inmediato
 * sin depender de red. En cuanto haya salida de red hacia smogon.com con
 * stats publicadas para `gen9championsvgc2026regmb`, `vgc meta update`
 * reemplaza este snapshot y marca `source: 'live'`.
 *
 * Los "SP" (Stat Points) de Pokemon Champions van de 0 a 32 por stat, hasta
 * 66 en total (reemplazan a los EVs 0-252 de los juegos principales) — el
 * formato "Nature:HP/Atk/Def/SpA/SpD/Spe" de mas abajo ya esta en esa escala.
 */

interface Raw {
  species: string;
  usage: number;
  ability: string;
  item: string;
  spread: string; // "Nature:HP/Atk/Def/SpA/SpD/Spe" en escala de Stat Points (0-32 c/u, <=66 total)
  moves: [string, number][];
  teammates: [string, number][];
  counters: [string, number, number, number][]; // species, winrate, ko%, rating
}

const RAW: Raw[] = [
  { species: 'Incineroar', usage: 0.30, ability: 'Intimidate', item: 'Sitrus Berry', spread: 'Careful:32/2/0/0/32/0',
    moves: [['Fake Out', 0.9], ['Flare Blitz', 0.6], ['Darkest Lariat', 0.55], ['Parting Shot', 0.48]],
    teammates: [['Kingambit', 0.22], ['Staraptor', 0.18], ['Sinistcha', 0.15]],
    counters: [['Garchomp', 0.44, 24, 1620], ['Raichu', 0.40, 20, 1600], ['Basculegion', 0.36, 18, 1580]] },
  { species: 'Garchomp', usage: 0.24, ability: 'Rough Skin', item: 'Life Orb', spread: 'Jolly:0/32/0/0/2/32',
    moves: [['Earthquake', 0.62], ['Dragon Claw', 0.5], ['Rock Slide', 0.45], ['Protect', 0.55]],
    teammates: [['Charizard', 0.2], ['Sinistcha', 0.16], ['Incineroar', 0.14]],
    counters: [['Charizard', 0.58, 30, 1660], ['Raichu', 0.50, 26, 1640], ['Kingambit', 0.48, 24, 1630]] },
  { species: 'Kingambit', usage: 0.22, ability: 'Supreme Overlord', item: 'Black Glasses', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Kowtow Cleave', 0.58], ['Sucker Punch', 0.5], ['Iron Head', 0.3], ['Protect', 0.5]],
    teammates: [['Incineroar', 0.2], ['Whimsicott', 0.15], ['Grimmsnarl', 0.13]],
    counters: [['Metagross-Mega', 0.46, 22, 1610], ['Raichu', 0.40, 18, 1590], ['Garchomp', 0.36, 16, 1580]] },
  { species: 'Sinistcha', usage: 0.21, ability: 'Hospitality', item: 'Sitrus Berry', spread: 'Sassy:32/0/2/0/32/0',
    moves: [['Rage Powder', 0.5], ['Matcha Gotcha', 0.55], ['Trick Room', 0.4], ['Protect', 0.5]],
    teammates: [['Garchomp', 0.18], ['Basculegion', 0.16], ['Metagross-Mega', 0.14]],
    counters: [['Kingambit', 0.52, 24, 1630], ['Incineroar', 0.46, 20, 1600], ['Raichu', 0.40, 18, 1590]] },
  { species: 'Metagross-Mega', usage: 0.20, ability: 'Tough Claws', item: 'Metagrossite', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Protect', 0.95], ['Psychic Fangs', 0.88], ['Iron Head', 0.71], ['Bullet Punch', 0.32]],
    teammates: [['Garchomp', 0.18], ['Sinistcha', 0.16], ['Grimmsnarl', 0.14], ['Pelipper', 0.12]],
    counters: [['Incineroar', 0.40, 18, 1590], ['Garchomp', 0.36, 16, 1580], ['Whimsicott', 0.30, 14, 1560]] },
  { species: 'Basculegion', usage: 0.19, ability: 'Adaptability', item: 'Choice Scarf', spread: 'Jolly:0/32/0/0/2/32',
    moves: [['Last Respects', 0.5], ['Wave Crash', 0.45], ['Aqua Jet', 0.4], ['Flip Turn', 0.3]],
    teammates: [['Sinistcha', 0.16], ['Pelipper', 0.14], ['Whimsicott', 0.12]],
    counters: [['Whimsicott', 0.44, 20, 1600], ['Grimmsnarl', 0.40, 18, 1590], ['Raichu', 0.38, 16, 1580]] },
  { species: 'Whimsicott', usage: 0.18, ability: 'Prankster', item: 'Focus Sash', spread: 'Timid:32/0/0/0/0/32',
    moves: [['Tailwind', 0.5], ['Moonblast', 0.4], ['Encore', 0.35], ['Protect', 0.45]],
    teammates: [['Metagross-Mega', 0.14], ['Charizard', 0.12], ['Staraptor', 0.1]],
    counters: [['Kingambit', 0.42, 18, 1590], ['Metagross-Mega', 0.38, 16, 1580], ['Incineroar', 0.36, 15, 1570]] },
  { species: 'Staraptor', usage: 0.17, ability: 'Intimidate', item: 'Life Orb', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Double-Edge', 0.45], ['Close Combat', 0.4], ['U-turn', 0.35], ['Protect', 0.5]],
    teammates: [['Whimsicott', 0.13], ['Sinistcha', 0.11], ['Incineroar', 0.1]],
    counters: [['Metagross-Mega', 0.40, 17, 1580], ['Garchomp', 0.36, 15, 1570], ['Incineroar', 0.34, 14, 1560]] },
  { species: 'Charizard', usage: 0.26, ability: 'Drought', item: 'Charizardite Y', spread: 'Timid:0/0/0/32/2/32',
    moves: [['Heat Wave', 0.55], ['Solar Beam', 0.35], ['Roost', 0.3], ['Protect', 0.5]],
    teammates: [['Garchomp', 0.2], ['Whimsicott', 0.14], ['Aerodactyl-Mega', 0.1]],
    counters: [['Garchomp', 0.52, 24, 1620], ['Raichu', 0.44, 20, 1600], ['Basculegion', 0.38, 17, 1580]] },
  { species: 'Raichu', usage: 0.16, ability: 'Lightning Rod', item: 'Focus Sash', spread: 'Timid:0/0/0/32/2/32',
    moves: [['Volt Switch', 0.5], ['Thunderbolt', 0.4], ['Fake Out', 0.3], ['Protect', 0.45]],
    teammates: [['Pelipper', 0.15], ['Garchomp', 0.12], ['Whimsicott', 0.1]],
    counters: [['Kingambit', 0.38, 15, 1570], ['Garchomp', 0.34, 14, 1560], ['Metagross-Mega', 0.32, 13, 1550]] },
  { species: 'Pelipper', usage: 0.15, ability: 'Drizzle', item: 'Focus Sash', spread: 'Bold:32/0/32/0/0/2',
    moves: [['Hurricane', 0.4], ['Wide Guard', 0.3], ['Tailwind', 0.25], ['Protect', 0.45]],
    teammates: [['Swampert-Mega', 0.2], ['Raichu', 0.13], ['Basculegion', 0.12]],
    counters: [['Charizard', 0.36, 14, 1560], ['Raichu', 0.30, 12, 1550], ['Kingambit', 0.28, 11, 1540]] },
  { species: 'Grimmsnarl', usage: 0.16, ability: 'Prankster', item: 'Light Clay', spread: 'Careful:32/0/2/0/32/0',
    moves: [['Light Screen', 0.55], ['Reflect', 0.55], ['Spirit Break', 0.35], ['Thunder Wave', 0.2]],
    teammates: [['Metagross-Mega', 0.14], ['Kingambit', 0.12], ['Incineroar', 0.1]],
    counters: [['Kingambit', 0.34, 12, 1550], ['Metagross-Mega', 0.30, 11, 1540], ['Garchomp', 0.28, 10, 1530]] },
  { species: 'Swampert-Mega', usage: 0.14, ability: 'Swift Swim', item: 'Swampertite', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Wave Crash', 0.5], ['Earthquake', 0.4], ['Ice Punch', 0.3], ['Protect', 0.5]],
    teammates: [['Pelipper', 0.25], ['Metagross-Mega', 0.15], ['Raichu', 0.1]],
    counters: [['Whimsicott', 0.30, 11, 1540], ['Raichu', 0.28, 10, 1530], ['Sinistcha', 0.26, 9, 1520]] },
  { species: 'Aerodactyl-Mega', usage: 0.15, ability: 'Tough Claws', item: 'Aerodactylite', spread: 'Jolly:0/32/0/0/2/32',
    moves: [['Rock Slide', 0.5], ['Tailwind', 0.35], ['Taunt', 0.3], ['Protect', 0.45]],
    teammates: [['Charizard', 0.13], ['Garchomp', 0.12], ['Whimsicott', 0.1]],
    counters: [['Garchomp', 0.40, 16, 1580], ['Metagross-Mega', 0.34, 14, 1560], ['Incineroar', 0.30, 12, 1550]] },
  { species: 'Tyranitar-Mega', usage: 0.13, ability: 'Sand Stream', item: 'Tyranitarite', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Rock Slide', 0.45], ['Crunch', 0.4], ['Low Kick', 0.25], ['Protect', 0.5]],
    teammates: [['Incineroar', 0.13], ['Kingambit', 0.12], ['Sinistcha', 0.1]],
    counters: [['Kingambit', 0.32, 11, 1540], ['Metagross-Mega', 0.28, 10, 1530], ['Garchomp', 0.26, 9, 1520]] },
  { species: 'Froslass-Mega', usage: 0.12, ability: 'Snow Warning', item: 'Froslassite', spread: 'Timid:0/0/0/32/2/32',
    moves: [['Blizzard', 0.4], ['Shadow Ball', 0.35], ['Destiny Bond', 0.25], ['Protect', 0.45]],
    teammates: [['Incineroar', 0.12], ['Sinistcha', 0.11], ['Whimsicott', 0.1]],
    counters: [['Metagross-Mega', 0.30, 10, 1530], ['Kingambit', 0.28, 9, 1520], ['Garchomp', 0.24, 8, 1510]] },
  { species: 'Staraptor-Mega', usage: 0.11, ability: 'Contrary', item: 'Staraptite', spread: 'Adamant:2/32/0/0/0/32',
    moves: [['Close Combat', 0.45], ['Brave Bird', 0.4], ['Tailwind', 0.25], ['Protect', 0.5]],
    teammates: [['Whimsicott', 0.12], ['Sinistcha', 0.1], ['Incineroar', 0.1]],
    counters: [['Metagross-Mega', 0.28, 9, 1520], ['Garchomp', 0.26, 8, 1510], ['Incineroar', 0.24, 7, 1500]] },
];

function buildSnapshot(format: string): MetaSnapshot {
  const pokemon: PokemonUsageStats[] = RAW.sort((a, b) => b.usage - a.usage).map((r) => ({
    species: r.species,
    usagePercent: r.usage,
    rawCount: Math.round(r.usage * 10000),
    abilities: { [r.ability]: 0.9 },
    items: { [r.item]: 0.5 },
    spreads: { [r.spread]: 0.35 },
    moves: Object.fromEntries(r.moves),
    teammates: Object.fromEntries(r.teammates),
    checksAndCounters: Object.fromEntries(r.counters.map(([s, wr, ko, rating]) => [s, [wr, ko, rating] as [number, number, number]])),
  }));

  return {
    format,
    updatedAt: new Date().toISOString(),
    source: 'seed',
    pokemon,
  };
}

export function seedMetaSnapshot(format: string): MetaSnapshot {
  return buildSnapshot(format);
}
