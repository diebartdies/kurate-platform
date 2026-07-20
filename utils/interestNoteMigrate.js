async function migrateLegacyNote(note) {
  return note;
}

async function migrateAllInterestNotes() {
  return 0;
}

module.exports = {
  migrateLegacyNote,
  migrateAllInterestNotes
};
