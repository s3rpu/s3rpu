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
  if (hash === 'todos') return { tab: 'todos', listId: null };
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
  } else if (route.tab === 'todos') {
    renderTodos();
  } else {
    renderBuscar();
  }
}

function renderTabs(activeTab) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  const tabs = [
    { id: 'buscar', label: 'Buscar' },
    { id: 'todos', label: 'Base de datos' },
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

// ---------- Pestaña Base de datos (listado completo, sin filtrar) ----------

function renderTodos() {
  const main = document.getElementById('main');
  const contacts = DATA.contacts.slice().sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), 'es'));
  main.innerHTML = `
    <div class="section-title">${contacts.length} contacto${contacts.length === 1 ? '' : 's'} en total</div>
    <div id="todos-list" class="contact-list"></div>
  `;
  const listEl = document.getElementById('todos-list');
  listEl.innerHTML = contacts.length === 0 ? '<p class="empty">Todavía no hay contactos. Importa un Excel/CSV o crea uno nuevo.</p>' : contacts.map((c) => contactCardHtml(c, 'search')).join('');
  wireContactCards(listEl, 'search', null);
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

function openContactModal(contact, prefillValues) {
  const overlay = document.getElementById('modal-overlay');
  const isEdit = !!contact;
  const values = prefillValues || (contact ? contact.fields : {});
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
    const excludeId = isEdit ? contact.id : null;
    const duplicates = findDuplicates(fieldsObj, excludeId);
    if (duplicates.length > 0) {
      openDuplicateWarningModal(fieldsObj, duplicates, isEdit ? contact : null);
    } else {
      saveContactFields(fieldsObj, isEdit ? contact : null);
    }
  });
}

function saveContactFields(fieldsObj, existingContact) {
  if (existingContact) {
    updateContact(existingContact.id, fieldsObj);
    showToast('Contacto actualizado.');
  } else {
    createContact(fieldsObj);
    showToast('Contacto creado.');
  }
  closeModal();
  renderCurrentTab();
}

// ---------- Aviso de posible contacto duplicado ----------

function openDuplicateWarningModal(fieldsObj, duplicates, existingContact) {
  const overlay = document.getElementById('modal-overlay');
  overlay.innerHTML = `
    <div class="modal card">
      <h3>⚠️ Puede que este contacto ya exista</h3>
      <p class="dup-intro">Los datos introducidos coinciden con ${duplicates.length === 1 ? 'un contacto que ya está' : 'contactos que ya están'} en la base de datos:</p>
      <div class="dup-list">
        ${duplicates
          .map(
            (d) => `
          <div class="card dup-item">
            <div class="contact-name">${escapeHtml(contactDisplayName(d.contact))}</div>
            <div class="dup-reason">Coincide en: ${d.reasons.join(', ')}</div>
            <div class="contact-fields">${contactFieldsHtml(d.contact)}</div>
            <button type="button" class="primary-btn dup-merge-btn" data-id="${d.contact.id}">Unificar con este contacto</button>
          </div>`
          )
          .join('')}
      </div>
      <div class="modal-actions">
        <button type="button" id="dup-cancel-btn" class="icon-btn">Volver a editar</button>
        <button type="button" id="dup-create-anyway-btn" class="icon-btn">Crear de todas formas</button>
      </div>
    </div>`;
  overlay.hidden = false;

  overlay.querySelectorAll('.dup-merge-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.id;
      const target = getContact(targetId);
      const merged = { ...target.fields, ...fieldsObj };
      updateContact(targetId, merged);
      if (existingContact && existingContact.id !== targetId) deleteContact(existingContact.id);
      showToast(`Contacto unificado con "${contactDisplayName(target)}".`);
      closeModal();
      renderCurrentTab();
    });
  });

  document.getElementById('dup-cancel-btn').addEventListener('click', () => openContactModal(existingContact, fieldsObj));
  document.getElementById('dup-create-anyway-btn').addEventListener('click', () => saveContactFields(fieldsObj, existingContact));
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
      <button id="new-list-from-excel-btn" class="icon-btn">Importar Excel como listado nuevo</button>
    </div>
    <div id="lists-grid" class="lists-grid"></div>
  `;
  document.getElementById('new-list-btn').addEventListener('click', () => {
    const name = prompt('Nombre del nuevo listado (ej. "Navidad 2026", "Colegios"):');
    if (!name || !name.trim()) return;
    const list = createList(name);
    navigate(`listas/${list.id}`);
  });
  document.getElementById('new-list-from-excel-btn').addEventListener('click', () => {
    const name = prompt('Nombre del nuevo listado a importar (ej. "Invitados Feria 2026"):');
    if (!name || !name.trim()) return;
    const list = createList(name);
    navigate(`listas/${list.id}`);
    pickExcelFile((file) => handleExcelImport(file, list.id));
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
      <button id="import-list-excel-btn" class="icon-btn">Importar Excel a este listado</button>
      <button id="export-list-excel-btn" class="icon-btn">Exportar este listado a Excel</button>
    </div>
    <div id="list-contacts" class="contact-list"></div>
  `;
  document.getElementById('back-btn').addEventListener('click', () => navigate('listas'));
  document.getElementById('add-contacts-btn').addEventListener('click', () => openAddToListModal(listId));
  document.getElementById('import-list-excel-btn').addEventListener('click', () => pickExcelFile((file) => handleExcelImport(file, listId)));
  document.getElementById('export-list-excel-btn').addEventListener('click', () => exportExcel(listContacts(listId), `listado-${slugify(list.name)}`));
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

