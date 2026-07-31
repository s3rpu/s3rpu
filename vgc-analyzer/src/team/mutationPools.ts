/**
 * Pool de candidatos para las mutaciones del optimizador evolutivo
 * (`team/evolve.ts`). No es una lista de "movesets asumidos": es un
 * catalogo amplio de movimientos/objetos/naturalezas que se prueban contra
 * el validador real (`legality.ts`) para descubrir que es legal para cada
 * pokemon puntual, en vez de asumir un set fijo por especie.
 */

export const MOVE_CANDIDATES: string[] = [
  // Utilidad universal de VGC
  'Protect', 'Detect', 'Wide Guard', 'Quick Guard', 'Follow Me', 'Rage Powder',
  'Fake Out', 'Tailwind', 'Trick Room', 'Taunt', 'Encore', 'Disable', 'Helping Hand',
  'Light Screen', 'Reflect', 'Aurora Veil', 'Thunder Wave', 'Will-O-Wisp', 'Toxic',
  'Icy Wind', 'Electroweb', 'Sticky Web', 'Parting Shot', 'U-turn', 'Volt Switch',
  'Flip Turn', 'Teleport', 'Sunny Day', 'Rain Dance', 'Sandstorm', 'Hail', 'Snowscape',
  'Nasty Plot', 'Swords Dance', 'Quiver Dance', 'Dragon Dance', 'Bulk Up', 'Calm Mind',
  'Substitute', 'Recover', 'Roost', 'Rest', 'Leech Seed', 'Haze', 'Spore', 'Sleep Powder',
  // Fisicos comunes por tipo
  'Close Combat', 'Drain Punch', 'Earthquake', 'High Horsepower', 'Rock Slide', 'Stone Edge',
  'Flare Blitz', 'Sucker Punch', 'Knock Off', 'Darkest Lariat', 'Crunch', 'Iron Head',
  'Iron Head', 'Play Rough', 'Wood Hammer', 'Wave Crash', 'Liquidation', 'Aqua Jet',
  'Ice Punch', 'Thunder Punch', 'Fire Punch', 'Zen Headbutt', 'Psychic Fangs', 'Bullet Punch',
  'Double-Edge', 'Facade', 'Brave Bird', 'U-turn', 'Gunk Shot', 'Poison Jab', 'X-Scissor',
  // Especiales comunes por tipo
  'Moonblast', 'Dazzling Gleam', 'Shadow Ball', 'Thunderbolt', 'Ice Beam', 'Flamethrower',
  'Heat Wave', 'Overheat', 'Draco Meteor', 'Dragon Pulse', 'Hydro Pump', 'Scald', 'Muddy Water',
  'Energy Ball', 'Leaf Storm', 'Bug Buzz', 'Air Slash', 'Hurricane', 'Psychic', 'Expanding Force',
  'Make It Rain', 'Focus Blast', 'Sludge Bomb', 'Earth Power', 'Weather Ball', 'Solar Beam',
  // Prioridad / control adicional
  'Extreme Speed', 'Mach Punch', 'Vacuum Wave', 'Feint', 'Trick Room',
] as const;

export const ITEM_CANDIDATES: string[] = [
  'Sitrus Berry', 'Rocky Helmet', 'Assault Vest', 'Leftovers', 'Focus Sash', 'Life Orb',
  'Choice Scarf', 'Choice Band', 'Choice Specs', 'Mystic Water', 'Black Glasses', 'Charcoal',
  'Miracle Seed', 'Magnet', 'Never-Melt Ice', 'Twisted Spoon', 'Silk Scarf', 'Silver Powder',
  'Hard Stone', 'Spell Tag', 'Dragon Fang', 'Metal Coat', 'Fairy Feather', 'Muscle Band',
  'Wise Glasses', 'Wide Lens', 'Covert Cloak', 'Safety Goggles', 'Mental Herb', 'Light Clay',
  'Eviolite', 'Weakness Policy', 'Throat Spray',
] as const;

export const NATURE_CANDIDATES: string[] = [
  'Adamant', 'Jolly', 'Modest', 'Timid', 'Careful', 'Calm', 'Impish', 'Bold', 'Brave',
  'Quiet', 'Sassy', 'Relaxed', 'Naive', 'Hasty', 'Rash', 'Mild', 'Gentle', 'Lax',
] as const;
