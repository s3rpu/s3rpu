import type { MetaSnapshot, PokemonUsageStats } from './types.js';

/**
 * Dataset SEMILLA (offline) para arrancar la herramienta sin depender de red.
 *
 * Estos numeros son una curaduria manual, representativa de patrones estables
 * del meta de VGC Gen 9 (Regulation G/H/I) — NO son un volcado literal de
 * smogon.com/stats. Sirven para que `vgc meta` funcione de inmediato en modo
 * demo/offline; en cuanto haya salida de red hacia smogon.com, correr
 * `vgc meta update` reemplaza este snapshot con datos reales y marca
 * `source: 'live'`.
 */

interface Raw {
  species: string;
  usage: number;
  ability: string;
  item: string;
  spread: string; // "Nature:HP/Atk/Def/SpA/SpD/Spe"
  moves: [string, number][];
  teammates: [string, number][];
  counters: [string, number, number, number][]; // species, winrate, ko%, rating
}

const RAW: Raw[] = [
  { species: 'Incineroar', usage: 0.38, ability: 'Intimidate', item: 'Sitrus Berry', spread: 'Careful:244/0/4/4/4/252',
    moves: [['Fake Out', 0.93], ['Flare Blitz', 0.62], ['Knock Off', 0.58], ['Parting Shot', 0.51]],
    teammates: [['Rillaboom', 0.22], ['Flutter Mane', 0.18], ['Gholdengo', 0.15], ['Amoonguss', 0.12]],
    counters: [['Chien-Pao', 0.62, 45, 1700], ['Iron Hands', 0.58, 40, 1690], ['Raging Bolt', 0.55, 38, 1680]] },
  { species: 'Rillaboom', usage: 0.34, ability: 'Grassy Surge', item: 'Assault Vest', spread: 'Adamant:252/252/0/0/4/0',
    moves: [['Wood Hammer', 0.71], ['Fake Out', 0.68], ['Grassy Glide', 0.66], ['U-turn', 0.45], ['High Horsepower', 0.2]],
    teammates: [['Incineroar', 0.2], ['Ogerpon-Hearthflame', 0.16], ['Whimsicott', 0.13]],
    counters: [['Ogerpon-Wellspring', 0.6, 42, 1710], ['Talonflame', 0.57, 35, 1670], ['Flutter Mane', 0.53, 33, 1660]] },
  { species: 'Amoonguss', usage: 0.31, ability: 'Regenerator', item: 'Rocky Helmet', spread: 'Calm:244/0/4/0/252/4',
    moves: [['Spore', 0.88], ['Rage Powder', 0.62], ['Pollen Puff', 0.55], ['Sludge Bomb', 0.42], ['Protect', 0.3]],
    teammates: [['Incineroar', 0.19], ['Urshifu-Rapid-Strike', 0.17], ['Gholdengo', 0.14]],
    counters: [['Chi-Yu', 0.6, 38, 1690], ['Iron Hands', 0.55, 34, 1680], ['Kingambit', 0.52, 30, 1650]] },
  { species: 'Landorus-Therian', usage: 0.29, ability: 'Intimidate', item: 'Choice Scarf', spread: 'Jolly:4/252/0/0/0/252',
    moves: [['Earthquake', 0.66], ['U-turn', 0.55], ['Rock Slide', 0.44], ['Tera Blast', 0.31], ['Protect', 0.2]],
    teammates: [['Rillaboom', 0.18], ['Amoonguss', 0.15], ['Flutter Mane', 0.13]],
    counters: [['Ogerpon-Wellspring', 0.58, 36, 1680], ['Dondozo', 0.55, 30, 1650], ['Urshifu-Rapid-Strike', 0.5, 28, 1640]] },
  { species: 'Urshifu-Rapid-Strike', usage: 0.27, ability: 'Unseen Fist', item: 'Focus Sash', spread: 'Jolly:252/0/0/0/4/252',
    moves: [['Surging Strikes', 0.6], ['Close Combat', 0.5], ['Aqua Jet', 0.45], ['Detect', 0.6], ['U-turn', 0.15]],
    teammates: [['Amoonguss', 0.2], ['Rillaboom', 0.17], ['Tornadus', 0.14]],
    counters: [['Gholdengo', 0.62, 40, 1700], ['Rillaboom', 0.55, 34, 1670], ['Farigiraf', 0.5, 28, 1650]] },
  { species: 'Flutter Mane', usage: 0.33, ability: 'Protosynthesis', item: 'Choice Specs', spread: 'Timid:4/0/0/252/0/252',
    moves: [['Moonblast', 0.68], ['Shadow Ball', 0.55], ['Icy Wind', 0.5], ['Thunderbolt', 0.3], ['Dazzling Gleam', 0.28]],
    teammates: [['Incineroar', 0.19], ['Rillaboom', 0.15], ['Tornadus', 0.13]],
    counters: [['Kingambit', 0.6, 38, 1690], ['Iron Hands', 0.55, 34, 1670], ['Gholdengo', 0.5, 28, 1650]] },
  { species: 'Gholdengo', usage: 0.26, ability: 'Good as Gold', item: 'Life Orb', spread: 'Timid:4/0/0/252/0/252',
    moves: [['Make It Rain', 0.65], ['Shadow Ball', 0.55], ['Nasty Plot', 0.35], ['Protect', 0.45], ['Thunderbolt', 0.2]],
    teammates: [['Landorus-Therian', 0.17], ['Amoonguss', 0.15], ['Rillaboom', 0.13]],
    counters: [['Chien-Pao', 0.55, 32, 1660], ['Kingambit', 0.5, 28, 1640], ['Raging Bolt', 0.48, 26, 1630]] },
  { species: 'Chien-Pao', usage: 0.28, ability: 'Sword of Ruin', item: 'Focus Sash', spread: 'Jolly:4/252/0/0/0/252',
    moves: [['Icicle Crash', 0.6], ['Sacred Sword', 0.45], ['Sucker Punch', 0.4], ['Protect', 0.5], ['Ice Shard', 0.15]],
    teammates: [['Incineroar', 0.16], ['Amoonguss', 0.14], ['Ogerpon-Wellspring', 0.13]],
    counters: [['Incineroar', 0.58, 34, 1670], ['Rillaboom', 0.53, 30, 1650], ['Amoonguss', 0.5, 26, 1630]] },
  { species: 'Chi-Yu', usage: 0.22, ability: 'Beads of Ruin', item: 'Choice Specs', spread: 'Timid:4/0/0/252/0/252',
    moves: [['Overheat', 0.5], ['Heat Wave', 0.3], ['Dark Pulse', 0.45], ['Snarl', 0.3], ['Tera Blast', 0.2]],
    teammates: [['Rillaboom', 0.15], ['Incineroar', 0.13], ['Chien-Pao', 0.12]],
    counters: [['Rillaboom', 0.55, 30, 1650], ['Dondozo', 0.5, 26, 1630], ['Amoonguss', 0.48, 24, 1620]] },
  { species: 'Raging Bolt', usage: 0.24, ability: 'Protosynthesis', item: 'Assault Vest', spread: 'Modest:236/0/4/196/4/68',
    moves: [['Thunderclap', 0.55], ['Dragon Pulse', 0.45], ['Thunderbolt', 0.3], ['Protect', 0.4], ['Draco Meteor', 0.15]],
    teammates: [['Rillaboom', 0.16], ['Ogerpon-Hearthflame', 0.13], ['Incineroar', 0.12]],
    counters: [['Gholdengo', 0.5, 26, 1630], ['Kingambit', 0.48, 24, 1620], ['Iron Hands', 0.45, 22, 1610]] },
  { species: 'Ogerpon-Hearthflame', usage: 0.23, ability: 'Mold Breaker', item: 'Hearthflame Mask', spread: 'Adamant:236/252/0/0/4/16',
    moves: [['Ivy Cudgel', 0.6], ['Wood Hammer', 0.2], ['Follow Me', 0.2], ['Spiky Shield', 0.5], ['Helping Hand', 0.1]],
    teammates: [['Rillaboom', 0.14], ['Amoonguss', 0.12], ['Incineroar', 0.11]],
    counters: [['Dondozo', 0.5, 24, 1620], ['Amoonguss', 0.46, 22, 1610], ['Rillaboom', 0.44, 20, 1600]] },
  { species: 'Iron Hands', usage: 0.25, ability: 'Quark Drive', item: 'Assault Vest', spread: 'Adamant:236/156/4/0/12/100',
    moves: [['Drain Punch', 0.55], ['Wild Charge', 0.4], ['Fake Out', 0.35], ['Heavy Slam', 0.2], ['Volt Switch', 0.2]],
    teammates: [['Rillaboom', 0.13], ['Incineroar', 0.12], ['Flutter Mane', 0.1]],
    counters: [['Gholdengo', 0.52, 26, 1630], ['Chien-Pao', 0.48, 22, 1610], ['Kingambit', 0.45, 20, 1600]] },
  { species: 'Grimmsnarl', usage: 0.21, ability: 'Prankster', item: 'Light Clay', spread: 'Careful:244/0/4/0/252/8',
    moves: [['Light Screen', 0.6], ['Reflect', 0.6], ['Spirit Break', 0.4], ['Thunder Wave', 0.25], ['Fake Out', 0.2]],
    teammates: [['Iron Hands', 0.13], ['Raging Bolt', 0.11], ['Incineroar', 0.1]],
    counters: [['Kingambit', 0.5, 20, 1600], ['Gholdengo', 0.46, 18, 1590], ['Chien-Pao', 0.44, 16, 1580]] },
  { species: 'Tornadus', usage: 0.24, ability: 'Prankster', item: 'Covert Cloak', spread: 'Timid:252/0/4/0/0/252',
    moves: [['Tailwind', 0.55], ['Bleakwind Storm', 0.45], ['Taunt', 0.4], ['Protect', 0.45], ['Rain Dance', 0.1]],
    teammates: [['Flutter Mane', 0.14], ['Urshifu-Rapid-Strike', 0.12], ['Gholdengo', 0.11]],
    counters: [['Raging Bolt', 0.46, 18, 1590], ['Iron Hands', 0.44, 16, 1580], ['Kingambit', 0.42, 15, 1570]] },
  { species: 'Whimsicott', usage: 0.18, ability: 'Prankster', item: 'Focus Sash', spread: 'Timid:252/0/4/0/0/252',
    moves: [['Tailwind', 0.5], ['Moonblast', 0.4], ['Encore', 0.3], ['Protect', 0.4], ['Sunny Day', 0.1]],
    teammates: [['Ogerpon-Hearthflame', 0.12], ['Rillaboom', 0.1], ['Torkoal', 0.09]],
    counters: [['Kingambit', 0.44, 16, 1580], ['Gholdengo', 0.4, 14, 1570], ['Iron Hands', 0.38, 13, 1560]] },
  { species: 'Dondozo', usage: 0.19, ability: 'Unaware', item: 'Leftovers', spread: 'Impish:252/4/252/0/0/0',
    moves: [['Wave Crash', 0.4], ['Order Up', 0.4], ['Body Press', 0.2], ['Protect', 0.5], ['Curse', 0.15]],
    teammates: [['Tatsugiri', 0.35], ['Amoonguss', 0.14], ['Farigiraf', 0.1]],
    counters: [['Chi-Yu', 0.42, 14, 1570], ['Gholdengo', 0.4, 13, 1560], ['Raging Bolt', 0.38, 12, 1550]] },
  { species: 'Tatsugiri', usage: 0.16, ability: 'Commander', item: 'Choice Specs', spread: 'Modest:4/0/0/252/0/252',
    moves: [['Muddy Water', 0.5], ['Draco Meteor', 0.3], ['Icy Wind', 0.3], ['Rain Dance', 0.1], ['Hydro Pump', 0.2]],
    teammates: [['Dondozo', 0.6], ['Amoonguss', 0.1], ['Incineroar', 0.08]],
    counters: [['Amoonguss', 0.4, 12, 1550], ['Rillaboom', 0.38, 11, 1540], ['Farigiraf', 0.36, 10, 1530]] },
  { species: 'Farigiraf', usage: 0.15, ability: 'Armor Tail', item: 'Sitrus Berry', spread: 'Sassy:252/0/4/0/252/0',
    moves: [['Trick Room', 0.5], ['Psychic', 0.35], ['Hyper Voice', 0.3], ['Helping Hand', 0.2], ['Foul Play', 0.15]],
    teammates: [['Iron Hands', 0.15], ['Torkoal', 0.12], ['Dondozo', 0.1]],
    counters: [['Gholdengo', 0.38, 11, 1540], ['Kingambit', 0.36, 10, 1530], ['Chien-Pao', 0.34, 9, 1520]] },
  { species: 'Pelipper', usage: 0.14, ability: 'Drizzle', item: 'Focus Sash', spread: 'Bold:252/0/252/4/0/0',
    moves: [['Hurricane', 0.4], ['Wide Guard', 0.3], ['Tailwind', 0.2], ['Protect', 0.4], ['Scald', 0.2]],
    teammates: [['Urshifu-Rapid-Strike', 0.25], ['Tatsugiri', 0.15], ['Archaludon', 0.1]],
    counters: [['Raging Bolt', 0.36, 9, 1520], ['Rillaboom', 0.34, 8, 1510], ['Gholdengo', 0.32, 8, 1500]] },
  { species: 'Kingambit', usage: 0.2, ability: 'Supreme Overlord', item: 'Black Glasses', spread: 'Adamant:252/252/0/0/4/0',
    moves: [['Kowtow Cleave', 0.55], ['Sucker Punch', 0.45], ['Iron Head', 0.3], ['Protect', 0.4], ['Low Kick', 0.15]],
    teammates: [['Incineroar', 0.13], ['Rillaboom', 0.11], ['Whimsicott', 0.1]],
    counters: [['Urshifu-Rapid-Strike', 0.34, 8, 1510], ['Gholdengo', 0.32, 7, 1500], ['Flutter Mane', 0.3, 6, 1490]] },
  { species: 'Volcarona', usage: 0.17, ability: 'Flame Body', item: 'Rocky Helmet', spread: 'Timid:252/0/4/0/0/252',
    moves: [['Rage Powder', 0.3], ['Struggle Bug', 0.3], ['Overheat', 0.2], ['Tera Blast', 0.2], ['Quiver Dance', 0.15]],
    teammates: [['Torkoal', 0.3], ['Whimsicott', 0.12], ['Incineroar', 0.1]],
    counters: [['Chien-Pao', 0.32, 7, 1500], ['Kingambit', 0.3, 6, 1490], ['Raging Bolt', 0.28, 6, 1480]] },
  { species: 'Torkoal', usage: 0.13, ability: 'Drought', item: 'Charcoal Stick', spread: 'Quiet:252/0/4/252/0/0',
    moves: [['Eruption', 0.4], ['Weather Ball', 0.3], ['Yawn', 0.2], ['Protect', 0.3], ['Helping Hand', 0.15]],
    teammates: [['Volcarona', 0.3], ['Whimsicott', 0.1], ['Camerupt', 0.08]],
    counters: [['Landorus-Therian', 0.3, 6, 1480], ['Chien-Pao', 0.28, 5, 1470], ['Urshifu-Rapid-Strike', 0.26, 5, 1460]] },
  { species: 'Indeedee-F', usage: 0.14, ability: 'Psychic Surge', item: 'Sitrus Berry', spread: 'Sassy:252/0/4/0/252/0',
    moves: [['Follow Me', 0.5], ['Trick Room', 0.3], ['Psychic', 0.3], ['Helping Hand', 0.3], ['Expanding Force', 0.2]],
    teammates: [['Iron Hands', 0.14], ['Farigiraf', 0.1], ['Torkoal', 0.08]],
    counters: [['Kingambit', 0.28, 5, 1460], ['Gholdengo', 0.26, 5, 1450], ['Chien-Pao', 0.24, 4, 1440]] },
  { species: 'Talonflame', usage: 0.13, ability: 'Flame Body', item: 'Covert Cloak', spread: 'Jolly:252/4/0/0/4/248',
    moves: [['Tailwind', 0.4], ['Brave Bird', 0.35], ['Will-O-Wisp', 0.3], ['Taunt', 0.2], ['Protect', 0.3]],
    teammates: [['Flutter Mane', 0.12], ['Urshifu-Rapid-Strike', 0.1], ['Gholdengo', 0.09]],
    counters: [['Raging Bolt', 0.26, 4, 1450], ['Iron Hands', 0.24, 4, 1440], ['Kingambit', 0.22, 3, 1430]] },
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
