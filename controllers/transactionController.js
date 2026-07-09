const User = require('../models/User');
const Connection = require('../models/Connection');

// @desc    Request a connection with a professional
// @route   POST /api/v1/transactions/request
// @access  Private (User or Guest)
exports.requestConnection = async (req, res, next) => {
  try {
    const { professionalAlias, message } = req.body;

    if (!professionalAlias) {
      return res.status(400).json({ success: false, error: 'Please provide a professional to connect with.' });
    }

    const professional = await User.findOne({
      'professionalProfile.alias': professionalAlias,
      role: 'professional',
      accountDeletedAt: null
    });

    if (!professional) {
      return res.status(404).json({ success: false, error: 'Professional not found.' });
    }

    // The requester's ID comes from the 'protect' middleware
    const requesterId = req.user.id;

    // Check if requester is trying to connect with themselves
    if (professional.id === requesterId) {
        return res.status(400).json({ success: false, error: 'You cannot connect with yourself.' });
    }

    await Connection.create({
      requester: requesterId,
      professional: professional.id,
      message: message
    });

    res.status(201).json({
      success: true,
      message: `Your connection request to ${professionalAlias} has been sent successfully.`
    });

  } catch (error) {
    // Handle potential unique index violation gracefully
    if (error.code === 11000) {
        return res.status(400).json({ success: false, error: 'You already have a pending connection request with this professional.' });
    }
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error: Could not process your request.' });
  }
};

// @desc    Get pending connection requests for a professional
// @route   GET /api/v1/transactions/requests
// @access  Private (Professional)
exports.getPendingRequests = async (req, res, next) => {
  try {
    const professionalId = req.user.id;
    const requests = await Connection.find({ professional: professionalId, status: 'pending' })
      .populate('requester', 'name email')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: requests.length,
      data: requests
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error: Could not fetch requests.' });
  }
};

// @desc    Update a connection request status
// @route   PUT /api/v1/transactions/requests/:id
// @access  Private (Professional)
exports.updateRequestStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    
    if (!['accepted', 'declined', 'completed', 'rejected'].includes(status)) {
        return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const connection = await Connection.findById(req.params.id);

    if (!connection) {
      return res.status(404).json({ success: false, error: 'Connection request not found' });
    }

    if (connection.professional.toString() !== req.user.id) {
        return res.status(403).json({ success: false, error: 'Not authorized to update this request' });
    }

    connection.status = status;
    await connection.save();

    res.status(200).json({
      success: true,
      data: connection
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Server Error: Could not update request.' });
  }
};