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

// Cierra un overlay al hacer clic en el fondo, pero solo si el gesto empezó
// Y terminó en el fondo. Si solo se comprobase el click final, seleccionar
// texto arrastrando el ratón desde un campo hasta fuera del modal también
// lo cerraría (el mouseup queda fuera, y ese es el punto que cuenta para el
// evento "click").
function wireOverlayBackdropClose(overlay, onBackdropClick) {
  let downOnBackdrop = false;
  overlay.addEventListener('mousedown', (e) => {
    downOnBackdrop = e.target === overlay;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && downOnBackdrop) onBackdropClick();
  });
}

// ---------- Navegación ----------

function currentRoute() {
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('listas/')) return { tab: 'listas', listId: hash.slice('listas/'.length) };
  if (hash === 'listas') return { tab: 'listas', listId: null };
  return { tab: 'todos', listId: null };
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
    renderTodos();
  }
}

function renderTabs(activeTab) {
  const nav = document.getElementById('tabs');
  nav.innerHTML = '';
  const tabs = [
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

// ---------- Pestaña Base de datos (buscador + listado completo) ----------

function renderTodos() {
  const main = document.getElementById('main');
  main.innerHTML = `
    <div class="search-bar">
      <input type="text" id="search-input" placeholder="Buscar por nombre, cargo, teléfono, email…" />
      <button id="new-contact-btn" class="primary-btn">+ Nuevo contacto</button>
      ${
        DATA.contacts.length > 0
          ? `<button id="clean-data-btn" class="icon-btn">🧹 Compilar datos duplicados</button>
             <button id="delete-all-btn" class="delete-btn">✕ Borrar todo</button>`
          : ''
      }
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
  const cleanDataBtn = document.getElementById('clean-data-btn');
  if (cleanDataBtn) {
    cleanDataBtn.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'Compilar datos duplicados',
        message:
          '¿Compilar los datos duplicados de todos los contactos? Si un contacto tiene el mismo teléfono o el mismo correo repetido en varios campos (aunque sea con formato distinto), se dejará solo en el primero; el resto de campos redundantes se vaciarán.',
        confirmLabel: 'Compilar',
        danger: false,
      });
      if (!ok) return;
      const changed = cleanAllContactsData();
      showToast(changed > 0 ? `✅ Se actualizaron ${changed} contactos.` : 'No había datos duplicados que compilar.');
      renderCurrentTab();
    });
  }
  const deleteAllBtn = document.getElementById('delete-all-btn');
  if (deleteAllBtn) {
    deleteAllBtn.addEventListener('click', async () => {
      const ok = await showConfirmModal({
        title: 'Borrar todo',
        message: `¿De verdad quieres borrarlo todo? Se eliminarán los ${DATA.contacts.length} contactos de la base de datos (los listados se quedan vacíos, pero no se borran). Esta acción no se puede deshacer.`,
        confirmLabel: 'Borrar todo',
      });
      if (!ok) return;
      deleteAllContacts();
      showToast('Se ha borrado toda la base de datos.');
      renderCurrentTab();
    });
  }
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

function contactTagsHtml(listId, contactId) {
  const tags = contactTagsInList(listId, contactId);
  if (tags.length === 0) return '';
  return `<div class="contact-tags">${tags
    .map((t) => `<span class="tag-chip">${escapeHtml(t.name)}<button type="button" class="tag-remove-btn" data-tag="${t.id}" title="Quitar etiqueta">×</button></span>`)
    .join('')}</div>`;
}

function contactCardHtml(c, context, listId) {
  const name = escapeHtml(contactDisplayName(c));
  const inList = context === 'list';
  const selecting = inList && listSelectionState.active;
  const checkbox = selecting
    ? `<label class="contact-select"><input type="checkbox" class="contact-select-checkbox" data-id="${c.id}" ${listSelectionState.selected.has(c.id) ? 'checked' : ''} /></label>`
    : '';
  return `
    <div class="card contact-card" data-id="${c.id}">
      ${checkbox}
      <div class="contact-main">
        <div class="contact-name">${name}</div>
        <div class="contact-fields">${contactFieldsHtml(c)}</div>
        ${inList ? contactTagsHtml(listId, c.id) : ''}
      </div>
      <div class="contact-actions">
        <button class="icon-btn" data-action="edit">Editar</button>
        ${inList ? '<button class="icon-btn" data-action="remove">Quitar de la lista</button>' : '<button class="icon-btn" data-action="addlist">Añadir a…</button><button class="delete-btn" data-action="delete" title="Borrar contacto">✕ Borrar</button>'}
      </div>
    </div>`;
}

function wireContactCards(container, context, listId) {
  container.querySelectorAll('.contact-card').forEach((card) => {
    const id = card.dataset.id;
    card.querySelector('[data-action="edit"]').addEventListener('click', () => openContactModal(getContact(id)));
    const deleteBtn = card.querySelector('[data-action="delete"]');
    if (deleteBtn)
      deleteBtn.addEventListener('click', async () => {
        const ok = await showConfirmModal({
          title: 'Eliminar contacto',
          message: '¿Seguro que quieres eliminar este contacto? Si eliminas este contacto se borrará de la base de datos.',
          confirmLabel: 'Eliminar',
        });
        if (!ok) return;
        deleteContact(id);
        showToast('Contacto borrado.');
        renderCurrentTab();
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
    const selectCheckbox = card.querySelector('.contact-select-checkbox');
    if (selectCheckbox) {
      selectCheckbox.addEventListener('change', () => {
        if (selectCheckbox.checked) listSelectionState.selected.add(id);
        else listSelectionState.selected.delete(id);
        updateSelectionCount();
      });
    }
    card.querySelectorAll('.tag-remove-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeContactTag(listId, id, btn.dataset.tag);
        renderListContactsList(listId);
      });
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

  document.getElementById('add-field-btn').addEventListener('click', async () => {
    const label = await showPromptModal({ title: 'Nuevo campo', message: 'Nombre del nuevo campo (ej. "Fax", "Horario"):' });
    if (!label || !label.trim()) return;
    const field = ensureField(label);
    document.getElementById('contact-fields-wrap').insertAdjacentHTML('beforeend', contactFieldRowHtml(field, ''));
  });

  document.getElementById('cancel-btn').addEventListener('click', closeModal);
  wireOverlayBackdropClose(overlay, closeModal);

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
      if (existingContact && existingContact.id !== targetId) {
        transferListMemberships(existingContact.id, targetId);
        deleteContact(existingContact.id);
      }
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

// ---------- Diálogo de texto (sustituye a prompt()) ----------
// Electron no soporta window.prompt() (a diferencia de alert()/confirm(),
// que sí funcionan): el diálogo nativo simplemente no aparece y la llamada
// devuelve null al instante, como si el usuario hubiese cancelado. Se usa un
// overlay propio, independiente de #modal-overlay, para poder mostrarse
// también por encima de otro modal ya abierto (p. ej. "+ Añadir campo"
// dentro del formulario de contacto).
function showPromptModal({ title, message, defaultValue = '', confirmLabel = 'Aceptar' }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('prompt-overlay');
    overlay.innerHTML = `
      <div class="modal card">
        <h3>${escapeHtml(title)}</h3>
        <form id="prompt-form" class="contact-form">
          ${message ? `<p class="dup-intro">${escapeHtml(message)}</p>` : ''}
          <input type="text" id="prompt-input" class="modal-search" />
          <div class="modal-actions">
            <button type="button" id="prompt-cancel-btn" class="icon-btn">Cancelar</button>
            <button type="submit" class="primary-btn">${escapeHtml(confirmLabel)}</button>
          </div>
        </form>
      </div>`;
    overlay.hidden = false;
    const input = document.getElementById('prompt-input');
    input.value = defaultValue;
    input.focus();
    input.select();

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      overlay.hidden = true;
      overlay.innerHTML = '';
      resolve(value);
    };

    document.getElementById('prompt-form').addEventListener('submit', (e) => {
      e.preventDefault();
      finish(input.value);
    });
    document.getElementById('prompt-cancel-btn').addEventListener('click', () => finish(null));
    wireOverlayBackdropClose(overlay, () => finish(null));
  });
}

// ---------- Diálogo de confirmación (sustituye a confirm()) ----------
// Igual que showPromptModal, evita depender del diálogo nativo confirm():
// en Electron, tras cerrarse un diálogo nativo, la ventana puede quedarse
// sin el foco de teclado real aunque el elemento activo en el DOM sí lo
// tenga, dejando inputs (como el buscador) sin responder hasta un segundo
// clic. Usar un modal propio evita ese problema de raíz.
function showConfirmModal({ title = 'Confirmar', message, confirmLabel = 'Aceptar', cancelLabel = 'Cancelar', danger = true }) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('prompt-overlay');
    overlay.innerHTML = `
      <div class="modal card">
        <h3>${escapeHtml(title)}</h3>
        <p class="dup-intro">${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button type="button" id="confirm-cancel-btn" class="icon-btn">${escapeHtml(cancelLabel)}</button>
          <button type="button" id="confirm-ok-btn" class="${danger ? 'delete-btn' : 'primary-btn'}">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    overlay.hidden = false;

    let resolved = false;
    const finish = (value) => {
      if (resolved) return;
      resolved = true;
      overlay.hidden = true;
      overlay.innerHTML = '';
      resolve(value);
    };

    const okBtn = document.getElementById('confirm-ok-btn');
    okBtn.addEventListener('click', () => finish(true));
    okBtn.focus();
    document.getElementById('confirm-cancel-btn').addEventListener('click', () => finish(false));
    wireOverlayBackdropClose(overlay, () => finish(false));
  });
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
  document.getElementById('new-list-btn').addEventListener('click', async () => {
    const name = await showPromptModal({ title: 'Nuevo listado', message: 'Nombre del nuevo listado (ej. "Navidad 2026", "Colegios"):' });
    if (!name || !name.trim()) return;
    const list = createList(name);
    navigate(`listas/${list.id}`);
  });
  document.getElementById('new-list-from-excel-btn').addEventListener('click', async () => {
    const name = await showPromptModal({ title: 'Importar Excel como listado nuevo', message: 'Nombre del nuevo listado a importar (ej. "Invitados Feria 2026"):' });
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
    card.querySelector('[data-action="renombrar"]').addEventListener('click', async () => {
      const list = DATA.lists.find((l) => l.id === id);
      const name = await showPromptModal({ title: 'Renombrar listado', defaultValue: list.name, confirmLabel: 'Renombrar' });
      if (!name || !name.trim()) return;
      renameList(id, name);
      renderListsGrid();
    });
    card.querySelector('[data-action="borrar"]').addEventListener('click', async () => {
      const list = DATA.lists.find((l) => l.id === id);
      const ok = await showConfirmModal({
        title: 'Borrar listado',
        message: `¿Borrar el listado "${list.name}"? Los contactos no se eliminarán del directorio.`,
        confirmLabel: 'Borrar',
      });
      if (!ok) return;
      deleteList(id);
      renderListsGrid();
    });
  });
}

// Búsqueda local dentro de un listado. Se guarda junto con el id del
// listado para que, al cambiar a otro, el texto no se arrastre de uno a otro.
let listSearchState = { listId: null, query: '' };

// Modo selección (para "Copiar correos electrónicos"), también por listado.
let listSelectionState = { listId: null, active: false, selected: new Set() };

// Filtro por forma de contacto (solo correo / solo teléfono / ambos / ninguno).
let listFilterState = { listId: null, mode: 'all' };

// Filtro por etiqueta (sub-listado dentro de un listado). Un contacto puede
// tener varias etiquetas a la vez, así que el filtro admite seleccionar
// varias etiquetas a la vez: se muestran los contactos que tengan AL MENOS
// UNA de las etiquetas marcadas (no hace falta que las tengan todas).
let listTagFilterState = { listId: null, tagIds: new Set() };

function renderListDetail(listId) {
  const list = DATA.lists.find((l) => l.id === listId);
  const main = document.getElementById('main');
  if (!list) {
    main.innerHTML = '<p class="empty">Listado no encontrado.</p>';
    return;
  }
  if (listSearchState.listId !== listId) listSearchState = { listId, query: '' };
  if (listSelectionState.listId !== listId) listSelectionState = { listId, active: false, selected: new Set() };
  if (listFilterState.listId !== listId) listFilterState = { listId, mode: 'all' };
  if (listTagFilterState.listId !== listId) listTagFilterState = { listId, tagIds: new Set() };
  const tags = listTags(listId);
  main.innerHTML = `
    <div class="list-detail-header">
      <button id="back-btn" class="icon-btn">← Listados</button>
      <h2 class="day-title">${escapeHtml(list.name)}</h2>
    </div>
    <div class="search-bar">
      <input type="text" id="list-search-input" placeholder="Buscar dentro de este listado…" />
      <select id="list-filter-select" class="icon-btn">
        <option value="all">Todos</option>
        <option value="email-only">Solo con correo</option>
        <option value="phone-only">Solo con teléfono</option>
        <option value="both">Correo y teléfono</option>
        <option value="none">Sin correo ni teléfono</option>
      </select>
      <button id="add-contacts-btn" class="primary-btn">+ Añadir contactos</button>
      <button id="import-list-excel-btn" class="icon-btn">Importar Excel a este listado</button>
      <button id="export-list-excel-btn" class="icon-btn">Exportar este listado a Excel</button>
      <button id="manage-tags-btn" class="icon-btn">🏷️ Etiquetas</button>
      <button id="toggle-select-btn" class="icon-btn">${listSelectionState.active ? 'Cancelar selección' : '☑ Seleccionar'}</button>
    </div>
    ${
      tags.length > 0
        ? `<div class="search-bar tag-filter-bar">
             <span class="tag-filter-label">Etiquetas:</span>
             ${tags
               .map(
                 (t) =>
                   `<button type="button" class="tag-filter-chip${listTagFilterState.tagIds.has(t.id) ? ' active' : ''}" data-tag="${t.id}">${escapeHtml(t.name)}</button>`
               )
               .join('')}
           </div>`
        : ''
    }
    ${
      listSelectionState.active
        ? `<div class="search-bar selection-toolbar">
             <button id="select-all-btn" class="icon-btn">Seleccionar todos</button>
             <button id="select-none-btn" class="icon-btn">Ninguno</button>
             <button id="copy-emails-btn" class="primary-btn">📋 Copiar correos electrónicos</button>
             <span id="selection-count" class="section-title"></span>
           </div>`
        : ''
    }
    <div id="list-search-meta" class="section-title"></div>
    <div id="list-contacts" class="contact-list"></div>
  `;
  document.getElementById('back-btn').addEventListener('click', () => navigate('listas'));
  document.getElementById('add-contacts-btn').addEventListener('click', () => openAddToListModal(listId));
  document.getElementById('import-list-excel-btn').addEventListener('click', () => pickExcelFile((file) => handleExcelImport(file, listId)));
  document.getElementById('export-list-excel-btn').addEventListener('click', () => exportExcel(getFilteredListContacts(listId), `listado-${slugify(list.name)}`, listId));
  document.getElementById('manage-tags-btn').addEventListener('click', () => openAddTagModal(listId));
  document.getElementById('toggle-select-btn').addEventListener('click', () => {
    listSelectionState.active = !listSelectionState.active;
    listSelectionState.selected.clear();
    renderListDetail(listId);
  });
  if (listSelectionState.active) {
    document.getElementById('select-all-btn').addEventListener('click', () => {
      getFilteredListContacts(listId).forEach((c) => listSelectionState.selected.add(c.id));
      renderListContactsList(listId);
    });
    document.getElementById('select-none-btn').addEventListener('click', () => {
      listSelectionState.selected.clear();
      renderListContactsList(listId);
    });
    document.getElementById('copy-emails-btn').addEventListener('click', () => copySelectedEmails());
  }
  const searchInput = document.getElementById('list-search-input');
  searchInput.value = listSearchState.query;
  searchInput.addEventListener('input', () => {
    listSearchState.query = searchInput.value;
    renderListContactsList(listId);
  });
  const filterSelect = document.getElementById('list-filter-select');
  filterSelect.value = listFilterState.mode;
  filterSelect.addEventListener('change', () => {
    listFilterState.mode = filterSelect.value;
    renderListContactsList(listId);
  });
  document.querySelectorAll('.tag-filter-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tagId = btn.dataset.tag;
      if (listTagFilterState.tagIds.has(tagId)) listTagFilterState.tagIds.delete(tagId);
      else listTagFilterState.tagIds.add(tagId);
      btn.classList.toggle('active');
      renderListContactsList(listId);
    });
  });
  renderListContactsList(listId);
}

