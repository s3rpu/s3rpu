// Datos y constantes del juego Summoners War necesarios para interpretar
// el JSON exportado con SWEX (https://github.com/Xzandro/sw-exporter).
//
// IMPORTANTE: estos valores (sobre todo los porcentajes de los sets) están
// tomados de guías de la comunidad, no de un archivo oficial de Com2uS, así
// que puede haber alguna pequeña diferencia con el juego actual. Si detectas
// un valor incorrecto, edítalo aquí, es el único sitio donde hace falta
// tocarlo.

// Códigos de tipo de stat tal y como aparecen en pri_eff / prefix_eff / sec_eff.
const STAT_TYPES = {
  1: { key: 'hp_flat', label: 'HP', flat: true },
  2: { key: 'hp_pct', label: 'HP %', flat: false },
  3: { key: 'atk_flat', label: 'ATQ', flat: true },
  4: { key: 'atk_pct', label: 'ATQ %', flat: false },
  5: { key: 'def_flat', label: 'DEF', flat: true },
  6: { key: 'def_pct', label: 'DEF %', flat: false },
  7: { key: 'spd', label: 'VEL', flat: true },
  8: { key: 'cri_rate', label: 'CRI %', flat: false },
  9: { key: 'cri_dmg', label: 'C.DAÑO %', flat: false },
  10: { key: 'res', label: 'RES %', flat: false },
  11: { key: 'acc', label: 'PRE %', flat: false },
};

// Qué stat principal puede llevar cada ranura (1-6). Las ranuras 1,3,5
// siempre tienen la stat fija indicada; 2,4,6 pueden variar.
const SLOT_FIXED_MAIN = { 1: 3, 3: 5, 5: 1 }; // 3=ATQ flat, 5=DEF flat, 1=HP flat

// Sets de runas: id -> info. "pieces" indica cuántas runas del set hacen
// falta para activar el efecto (2 ó 4). "statKey"/"value" solo están
// presentes en los sets que dan un bonus de stat simple y por tanto se
// pueden sumar al cálculo de stats aportadas; el resto son efectos de
// proc/condición y se muestran como texto informativo.
// "statKey" solo se usa en los sets cuyo bonus se puede sumar directamente
// a las stats aportadas por las runas (mismo tipo/unidad que un substat).
// El set Rapidez (velocidad) es un caso especial: su +25% es un porcentaje
// sobre la velocidad TOTAL del monstruo (no sobre la velocidad de las
// runas), así que se marca con "specialPct: 'spd'" y se muestra aparte en
// vez de sumarlo a la velocidad plana de las runas.
const SET_INFO = {
  1: { name: 'Energía', pieces: 2, statKey: 'hp_pct', value: 15, desc: '+15% HP' },
  2: { name: 'Guardia', pieces: 2, statKey: 'def_pct', value: 15, desc: '+15% DEF' },
  3: { name: 'Rapidez', pieces: 4, specialPct: 'spd', value: 25, desc: '+25% Velocidad (sobre la velocidad total)' },
  4: { name: 'Hoja', pieces: 2, statKey: 'cri_rate', value: 12, desc: '+12% Prob. crítico' },
  5: { name: 'Furia', pieces: 4, statKey: 'cri_dmg', value: 40, desc: '+40% Daño crítico' },
  6: { name: 'Concentración', pieces: 2, statKey: 'acc', value: 20, desc: '+20% Precisión' },
  7: { name: 'Resistencia', pieces: 2, statKey: 'res', value: 20, desc: '+20% Resistencia' },
  8: { name: 'Fatal', pieces: 4, statKey: 'atk_pct', value: 35, desc: '+35% ATQ' },
  10: { name: 'Desesperación', pieces: 4, desc: '+25% prob. de aturdir al golpear' },
  11: { name: 'Vampiro', pieces: 4, desc: 'Cura ~25% del daño infligido como HP' },
  13: { name: 'Violento', pieces: 4, desc: '+22% prob. de turno extra' },
  14: { name: 'Némesis', pieces: 2, desc: '+4% barra de ataque cada vez que pierdes HP' },
  15: { name: 'Voluntad', pieces: 2, desc: 'Prob. de inmunidad 1 turno tras recibir un debuff' },
  16: { name: 'Escudo', pieces: 2, desc: 'Escudo = 15% del HP propio al iniciar el combate (3 turnos)' },
  17: { name: 'Venganza', pieces: 2, desc: '+15% prob. de contraataque' },
  18: { name: 'Destrucción', pieces: 2, desc: 'Prob. de reducir el HP máx. enemigo un 4% al golpear' },
  19: { name: 'Lucha', pieces: 2, statKey: 'atk_pct', value: 8, desc: '+8% ATQ (aliados)' },
  20: { name: 'Determinación', pieces: 2, statKey: 'def_pct', value: 8, desc: '+8% DEF (aliados)' },
  21: { name: 'Refuerzo', pieces: 2, statKey: 'hp_pct', value: 8, desc: '+8% HP (aliados)' },
  22: { name: 'Precisión', pieces: 2, statKey: 'acc', value: 10, desc: '+10% Precisión (aliados)' },
  23: { name: 'Tolerancia', pieces: 2, statKey: 'res', value: 10, desc: '+10% Resistencia (aliados)' },
};

// Sets que solo se activan con 4 piezas (el resto son de 2).
const FOUR_PIECE_SETS = new Set([3, 5, 8, 10, 11, 13]);

// Valor máximo "de referencia" (línea de 6★, rango legendario) usado para
// calcular la eficiencia de una runa según la fórmula estándar de la
// comunidad: eficiencia = suma( valor_substat / max_substat * peso ) / 2.8 * 100
// El divisor 2.8 es la suma de pesos de una runa perfecta (4 líneas al máximo
// valor posible, ponderadas). Es la misma fórmula que usan la mayoría de
// calculadoras de eficiencia de runas de la comunidad.
const SUBSTAT_MAX = {
  hp_flat: 2500,
  hp_pct: 40,
  atk_flat: 160,
  atk_pct: 40,
  def_flat: 160,
  def_pct: 40,
  spd: 30,
  cri_rate: 35,
  cri_dmg: 45,
  res: 40,
  acc: 40,
};

const EFFICIENCY_DIVISOR = 2.8;

function statLabel(key) {
  const found = Object.values(STAT_TYPES).find((s) => s.key === key);
  return found ? found.label : key;
}
