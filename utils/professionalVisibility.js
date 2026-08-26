function mergePublicListingFilter() {
  return {
    role: 'professional',
    accountDeletedAt: null,
    'professionalProfile.isExposed': { $ne: false },
    'professionalProfile.alias': { $exists: true, $ne: null, $ne: '' },
    'professionalProfile.bio': { $exists: true, $ne: null, $ne: '' },
    'professionalProfile.location.province': { $exists: true, $ne: null, $ne: '' },
    'professionalProfile.services': { $exists: true, $not: { $size: 0 } },
    'professionalProfile.photos': { $exists: true },
    $or: [
      { verificationStatus: 'approved' },
      { verificationStatus: { $exists: false } },
      { verificationStatus: null }
    ]
  };
}

function isAccountDeleted(user) {
  return user && user.accountDeletedAt != null;
}

module.exports = { mergePublicListingFilter, isAccountDeleted };