// Aplica a la vez la búsqueda de texto, el filtro de correo/teléfono y el
// filtro de etiquetas de un listado, para que "Seleccionar todos" y el
// propio listado siempre muestren/seleccionen exactamente el mismo conjunto
// de contactos.
function getFilteredListContacts(listId) {
  const all = listContacts(listId);
  const query = listSearchState.listId === listId ? listSearchState.query : '';
  const mode = listFilterState.listId === listId ? listFilterState.mode : 'all';
  const tagIds = listTagFilterState.listId === listId ? listTagFilterState.tagIds : new Set();
  return all
    .filter((c) => (query ? contactMatches(c, query) : true))
    .filter((c) => matchesContactFilter(c, mode))
    .filter((c) => (tagIds.size === 0 ? true : contactTagsInList(listId, c.id).some((t) => tagIds.has(t.id))));
}

function renderListContactsList(listId) {
  const el = document.getElementById('list-contacts');
  const meta = document.getElementById('list-search-meta');
  const all = listContacts(listId);
  const contacts = getFilteredListContacts(listId);
  if (meta) meta.textContent = all.length === 0 ? '' : `${contacts.length} de ${all.length} contacto${all.length === 1 ? '' : 's'}`;
  const exportBtn = document.getElementById('export-list-excel-btn');
  if (exportBtn) {
    exportBtn.textContent = contacts.length === all.length ? 'Exportar este listado a Excel' : `Exportar filtrados a Excel (${contacts.length})`;
  }
  el.innerHTML =
    all.length === 0
      ? '<p class="empty">Este listado todavía no tiene contactos. Usa "+ Añadir contactos".</p>'
      : contacts.length === 0
        ? '<p class="empty">Sin resultados en este listado.</p>'
        : contacts.map((c) => contactCardHtml(c, 'list', listId)).join('');
  wireContactCards(el, 'list', listId);
  updateSelectionCount();
}

