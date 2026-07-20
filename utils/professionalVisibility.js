function mergePublicListingFilter() {
  return {
    role: 'professional',
    accountDeletedAt: null,
    'professionalProfile.isExposed': { $ne: false },
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
