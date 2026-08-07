// Importador del JSON exportado con SWEX (https://github.com/Xzandro/sw-exporter),
// tanto en su formato "crudo" (respuesta de la API del juego) como en el
// formato simplificado "optimizer.json" que usan varias herramientas de
// optimización de runas. Ambos comparten la forma de los objetos de runa y
// de monstruo, así que en vez de asumir una única estructura de nivel
// superior, recorremos el JSON buscando arrays que "parezcan" de runas o de
// monstruos. Esto hace el importador más tolerante a pequeñas diferencias
// entre versiones/herramientas de exportación.

function looksLikeRune(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && 'set_id' in x && ('rune_id' in x || 'slot_no' in x) && 'pri_eff' in x;
}

function looksLikeUnit(x) {
  return x && typeof x === 'object' && !Array.isArray(x) && 'unit_master_id' in x && 'unit_id' in x;
}

// Recorre el árbol de objeto/array buscando arrays no vacíos cuyo primer
// elemento cumpla `predicate`. Devuelve la lista de arrays encontrados
// (puede haber varios: p.ej. runas equipadas dentro de cada unidad + el
// inventario de runas sin equipar en otra parte del JSON).
function findArrays(node, predicate, out, seen) {
  if (!node || typeof node !== 'object') return out;
  if (seen.has(node)) return out;
  seen.add(node);

  if (Array.isArray(node)) {
    if (node.length > 0 && predicate(node[0])) {
      out.push(node);
      return out; // no hace falta bajar más en este array
    }
    for (const item of node) findArrays(item, predicate, out, seen);
    return out;
  }

  for (const key of Object.keys(node)) {
    findArrays(node[key], predicate, out, seen);
  }
  return out;
}

function dedupeById(items, idKey) {
  const map = new Map();
  for (const it of items) {
    if (it && it[idKey] != null) map.set(it[idKey], it);
  }
  return [...map.values()];
}

function normalizeStatPair(pair) {
  if (!Array.isArray(pair)) return null;
  const [type, value] = pair;
  const info = STAT_TYPES[type];
  if (!info || !value) return null;
  return { key: info.key, label: info.label, value };
}

function normalizeRune(r) {
  const main = normalizeStatPair(r.pri_eff);
  const innate = r.prefix_eff && r.prefix_eff[0] ? normalizeStatPair(r.prefix_eff) : null;
  const subs = Array.isArray(r.sec_eff)
    ? r.sec_eff
        .map((line) => {
          if (!Array.isArray(line) || !line[0]) return null;
          const info = STAT_TYPES[line[0]];
          if (!info) return null;
          const base = Number(line[1]) || 0;
          const grind = Number(line[3]) || 0;
          const enchanted = !!line[2];
          return { key: info.key, label: info.label, value: base + grind, enchanted };
        })
        .filter(Boolean)
    : [];

  const setInfo = SET_INFO[r.set_id];
  const qualityBySubCount = ['Normal', 'Mágica', 'Rara', 'Heroica', 'Legendaria'][subs.length] || 'Normal';

  return {
    id: r.rune_id ?? r.id ?? null,
    slot: r.slot_no ?? null,
    setId: r.set_id ?? null,
    setName: setInfo ? setInfo.name : `Set #${r.set_id}`,
    upgrade: r.upgrade_curr ?? 0,
    gradeRaw: r.rank ?? r.class ?? null, // cosmético, ambiguo según la fuente
    ancient: !!r.extra,
    quality: qualityBySubCount,
    main,
    innate,
    subs,
    equippedTo: r.occupied_id ? r.occupied_id : null,
    raw: r,
  };
}

function normalizeUnit(u) {
  return {
    id: u.unit_id,
    masterId: u.unit_master_id,
    level: u.unit_level ?? u.level ?? null,
    stars: u.class ?? u.star ?? null, // cosmético, ambiguo
    nameFromExport: u.unit_name || u.name || null,
    equippedRuneIds: [],
    raw: u,
  };
}

// Resultado: { monsters: [...], runes: [...], warnings: [...] }
function parseSwexJson(obj) {
  const seen = new Set();
  const runeArrays = findArrays(obj, looksLikeRune, [], seen);
  const seen2 = new Set();
  const unitArrays = findArrays(obj, looksLikeUnit, [], seen2);

  const warnings = [];

  if (runeArrays.length === 0 && unitArrays.length === 0) {
    const topKeys = obj && typeof obj === 'object' ? Object.keys(obj) : [];
    const err = new Error(
      `No se ha encontrado ninguna runa ni monstruo reconocible en el archivo. ` +
        `Claves de nivel superior encontradas: ${topKeys.join(', ') || '(ninguna)'}. ` +
        `Comprueba que es un export de SWEX (JSON completo o "optimizer.json").`
    );
    err.topKeys = topKeys;
    throw err;
  }

  const rawRunes = dedupeById(runeArrays.flat(), 'rune_id');
  const rawUnits = dedupeById(unitArrays.flat(), 'unit_id');

  // Algunos exports embeben las runas equipadas dentro de cada unidad
  // (unit.runes) sin que aparezcan también en el array raíz de runas.
  for (const u of rawUnits) {
    if (Array.isArray(u.runes)) {
      for (const r of u.runes) {
        if (looksLikeRune(r) && !rawRunes.find((x) => x.rune_id === r.rune_id)) {
          if (!r.occupied_id) r.occupied_id = u.unit_id;
          rawRunes.push(r);
        }
      }
    }
  }

  const monsters = rawUnits.map(normalizeUnit);
  const monsterById = new Map(monsters.map((m) => [m.id, m]));

  const runes = rawRunes.map(normalizeRune);
  for (const r of runes) {
    if (r.equippedTo && monsterById.has(r.equippedTo)) {
      monsterById.get(r.equippedTo).equippedRuneIds.push(r.id);
    } else if (r.equippedTo) {
      warnings.push(`La runa #${r.id} está equipada en un monstruo (#${r.equippedTo}) que no aparece en el listado importado.`);
    }
  }

  if (monsters.length === 0) warnings.push('No se han encontrado monstruos en el archivo, solo runas.');
  if (runes.length === 0) warnings.push('No se han encontrado runas en el archivo, solo monstruos.');

  return { monsters, runes, warnings };
}