// Crea un <input type="file"> oculto, lo dispara y limpia solo. Se usa para
// poder abrir el selector de archivos desde botones que no tienen su propio
// <input> fijo en el HTML (importar como listado nuevo, importar a un
// listado existente…).
function pickExcelFile(onFile) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.xlsx,.xls,.csv';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (file) onFile(file);
    input.remove();
  });
  document.body.appendChild(input);
  input.click();
}

// listId (opcional): si se indica, los contactos resultantes (nuevos o
// unificados) se añaden también a ese listado, además de guardarse en el
// directorio general.
function handleExcelImport(file, listId) {
  const reader = new FileReader();
  reader.onload = () => {
    showToast('⏳ Importando y comprobando duplicados…');
    // Deja pintar el toast antes de bloquear el hilo con el procesado (que
    // con archivos de cientos de filas puede tardar unos segundos).
    setTimeout(() => {
      try {
        const data = new Uint8Array(reader.result);
        // codepage 65001 = UTF-8. Sin indicarlo explícitamente, un CSV en UTF-8
        // sin BOM se interpreta con otra codificación y las tildes/eñes salen
        // mal ("Organización" -> "OrganizaciÃ³n"). Los .xlsx no se ven
        // afectados (llevan su propia codificación en el XML interno).
        const workbook = XLSX.read(data, { type: 'array', codepage: 65001 });
        // Un libro puede traer varias hojas (p.ej. una de "buscador" y otra con
        // los datos completos, como en CONTACTOS_COMPLETO_TODOS.xlsx); se coge
        // la que tenga más filas, que es la que contiene los datos reales.
        const best = workbook.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '', raw: false }),
        })).reduce((a, b) => (b.rows.length > a.rows.length ? b : a));
        if (best.rows.length < 2) throw new Error('el archivo no tiene filas de datos');
        const [header, ...dataRows] = best.rows;
        runImport(header, dataRows, listId);
      } catch (e) {
        alert('No se pudo importar el archivo: ' + e.message);
      }
    }, 30);
  };
  reader.readAsArrayBuffer(file);
}

