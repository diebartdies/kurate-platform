const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  const email = 'a11y-pending-1790732741026@test.local';
  let u = await User.findOne({ email });
  if (!u) {
    u = new User({
      email,
      password: 'A11yAudit#2026',
      role: 'professional',
      professionalType: 'tecnico_no_matriculado',
      isEmailVerified: true,
      isVerified: true,
      verificationStatus: 'pending',
      is18Plus: true,
      termsAcceptedAt: new Date(),
    });
    await u.save();
  } else {
    u.password = 'A11yAudit#2026';
    await u.save();
  }
  const out = await User.findOne({ email }).lean();
  console.log('OK', out.email, out.role, out.verificationStatus, 'id=' + out._id);
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });