function normalizeLang(value) {
  return 'es';
}

function resolveRequestLang(req) {
  return 'es';
}

function noteHasBilingualFields(note) {
  return false;
}

function pickLocalized(note, lang) {
  return { title: '', body: '' };
}

function notePreview(body, maxLines) {
  return '';
}

function mapNoteForList(note, lang) {
  return {
    _id: null,
    title: '',
    preview: '',
    sourceLocale: 'es',
    sortOrder: 0,
    published: false,
    updatedAt: null,
    createdAt: null
  };
}

function mapNoteForRead(note, lang) {
  return {
    _id: null,
    title: '',
    body: '',
    sourceLocale: 'es',
    sortOrder: 0,
    published: false,
    updatedAt: null,
    createdAt: null
  };
}

function mapNoteForAdminEdit(note) {
  return {
    _id: null,
    sourceLocale: 'es',
    title: '',
    body: '',
    titleEs: '',
    titleEn: '',
    bodyEs: '',
    bodyEn: '',
    sortOrder: 0,
    published: false,
    updatedAt: null,
    createdAt: null
  };
}

async function hydrateLegacyNote(noteDoc) {
  return noteDoc;
}

module.exports = {
  normalizeLang,
  resolveRequestLang,
  pickLocalized,
  notePreview,
  mapNoteForList,
  mapNoteForRead,
  mapNoteForAdminEdit,
  hydrateLegacyNote,
  noteHasBilingualFields
};