function updateSelectionCount() {
  const el = document.getElementById('selection-count');
  if (!el) return;
  const n = listSelectionState.selected.size;
  el.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
}

// ---------- Copiar correos electrónicos al portapapeles ----------

function copyTextToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text).catch(() => copyViaExecCommand(text));
  }
  return copyViaExecCommand(text);
}

function copyViaExecCommand(text) {
  return new Promise((resolve, reject) => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      // ok se queda en false
    }
    document.body.removeChild(ta);
    if (ok) resolve();
    else reject(new Error('No se pudo copiar al portapapeles.'));
  });
}

// Recoge los correos de todos los campos de tipo email (Correo electrónico,
// Correo secundario, o cualquier otro que se llame así) de los contactos
// seleccionados, separando también celdas con varios correos, y los copia
// como una lista separada por comas — el formato que aceptan Gmail, Outlook,
// etc. al pegar directamente en el campo de destinatarios.
function copySelectedEmails() {
  const selectedIds = Array.from(listSelectionState.selected);
  if (selectedIds.length === 0) {
    showToast('No has seleccionado ningún contacto.');
    return;
  }
  const emailFields = DATA.fields.filter((f) => fieldKind(f) === 'email');
  const emails = new Set();
  selectedIds.forEach((id) => {
    const c = getContact(id);
    if (!c || !c.fields) return;
    emailFields.forEach((field) => {
      const raw = c.fields[field.key];
      if (!raw) return;
      splitMultiValues(raw).forEach((part) => {
        const trimmed = part.trim();
        if (trimmed) emails.add(trimmed);
      });
    });
  });
  if (emails.size === 0) {
    showToast('Los contactos seleccionados no tienen correo electrónico.');
    return;
  }
  const text = Array.from(emails).join(', ');
  copyTextToClipboard(text).then(
    () => showToast(`✅ ${emails.size} correo${emails.size === 1 ? '' : 's'} copiado${emails.size === 1 ? '' : 's'} al portapapeles.`),
    () => alert('No se pudo copiar al portapapeles automáticamente. Cópialos a mano:\n\n' + text)
  );
}

