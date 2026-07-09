const InterestNote = require('../models/InterestNote');
const { ensureDefaultInterestNotes } = require('../utils/interestNoteSeed');
const { buildBilingualArticle } = require('../services/interestNoteTranslationService');
const {
  resolveRequestLang,
  mapNoteForList,
  mapNoteForRead,
  mapNoteForAdminEdit,
  hydrateLegacyNote
} = require('../utils/interestNoteI18n');

async function applyBilingualFields(noteDoc, { title, body, sortOrder, published }) {
  const bilingual = await buildBilingualArticle({ title, body });

  noteDoc.sourceLocale = bilingual.sourceLocale;
  noteDoc.titleEs = bilingual.titleEs;
  noteDoc.titleEn = bilingual.titleEn;
  noteDoc.bodyEs = bilingual.bodyEs;
  noteDoc.bodyEn = bilingual.bodyEn;
  noteDoc.title = bilingual.title;
  noteDoc.body = bilingual.body;
  if (sortOrder !== undefined) noteDoc.sortOrder = Number(sortOrder) || 0;
  if (published !== undefined) noteDoc.published = published !== false;
  await noteDoc.save();
  return noteDoc;
}

// @desc    Public headlines for categories banner (titles only)
// @route   GET /api/v1/public/interest-note-headlines
// @access  Public
exports.listPublicHeadlines = async (req, res) => {
  try {
    await ensureDefaultInterestNotes();
    const lang = resolveRequestLang(req);
    const notes = await InterestNote.find({ published: true })
      .sort({ sortOrder: 1, createdAt: -1 })
      .limit(8);

    const hydrated = [];
    for (const note of notes) {
      hydrated.push(await hydrateLegacyNote(note));
    }

    res.status(200).json({
      success: true,
      lang,
      data: hydrated.map((note) => mapNoteForList(note, lang))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    List interest notes (professionals read-only; admin sees all)
// @route   GET /api/v1/interest-notes
// @access  Private (professional, admin)
exports.listInterestNotes = async (req, res) => {
  try {
    await ensureDefaultInterestNotes();

    const lang = resolveRequestLang(req);
    const query = req.user.role === 'admin' ? {} : { published: true };
    const notes = await InterestNote.find(query)
      .sort({ sortOrder: 1, createdAt: -1 });

    const hydrated = [];
    for (const note of notes) {
      hydrated.push(await hydrateLegacyNote(note));
    }

    res.status(200).json({
      success: true,
      lang,
      data: hydrated.map((note) => mapNoteForList(note, lang))
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Get one interest note
// @route   GET /api/v1/interest-notes/:id
// @access  Private (professional, admin)
exports.getInterestNote = async (req, res) => {
  try {
    let note = await InterestNote.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    if (!note.published && req.user.role !== 'admin') {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    note = await hydrateLegacyNote(note);
    const lang = resolveRequestLang(req);
    const payload = req.user.role === 'admin' && req.query.edit === '1'
      ? mapNoteForAdminEdit(note)
      : mapNoteForRead(note, lang);

    res.status(200).json({
      success: true,
      lang,
      data: payload
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Create interest note
// @route   POST /api/v1/admin/interest-notes
// @access  Private/Admin
exports.createInterestNote = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title and body are required' });
    }

    const note = new InterestNote({
      sortOrder: Number(req.body?.sortOrder) || 0,
      published: req.body?.published !== false
    });
    await applyBilingualFields(note, { title, body });

    res.status(201).json({
      success: true,
      data: mapNoteForAdminEdit(note),
      message: 'Article saved with automatic translation'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update interest note
// @route   PUT /api/v1/admin/interest-notes/:id
// @access  Private/Admin
exports.updateInterestNote = async (req, res) => {
  try {
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'Title and body are required' });
    }

    const note = await InterestNote.findById(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }

    await applyBilingualFields(note, {
      title,
      body,
      sortOrder: Number(req.body?.sortOrder) || 0,
      published: req.body?.published !== false
    });

    res.status(200).json({
      success: true,
      data: mapNoteForAdminEdit(note),
      message: 'Article updated with automatic translation'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Delete interest note
// @route   DELETE /api/v1/admin/interest-notes/:id
// @access  Private/Admin
exports.deleteInterestNote = async (req, res) => {
  try {
    const note = await InterestNote.findByIdAndDelete(req.params.id);
    if (!note) {
      return res.status(404).json({ success: false, error: 'Article not found' });
    }
    res.status(200).json({ success: true, data: { _id: note._id } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
