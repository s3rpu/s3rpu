// Definición de la rutina (según plan de entrenamiento del usuario).
const ROUTINE = [
  {
    id: 'dia1',
    name: 'Día 1',
    subtitle: 'Pierna A',
    type: 'training',
    exercises: [
      { id: 'd1-sentadilla', name: 'Sentadilla o Prensa', target: '3x8-10' },
      { id: 'd1-pesomuerto-rumano', name: 'Peso muerto rumano', target: '3x8-10' },
      { id: 'd1-extension-cuadriceps', name: 'Extensión de cuádriceps', target: '3x12-15' },
      { id: 'd1-femoral', name: 'Femoral sentado/tumbado', target: '3x10-12' },
      { id: 'd1-gemelo', name: 'Gemelo en máquina', target: '3x12-15' },
    ],
  },
  {
    id: 'dia2',
    name: 'Día 2',
    subtitle: 'Torso A',
    type: 'training',
    exercises: [
      { id: 'd2-press-banca', name: 'Press banca', target: '3x6-8' },
      { id: 'd2-remo', name: 'Remo T o remo barra', target: '3x8-10' },
      { id: 'd2-press-militar', name: 'Press militar/inclinado multipower', target: '3x8-10' },
      { id: 'd2-jalon', name: 'Jalón al pecho o dominadas', target: '3x10-12' },
      { id: 'd2-elevaciones-laterales', name: 'Elevaciones laterales', target: '3x12-15' },
      { id: 'd2-biceps-triceps', name: 'Bíceps + tríceps (1 ejercicio cada uno)', target: '2x12-15' },
    ],
  },
  {
    id: 'dia3',
    name: 'Día 3',
    subtitle: 'Descanso',
    type: 'rest',
    note: "Cardio suave opcional 20-30', no obligatorio",
  },
  {
    id: 'dia4',
    name: 'Día 4',
    subtitle: 'Pierna B',
    type: 'training',
    exercises: [
      { id: 'd4-pesomuerto-prensa', name: 'Peso muerto o prensa (variante de la A)', target: '3x6-8' },
      { id: 'd4-bulgaras', name: 'Búlgaras o zancada', target: '3x10-12' },
      { id: 'd4-aductor-abductor', name: 'Aductor/abductor en máquina', target: '2x12-15' },
      { id: 'd4-femoral-tumbado', name: 'Femoral tumbado', target: '3x10-12' },
      { id: 'd4-core', name: 'Core (dead bug, plancha)', target: '2-3 series' },
    ],
  },
  {
    id: 'dia5',
    name: 'Día 5',
    subtitle: 'Torso B',
    type: 'training',
    exercises: [
      { id: 'd5-press-inclinado', name: 'Press inclinado mancuerna', target: '3x8-10' },
      { id: 'd5-remo-unilateral', name: 'Remo unilateral polea', target: '3x8-10' },
      { id: 'd5-press-convergente', name: 'Press convergente o press estrecho', target: '3x10-12' },
      { id: 'd5-jalon-unilateral', name: 'Jalón unilateral', target: '3x10-12' },
      { id: 'd5-elevacion-lateral-posterior', name: 'Elevación lateral + posterior', target: '3x12-15' },
      { id: 'd5-biceps-triceps', name: 'Bíceps + tríceps', target: '2x12-15' },
    ],
  },
];
