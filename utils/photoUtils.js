const fs = require('fs');
const path = require('path');
const config = require('../config/appConfig');

const PUBLIC_ROOT = path.join(config.root, 'public');

/** Unsplash removed these images (404). Map to verified working URLs. */
const UNSPLASH_DEAD_ID_REPLACEMENTS = {
  'photo-1611601322175-28e659d4d484': 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=800&auto=format&fit=crop',
  'photo-1589466725882-6cf1b8957b37': 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop'
};

/** Verified URLs for seeding / embed fallbacks when a download fails. */
const WORKING_SAMPLE_PHOTO_URLS = [
  'https://images.unsplash.com/photo-1580489944761-15a19d654956?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1542206395-9feb3edaa68d?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1604004555489-723a93d6ce74?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?q=80&w=800&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=800&auto=format&fit=crop'
];

function replaceDeadExternalUrl(photo) {
  if (!isExternalUrl(photo)) return photo;
  for (const [deadId, replacement] of Object.entries(UNSPLASH_DEAD_ID_REPLACEMENTS)) {
    if (photo.includes(deadId)) return replacement;
  }
  return photo;
}

function isDataUri(photo) {
  return typeof photo === 'string' && photo.startsWith('data:image/');
}

function isExternalUrl(photo) {
  return typeof photo === 'string' && /^https?:\/\//i.test(photo);
}

function isUploadPath(photo) {
  return typeof photo === 'string' && photo.startsWith('/uploads/');
}

function uploadPathToAbsolute(relativePath) {
  const normalized = relativePath.replace(/^\//, '');
  return path.join(PUBLIC_ROOT, normalized);
}

function filePathToDataUri(relativePath) {
  if (!isUploadPath(relativePath)) return null;
  const absolutePath = uploadPathToAbsolute(relativePath);
  if (!fs.existsSync(absolutePath)) return null;

  const buffer = fs.readFileSync(absolutePath);
  const ext = path.extname(absolutePath).slice(1).toLowerCase() || 'jpeg';
  const mime = ext === 'jpg' ? 'jpeg' : ext;
  return `data:image/${mime};base64,${buffer.toString('base64')}`;
}

/**
 * Return a value suitable for <img src> — prefers base64 stored in MongoDB.
 */
function resolvePhotoForClient(photo) {
  if (!photo || typeof photo !== 'string') return null;
  if (isDataUri(photo)) return photo;
  if (isExternalUrl(photo)) return replaceDeadExternalUrl(photo);
  if (isUploadPath(photo)) return filePathToDataUri(photo);
  return photo;
}

function resolveFirstPhotoForClient(photos) {
  if (!Array.isArray(photos)) return null;
  for (const photo of photos) {
    const resolved = resolvePhotoForClient(photo);
    if (resolved) return resolved;
  }
  return null;
}

function resolvePhotosForClient(photos, { limit } = {}) {
  if (!Array.isArray(photos)) return [];
  const resolved = photos
    .map(resolvePhotoForClient)
    .filter(Boolean);
  return typeof limit === 'number' ? resolved.slice(0, limit) : resolved;
}

/**
 * Persist photos as base64 data URIs in MongoDB (never as /uploads/ paths).
 */
function normalizePhotosForStorage(photos, oldPhotos = []) {
  if (!Array.isArray(photos)) return [];

  return photos.map((photo) => {
    if (!photo || typeof photo !== 'string') return null;
    if (isDataUri(photo)) return photo;
    if (isExternalUrl(photo)) return replaceDeadExternalUrl(photo);

    const oldMatch = (oldPhotos || []).find((old) => old === photo);
    if (oldMatch && isDataUri(oldMatch)) return oldMatch;

    if (isUploadPath(photo)) {
      return filePathToDataUri(photo);
    }

    return photo;
  }).filter(Boolean);
}

function bufferToDataUri(buffer, mimeType = 'image/jpeg') {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

module.exports = {
  isDataUri,
  isExternalUrl,
  isUploadPath,
  replaceDeadExternalUrl,
  WORKING_SAMPLE_PHOTO_URLS,
  resolvePhotoForClient,
  resolvePhotosForClient,
  normalizePhotosForStorage,
  filePathToDataUri,
  bufferToDataUri,
  resolveFirstPhotoForClient
};
