// Almacenamiento y modelo de datos del directorio de contactos.
// Todo se guarda en el localStorage del navegador (sin backend).

const STORAGE_KEY = 'contactos.v1';

const DEFAULT_FIELDS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'apellidos', label: 'Apellidos' },
  { key: 'cargo', label: 'Cargo / Puesto' },
  { key: 'departamento', label: 'Departamento / Área' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'movil', label: 'Móvil' },
  { key: 'email', label: 'Email' },
  { key: 'direccion', label: 'Dirección' },
  { key: 'notas', label: 'Notas' },
];

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { contacts: [], lists: [], fields: DEFAULT_FIELDS.slice() };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.contacts)) parsed.contacts = [];
    if (!Array.isArray(parsed.lists)) parsed.lists = [];
    if (!Array.isArray(parsed.fields) || parsed.fields.length === 0) parsed.fields = DEFAULT_FIELDS.slice();
    return parsed;
  } catch (e) {
    console.error('No se pudieron leer los datos guardados', e);
    return { contacts: [], lists: [], fields: DEFAULT_FIELDS.slice() };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

let DATA = loadData();

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function slugify(text) {
  const slug = text
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || 'campo';
}

function ensureField(label) {
  const key = slugify(label);
  let field = DATA.fields.find((f) => f.key === key);
  if (!field) {
    field = { key, label: label.toString().trim() || key };
    DATA.fields.push(field);
    saveData(DATA);
  }
  return field;
}

function normalizeText(text) {
  return (text || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function contactDisplayName(contact) {
  const f = contact.fields || {};
  const nombre = [f.nombre, f.apellidos].filter(Boolean).join(' ').trim();
  if (nombre) return nombre;
  const firstValue = DATA.fields.map((field) => f[field.key]).find((v) => v && v.toString().trim());
  return firstValue ? firstValue.toString().trim() : '(Sin nombre)';
}

function contactMatches(contact, query) {
  if (!query) return true;
  const q = normalizeText(query);
  const f = contact.fields || {};
  return Object.values(f).some((v) => v && normalizeText(v).includes(q));
}

function searchContacts(query) {
  return DATA.contacts
    .filter((c) => contactMatches(c, query))
    .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), 'es'));
}

function createContact(fieldsObj) {
  const contact = { id: uid(), fields: { ...fieldsObj } };
  DATA.contacts.push(contact);
  saveData(DATA);
  return contact;
}

function updateContact(id, fieldsObj) {
  const contact = DATA.contacts.find((c) => c.id === id);
  if (!contact) return null;
  contact.fields = { ...fieldsObj };
  saveData(DATA);
  return contact;
}

function deleteContact(id) {
  DATA.contacts = DATA.contacts.filter((c) => c.id !== id);
  DATA.lists.forEach((list) => {
    list.contactIds = list.contactIds.filter((cid) => cid !== id);
  });
  saveData(DATA);
}

function getContact(id) {
  return DATA.contacts.find((c) => c.id === id) || null;
}

// ---------- Detección de posibles duplicados ----------
// Se indexa por nombre completo, teléfono/móvil y email normalizados para
// poder comprobar cada contacto en tiempo prácticamente constante en vez de
// recorrer toda la lista cada vez (importa mucho al importar cientos de filas).

function normalizePhone(v) {
  return (v || '').toString().replace(/[^0-9+]/g, '');
}

function normalizeEmail(v) {
  return (v || '').toString().trim().toLowerCase();
}

function matchKeysFor(fields) {
  const f = fields || {};
  return {
    nameKey: normalizeText([f.nombre, f.apellidos].filter(Boolean).join(' ').trim()),
    phoneKeys: [f.telefono, f.movil].map(normalizePhone).filter((v) => v.length >= 6),
    emailKey: normalizeEmail(f.email),
  };
}

function indexAddContact(index, contact) {
  const { nameKey, phoneKeys, emailKey } = matchKeysFor(contact.fields);
  if (nameKey) {
    if (!index.byName.has(nameKey)) index.byName.set(nameKey, []);
    index.byName.get(nameKey).push(contact);
  }
  phoneKeys.forEach((p) => {
    if (!index.byPhone.has(p)) index.byPhone.set(p, []);
    index.byPhone.get(p).push(contact);
  });
  if (emailKey) {
    if (!index.byEmail.has(emailKey)) index.byEmail.set(emailKey, []);
    index.byEmail.get(emailKey).push(contact);
  }
}