// ---------- Etiquetas (sub-listados dentro de un listado) ----------

function openAddTagModal(listId) {
  const overlay = document.getElementById('modal-overlay');

  // Sin contactos seleccionados el modal sirve para crear/renombrar/borrar
  // etiquetas (gestión); con contactos seleccionados, además se pueden
  // asignar con un clic. Se recalcula en cada render por si el usuario activa
  // la selección mientras el modal ya está abierto.
  function selectedIds() {
    return Array.from(listSelectionState.selected);
  }

  function render() {
    const tags = listTags(listId);
    const ids = selectedIds();
    const hasSelection = ids.length > 0;
    overlay.innerHTML = `
      <div class="modal card">
        <h3>Etiquetas</h3>
        <p class="dup-intro">${
          hasSelection
            ? `${ids.length} contacto${ids.length === 1 ? '' : 's'} seleccionado${ids.length === 1 ? '' : 's'}. Toca una etiqueta para asignarla.`
            : 'Crea, renombra o borra las etiquetas de este listado. Selecciona contactos antes para poder asignárselas con un clic.'
        }</p>
        ${
          tags.length === 0
            ? '<p class="empty">Todavía no hay etiquetas en este listado. Crea la primera abajo.</p>'
            : `<div class="tag-options">
                 ${tags
                   .map(
                     (t) => `
                   <div class="tag-option-row">
                     <button type="button" class="tag-option${hasSelection ? '' : ' tag-option-static'}" data-tag="${t.id}"${hasSelection ? '' : ' disabled'}>${escapeHtml(t.name)}</button>
                     <button type="button" class="tag-option-rename" data-tag="${t.id}" title="Renombrar etiqueta">✎</button>
                     <button type="button" class="tag-option-delete" data-tag="${t.id}" title="Borrar etiqueta">×</button>
                   </div>`
                   )
                   .join('')}
               </div>`
        }
        <div class="addlist-new">
          <input type="text" placeholder="Crear etiqueta…" class="addlist-input" id="new-tag-input" />
          <button type="button" id="create-tag-btn" class="addlist-create">${hasSelection ? 'Crear y asignar' : 'Crear etiqueta'}</button>
        </div>
        <div class="modal-actions">
          <button type="button" id="close-tag-modal" class="primary-btn">Hecho</button>
        </div>
      </div>`;
    overlay.hidden = false;
    wire();
  }

  function wire() {
    overlay.querySelectorAll('.tag-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        const ids = selectedIds();
        if (ids.length === 0) return;
        const tagId = btn.dataset.tag;
        const tag = listTags(listId).find((t) => t.id === tagId);
        assignTagToContacts(listId, tagId, ids);
        showToast(`Etiqueta "${tag.name}" añadida.`);
        renderListDetail(listId);
      });
    });
    overlay.querySelectorAll('.tag-option-rename').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tagId = btn.dataset.tag;
        const tag = listTags(listId).find((t) => t.id === tagId);
        const name = await showPromptModal({ title: 'Renombrar etiqueta', defaultValue: tag.name, confirmLabel: 'Renombrar' });
        if (!name || !name.trim()) return;
        renameListTag(listId, tagId, name);
        showToast('Etiqueta renombrada.');
        render();
        renderListDetail(listId);
      });
    });
    overlay.querySelectorAll('.tag-option-delete').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tagId = btn.dataset.tag;
        const tag = listTags(listId).find((t) => t.id === tagId);
        const ok = await showConfirmModal({
          title: 'Borrar etiqueta',
          message: `¿Borrar la etiqueta "${tag.name}"? Se quitará de todos los contactos de este listado que la tengan.`,
          confirmLabel: 'Borrar',
        });
        if (!ok) return;
        deleteListTag(listId, tagId);
        listTagFilterState.tagIds.delete(tagId);
        render();
        renderListDetail(listId);
      });
    });
    document.getElementById('create-tag-btn').addEventListener('click', () => {
      const input = document.getElementById('new-tag-input');
      const name = input.value.trim();
      if (!name) return;
      const tag = createListTag(listId, name);
      const ids = selectedIds();
      if (ids.length > 0) {
        assignTagToContacts(listId, tag.id, ids);
        showToast(`Etiqueta "${tag.name}" creada y asignada.`);
      } else {
        showToast(`Etiqueta "${tag.name}" creada.`);
      }
      render();
      renderListDetail(listId);
    });
    document.getElementById('close-tag-modal').addEventListener('click', () => {
      closeModal();
      renderListDetail(listId);
    });
    wireOverlayBackdropClose(overlay, () => {
      closeModal();
      renderListDetail(listId);
    });
  }

  render();
}