// Las filas sin coincidencias se importan directamente; las que coinciden en
// nombre, teléfono o email con un contacto ya existente (o con otra fila ya
// importada del mismo archivo) se dejan para revisión manual en vez de
// crearse a ciegas. El índice se construye una vez y se va actualizando según
// se crean contactos, así cada fila se comprueba en tiempo prácticamente
// constante en lugar de recorrer toda la lista por cada una (importa con
// archivos de cientos de filas).
function runImport(headerRow, dataRows, listId) {
  const parsedRows = prepareImportRows(headerRow, dataRows);
  const index = buildContactIndex();
  let createdCount = 0;
  const pending = [];

  parsedRows.forEach((fieldsObj) => {
    const matches = findDuplicatesIndexed(fieldsObj, index);
    if (matches.length === 0) {
      const contact = createContact(fieldsObj);
      indexAddContact(index, contact);
      if (listId) addContactToList(listId, contact.id);
      createdCount++;
    } else {
      pending.push({ fieldsObj, matches });
    }
  });

  renderCurrentTab();
  const suffix = listId ? ' y añadidos al listado' : '';
  if (pending.length === 0) {
    showToast(`✅ Se importaron ${createdCount} contactos nuevos${suffix}.`);
  } else {
    showToast(`✅ ${createdCount} contactos importados${suffix}. ⚠️ ${pending.length} parecen duplicados, revísalos.`);
    openImportReviewModal(pending, listId);
  }
}

function openImportReviewModal(pendingRows, listId) {
  const overlay = document.getElementById('modal-overlay');
  const rows = pendingRows.map((r, i) => ({ ...r, _id: `imp-${i}` }));

  function importReviewRowHtml(r) {
    const rowName = contactDisplayName({ fields: r.fieldsObj });
    return `
      <div class="card dup-item" data-rowid="${r._id}">
        <div class="contact-name">Del archivo: ${escapeHtml(rowName)}</div>
        <div class="contact-fields">${contactFieldsHtml({ fields: r.fieldsObj })}</div>
        <div class="dup-matches">
          ${r.matches
            .map(
              (m) => `
            <div class="dup-match-option">
              <span class="dup-reason">Coincide con "${escapeHtml(contactDisplayName(m.contact))}" en: ${m.reasons.join(', ')}</span>
              <button type="button" class="icon-btn dup-merge-btn" data-target="${m.contact.id}">Unificar con este</button>
            </div>`
            )
            .join('')}
        </div>
        <div class="dup-row-actions">
          <button type="button" class="icon-btn row-import-btn">Importar como nuevo</button>
          <button type="button" class="delete-btn row-skip-btn">Omitir esta fila</button>
        </div>
      </div>`;
  }

  function render() {
    overlay.innerHTML = `
      <div class="modal card modal-wide">
        <h3>⚠️ Revisión de posibles duplicados</h3>
        <p class="dup-intro">${rows.length} fila${rows.length === 1 ? '' : 's'} del archivo coinciden con contactos ya existentes o repetidos dentro del propio archivo. Decide qué hacer con cada una.</p>
        <div class="modal-actions modal-actions-start">
          <button type="button" id="merge-all-rest" class="icon-btn">Unificar todos</button>
          <button type="button" id="import-all-rest" class="icon-btn">Importar todas como nuevas</button>
          <button type="button" id="skip-all-rest" class="icon-btn">Omitir todas</button>
        </div>
        <div class="dup-list dup-list-tall" id="import-review-list">${rows.map((r) => importReviewRowHtml(r)).join('')}</div>
        <div class="modal-actions">
          <button type="button" id="close-review-btn" class="primary-btn">Cerrar</button>
        </div>
      </div>`;
    overlay.hidden = false;
    wire();
  }

  function removeRow(id) {
    const idx = rows.findIndex((r) => r._id === id);
    if (idx !== -1) rows.splice(idx, 1);
    if (rows.length === 0) {
      closeModal();
      renderCurrentTab();
      showToast('Revisión de duplicados completada.');
    } else {
      render();
    }
  }

  function wire() {
    document.getElementById('close-review-btn').addEventListener('click', () => {
      closeModal();
      renderCurrentTab();
    });
    document.getElementById('merge-all-rest').addEventListener('click', () => {
      const n = rows.length;
      rows.forEach((r) => {
        const target = r.matches[0].contact;
        updateContact(target.id, { ...target.fields, ...r.fieldsObj });
        if (listId) addContactToList(listId, target.id);
      });
      rows.length = 0;
      closeModal();
      renderCurrentTab();
      showToast(`Se unificaron ${n} filas con su contacto coincidente.`);
    });
    document.getElementById('import-all-rest').addEventListener('click', () => {
      const n = rows.length;
      rows.forEach((r) => {
        const c = createContact(r.fieldsObj);
        if (listId) addContactToList(listId, c.id);
      });
      rows.length = 0;
      closeModal();
      renderCurrentTab();
      showToast(`Se importaron ${n} contactos adicionales como nuevos.`);
    });
    document.getElementById('skip-all-rest').addEventListener('click', () => {
      const n = rows.length;
      rows.length = 0;
      closeModal();
      renderCurrentTab();
      showToast(`Se omitieron ${n} filas.`);
    });
    overlay.querySelectorAll('.dup-item').forEach((card) => {
      const rowId = card.dataset.rowid;
      const row = rows.find((r) => r._id === rowId);
      card.querySelectorAll('.dup-merge-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const target = getContact(btn.dataset.target);
          const merged = { ...target.fields, ...row.fieldsObj };
          updateContact(target.id, merged);
          if (listId) addContactToList(listId, target.id);
          showToast(`Unificado con "${contactDisplayName(target)}".`);
          removeRow(rowId);
        });
      });
      card.querySelector('.row-import-btn').addEventListener('click', () => {
        const c = createContact(row.fieldsObj);
        if (listId) addContactToList(listId, c.id);
        showToast('Importado como nuevo contacto.');
        removeRow(rowId);
      });
      card.querySelector('.row-skip-btn').addEventListener('click', () => removeRow(rowId));
    });
  }

  render();
}

