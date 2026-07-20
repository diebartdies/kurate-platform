function getCertificateExpiryWarnings(thresholdDays) {
  return { all: [], warnings: [], thresholdDays };
}

module.exports = {
  getCertificateExpiryWarnings
};
