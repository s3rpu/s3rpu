// Almacenamiento y modelo de datos del directorio de contactos.
// Todo se guarda en el localStorage del navegador (sin backend).

const STORAGE_KEY = 'contactos.v1';

// Coincide exactamente con las columnas del Excel real del ayuntamiento
// (CONTACTOS_COMPLETO_TODOS.xlsx) para que la importación no cree campos
// duplicados. "Notas" es el único campo añadido que no viene del Excel.
const DEFAULT_FIELDS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'organizacion', label: 'Organización' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'correo_electronico', label: 'Correo electrónico' },
  { key: 'correo_secundario', label: 'Correo secundario' },
  { key: 'telefono_movil', label: 'Teléfono móvil' },
  { key: 'telefono_fijo', label: 'Teléfono fijo' },
  { key: 'extension', label: 'Extensión' },
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

// Borra todos los contactos. Los listados se conservan (con nombre) pero
// quedan vacíos, en vez de borrarse también, para no destruir esa
// organización si luego se vuelve a importar/crear contactos.
function deleteAllContacts() {
  DATA.contacts = [];
  DATA.lists.forEach((list) => {
    list.contactIds = [];
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

// Una misma celda puede traer varios valores (p.ej. "679684209 / 659597357"
// o dos correos separados por coma); se separan para poder comparar cada
// uno individualmente en vez de tratarlos como un único valor pegado.
function splitMultiValues(v) {
  return (v || '')
    .toString()
    .split(/[,;/\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Clasifica un campo como "teléfono" o "email" por su nombre (clave o
// etiqueta), en vez de depender de una clave fija como 'telefono' o 'email':
// así funciona igual con "Teléfono móvil", "Teléfono fijo", "Correo
// electrónico", "Correo secundario", o cualquier campo que se añada luego.
function fieldKind(field) {
  const s = normalizeText(`${field.label} ${field.key}`);
  if (/correo|email|mail/.test(s)) return 'email';
  if (/telefono|movil|celular|whatsapp/.test(s)) return 'phone';
  return null;
}

function matchKeysFor(fields) {
  const f = fields || {};
  const nameKey = normalizeText([f.nombre, f.apellidos].filter(Boolean).join(' ').trim());
  const phoneKeys = [];
  const emailKeys = [];
  DATA.fields.forEach((field) => {
    const kind = fieldKind(field);
    if (!kind || !f[field.key]) return;
    splitMultiValues(f[field.key]).forEach((part) => {
      if (kind === 'phone') {
        const p = normalizePhone(part);
        if (p.length >= 6) phoneKeys.push(p);
      } else {
        const e = normalizeEmail(part);
        if (e) emailKeys.push(e);
      }
    });
  });
  return { nameKey, phoneKeys, emailKeys };
}

function indexAddContact(index, contact) {
  const { nameKey, phoneKeys, emailKeys } = matchKeysFor(contact.fields);
  if (nameKey) {
    if (!index.byName.has(nameKey)) index.byName.set(nameKey, []);
    index.byName.get(nameKey).push(contact);
  }
  phoneKeys.forEach((p) => {
    if (!index.byPhone.has(p)) index.byPhone.set(p, []);
    index.byPhone.get(p).push(contact);
  });
  emailKeys.forEach((e) => {
    if (!index.byEmail.has(e)) index.byEmail.set(e, []);
    index.byEmail.get(e).push(contact);
  });
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
  const { nameKey, phoneKeys, emailKeys } = matchKeysFor(fieldsObj);
  const found = new Map(); // contact.id -> { contact, reasons: Set }
  const add = (contact, reason) => {
    if (!found.has(contact.id)) found.set(contact.id, { contact, reasons: new Set() });
    found.get(contact.id).reasons.add(reason);
  };
  if (nameKey && index.byName.has(nameKey)) index.byName.get(nameKey).forEach((c) => add(c, 'Nombre'));
  phoneKeys.forEach((p) => {
    if (index.byPhone.has(p)) index.byPhone.get(p).forEach((c) => add(c, 'Teléfono'));
  });
  emailKeys.forEach((e) => {
    if (index.byEmail.has(e)) index.byEmail.get(e).forEach((c) => add(c, 'Email'));
  });
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

// Al unificar un contacto con otro (y borrar el primero), hace que el que
// sobrevive quede en todos los listados en los que estaba el que desaparece.
// Sin esto, unificar un contacto que forma parte de un listado hacía que
// desapareciera de él en vez de quedarse actualizado.
function transferListMemberships(fromId, toId) {
  DATA.lists.forEach((list) => {
    if (list.contactIds.includes(fromId) && !list.contactIds.includes(toId)) {
      list.contactIds.push(toId);
    }
  });
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