// ---------- Exportar a Excel ----------
// Usa ExcelJS (en vez de la librería de importación) porque es la que
// realmente escribe estilos: cabecera en color, texto en negrita,
// autofiltro y fila fija al hacer scroll, para que se vea como una tabla
// de verdad en vez de una lista plana.

// contacts: lista a exportar (por defecto todos). filenamePrefix: para poder
// distinguir la exportación completa de la de un listado concreto.
async function exportExcel(contacts, filenamePrefix) {
  try {
    const source = contacts || DATA.contacts;
    const headers = DATA.fields.map((f) => f.label);
    const sorted = source.slice().sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), 'es'));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contactos');
    sheet.columns = DATA.fields.map((field) => {
      const longest = sorted.reduce((max, c) => Math.max(max, ((c.fields && c.fields[field.key]) || '').toString().length), field.label.length);
      return { header: field.label, key: field.key, width: Math.min(45, Math.max(14, longest + 2)) };
    });
    sorted.forEach((c) => sheet.addRow(c.fields || {}));

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14456F' } };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FF0D2E49' } } };
    });
    sheet.eachRow((row, rowNumber) => {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { ...cell.border, bottom: cell.border && cell.border.bottom ? cell.border.bottom : { style: 'thin', color: { argb: 'FFE3E7EB' } } };
      });
      if (rowNumber > 1 && rowNumber % 2 === 0) {
        row.eachCell({ includeEmpty: true }, (cell) => {
          if (!cell.fill || !cell.fill.fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF4F6F8' } };
        });
      }
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: headers.length } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filenamePrefix || 'contactos'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('No se pudo generar el Excel: ' + e.message);
  }
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

// ---------- Modo claro / oscuro ----------

function initTheme() {
  const btn = document.getElementById('theme-toggle-btn');
  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    btn.textContent = theme === 'dark' ? '☀️ Claro' : '🌙 Oscuro';
  };
  applyTheme(localStorage.getItem('contactos.theme') || 'light');
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    localStorage.setItem('contactos.theme', next);
    applyTheme(next);
  });
}

function init() {
  initTheme();
  document.getElementById('export-excel-btn').addEventListener('click', () => exportExcel());
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
