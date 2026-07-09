const User = require('../models/User');

// @desc    Force verify a user (for testing only)
// @route   POST /api/v1/testing/verify-user
// @access  Public (only exposed in non-production)
exports.forceVerifyUser = async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Please provide a userId'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { isVerified: true, verificationStatus: 'approved' },
            { new: true, runValidators: true }
        );

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        res.status(200).json({ success: true, data: user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};