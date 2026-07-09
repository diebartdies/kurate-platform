const User = require('../models/User');
const sendEmail = require('../sendEmail');
const config = require('../config/appConfig');
const fs = require('fs');

// @desc    Upload Payment Receipt
// @route   POST /api/v1/professionals/upload-receipt
// @access  Private (Professional)
exports.uploadReceipt = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'Please upload a receipt file or photo' });
    }

    // Convert receipt to Base64 to store directly in the database
    const base64Data = fs.readFileSync(req.file.path, 'base64');
    const receiptUrl = `data:${req.file.mimetype};base64,${base64Data}`;
    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path); // Remove external file

    const user = await User.findByIdAndUpdate(req.user.id, {
        $set: {
            'professionalProfile.paymentReceiptUrl': receiptUrl,
            'professionalProfile.paymentProcessed': false
        }
    }, { new: true });
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Notify the admin via email with a direct link to the receipt
    const fullReceiptUrl = `${req.protocol}://${req.get('host')}${receiptUrl}`;
    const message = `Payment Receipt Uploaded\n\nProfessional: ${user.professionalProfile?.alias || 'Unknown'} (${user.email})\n\nReceipt Link: ${fullReceiptUrl}\n\nPlease review and verify their payment status.`;

    try {
      await sendEmail({
        email: config.payment.adminEmail,
        subject: 'FullMinent - New Payment Receipt Upload',
        message: message
      });
    } catch (err) {
      console.error('Failed to send admin notification email:', err);
    }

    res.status(200).json({ success: true, data: receiptUrl, message: 'Receipt uploaded successfully.' });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};