function openAddToListModal(listId) {
  const overlay = document.getElementById('modal-overlay');
  // "Seleccionar varios" es un modo aparte: en vez de añadir de uno en uno
  // con el botón de cada fila, se marcan varios con casillas y se añaden
  // todos juntos con un solo clic (con "Seleccionar todos" para marcar de
  // golpe todos los resultados visibles).
  let selectionMode = false;
  const selected = new Set();
  let currentMatches = [];

  function renderShell() {
    const previousQuery = document.getElementById('add-search-input') ? document.getElementById('add-search-input').value : '';
    overlay.innerHTML = `
      <div class="modal card modal-wide">
        <h3>Añadir contactos al listado</h3>
        <div class="search-bar">
          <input type="text" id="add-search-input" placeholder="Buscar contacto…" class="modal-search" />
          <button type="button" id="toggle-multiselect-btn" class="icon-btn">${selectionMode ? 'Cancelar selección' : '☑ Seleccionar varios'}</button>
        </div>
        ${
          selectionMode
            ? `<div class="search-bar selection-toolbar">
                 <button type="button" id="add-select-all-btn" class="icon-btn">Seleccionar todos</button>
                 <button type="button" id="add-select-none-btn" class="icon-btn">Ninguno</button>
                 <button type="button" id="add-selected-btn" class="primary-btn">+ Añadir seleccionados</button>
                 <span id="add-selection-count" class="section-title"></span>
               </div>`
            : ''
        }
        <div id="add-search-meta" class="section-title"></div>
        <div id="add-search-results" class="contact-list compact"></div>
        <div class="modal-actions">
          <button type="button" id="close-add-modal" class="primary-btn">Hecho</button>
        </div>
      </div>`;
    overlay.hidden = false;

    const searchInput = document.getElementById('add-search-input');
    searchInput.value = previousQuery;
    searchInput.addEventListener('input', (e) => renderResults(e.target.value));

    document.getElementById('toggle-multiselect-btn').addEventListener('click', () => {
      selectionMode = !selectionMode;
      selected.clear();
      renderShell();
    });
    document.getElementById('close-add-modal').addEventListener('click', () => {
      closeModal();
      renderCurrentTab();
    });
    wireOverlayBackdropClose(overlay, () => {
      closeModal();
      renderCurrentTab();
    });

    if (selectionMode) {
      document.getElementById('add-select-all-btn').addEventListener('click', () => {
        currentMatches.forEach((c) => selected.add(c.id));
        renderResults(searchInput.value);
      });
      document.getElementById('add-select-none-btn').addEventListener('click', () => {
        selected.clear();
        renderResults(searchInput.value);
      });
      document.getElementById('add-selected-btn').addEventListener('click', () => {
        if (selected.size === 0) {
          showToast('No has seleccionado ningún contacto.');
          return;
        }
        const list = DATA.lists.find((l) => l.id === listId);
        const newlyAdded = Array.from(selected).filter((cid) => !list.contactIds.includes(cid));
        selected.forEach((cid) => addContactToList(listId, cid));
        showToast(
          newlyAdded.length > 0
            ? `✅ ${newlyAdded.length} contacto${newlyAdded.length === 1 ? '' : 's'} añadido${newlyAdded.length === 1 ? '' : 's'} al listado.`
            : 'Los contactos seleccionados ya estaban en el listado.'
        );
        selected.clear();
        renderResults(searchInput.value);
      });
    } else {
      searchInput.focus();
    }

    renderResults(previousQuery);
  }

  function renderResults(query) {
    const matches = searchContacts(query);
    currentMatches = matches;
    const meta = document.getElementById('add-search-meta');
    meta.textContent = `${matches.length} resultado${matches.length === 1 ? '' : 's'}`;
    const resultsEl = document.getElementById('add-search-results');
    const list = DATA.lists.find((l) => l.id === listId);
    resultsEl.innerHTML = matches.length
      ? matches
          .map((c) =>
            selectionMode
              ? `
        <div class="card contact-card compact" data-id="${c.id}">
          <label class="contact-select"><input type="checkbox" class="add-select-checkbox" data-id="${c.id}" ${selected.has(c.id) ? 'checked' : ''} /></label>
          <div class="contact-name">${escapeHtml(contactDisplayName(c))}</div>
          ${list.contactIds.includes(c.id) ? '<span class="section-title">Ya en el listado</span>' : ''}
        </div>`
              : `
        <div class="card contact-card compact" data-id="${c.id}">
          <div class="contact-name">${escapeHtml(contactDisplayName(c))}</div>
          <button class="icon-btn toggle-add-btn" data-id="${c.id}">${list.contactIds.includes(c.id) ? '✓ En el listado' : 'Añadir'}</button>
        </div>`
          )
          .join('')
      : '<p class="empty">Sin resultados.</p>';

    if (selectionMode) {
      resultsEl.querySelectorAll('.add-select-checkbox').forEach((cb) => {
        cb.addEventListener('change', () => {
          const cid = cb.dataset.id;
          if (cb.checked) selected.add(cid);
          else selected.delete(cid);
          updateAddSelectionCount();
        });
      });
      updateAddSelectionCount();
    } else {
      resultsEl.querySelectorAll('.toggle-add-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const cid = btn.dataset.id;
          if (list.contactIds.includes(cid)) removeContactFromList(listId, cid);
          else addContactToList(listId, cid);
          renderResults(document.getElementById('add-search-input').value);
        });
      });
    }
  }

  function updateAddSelectionCount() {
    const el = document.getElementById('add-selection-count');
    if (!el) return;
    const n = selected.size;
    el.textContent = `${n} seleccionado${n === 1 ? '' : 's'}`;
  }

  renderShell();
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

