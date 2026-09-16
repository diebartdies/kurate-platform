const ClickEvent = require('../models/ClickEvent');
const User = require('../models/User');
const { getClientIp } = require('../utils/clientIp');

const CLICK_TYPES = ['profile_card', 'phone', 'whatsapp', 'telegram'];

function getCurrentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

exports.trackClick = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const { type } = req.body;

    if (!CLICK_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid click type' });
    }

    const prof = await User.findById(professionalId).select('_id');
    if (!prof) {
      return res.status(404).json({ success: false, error: 'Professional not found' });
    }

    const ip = getClientIp(req);
    const fingerprint = req.body.fingerprint || '';
    const ua = (req.headers['user-agent'] || '').substring(0, 300);
    const referer = (req.headers['referer'] || '').substring(0, 500);
    const month = getCurrentMonth();

    // Deduplicate: max 1 click per fingerprint per type per professional per month
    if (fingerprint) {
      const existing = await ClickEvent.findOne({
        professional: professionalId,
        type,
        visitorFingerprint: fingerprint,
        month
      });
      if (existing) {
        return res.json({ success: true, tracked: false, message: 'Already tracked' });
      }
    }

    await ClickEvent.create({
      professional: professionalId,
      type,
      visitorIp: ip,
      visitorFingerprint: fingerprint,
      userAgent: ua,
      referer,
      month
    });

    res.json({ success: true, tracked: true });
  } catch (err) {
    console.error('trackClick error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getProfessionalStats = async (req, res) => {
  try {
    const professionalId = req.user.id;
    const { months = 12 } = req.query;

    const stats = await getStatsForProfessional(professionalId, Number(months));
    res.json({ success: true, data: stats });
  } catch (err) {
    console.error('getProfessionalStats error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const { professionalId, months = 12 } = req.query;

    if (professionalId) {
      const stats = await getStatsForProfessional(professionalId, Number(months));
      return res.json({ success: true, data: stats });
    }

    // Global stats
    const globalStats = await getGlobalStats(Number(months));
    res.json({ success: true, data: globalStats });
  } catch (err) {
    console.error('getAdminStats error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getSemestralReport = async (req, res) => {
  try {
    const { professionalId } = req.query;
    const report = await getReport(professionalId, 6);
    res.json({ success: true, data: report });
  } catch (err) {
    console.error('getSemestralReport error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAnualReport = async (req, res) => {
  try {
    const { professionalId } = req.query;
    const report = await getReport(professionalId, 12);
    res.json({ success: true, data: report });
  } catch (err) {
    console.error('getAnualReport error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

async function getStatsForProfessional(professionalId, months = 12) {
  const now = new Date();
  const monthsList = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const mongoose = require('mongoose');
  const pipeline = [
    { $match: { professional: new mongoose.Types.ObjectId(professionalId) } },
    { $group: { _id: { month: '$month', type: '$type' }, count: { $sum: 1 } } }
  ];

  const raw = await ClickEvent.aggregate(pipeline);

  const byType = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0 };
  const byMonth = {};
  monthsList.forEach(m => {
    byMonth[m] = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0, total: 0 };
  });

  raw.forEach(r => {
    if (byType[r._id.type] !== undefined) {
      byType[r._id.type] += r.count;
    }
    if (byMonth[r._id.month]) {
      byMonth[r._id.month][r._id.type] += r.count;
      byMonth[r._id.month].total += r.count;
    }
  });

  const totalClicks = Object.values(byType).reduce((a, b) => a + b, 0);

  return {
    professionalId,
    months: monthsList,
    byType,
    byMonth,
    totalClicks,
    semestralTotal: monthsList.slice(-6).reduce((sum, m) => sum + byMonth[m].total, 0),
    anualTotal: totalClicks
  };
}

async function getGlobalStats(months = 12) {
  const now = new Date();
  const monthsList = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const pipeline = [
    { $group: { _id: { month: '$month', type: '$type' }, count: { $sum: 1 } } }
  ];

  const raw = await ClickEvent.aggregate(pipeline);

  const byType = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0 };
  const byMonth = {};
  monthsList.forEach(m => {
    byMonth[m] = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0, total: 0 };
  });

  raw.forEach(r => {
    if (byType[r._id.type] !== undefined) {
      byType[r._id.type] += r.count;
    }
    if (byMonth[r._id.month]) {
      byMonth[r._id.month][r._id.type] += r.count;
      byMonth[r._id.month].total += r.count;
    }
  });

  const totalClicks = Object.values(byType).reduce((a, b) => a + b, 0);

  // Top professionals by clicks
  const topProfs = await ClickEvent.aggregate([
    { $group: { _id: { prof: '$professional', type: '$type' }, count: { $sum: 1 } } },
    { $group: { _id: '$_id.prof', total: { $sum: '$count' }, clicks: { $push: { type: '$_id.type', count: '$count' } } } },
    { $sort: { total: -1 } },
    { $limit: 20 }
  ]);

  const profIds = topProfs.map(p => p._id);
  const profs = await User.find({ _id: { $in: profIds } })
    .select('professionalProfile.alias email')
    .lean();
  const profMap = {};
  profs.forEach(p => { profMap[p._id.toString()] = p; });

  const top = topProfs.map(p => {
    const prof = profMap[p._id.toString()] || {};
    const clicksByType = {};
    p.clicks.forEach(c => { clicksByType[c.type] = c.count; });
    return {
      professionalId: p._id,
      alias: prof.professionalProfile?.alias || '',
      email: prof.email || '',
      total: p.total,
      profile_card: clicksByType.profile_card || 0,
      phone: clicksByType.phone || 0,
      whatsapp: clicksByType.whatsapp || 0,
      telegram: clicksByType.telegram || 0
    };
  });

  return {
    months: monthsList,
    byType,
    byMonth,
    totalClicks,
    topProfessionals: top
  };
}

async function getReport(professionalId, months) {
  const now = new Date();
  const monthsList = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthsList.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }

  const match = {};
  if (professionalId) {
    const mongoose = require('mongoose');
    match.professional = new mongoose.Types.ObjectId(professionalId);
  }

  const pipeline = [
    ...(professionalId ? [{ $match: match }] : []),
    { $group: { _id: { month: '$month', type: '$type' }, count: { $sum: 1 } } }
  ];

  const raw = await ClickEvent.aggregate(pipeline);

  const byType = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0 };
  const byMonth = {};
  monthsList.forEach(m => {
    byMonth[m] = { profile_card: 0, phone: 0, whatsapp: 0, telegram: 0, total: 0 };
  });

  raw.forEach(r => {
    if (byType[r._id.type] !== undefined) byType[r._id.type] += r.count;
    if (byMonth[r._id.month]) {
      byMonth[r._id.month][r._id.type] += r.count;
      byMonth[r._id.month].total += r.count;
    }
  });

  const totalClicks = Object.values(byType).reduce((a, b) => a + b, 0);
  const periodTotal = monthsList.reduce((sum, m) => sum + byMonth[m].total, 0);

  return {
    period: months === 6 ? 'Semestral' : 'Anual',
    months: monthsList,
    byType,
    byMonth,
    totalClicks,
    periodTotal
  };
}
