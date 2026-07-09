const config = require('../config/appConfig');

// @desc    Submit feedback or complaint
// @route   POST /api/v1/feedback
// @access  Private
exports.submitFeedback = async (req, res, next) => {
  try {
    const { message, targetUser } = req.body;

    // Simple check for inappropriate terms (case insensitive)
    const hasInappropriateTerms = config.respectAgreement.inappropriateTerms.some(term => 
      message.toLowerCase().includes(term.toLowerCase())
    );

    if (hasInappropriateTerms) {
      // In a real app, this would trigger an actual email/alert system
      console.log(`[RESPECT AGREEMENT VIOLATION]`);
      console.log(`To: ${config.respectAgreement.adminEmail}`);
      console.log(`From User ID: ${req.user.id}`);
      console.log(`Message: ${message}`);
      console.log(`-----------------------------------`);

      return res.status(400).json({
        success: false,
        error: config.respectAgreement.violationMessage
      });
    }

    // Process valid feedback (e.g., save to DB)
    res.status(200).json({
      success: true,
      message: 'Thank you for your feedback. We value the respect in our community.'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};
