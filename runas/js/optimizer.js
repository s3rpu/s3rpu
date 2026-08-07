// Cálculo de eficiencia de runas, stats aportadas por un set de runas, y
// buscador de la mejor combinación disponible en el inventario para un
// monstruo y un objetivo dados.
//
// LIMITACIÓN IMPORTANTE (léela antes de confiar en los números): el JSON
// exportado no incluye las stats base del monstruo sin runas, así que todo
// lo que se calcula aquí es el "aporte de las runas" (+ bonus de sets),
// NO la stat final del monstruo en el juego. Es perfectamente válido para
// comparar builds entre sí (que es lo que hace el buscador), pero no lo
// uses como la cifra exacta que verás en la pantalla de tu monstruo.

function runeEfficiency(rune) {
  if (!rune.subs || rune.subs.length === 0) return 0;
  const sum = rune.subs.reduce((acc, s) => {
    const max = SUBSTAT_MAX[s.key];
    if (!max) return acc;
    return acc + s.value / max;
  }, 0);
  return Math.round((sum / EFFICIENCY_DIVISOR) * 1000) / 10; // 1 decimal
}

// Suma main + innate + substats de una lista de runas en un objeto {key: total}.
function aggregateRuneStats(runeList) {
  const totals = {};
  const add = (key, value) => {
    if (!key || !value) return;
    totals[key] = (totals[key] || 0) + value;
  };
  for (const r of runeList) {
    if (r.main) add(r.main.key, r.main.value);
    if (r.innate) add(r.innate.key, r.innate.value);
    for (const s of r.subs) add(s.key, s.value);
  }
  return totals;
}

// Cuenta piezas por set y determina cuántas veces se activa cada uno
// (p.ej. 4 runas Guardia = 2 activaciones de +15% DEF).
function activeSets(runeList) {
  const counts = {};
  for (const r of runeList) {
    if (r.setId == null) continue;
    counts[r.setId] = (counts[r.setId] || 0) + 1;
  }
  const active = {};
  for (const [setId, count] of Object.entries(counts)) {
    const info = SET_INFO[setId];
    if (!info) continue;
    const activations = Math.floor(count / info.pieces);
    if (activations > 0) active[setId] = { count, activations, info };
  }
  return active;
}

// Añade los bonus de set (los que se pueden expresar como stat simple) a un
// objeto de totales ya calculado con aggregateRuneStats. specialPct (Rapidez)
// se devuelve aparte porque no es sumable directamente (ver cabecera).
function applySetBonuses(totals, active) {
  const withSets = { ...totals };
  const special = [];
  for (const { activations, info } of Object.values(active)) {
    if (info.statKey) {
      withSets[info.statKey] = (withSets[info.statKey] || 0) + info.value * activations;
    } else if (info.specialPct) {
      special.push({ key: info.specialPct, value: info.value * activations, setName: info.name });
    }
  }
  return { totals: withSets, special };
}

function* combinations(arr, k) {
  if (k === 0) {
    yield [];
    return;
  }
  if (arr.length < k) return;
  const [first, ...rest] = arr;
  for (const combo of combinations(rest, k - 1)) {
    yield [first, ...combo];
  }
  yield* combinations(rest, k);
}

function buildRequirementPlans(availableSetCounts) {
  // availableSetCounts: [{setId, count, info}], solo sets con al menos
  // `pieces` runas candidatas disponibles en total.
  const feasible = availableSetCounts.filter((s) => s.count >= s.info.pieces);
  // Nos quedamos como mucho con los 8 sets más abundantes para no disparar
  // el número de combinaciones a evaluar.
  feasible.sort((a, b) => b.count - a.count);
  const top = feasible.slice(0, 8);

  const plans = [[]]; // baseline: sin restricción de set

  for (const s of top) {
    plans.push([{ setId: s.setId, count: s.info.pieces }]);
    if (s.info.pieces === 2 && s.count >= 4) {
      plans.push([{ setId: s.setId, count: 4 }]);
    }
  }

  const twoPieceSets = top.filter((s) => s.info.pieces === 2);
  for (const combo of combinations(twoPieceSets, 2)) {
    plans.push(combo.map((s) => ({ setId: s.setId, count: 2 })));
  }
  for (const combo of combinations(twoPieceSets, 3)) {
    plans.push(combo.map((s) => ({ setId: s.setId, count: 2 })));
  }

  return plans;
}

