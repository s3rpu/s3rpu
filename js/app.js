// Lógica de interfaz: pestañas, búsqueda, listados, formularios e import/export.

let searchQuery = '';

function escapeHtml(str) {
  return (str || '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function showToast(html, variant = '') {
  const stack = document.getElementById('toast-stack');
  const toast = document.createElement('div');
  toast.className = 'toast' + (variant ? ` toast-${variant}` : '');
  toast.innerHTML = html;
  stack.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

// ---------- Navegación ----------

function currentRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('listas/')) return { tab: 'listas', listId: hash.slice('listas/'.length) };
  if (hash === 'listas') return { tab: 'listas', listId: null };
  return { tab: 'buscar', listId: null };
}

function navigate(hash) {
  window.location.hash = hash;
  renderCurrentTab();
}

function renderCurrentTab() {
  const route = currentRoute();
  renderTabs(route.tab);
  if (route.tab === 'listas') {
    if (route.listId) renderListDetail(route.listId);
    else renderListas();
  } else {
    renderBuscar();
  }
}

function renderTabs(activeTab) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  const tabs = [
    { id: 'buscar', label: 'Buscar' },
    { id: 'listas', label: 'Listados' },
  ];
  tabs.forEach((t) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (t.id === activeTab ? ' active' : '');
    btn.innerHTML = `<span class="tab-main">${t.label}</span>`;
    btn.addEventListener('click', () => navigate(t.id));
    nav.appendChild(btn);
  });
}

// ---------- Pestaña Buscar ----------

