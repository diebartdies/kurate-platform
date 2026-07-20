const mongoose = require('mongoose');
const Feedback = require('../models/Feedback');
const User = require('../models/User');
const sendEmail = require('../sendEmail');

exports.requestFeedback = async (req, res) => {
  try {
    const { professionalId, customerEmail, customerName } = req.body;
    if (!professionalId || !customerEmail) {
      return res.status(400).json({ error: 'Faltan datos.' });
    }
    const professional = await User.findById(professionalId);
    if (!professional) {
      return res.status(404).json({ error: 'Profesional no encontrado.' });
    }
    const feedback = await Feedback.create({
      professional: professionalId,
      customerEmail,
      customerName: customerName || '',
      status: 'pending',
      requestedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    });
    res.status(201).json({ id: feedback._id, message: 'Feedback solicitado.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.submitFeedback = async (req, res) => {
  try {
    const { id, rating, comment } = req.body;
    if (!id || !rating) {
      return res.status(400).json({ error: 'Faltan datos.' });
    }
    const feedback = await Feedback.findById(id);
    if (!feedback) return res.status(404).json({ error: 'No encontrado.' });
    if (feedback.status === 'completed') {
      return res.status(400).json({ error: 'Ya fue completado.' });
    }
    feedback.rating = Math.min(5, Math.max(1, Math.round(rating)));
    feedback.comment = comment || '';
    feedback.status = 'completed';
    feedback.completedAt = new Date();
    await feedback.save();
    res.json({ message: 'Gracias por tu feedback.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getProfessionalRating = async (req, res) => {
  try {
    const { professionalId } = req.params;
    const stats = await Feedback.aggregate([
      { $match: { professional: new mongoose.Types.ObjectId(professionalId), status: 'completed' } },
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const result = stats[0] || { avg: 0, count: 0 };
    res.json({ average: Math.round(result.avg * 10) / 10, count: result.count });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

async function processPendingFeedback() {
  const due = await Feedback.find({
    status: 'pending',
    requestedAt: { $lte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
  });
  for (const fb of due) {
    const prof = await User.findById(fb.professional).select('professionalProfile.alias');
    const pollUrl = `${process.env.PLATFORM_URL || 'http://localhost:5001'}/feedback.html?id=${fb._id}`;
    const emailText = `Hola${fb.customerName ? ' ' + fb.customerName : ''},

Hace una semana solicitaste un servicio de ${prof?.professionalProfile?.alias || 'un profesional'} a través de KuraTe.

Nos ayudaría mucho si nos contás cómo fue tu experiencia.

Calificá el servicio acá:
${pollUrl}

Tu opinión ayuda a que otros usuarios elijan mejor.

Gracias,
Equipo KuraTe`;
    try {
      await sendEmail({
        email: fb.customerEmail,
        subject: 'KuraTe — ¿Cómo fue tu experiencia?',
        message: emailText
      });
      fb.status = 'sent';
      fb.sentAt = new Date();
      await fb.save();
    } catch (err) {
      console.error('[Feedback] Error sending email:', err.message);
    }
  }
  return due.length;
}

exports.processPendingFeedback = processPendingFeedback;
