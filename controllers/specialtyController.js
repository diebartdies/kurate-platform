const Specialty = require('../models/Specialty');

// @desc    Get users by specialty (Query the Junction Table directly)
// @route   GET /api/v1/specialties/users
// @access  Public
exports.getUsersBySpecialty = async (req, res, next) => {
  try {
    const { specialty } = req.query;
    
    if (!specialty) {
      return res.status(400).json({ success: false, error: 'Please provide a specialty to query.' });
    }

    // Query the many-to-many junction table and populate the user details
    const records = await Specialty.find({ specialty: specialty }).populate('user');

    res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};