function renderBuscar() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="search-bar">
      <input type="search" id="search-input" placeholder="Buscar por nombre, cargo, teléfono, email…" />
      <button id="new-contact-btn" class="primary-btn">+ Nuevo contacto</button>
    </div>
    <div id="search-meta" class="section-title"></div>
    <div id="results-list" class="contact-list"></div>
  `;
  const input = document.getElementById('search-input');
  input.value = searchQuery;
  input.addEventListener('input', () => {
    searchQuery = input.value;
    renderResultsList();
  });
  document.getElementById('new-contact-btn').addEventListener('click', () => openContactModal(null));
  renderResultsList();
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

function renderResultsList() {
  const meta = document.getElementById('search-meta');
  const listEl = document.getElementById('results-list');
  const matches = searchContacts(searchQuery);
  meta.textContent =
    DATA.contacts.length === 0
      ? 'Todavía no hay contactos. Importa un Excel/CSV o crea uno nuevo.'
      : `${matches.length} contacto${matches.length === 1 ? '' : 's'} de ${DATA.contacts.length}`;
  listEl.innerHTML = matches.length === 0 ? '<p class="empty">Sin resultados.</p>' : matches.map((c) => contactCardHtml(c, 'search')).join('');
  wireContactCards(listEl, 'search', null);
}

// ---------- Tarjetas de contacto (reutilizadas en Buscar y en Listados) ----------

function contactFieldsHtml(contact) {
  const f = contact.fields || {};
  return DATA.fields
    .filter((field) => field.key !== 'nombre' && field.key !== 'apellidos')
    .map((field) => (f[field.key] ? `<div class="contact-field"><span class="field-label">${escapeHtml(field.label)}:</span> ${escapeHtml(f[field.key])}</div>` : ''))
    .join('');
}

function contactCardHtml(c, context) {
  const name = escapeHtml(contactDisplayName(c));
  return `
    <div class="card contact-card" data-id="${c.id}">
      <div class="contact-main">
        <div class="contact-name">${name}</div>
        <div class="contact-fields">${contactFieldsHtml(c)}</div>
      </div>
      <div class="contact-actions">
        <button class="icon-btn" data-action="edit">Editar</button>
        ${context === 'list' ? '<button class="icon-btn" data-action="remove">Quitar de la lista</button>' : '<button class="icon-btn" data-action="addlist">Añadir a…</button>'}
        <button class="delete-btn" data-action="delete" title="Borrar contacto">✕ Borrar</button>
      </div>
    </div>`;
}

function wireContactCards(container, context, listId) {
  container.querySelectorAll('.contact-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openContactModal(getContact(id)));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => {
      const c = getContact(id);
      if (confirm(`¿Borrar el contacto "${contactDisplayName(c)}"? Esta acción no se puede deshacer.`)) {
        deleteContact(id);
        showToast('Contacto borrado.');
        renderCurrentTab();
      }
    });
    const addBtn = card.querySelector('[data-action="addlist"]');
    if (addBtn) addBtn.addEventListener('click', () => toggleAddToListPanel(card, id));
    const removeBtn = card.querySelector('[data-action="remove"]');
    if (removeBtn)
      removeBtn.addEventListener('click', () => {
        removeContactFromList(listId, id);
        showToast('Quitado del listado.');
        renderListContactsList(listId);
      });
  });
}

function toggleAddToListPanel(card, contactId) {
  const existing = card.querySelector('.addlist-panel');
  if (existing) {
    existing.remove();
    return;
  }
  const panel = document.createElement('div');
  panel.className = 'addlist-panel';
  renderAddToListPanel(panel, contactId);
  card.appendChild(panel);
}

function renderAddToListPanel(panel, contactId) {
  panel.innerHTML = `
    ${
      DATA.lists.length === 0
        ? '<div class="empty">Todavía no hay listados.</div>'
        : DATA.lists
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'es'))
            .map((l) => `<button class="addlist-option" data-list="${l.id}">${l.contactIds.includes(contactId) ? '✓ ' : ''}${escapeHtml(l.name)}</button>`)
            .join('')
    }
    <div class="addlist-new">
      <input type="text" placeholder="Nuevo listado…" class="addlist-input" />
      <button class="addlist-create">Crear y añadir</button>
    </div>
  `;
  panel.querySelectorAll('.addlist-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      const listId = btn.dataset.list;
      const list = DATA.lists.find((l) => l.id === listId);
      if (list.contactIds.includes(contactId)) {
        removeContactFromList(listId, contactId);
        showToast(`Quitado de "${list.name}".`);
      } else {
        addContactToList(listId, contactId);
        showToast(`Añadido a "${list.name}".`);
      }
      renderAddToListPanel(panel, contactId);
    });
  });
  panel.querySelector('.addlist-create').addEventListener('click', () => {
    const input = panel.querySelector('.addlist-input');
    const name = input.value.trim();
    if (!name) return;
    const list = createList(name);
    addContactToList(list.id, contactId);
    showToast(`Listado "${list.name}" creado y contacto añadido.`);
    renderAddToListPanel(panel, contactId);
  });
}

// ---------- Formulario de contacto (nuevo / editar) ----------

function contactFieldRowHtml(field, value) {
  return `
    <label class="field-row">
      <span class="field-row-label">${escapeHtml(field.label)}</span>
      <input type="text" name="${field.key}" value="${escapeHtml(value)}" />
    </label>`;
}

function openContactModal(contact) {
  const overlay = document.getElementById('modal-overlay');
  const isEdit = !!contact;
  const values = contact ? contact.fields : {};
  overlay.innerHTML = `
    <div class="modal card">
      <h3>${isEdit ? 'Editar contacto' : 'Nuevo contacto'}</h3>
      <form id="contact-form" class="contact-form">
        <div id="contact-fields-wrap">
          ${DATA.fields.map((field) => contactFieldRowHtml(field, values[field.key] || '')).join('')}
        </div>
        <button type="button" id="add-field-btn" class="icon-btn">+ Añadir campo</button>
        <div class="modal-actions">
          <button type="button" id="cancel-btn" class="icon-btn">Cancelar</button>
          <button type="submit" class="primary-btn">Guardar</button>
        </div>
      </form>
    </div>`;
  overlay.hidden = false;

  document.getElementById('add-field-btn').addEventListener('click', () => {
    const label = prompt('Nombre del nuevo campo (ej. "Fax", "Horario"):');
    if (!label || !label.trim()) return;
    const field = ensureField(label);
    document.getElementById('contact-fields-wrap').insertAdjacentHTML('beforeend', contactFieldRowHtml(field, ''));
  });

  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal();
  });

  document.getElementById('contact-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const fieldsObj = {};
    DATA.fields.forEach((field) => {
      const v = (fd.get(field.key) || '').toString().trim();
      if (v) fieldsObj[field.key] = v;
    });
    if (isEdit) {
      updateContact(contact.id, fieldsObj);
      showToast('Contacto actualizado.');
    } else {
      createContact(fieldsObj);
      showToast('Contacto creado.');
    }
    closeModal();
    renderCurrentTab();
  });
}

function closeModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  overlay.innerHTML = '';
}

// ---------- Pestaña Listados ----------

function renderListas() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="search-bar">
      <button id="new-list-btn" class="primary-btn">+ Nuevo listado</button>
    </div>
    <div id="lists-grid" class="lists-grid"></div>
  `;
  document.getElementById('new-list-btn').addEventListener('click', () => {
    const name = prompt('Nombre del nuevo listado (ej. "Navidad 2026", "Colegios"):');
    if (!name || !name.trim()) return;
    const list = createList(name);
    navigate(`listas/${list.id}`);
  });
  renderListsGrid();
}

