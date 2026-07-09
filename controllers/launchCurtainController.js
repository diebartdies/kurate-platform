const {
  getLaunchCurtainStatus,
  setLaunchCurtainEnabled,
  setLaunchCurtainOpeningAt
} = require('../utils/launchCurtainConfig');

// @desc    Public launch curtain status (for grid pages)
// @route   GET /api/v1/public/launch-curtain
// @access  Public
exports.getPublicLaunchCurtainStatus = async (req, res) => {
  try {
    const status = await getLaunchCurtainStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Admin launch curtain settings
// @route   GET /api/v1/admin/launch-curtain
// @access  Private/Admin
exports.getAdminLaunchCurtainConfig = async (req, res) => {
  try {
    const status = await getLaunchCurtainStatus();
    res.status(200).json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// @desc    Update launch curtain settings: enable toggle and/or opening date/time
// @route   PUT /api/v1/admin/launch-curtain
// @access  Private/Admin
exports.updateLaunchCurtainConfig = async (req, res) => {
  try {
    const { enabled, openingAt } = req.body;
    const hasEnabled = typeof enabled === 'boolean';
    const hasOpeningAt = typeof openingAt === 'string' && openingAt.trim() !== '';

    if (!hasEnabled && !hasOpeningAt) {
      return res.status(400).json({
        success: false,
        error: 'Provide enabled (boolean) and/or openingAt (ISO date string)'
      });
    }

    let status;
    const messages = [];

    // Save the opening date first so the subsequent enable write (and the status
    // it returns) reflects the freshly stored date.
    if (hasOpeningAt) {
      status = await setLaunchCurtainOpeningAt(openingAt);
      messages.push('Opening date updated');
    }
    if (hasEnabled) {
      status = await setLaunchCurtainEnabled(enabled);
      messages.push(enabled ? 'Launch curtain enabled' : 'Launch curtain disabled');
    }

    res.status(200).json({
      success: true,
      message: messages.join('. '),
      data: status
    });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};
