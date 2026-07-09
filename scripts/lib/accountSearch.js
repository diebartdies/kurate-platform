/**
 * Build a MongoDB filter to find users by email (full or local-part), alias, or name.
 *
 * Search tips:
 * - Prefer full email: user@gmail.com (most precise)
 * - Local part only (user) also matches user@gmail.com, user@hotmail.com, etc.
 */

const COMMON_EMAIL_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'outlook.com',
  'yahoo.com',
  'yahoo.com.ar',
  'live.com',
  'icloud.com',
  'proton.me',
  'protonmail.com'
];

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildUserSearchFilter(needle) {
  const raw = String(needle || '').trim();
  if (!raw) return null;

  const escaped = escapeRegex(raw);
  const or = [
    { name: new RegExp(escaped, 'i') },
    { 'professionalProfile.alias': new RegExp(escaped, 'i') },
    { 'professionalProfile.firstName': new RegExp(escaped, 'i') },
    { 'professionalProfile.mobilePhone': new RegExp(escaped, 'i') }
  ];

  if (raw.includes('@')) {
    or.unshift({ email: new RegExp(`^${escaped}$`, 'i') });
    or.push({ email: new RegExp(escaped, 'i') });
  } else {
    // local part → any domain, plus common full addresses
    or.unshift({ email: new RegExp(`^${escaped}@`, 'i') });
    for (const domain of COMMON_EMAIL_DOMAINS) {
      or.push({ email: `${raw.toLowerCase()}@${domain}` });
    }
    or.push({ email: new RegExp(escaped, 'i') });
  }

  return { $or: or };
}

module.exports = {
  COMMON_EMAIL_DOMAINS,
  buildUserSearchFilter
};