function renderListsGrid() {
  const grid = document.getElementById('lists-grid');
  if (DATA.lists.length === 0) {
    grid.innerHTML = '<p class="empty">Todavía no has creado ningún listado. Crea uno para agrupar contactos y reutilizarlo año tras año.</p>';
    return;
  }
  grid.innerHTML = DATA.lists
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    .map(
      (l) => `
      <div class="card list-card" data-id="${l.id}">
        <div class="list-card-name">${escapeHtml(l.name)}</div>
        <div class="list-card-count">${l.contactIds.length} contacto${l.contactIds.length === 1 ? '' : 's'}</div>
        <div class="list-card-actions">
          <button class="icon-btn" data-action="ver">Ver</button>
          <button class="icon-btn" data-action="renombrar">Renombrar</button>
          <button class="delete-btn" data-action="borrar">✕ Borrar</button>
        </div>
      </div>`
    )
    .join('');
  grid.querySelectorAll('.list-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="ver"]').addEventListener('click', () => navigate(`listas/${id}`));
    card.querySelector('[data-action="renombrar"]').addEventListener('click', () => {
      const list = DATA.lists.find((l) => l.id === id);
      const name = prompt('Nuevo nombre del listado:', list.name);
      if (!name || !name.trim()) return;
      renameList(id, name);
      renderListsGrid();
    });
    card.querySelector('[data-action="borrar"]').addEventListener('click', () => {
      const list = DATA.lists.find((l) => l.id === id);
      if (confirm(`¿Borrar el listado "${list.name}"? Los contactos no se eliminarán del directorio.`)) {
        deleteList(id);
        renderListsGrid();
      }
    });
  });
}

function renderListDetail(listId) {
  const list = DATA.lists.find((l) => l.id === listId);
  const main = document.getElementById('main');
  if (!list) {
    main.innerHTML = '<p class="empty">Listado no encontrado.</p>';
    return;
  }
  main.innerHTML = `
    <div class="list-detail-header">
      <button id="back-btn" class="icon-btn">← Listados</button>
      <h2 class="day-title">${escapeHtml(list.name)}</h2>
    </div>
    <div class="search-bar">
      <button id="add-contacts-btn" class="primary-btn">+ Añadir contactos</button>
    </div>
    <div id="list-contacts" class="contact-list"></div>
  `;
  document.getElementById('back-btn').addEventListener('click', () => navigate('listas'));
  document.getElementById('add-contacts-btn').addEventListener('click', () => openAddToListModal(listId));
  renderListContactsList(listId);
}

