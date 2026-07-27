// Capa de gamificación: XP, niveles, rachas y logros.
// Todo se calcula a partir de los registros guardados (sin estado propio),
// para que nunca se desincronice de los datos reales.

const XP_PER_LOG = 10;
const XP_PER_PR = 15;
const TRAINING_DAY_IDS = ROUTINE.filter((d) => d.type === 'training').map((d) => d.id);

function levelInfo(xp) {
  let level = 1;
  let remaining = xp;
  let need = 100;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = 100 + (level - 1) * 25;
  }
  return { level, xpIntoLevel: remaining, xpForNext: need };
}

function chronological(entries) {
  return entries
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
}

function computeXPAndPRs(entries) {
  const maxSeen = {};
  let xp = 0;
  let prCount = 0;
  chronological(entries).forEach((e) => {
    xp += XP_PER_LOG;
    if (e.weight != null) {
      const prevMax = maxSeen[e.exerciseId] ?? -Infinity;
      if (e.weight > prevMax) {
        xp += XP_PER_PR;
        prCount += 1;
        maxSeen[e.exerciseId] = e.weight;
      }
    }
  });
  return { xp, prCount };
}

function diffDays(isoA, isoB) {
  const a = new Date(isoA + 'T00:00:00');
  const b = new Date(isoB + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

function computeStreak(sessionDatesAsc) {
  if (sessionDatesAsc.length === 0) return 0;
  const today = todayISO();
  const datesDesc = sessionDatesAsc.slice().reverse();
  if (diffDays(today, datesDesc[0]) > 2) return 0;
  let streak = 1;
  for (let i = 0; i < datesDesc.length - 1; i++) {
    const gap = diffDays(datesDesc[i], datesDesc[i + 1]);
    if (gap <= 2) streak += 1;
    else break;
  }
  return streak;
}

function computeFullDayCompletions(entries) {
  let count = 0;
  ROUTINE.filter((d) => d.type === 'training').forEach((day) => {
    const exerciseIds = day.exercises.map((ex) => ex.id);
    const byDate = {};
    entries
      .filter((e) => e.dayId === day.id)
      .forEach((e) => {
        (byDate[e.date] ??= new Set()).add(e.exerciseId);
      });
    Object.values(byDate).forEach((set) => {
      if (exerciseIds.every((id) => set.has(id))) count += 1;
    });
  });
  return count;
}

function isoWeekKey(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${weekNo}`;
}

function computePerfectWeeks(entries) {
  const weeks = {};
  entries.forEach((e) => {
    if (!TRAINING_DAY_IDS.includes(e.dayId)) return;
    const key = isoWeekKey(e.date);
    (weeks[key] ??= new Set()).add(e.dayId);
  });
  return Object.values(weeks).filter((set) => TRAINING_DAY_IDS.every((id) => set.has(id))).length;
}

const BADGES = [
  { id: 'first', icon: '🏋️', name: 'Primer paso', desc: 'Registra tu primer entrenamiento', check: (c) => c.entries.length >= 1 },
  { id: 'streak3', icon: '🔥', name: 'En racha', desc: '3 días de racha', check: (c) => c.streak >= 3 },
  { id: 'streak7', icon: '🔥🔥', name: 'Imparable', desc: '7 días de racha', check: (c) => c.streak >= 7 },
  { id: 'sessions10', icon: '💪', name: 'Constancia', desc: '10 días entrenados', check: (c) => c.sessionsCount >= 10 },
  { id: 'sessions25', icon: '🏆', name: 'Veterano', desc: '25 días entrenados', check: (c) => c.sessionsCount >= 25 },
  { id: 'sessions50', icon: '👑', name: 'Leyenda', desc: '50 días entrenados', check: (c) => c.sessionsCount >= 50 },
  { id: 'pr1', icon: '🥇', name: 'Nuevo récord', desc: 'Supera tu peso máximo en un ejercicio', check: (c) => c.prCount >= 1 },
  { id: 'pr10', icon: '🥇🥇', name: 'Rompe récords', desc: '10 récords personales', check: (c) => c.prCount >= 10 },
  { id: 'fullday', icon: '✅', name: 'Día completo', desc: 'Completa todos los ejercicios de un día en la misma sesión', check: (c) => c.fullDayCompletions >= 1 },
  { id: 'perfectweek', icon: '⭐', name: 'Semana perfecta', desc: 'Entrena los 4 días de la rutina en la misma semana', check: (c) => c.perfectWeeks >= 1 },
  { id: 'level5', icon: '🚀', name: 'Nivel 5', desc: 'Alcanza el nivel 5', check: (c) => c.level >= 5 },
];

function computeGamification(entries) {
  const { xp, prCount } = computeXPAndPRs(entries);
  const { level, xpIntoLevel, xpForNext } = levelInfo(xp);
  const sessionDatesAsc = [...new Set(entries.map((e) => e.date))].sort();
  const streak = computeStreak(sessionDatesAsc);
  const fullDayCompletions = computeFullDayCompletions(entries);
  const perfectWeeks = computePerfectWeeks(entries);

  const ctx = {
    entries,
    sessionsCount: sessionDatesAsc.length,
    streak,
    xp,
    level,
    prCount,
    fullDayCompletions,
    perfectWeeks,
  };

  const unlocked = BADGES.filter((b) => b.check(ctx));
  const locked = BADGES.filter((b) => !b.check(ctx));

  return { xp, level, xpIntoLevel, xpForNext, streak, sessionsCount: ctx.sessionsCount, unlocked, locked };
}
