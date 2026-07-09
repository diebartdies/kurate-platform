const Review = require('../models/Review');
const User = require('../models/User');

// @desc    Get reviews for a professional
// @route   GET /api/v1/professionals/:professionalId/reviews
// @access  Public
exports.getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ professional: req.params.professionalId }).populate({
      path: 'author',
      select: 'name professionalProfile.alias' // Show author's name or alias
    });

    return res.status(200).json({
      success: true,
      count: reviews.length,
      data: reviews
    });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
};

// @desc    Add a review
// @route   POST /api/v1/professionals/:professionalId/reviews
// @access  Private
exports.addReview = async (req, res, next) => {
  try {
    req.body.professional = req.params.professionalId;
    req.body.author = req.user.id; // from protect middleware

    const professional = await User.findById(req.params.professionalId);

    if (!professional || professional.role !== 'professional') {
      return res.status(404).json({ success: false, error: 'No professional found with that ID' });
    }

    // Ensure user is not reviewing themselves
    if (professional._id.toString() === req.user.id) {
        return res.status(400).json({ success: false, error: 'You cannot review yourself.' });
    }

    const review = await Review.create(req.body);

    res.status(201).json({
      success: true,
      data: review
    });
  } catch (err) {
    // Handle duplicate key error for unique index
    if (err.code === 11000) {
        return res.status(400).json({ success: false, error: 'You have already submitted a review for this professional.' });
    }
    res.status(500).json({ success: false, error: err.message || 'Server Error' });
  }
};