const DEFAULT_WELCOME_NOTE = {
  title: '',
  body: '',
  sortOrder: 0,
  published: false
};

async function ensureDefaultInterestNotes() {
  return { seeded: false, count: 0 };
}

module.exports = {
  DEFAULT_WELCOME_NOTE,
  ensureDefaultInterestNotes
};
