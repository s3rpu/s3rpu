// Interfaz de la app de runas. Todo vive en localStorage del navegador,
// no hay backend: importas tu JSON de SWEX y a partir de ahí se analiza
// todo en el propio navegador.

const STORAGE_KEY = 'sw-runas.v1';
const NICK_KEY = 'sw-runas.nicknames.v1';

const OBJECTIVES = [
  { key: 'spd', label: 'Velocidad' },
  { key: 'atk_pct', label: 'ATQ %' },
  { key: 'atk_flat', label: 'ATQ plano' },
  { key: 'def_pct', label: 'DEF %' },
  { key: 'def_flat', label: 'DEF plano' },
  { key: 'hp_pct', label: 'HP %' },
  { key: 'hp_flat', label: 'HP plano' },
  { key: 'cri_rate', label: 'Prob. crítico' },
  { key: 'cri_dmg', label: 'Daño crítico' },
  { key: 'res', label: 'Resistencia' },
  { key: 'acc', label: 'Precisión' },
];

let STATE = loadState();
let NICKS = loadNicknames();
let currentMonsterId = null;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.error('No se pudo leer el estado guardado', e);
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE));
}

function loadNicknames() {
  try {
    const raw = localStorage.getItem(NICK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function saveNicknames() {
  localStorage.setItem(NICK_KEY, JSON.stringify(NICKS));
}

function monsterLabel(m) {
  if (NICKS[m.id]) return NICKS[m.id];
  if (m.nameFromExport) return m.nameFromExport;
  return `Monstruo #${m.masterId}`;
}

function runeById(id) {
  return STATE.runes.find((r) => r.id === id);
}

function equippedRunes(monster) {
  return monster.equippedRuneIds.map(runeById).filter(Boolean);
}

function unequippedRunes() {
  return STATE.runes.filter((r) => !r.equippedTo);
}

function fmtNum(n) {
  if (n == null) return '0';
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function pctOrFlat(key, value) {
  const isPct = key.endsWith('_pct') || ['cri_rate', 'cri_dmg', 'res', 'acc'].includes(key);
  return `${fmtNum(value)}${isPct ? '%' : ''}`;
}

// ---------- Import / export ----------

function handleImportFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const result = parseSwexJson(parsed);
      STATE = { ...result, importedAt: Date.now() };
      saveState();
      currentMonsterId = null;
      renderApp();
      const msg = `Importado: ${result.monsters.length} monstruos, ${result.runes.length} runas.` + (result.warnings.length ? `\n\nAvisos:\n- ${result.warnings.slice(0, 5).join('\n- ')}` : '');
      alert(msg);
    } catch (e) {
      alert('No se pudo importar el archivo: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function exportState() {
  if (!STATE) return;
  const blob = new Blob([JSON.stringify(STATE, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sw-runas-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- Navegación / tabs ----------

function renderTabs(activeId) {
  const nav = document.getElementById('tabs');
  const tabs = [
    { id: 'monstruos', label: 'Monstruos' },
    { id: 'runas', label: 'Runas' },
    { id: 'ayuda', label: 'Ayuda' },
  ];
  nav.innerHTML = '';
  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.id === activeId ? ' active' : '');
    btn.innerHTML = `<span class="tab-main">${t.label}</span>`;
    btn.addEventListener('click', () => navigate(t.id));
    nav.appendChild(btn);
  });
}

function navigate(id) {
  window.location.hash = id;
  renderTabs(id);
  if (id === 'runas') renderRunasTab();
  else if (id === 'ayuda') renderAyudaTab();
  else renderMonstruosTab();
}

function renderApp() {
  const current = window.location.hash.replace('#', '') || 'monstruos';
  navigate(current);
}

// ---------- Tab: sin datos importados ----------

function renderEmptyState(main) {
  main.innerHTML = `
    <div class="card">
      <h2 class="day-title">Todavía no has importado datos</h2>
      <p>Para usar la app necesitas exportar tu cuenta con
        <a href="https://github.com/Xzandro/sw-exporter/releases/latest" target="_blank" rel="noopener">SWEX (SW Exporter)</a>,
        que funciona también con la versión de Steam. Mira la pestaña <strong>Ayuda</strong> para el paso a paso.</p>
      <p>Cuando tengas el archivo <code>.json</code>, pulsa "Importar" arriba.</p>
    </div>`;
}

// ---------- Tab: Monstruos ----------

function renderMonstruosTab() {
  const main = document.getElementById('main');
  if (!STATE) {
    renderEmptyState(main);
    return;
  }
  main.innerHTML = `
    <div class="toolbar">
      <input type="text" id="monster-search" placeholder="Buscar monstruo (nombre o ID)..." class="text-input" />
    </div>
    <div id="monster-list" class="monster-grid"></div>
  `;
  const search = document.getElementById('monster-search');
  const list = document.getElementById('monster-list');

  function draw() {
    const q = search.value.trim().toLowerCase();
    const monsters = STATE.monsters
      .filter((m) => !q || monsterLabel(m).toLowerCase().includes(q) || String(m.masterId).includes(q))
      .sort((a, b) => monsterLabel(a).localeCompare(monsterLabel(b)));

    if (monsters.length === 0) {
      list.innerHTML = '<p class="empty">No hay monstruos que coincidan.</p>';
      return;
    }

    list.innerHTML = monsters
      .map((m) => {
        const runes = equippedRunes(m);
        const avgEff = runes.length ? runes.reduce((s, r) => s + runeEfficiency(r), 0) / runes.length : 0;
        return `
        <div class="card monster-card" data-id="${m.id}">
          <div class="monster-card-name">${monsterLabel(m)}</div>
          <div class="monster-card-meta">Nv. ${m.level ?? '?'} · ${runes.length}/6 runas${runes.length ? ` · ${avgEff.toFixed(0)}% ef. media` : ''}</div>
        </div>`;
      })
      .join('');

    list.querySelectorAll('.monster-card').forEach((el) => {
      el.addEventListener('click', () => {
        currentMonsterId = Number(el.dataset.id);
        renderMonsterDetail();
      });
    });
  }

  search.addEventListener('input', draw);
  draw();
}

// ---------- Detalle de monstruo + optimizador ----------

function renderMonsterDetail() {
  const main = document.getElementById('main');
  const monster = STATE.monsters.find((m) => m.id === currentMonsterId);
  if (!monster) {
    renderMonstruosTab();
    return;
  }

  const runes = equippedRunes(monster);
  const rawTotals = aggregateRuneStats(runes);
  const active = activeSets(runes);
  const { totals, special } = applySetBonuses(rawTotals, active);

  main.innerHTML = `
    <button class="icon-btn back-btn" id="back-btn">&larr; Monstruos</button>
    <div class="card">
      <div class="monster-detail-header">
        <input type="text" id="nickname-input" class="text-input" value="${monsterLabel(monster).replace(/"/g, '&quot;')}" placeholder="Ponle un nombre..." />
        <span class="text-dim-small">ID interno #${monster.masterId} · Nv. ${monster.level ?? '?'}</span>
      </div>
      <div class="slot-grid">
        ${[1, 2, 3, 4, 5, 6].map((slot) => renderSlotCard(slot, runes.find((r) => r.slot === slot))).join('')}
      </div>
      <h3 class="section-title">Sets activos</h3>
      ${renderActiveSets(active, special)}
      <h3 class="section-title">Stats aportadas por las runas (no incluye stats base del monstruo)</h3>
      ${renderTotalsTable(totals)}
    </div>

    <div class="card">
      <h2 class="day-title">Buscar la mejor combinación</h2>
      <p class="text-dim-small">Busca en tus runas sin equipar + las que ya lleva este monstruo (no le quita runas a otros monstruos) la combinación que maximice la stat elegida.</p>
      <div class="optimizer-form">
        <label>Maximizar
          <select id="objective-select">
            ${OBJECTIVES.map((o) => `<option value="${o.key}">${o.label}</option>`).join('')}
          </select>
        </label>
        <label>Velocidad mínima (opcional)
          <input type="number" id="min-spd-input" class="text-input" min="0" placeholder="p.ej. 200" />
        </label>
        <button id="search-btn" class="icon-btn primary">Buscar combinación</button>
      </div>
      <div id="optimizer-results"></div>
    </div>
  `;

  document.getElementById('back-btn').addEventListener('click', () => navigate('monstruos'));
  document.getElementById('nickname-input').addEventListener('change', (e) => {
    const val = e.target.value.trim();
    if (val) NICKS[monster.id] = val;
    else delete NICKS[monster.id];
    saveNicknames();
  });
  document.getElementById('search-btn').addEventListener('click', () => runOptimizer(monster));
}

function renderSlotCard(slot, rune) {
  if (!rune) {
    return `<div class="rune-slot empty-slot"><div class="rune-slot-num">Ranura ${slot}</div><div class="empty">Vacía</div></div>`;
  }
  const eff = runeEfficiency(rune);
  return `
    <div class="rune-slot">
      <div class="rune-slot-num">Ranura ${slot} · ${rune.setName}</div>
      <div class="rune-main">${rune.main ? `${rune.main.label} ${pctOrFlat(rune.main.key, rune.main.value)}` : '?'}</div>
      <div class="rune-subs">
        ${rune.subs.map((s) => `<span class="sub-chip">${s.label} +${pctOrFlat(s.key, s.value)}${s.enchanted ? ' ✦' : ''}</span>`).join('')}
      </div>
      <div class="rune-eff">Eficiencia ~${eff}% · +${rune.upgrade}</div>
    </div>`;
}

function renderActiveSets(active, special) {
  const entries = Object.values(active);
  if (entries.length === 0 && special.length === 0) return '<p class="empty">Ningún set activo todavía.</p>';
  return `<div class="badge-row">
    ${entries.map((e) => `<span class="set-badge">${e.info.name} (${e.count}) ${e.activations > 1 ? `×${e.activations}` : ''}</span>`).join('')}
    ${special.map((s) => `<span class="set-badge special">${s.setName}: +${s.value}% ${statLabel(s.key)} (sobre el total, no en la tabla de abajo)</span>`).join('')}
  </div>`;
}

function renderTotalsTable(totals) {
  const keys = Object.keys(totals);
  if (keys.length === 0) return '<p class="empty">Sin runas equipadas.</p>';
  return `<div class="totals-grid">
    ${keys
      .map((k) => `<div class="total-chip"><span class="total-label">${statLabel(k)}</span><span class="total-value">${pctOrFlat(k, totals[k])}</span></div>`)
      .join('')}
  </div>`;
}

function runOptimizer(monster) {
  const objectiveKey = document.getElementById('objective-select').value;
  const minSpdVal = Number(document.getElementById('min-spd-input').value) || 0;

  const pool = [...unequippedRunes(), ...equippedRunes(monster)];
  const candidatesBySlot = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const r of pool) {
    if (r.slot >= 1 && r.slot <= 6) candidatesBySlot[r.slot].push(r);
  }

  const minConstraints = minSpdVal > 0 ? [{ key: 'spd', min: minSpdVal }] : [];
  const { builds, truncated } = findBestBuilds(candidatesBySlot, { objectiveKey, minConstraints, maxResults: 5 });

  const box = document.getElementById('optimizer-results');
  if (builds.length === 0) {
    box.innerHTML = '<p class="empty">No se ha encontrado ninguna combinación que cumpla los requisitos con tu inventario actual.</p>';
    return;
  }

  box.innerHTML =
    (truncated ? '<p class="text-dim-small">Búsqueda muy grande: se ha limitado el número de combinaciones evaluadas, puede que exista una combinación aún mejor.</p>' : '') +
    builds
      .map((b, i) => {
        const currentIds = new Set(monster.equippedRuneIds);
        const chosenList = Object.entries(b.runes);
        const changes = chosenList.filter(([slot, r]) => !currentIds.has(r.id)).length;
        return `
        <div class="card build-card">
          <div class="build-header">
            <strong>#${i + 1} · ${statLabel(objectiveKey)}: ${pctOrFlat(objectiveKey, b.score)}</strong>
            <span class="text-dim-small">${changes === 0 ? 'Es tu combinación actual' : `${changes} runa(s) distinta(s) de las que lleva ahora`}</span>
          </div>
          <div class="slot-grid compact">
            ${chosenList
              .map(([slot, r]) => {
                const isCurrent = currentIds.has(r.id);
                const isUnowned = false;
                return `<div class="rune-slot small ${isCurrent ? 'same' : 'new'}">
                  <div class="rune-slot-num">R${slot} · ${r.setName}</div>
                  <div class="rune-main">${r.main ? `${r.main.label} ${pctOrFlat(r.main.key, r.main.value)}` : '?'}</div>
                  <div class="rune-eff">${isCurrent ? 'ya la lleva' : 'mover aquí'} · #${r.id}</div>
                </div>`;
              })
              .join('')}
          </div>
          ${renderActiveSets(b.active, b.special)}
        </div>`;
      })
      .join('');
}

// ---------- Tab: Runas (inventario) ----------

function renderRunasTab() {
  const main = document.getElementById('main');
  if (!STATE) {
    renderEmptyState(main);
    return;
  }
  main.innerHTML = `
    <div class="toolbar">
      <select id="filter-slot" class="text-input">
        <option value="">Todas las ranuras</option>
        ${[1, 2, 3, 4, 5, 6].map((s) => `<option value="${s}">Ranura ${s}</option>`).join('')}
      </select>
      <select id="filter-set" class="text-input">
        <option value="">Todos los sets</option>
        ${Object.entries(SET_INFO)
          .map(([id, info]) => `<option value="${id}">${info.name}</option>`)
          .join('')}
      </select>
      <select id="filter-equipped" class="text-input">
        <option value="">Equipadas y sin equipar</option>
        <option value="equipped">Solo equipadas</option>
        <option value="free">Solo sin equipar</option>
      </select>
    </div>
    <div id="rune-list" class="rune-table"></div>
  `;

  const filterSlot = document.getElementById('filter-slot');
  const filterSet = document.getElementById('filter-set');
  const filterEquipped = document.getElementById('filter-equipped');
  const list = document.getElementById('rune-list');

  function draw() {
    let runes = [...STATE.runes];
    if (filterSlot.value) runes = runes.filter((r) => String(r.slot) === filterSlot.value);
    if (filterSet.value) runes = runes.filter((r) => String(r.setId) === filterSet.value);
    if (filterEquipped.value === 'equipped') runes = runes.filter((r) => r.equippedTo);
    if (filterEquipped.value === 'free') runes = runes.filter((r) => !r.equippedTo);
    runes.sort((a, b) => runeEfficiency(b) - runeEfficiency(a));

    if (runes.length === 0) {
      list.innerHTML = '<p class="empty">No hay runas que coincidan con el filtro.</p>';
      return;
    }

    list.innerHTML = runes
      .map((r) => {
        const owner = r.equippedTo ? STATE.monsters.find((m) => m.id === r.equippedTo) : null;
        return `
        <div class="rune-slot list-row">
          <div class="rune-slot-num">R${r.slot} · ${r.setName} · ${r.quality}${r.ancient ? ' · Ancestral' : ''}</div>
          <div class="rune-main">${r.main ? `${r.main.label} ${pctOrFlat(r.main.key, r.main.value)}` : '?'} · +${r.upgrade}</div>
          <div class="rune-subs">${r.subs.map((s) => `<span class="sub-chip">${s.label} +${pctOrFlat(s.key, s.value)}${s.enchanted ? ' ✦' : ''}</span>`).join('')}</div>
          <div class="rune-eff">Eficiencia ~${runeEfficiency(r)}% · ${owner ? `en ${monsterLabel(owner)}` : 'sin equipar'}</div>
        </div>`;
      })
      .join('');
  }

  [filterSlot, filterSet, filterEquipped].forEach((el) => el.addEventListener('change', draw));
  draw();
}

// ---------- Tab: Ayuda ----------

function renderAyudaTab() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="card">
      <h2 class="day-title">¿Cómo consigo el JSON?</h2>
      <ol>
        <li>Descarga <a href="https://github.com/Xzandro/sw-exporter/releases/latest" target="_blank" rel="noopener">SWEX (SW Exporter)</a>, la versión portable no necesita instalación.</li>
        <li>Ábrelo e instala su certificado la primera vez (te lo pide él solo).</li>
        <li>Con SWEX abierto, arranca Summoners War (Steam funciona) e inicia sesión.</li>
        <li>Al cargar tu cuenta, SWEX capturará tus monstruos y runas y generará un archivo <code>.json</code> en su carpeta de exports.</li>
        <li>Importa ese archivo aquí con el botón "Importar" de arriba.</li>
      </ol>
      <h2 class="day-title">Qué hace esta app</h2>
      <ul>
        <li>Lee tus monstruos y runas del JSON, calcula la eficiencia de cada runa y qué sets tienes activos.</li>
        <li>Para un monstruo, busca en tus runas sin equipar (+ las que ya lleva) la combinación que más maximiza la stat que elijas, respetando sets de 2/4 piezas.</li>
        <li>No mueve nada en el juego: te dice qué runa (por ranura y set) poner en cada sitio para que lo hagas tú a mano.</li>
      </ul>
      <h2 class="day-title">Limitaciones importantes</h2>
      <ul>
        <li>El JSON no incluye las stats base del monstruo sin runas, así que las cifras mostradas son "lo que aportan las runas", no la stat final que verás en el juego. Sirve perfectamente para comparar combinaciones entre sí.</li>
        <li>Los nombres de los monstruos no vienen en el export, así que se muestran por su ID interno; puedes ponerles un nombre en su ficha y se recuerda en este navegador.</li>
        <li>Los porcentajes de los sets y la fórmula de eficiencia están tomados de guías de la comunidad, pueden no coincidir al 100% con el juego actual.</li>
        <li>No hay ninguna recomendación de "meta" por mazmorra: eso cambia constantemente y no se genera dentro de esta app, solo optimiza con tus propias runas.</li>
      </ul>
    </div>`;
}

// ---------- Init ----------

function init() {
  document.getElementById('export-btn').addEventListener('click', exportState);
  document.getElementById('import-input').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (file) handleImportFile(file);
    evt.target.value = '';
  });
  renderApp();
}

window.addEventListener('DOMContentLoaded', init);