// ---------- Preferencias: estándar de campos ----------

function countFieldUsage(key) {
  return DATA.contacts.filter((c) => c.fields && c.fields[key]).length;
}

function openPreferencesModal() {
  const overlay = document.getElementById('modal-overlay');

  function render() {
    overlay.innerHTML = `
      <div class="modal card modal-wide">
        <h3>⚙ Preferencias — Estándar de campos</h3>
        <p class="dup-intro">
          Desmarca los campos que no quieras mantener. Al pulsar "Actualizar", esos campos se eliminan: si algún contacto tenía ahí un correo o un teléfono, se mueve automáticamente al campo de correo/teléfono correspondiente; cualquier otro dato se guarda en Notas para no perderlo.
        </p>
        <div class="tag-options">
          ${DATA.fields
            .map((f) => {
              const locked = f.key === 'nombre';
              const n = countFieldUsage(f.key);
              return `
            <label class="field-pref-row${locked ? ' field-pref-locked' : ''}" title="${locked ? 'El campo Nombre no se puede eliminar.' : ''}">
              <input type="checkbox" class="field-pref-checkbox" data-key="${f.key}" ${f.markedForRemoval ? '' : 'checked'} ${locked ? 'disabled' : ''} />
              <span class="field-pref-label">${escapeHtml(f.label)}</span>
              <span class="field-pref-count">${n} contacto${n === 1 ? '' : 's'}</span>
            </label>`;
            })
            .join('')}
        </div>
        <div class="modal-actions modal-actions-start">
          <button type="button" id="prefs-update-btn" class="primary-btn">Actualizar</button>
        </div>
        <div class="modal-actions">
          <button type="button" id="close-prefs-modal" class="icon-btn">Cerrar</button>
        </div>
      </div>`;
    overlay.hidden = false;
    wire();
  }

  function wire() {
    overlay.querySelectorAll('.field-pref-checkbox').forEach((cb) => {
      cb.addEventListener('change', () => {
        const field = DATA.fields.find((f) => f.key === cb.dataset.key);
        if (!field) return;
        field.markedForRemoval = !cb.checked;
        saveData(DATA);
      });
    });
    document.getElementById('prefs-update-btn').addEventListener('click', async () => {
      const toRemove = DATA.fields.filter((f) => f.markedForRemoval && f.key !== 'nombre');
      if (toRemove.length === 0) {
        showToast('No hay campos marcados para eliminar.');
        return;
      }
      const ok = await showConfirmModal({
        title: 'Actualizar estándar de campos',
        message: `Se eliminarán ${toRemove.length} campo${toRemove.length === 1 ? '' : 's'} (${toRemove.map((f) => f.label).join(', ')}). Los correos y teléfonos que tuvieran se moverán al campo correspondiente; el resto de datos se guardará en Notas. Esta acción no se puede deshacer.`,
        confirmLabel: 'Actualizar',
      });
      if (!ok) return;
      const result = updateFieldsStandard();
      showToast(
        `✅ Se actualizaron ${result.updatedContacts} contacto${result.updatedContacts === 1 ? '' : 's'} y se eliminaron ${result.removedFields} campo${result.removedFields === 1 ? '' : 's'}.` +
          (result.keptNotes ? ' Se mantuvo el campo "Notas" porque hacía falta como destino de datos sin clasificar.' : '')
      );
      render();
      renderCurrentTab();
    });
    document.getElementById('close-prefs-modal').addEventListener('click', closeModal);
    wireOverlayBackdropClose(overlay, closeModal);
  }

  render();
}

