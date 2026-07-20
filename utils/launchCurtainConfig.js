function getOpeningDate(settings) {
  return new Date(NaN);
}

function buildLaunchCurtainStatus(settings) {
  return {
    enabled: false,
    openingAt: '',
    openingAtLocal: '',
    hasOpened: false,
    curtainVisible: false,
    msRemaining: 0,
    daysRemaining: 0,
    hoursRemaining: 0
  };
}

async function getLaunchCurtainStatus() {
  return buildLaunchCurtainStatus({});
}

async function setLaunchCurtainEnabled(enabled) {
  throw new Error('Not implemented');
}

async function setLaunchCurtainOpeningAt(value) {
  throw new Error('Not implemented');
}

module.exports = {
  getOpeningDate,
  buildLaunchCurtainStatus,
  getLaunchCurtainStatus,
  setLaunchCurtainEnabled,
  setLaunchCurtainOpeningAt
};