function assignmentsForPlan(requirements) {
  const results = [];
  function helper(reqIdx, remainingPositions, current) {
    if (reqIdx === requirements.length) {
      results.push({ ...current });
      return;
    }
    const { setId, count } = requirements[reqIdx];
    for (const combo of combinations(remainingPositions, count)) {
      const next = { ...current };
      combo.forEach((p) => (next[p] = setId));
      const rest = remainingPositions.filter((p) => !combo.includes(p));
      helper(reqIdx + 1, rest, next);
    }
  }
  helper(0, [1, 2, 3, 4, 5, 6], {});
  return results;
}

function runeScoreForObjective(rune, objectiveKey) {
  let v = 0;
  if (rune.main && rune.main.key === objectiveKey) v += rune.main.value;
  if (rune.innate && rune.innate.key === objectiveKey) v += rune.innate.value;
  for (const s of rune.subs) if (s.key === objectiveKey) v += s.value;
  return v;
}

// candidatesBySlot: { 1: [rune,...], 2: [...], ..., 6: [...] }
// options: { objectiveKey, minConstraints: [{key, min}], maxResults }
function findBestBuilds(candidatesBySlot, options) {
  const { objectiveKey, minConstraints = [], maxResults = 5 } = options;

  const setCounts = {};
  for (let slot = 1; slot <= 6; slot++) {
    for (const r of candidatesBySlot[slot] || []) {
      if (r.setId == null) continue;
      const info = SET_INFO[r.setId];
      if (!info) continue;
      if (!setCounts[r.setId]) setCounts[r.setId] = { setId: r.setId, count: 0, info };
      setCounts[r.setId].count++;
    }
  }
  const plans = buildRequirementPlans(Object.values(setCounts));

  const seenBuilds = new Set();
  const results = [];
  let evaluated = 0;
  const BUDGET = 25000;

  for (const plan of plans) {
    const assignments = assignmentsForPlan(plan);
    for (const assignment of assignments) {
      if (evaluated++ > BUDGET) break;
      const chosen = {};
      let feasible = true;
      for (let slot = 1; slot <= 6; slot++) {
        const requiredSet = assignment[slot];
        const pool = (candidatesBySlot[slot] || []).filter((r) => requiredSet == null || r.setId === requiredSet);
        if (pool.length === 0) {
          feasible = false;
          break;
        }
        let best = pool[0];
        let bestScore = runeScoreForObjective(best, objectiveKey);
        for (const r of pool) {
          const sc = runeScoreForObjective(r, objectiveKey);
          if (sc > bestScore) {
            best = r;
            bestScore = sc;
          }
        }
        chosen[slot] = best;
      }
      if (!feasible) continue;

      const runeList = Object.values(chosen);
      const key = runeList
        .map((r) => r.id)
        .sort()
        .join(',');
      if (seenBuilds.has(key)) continue;
      seenBuilds.add(key);

      const rawTotals = aggregateRuneStats(runeList);
      const active = activeSets(runeList);
      const { totals, special } = applySetBonuses(rawTotals, active);

      let meetsConstraints = true;
      for (const c of minConstraints) {
        if ((totals[c.key] || 0) < c.min) {
          meetsConstraints = false;
          break;
        }
      }
      if (!meetsConstraints) continue;

      results.push({
        runes: chosen,
        totals,
        rawTotals,
        active,
        special,
        score: totals[objectiveKey] || 0,
      });
    }
    if (evaluated > BUDGET) break;
  }

  results.sort((a, b) => b.score - a.score);
  return { builds: results.slice(0, maxResults), truncated: evaluated > BUDGET };
}
