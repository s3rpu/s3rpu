// App de seguimiento de progreso de entrenamiento.
// Todos los datos se guardan en localStorage del navegador.

const STORAGE_KEY = 'progreso.v1';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { entries: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.entries)) return { entries: [] };
    return parsed;
  } catch (e) {
    console.error('No se pudo leer el progreso guardado', e);
    return { entries: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let DATA = loadData();

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function findDay(dayId) {
  return ROUTINE.find((d) => d.id === dayId);
}

function findExercise(dayId, exerciseId) {
  const day = findDay(dayId);
  if (!day || !day.exercises) return null;
  return day.exercises.find((ex) => ex.id === exerciseId);
}

function entriesFor(exerciseId) {
  return DATA.entries
    .filter((e) => e.exerciseId === exerciseId)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));
}

function addEntry(dayId, exerciseId, payload) {
  const entry = {
    id: uid(),
    dayId,
    exerciseId,
    date: payload.date || todayISO(),
    weight: payload.weight === '' ? null : Number(payload.weight),
    reps: payload.reps === '' ? null : Number(payload.reps),
    sets: payload.sets === '' ? null : Number(payload.sets),
    note: payload.note || '',
    createdAt: Date.now(),
  };
  DATA.entries.push(entry);
  saveData(DATA);
  return entry;
}

function deleteEntry(id) {
  DATA.entries = DATA.entries.filter((e) => e.id !== id);
  saveData(DATA);
}

function fmtEntry(e) {
  const parts = [];
  if (e.weight != null) parts.push(`${e.weight} kg`);
  if (e.sets != null || e.reps != null) parts.push(`${e.sets ?? '?'}x${e.reps ?? '?'}`);
  if (e.note) parts.push(`"${e.note}"`);
  return parts.join(' · ') || 'sin datos';
}

function fmtDate(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// ---------- Render: pestañas de navegación ----------

function renderTabs(activeId) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  const tabs = [
    ...ROUTINE.map((d) => ({ id: d.id, label: d.name, sub: d.subtitle })),
    { id: 'progreso', label: 'Progreso', sub: '' },
  ];
  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.id === activeId ? ' active' : '');
    btn.innerHTML = `<span class="tab-main">${t.label}</span>${t.sub ? `<span class="tab-sub">${t.sub}</span>` : ''}`;
    btn.addEventListener('click', () => navigate(t.id));
    nav.appendChild(btn);
  });
}

// ---------- Render: día de entrenamiento ----------

function renderDay(dayId) {
  const day = findDay(dayId);
  const main = document.getElementById('main');
  if (!day) {
    main.innerHTML = '<p>Día no encontrado.</p>';
    return;
  }

  if (day.type === 'rest') {
    main.innerHTML = `
      <div class="rest-card">
        <h2>${day.name} — ${day.subtitle}</h2>
        <p>${day.note}</p>
      </div>`;
    return;
  }

  main.innerHTML = `
    <h2 class="day-title">${day.name} — ${day.subtitle}</h2>
    <div class="exercise-list">
      ${day.exercises.map((ex) => renderExerciseCard(day, ex)).join('')}
    </div>`;

  day.exercises.forEach((ex) => wireExerciseCard(day, ex));
}

function renderExerciseCard(day, ex) {
  const history = entriesFor(ex.id);
  const last = history[0];
  return `
    <div class="card exercise-card" data-exercise="${ex.id}">
      <div class="exercise-header">
        <div>
          <div class="exercise-name">${ex.name}</div>
          <div class="exercise-target">Objetivo: ${ex.target}</div>
        </div>
        <button class="icon-btn history-toggle" data-exercise="${ex.id}" title="Ver historial">Historial</button>
      </div>
      <div class="last-log">${last ? `Último: ${fmtDate(last.date)} · ${fmtEntry(last)}` : 'Sin registros todavía'}</div>
      <form class="log-form" data-exercise="${ex.id}" data-day="${day.id}">
        <input type="date" name="date" value="${todayISO()}" required />
        <input type="number" step="0.5" min="0" name="weight" placeholder="Peso (kg)" />
        <input type="number" min="0" name="sets" placeholder="Series" />
        <input type="number" min="0" name="reps" placeholder="Reps" />
        <input type="text" name="note" placeholder="Nota (opcional)" class="note-input" />
        <button type="submit">Guardar</button>
      </form>
      <div class="history-panel" data-exercise="${ex.id}" hidden></div>
    </div>`;
}

function wireExerciseCard(day, ex) {
  const card = document.querySelector(`.exercise-card[data-exercise="${ex.id}"]`);
  const form = card.querySelector('.log-form');
  form.addEventListener('submit', (evt) => {
    evt.preventDefault();
    const fd = new FormData(form);
    addEntry(day.id, ex.id, {
      date: fd.get('date'),
      weight: fd.get('weight'),
      sets: fd.get('sets'),
      reps: fd.get('reps'),
      note: fd.get('note'),
    });
    renderDay(day.id);
  });

  const toggleBtn = card.querySelector('.history-toggle');
  const panel = card.querySelector('.history-panel');
  toggleBtn.addEventListener('click', () => {
    const hidden = panel.hasAttribute('hidden');
    if (hidden) {
      renderHistoryPanel(panel, ex.id, day.id);
      panel.removeAttribute('hidden');
    } else {
      panel.setAttribute('hidden', '');
    }
  });
}