function buildContactIndex(excludeIds) {
  const excl = excludeIds ? new Set(excludeIds) : null;
  const index = { byName: new Map(), byPhone: new Map(), byEmail: new Map() };
  DATA.contacts.forEach((c) => {
    if (excl && excl.has(c.id)) return;
    indexAddContact(index, c);
  });
  return index;
}

function findDuplicatesIndexed(fieldsObj, index) {
  const { nameKey, phoneKeys, emailKey } = matchKeysFor(fieldsObj);
  const found = new Map(); // contact.id -> { contact, reasons: Set }
  const add = (contact, reason) => {
    if (!found.has(contact.id)) found.set(contact.id, { contact, reasons: new Set() });
    found.get(contact.id).reasons.add(reason);
  };
  if (nameKey && index.byName.has(nameKey)) index.byName.get(nameKey).forEach((c) => add(c, 'Nombre'));
  phoneKeys.forEach((p) => {
    if (index.byPhone.has(p)) index.byPhone.get(p).forEach((c) => add(c, 'Teléfono'));
  });
  if (emailKey && index.byEmail.has(emailKey)) index.byEmail.get(emailKey).forEach((c) => add(c, 'Email'));
  return Array.from(found.values()).map((m) => ({ contact: m.contact, reasons: Array.from(m.reasons) }));
}

// Compara nombre completo, teléfono/móvil y email contra los contactos ya
// guardados. excludeId se usa al editar, para no comparar un contacto consigo mismo.
function findDuplicates(fieldsObj, excludeId) {
  const index = buildContactIndex(excludeId ? [excludeId] : null);
  return findDuplicatesIndexed(fieldsObj, index);
}

// ---------- Listados personalizados ----------

function createList(name) {
  const list = { id: uid(), name: (name || '').toString().trim() || 'Listado sin nombre', contactIds: [] };
  DATA.lists.push(list);
  saveData(DATA);
  return list;
}

function renameList(id, name) {
  const list = DATA.lists.find((l) => l.id === id);
  if (!list) return;
  const trimmed = (name || '').toString().trim();
  if (trimmed) list.name = trimmed;
  saveData(DATA);
}

function deleteList(id) {
  DATA.lists = DATA.lists.filter((l) => l.id !== id);
  saveData(DATA);
}

function addContactToList(listId, contactId) {
  const list = DATA.lists.find((l) => l.id === listId);
  if (!list) return;
  if (!list.contactIds.includes(contactId)) list.contactIds.push(contactId);
  saveData(DATA);
}

function removeContactFromList(listId, contactId) {
  const list = DATA.lists.find((l) => l.id === listId);
  if (!list) return;
  list.contactIds = list.contactIds.filter((id) => id !== contactId);
  saveData(DATA);
}

function listContacts(listId) {
  const list = DATA.lists.find((l) => l.id === listId);
  if (!list) return [];
  return list.contactIds
    .map((id) => getContact(id))
    .filter(Boolean)
    .sort((a, b) => contactDisplayName(a).localeCompare(contactDisplayName(b), 'es'));
}

// ---------- Importación masiva desde Excel/CSV ----------
// La primera fila se trata como cabecera; cada columna se convierte en un
// campo (si no existe ya se crea). Solo se parsean las filas aquí: la
// decisión de guardarlas (y la comprobación de duplicados) la hace quien
// llama a esta función, para poder revisar antes de escribir en DATA.

function prepareImportRows(headerRow, dataRows) {
  const fieldKeys = headerRow.map((h) => ensureField((h || '').toString()).key);
  const parsedRows = [];
  dataRows.forEach((row) => {
    const fieldsObj = {};
    let hasValue = false;
    fieldKeys.forEach((key, i) => {
      const value = row[i];
      if (value !== undefined && value !== null && value.toString().trim() !== '') {
        fieldsObj[key] = value.toString().trim();
        hasValue = true;
      }
    });
    if (hasValue) parsedRows.push(fieldsObj);
  });
  return parsedRows;
}