function renderListContactsList(listId) {
  const el = document.getElementById('list-contacts');
  const contacts = listContacts(listId);
  el.innerHTML =
    contacts.length === 0 ? '<p class="empty">Este listado todavía no tiene contactos. Usa "+ Añadir contactos".</p>' : contacts.map((c) => contactCardHtml(c, 'list')).join('');
  wireContactCards(el, 'list', listId);
}

function openAddToListModal(listId) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal card">
      <h3>Añadir contactos al listado</h3>
      <input type="search" id="add-search-input" placeholder="Buscar contacto…" class="modal-search" />
      <div id="add-search-meta" class="section-title"></div>
      <div id="add-search-results" class="contact-list compact"></div>
      <div class="modal-actions">
        <button type="button" id="close-add-modal" class="primary-btn">Hecho</button>
      </div>
    </div>`;
  overlay.hidden = false;
  const RESULT_LIMIT = 200;

  function renderResults(query) {
    const all = searchContacts(query);
    const matches = all.slice(0, RESULT_LIMIT);
    const meta = document.getElementById('add-search-meta');
    meta.textContent = all.length > RESULT_LIMIT ? `Mostrando ${RESULT_LIMIT} de ${all.length} resultados. Afina la búsqueda para ver más.` : `${all.length} resultado${all.length === 1 ? '' : 's'}`;
    const resultsEl = document.getElementById('add-search-results');
    const list = DATA.lists.find((l) => l.id === listId);
    resultsEl.innerHTML = matches.length
      ? matches
          .map(
            (c) => `
        <div class="card contact-card compact" data-id="${c.id}">
          <div class="contact-name">${escapeHtml(contactDisplayName(c))}</div>
          <button class="icon-btn toggle-add-btn" data-id="${c.id}">${list.contactIds.includes(c.id) ? '✓ En el listado' : 'Añadir'}</button>
        </div>`
          )
          .join('')
      : '<p class="empty">Sin resultados.</p>';
    resultsEl.querySelectorAll('.toggle-add-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.id;
        if (list.contactIds.includes(cid)) removeContactFromList(listId, cid);
        else addContactToList(listId, cid);
        renderResults(document.getElementById('add-search-input').value);
      });
    });
  }

  renderResults('');
  document.getElementById('add-search-input').addEventListener('input', (e) => renderResults(e.target.value));
  document.getElementById('close-add-modal').addEventListener('click', () => {
    closeModal();
    renderCurrentTab();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
      renderCurrentTab();
    }
  });
}

// ---------- Importar Excel/CSV ----------

function handleExcelImport(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = new Uint8Array(reader.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (rows.length < 2) throw new Error('el archivo no tiene filas de datos');
      const [header, ...dataRows] = rows;
      const count = importRows(header, dataRows);
      renderCurrentTab();
      showToast(`✅ Se importaron ${count} contactos.`);
    } catch (e) {
      alert('No se pudo importar el archivo: ' + e.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- Backup completo (JSON) ----------

function exportBackup() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `contactos-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed.contacts)) throw new Error('formato inválido');
      if (!Array.isArray(parsed.lists)) parsed.lists = [];
      if (!Array.isArray(parsed.fields) || parsed.fields.length === 0) parsed.fields = DEFAULT_FIELDS.slice();
      DATA = parsed;
      saveData(DATA);
      renderCurrentTab();
      showToast('✅ Copia de seguridad restaurada.');
    } catch (e) {
      alert('No se pudo importar el archivo: ' + e.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Inicio ----------

function init() {
  document.getElementById('export-btn').addEventListener('click', exportBackup);
  document.getElementById('import-input').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (file) importBackup(file);
    evt.target.value = '';
  });
  document.getElementById('excel-input').addEventListener('change', (evt) => {
    const file = evt.target.files[0];
    if (file) handleExcelImport(file);
    evt.target.value = '';
  });
  window.addEventListener('hashchange', renderCurrentTab);
  renderCurrentTab();
}

window.addEventListener('DOMContentLoaded', init);