function renderHistoryPanel(panel, exerciseId, dayId) {
  const history = entriesFor(exerciseId);
  if (history.length === 0) {
    panel.innerHTML = '<p class="empty">Todavía no hay registros para este ejercicio.</p>';
    return;
  }
  panel.innerHTML = `
    <ul class="history-list">
      ${history
        .map(
          (e) => `
        <li>
          <span class="history-date">${fmtDate(e.date)}</span>
          <span class="history-detail">${fmtEntry(e)}</span>
          <button class="delete-btn" data-id="${e.id}" title="Eliminar">✕</button>
        </li>`
        )
        .join('')}
    </ul>`;
  panel.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      deleteEntry(btn.dataset.id);
      renderHistoryPanel(panel, exerciseId, dayId);
      renderDay(dayId);
    });
  });
}

// ---------- Render: pestaña de progreso ----------

function allExercises() {
  return ROUTINE.filter((d) => d.type === 'training').flatMap((d) => d.exercises.map((ex) => ({ ...ex, dayId: d.id, dayName: d.subtitle })));
}

function renderProgreso() {
  const main = document.getElementById('main');
  const entries = DATA.entries;
  const sessionDates = new Set(entries.map((e) => e.date));
  const totalSesiones = sessionDates.size;
  const totalRegistros = entries.length;

  const exercises = allExercises();
  const rows = exercises
    .map((ex) => {
      const hist = entriesFor(ex.id).slice().reverse(); // orden cronológico ascendente
      const withWeight = hist.filter((e) => e.weight != null);
      const first = withWeight[0];
      const last = withWeight[withWeight.length - 1];
      const delta = first && last ? Number((last.weight - first.weight).toFixed(2)) : null;
      return { ex, hist, withWeight, delta, count: hist.length };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);

  main.innerHTML = `
    <h2 class="day-title">Progreso general</h2>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-value">${totalSesiones}</div><div class="stat-label">Días entrenados</div></div>
      <div class="stat-card"><div class="stat-value">${totalRegistros}</div><div class="stat-label">Registros totales</div></div>
      <div class="stat-card"><div class="stat-value">${rows.length}</div><div class="stat-label">Ejercicios con historial</div></div>
    </div>
    ${
      rows.length === 0
        ? '<p class="empty">Todavía no has registrado ningún entrenamiento. ¡Empieza por un día de la rutina!</p>'
        : `<div class="progress-list">${rows.map((r) => renderProgressRow(r)).join('')}</div>`
    }
  `;

  rows.forEach((r) => {
    const canvas = document.getElementById(`spark-${r.ex.id}`);
    if (canvas) drawSparkline(canvas, r.withWeight.map((e) => e.weight));
  });
}

function renderProgressRow(r) {
  const { ex, delta, count } = r;
  const deltaLabel =
    delta == null ? '' : delta > 0 ? `<span class="delta up">+${delta} kg</span>` : delta < 0 ? `<span class="delta down">${delta} kg</span>` : `<span class="delta flat">±0 kg</span>`;
  return `
    <div class="card progress-row">
      <div class="progress-info">
        <div class="exercise-name">${ex.name}</div>
        <div class="exercise-target">${ex.dayName} · ${count} registro${count === 1 ? '' : 's'}</div>
      </div>
      <canvas id="spark-${ex.id}" class="sparkline" width="160" height="40"></canvas>
      ${deltaLabel}
    </div>`;
}

function drawSparkline(canvas, values) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (values.length < 2) {
    ctx.fillStyle = 'rgba(150,150,150,0.6)';
    ctx.font = '11px sans-serif';
    ctx.fillText('Añade más registros para ver la tendencia', 4, h / 2 + 4);
    return;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 4;
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (values.length - 1);
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#4fd1a5';
  ctx.lineWidth = 2;
  ctx.stroke();
  const lastX = pad + (values.length - 1) * stepX;
  const lastY = h - pad - ((values[values.length - 1] - min) / range) * (h - pad * 2);
  ctx.beginPath();
  ctx.arc(lastX, lastY, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#4fd1a5';
  ctx.fill();
}

// ---------- Navegación / export / import ----------

function navigate(id) {
  window.location.hash = id;
  renderTabs(id);
  if (id === 'progreso') renderProgreso();
  else renderDay(id);
}

function exportData() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `progreso-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.entries)) throw new Error('formato inválido');
      DATA = parsed;
      saveData(DATA);
      const current = window.location.hash.replace('#', '') || ROUTINE[0].id;
      navigate(current);
      alert('Datos importados correctamente.');
    } catch (e) {
      alert('No se pudo importar el archivo: ' + e.message);
    }
  };
  reader.readAsText(file);
}

function init() {
  renderTabs(null);
  document.getElementById('export-btn').addEventListener('click', exportData);
  document.getElementById('import-input').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (file) importData(file);
    evt.target.value = '';
  });

  const initial = window.location.hash.replace('#', '') || ROUTINE[0].id;
  navigate(initial);
}

window.addEventListener('DOMContentLoaded', init);