// ---------- Exportar a Excel ----------
// Usa ExcelJS (en vez de la librería de importación) porque es la que
// realmente escribe estilos: cabecera en color, texto en negrita,
// autofiltro y fila fija al hacer scroll, para que se vea como una tabla
// de verdad en vez de una lista plana.

// contacts: lista a exportar (por defecto todos). filenamePrefix: para poder
// distinguir la exportación completa de la de un listado concreto. listId
// (opcional): si se indica, añade una columna "Etiquetas" con las etiquetas
// de ese listado que tenga cada contacto, ya que las etiquetas son propias
// de cada listado y solo tienen sentido en una exportación de un listado.
async function exportExcel(contacts, filenamePrefix, listId) {
  try {
    const source = contacts || DATA.contacts;
    const includeTags = !!listId;
    const headers = DATA.fields.map((f) => f.label).concat(includeTags ? ['Etiquetas'] : []);
    const sorted = source.slice().sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), 'es'));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Contactos');
    sheet.columns = DATA.fields
      .map((field) => {
        const longest = sorted.reduce((max, c) => Math.max(max, ((c.fields && c.fields[field.key]) || '').toString().length), field.label.length);
        return { header: field.label, key: field.key, width: Math.min(45, Math.max(14, longest + 2)) };
      })
      .concat(
        includeTags
          ? [
              {
                header: 'Etiquetas',
                key: '_tags',
                width: Math.min(
                  45,
                  Math.max(14, sorted.reduce((max, c) => Math.max(max, contactTagsInList(listId, c.id).map((t) => t.name).join(', ').length), 'Etiquetas'.length) + 2)
                ),
              },
            ]
          : []
      );
    sorted.forEach((c) => {
      const row = { ...(c.fields || {}) };
      if (includeTags) row._tags = contactTagsInList(listId, c.id).map((t) => t.name).join(', ');
      sheet.addRow(row);
    });

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
  document.getElementById('preferences-btn').addEventListener('click', openPreferencesModal);
  window.addEventListener('hashchange', renderCurrentTab);
  renderCurrentTab();
}

window.addEventListener('DOMContentLoaded', init);
