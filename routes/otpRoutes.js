const express = require('express');
const otpGenerator = require('otp-generator');
const { Otp } = require('../models');
const { sendOtp } = require('../services/emailService');
const router = express.Router();

// Route to generate and send OTP
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    
    if (!email.endsWith('@iitb.ac.in')) {
        return res.status(400).json({ message: 'Invalid IITB email address' });
    }

    try {
        // Delete any existing OTPs for this email
        await Otp.destroy({ where: { email } });

        // Generate a 6-digit OTP
        const otp = otpGenerator.generate(6, { 
            digits: true, 
            alphabets: false, 
            upperCase: false, 
            specialChars: false 
        });

        // Save OTP to database with expiration (5 minutes)
        await Otp.create({ 
            email, 
            otp,
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
        });

        // Send OTP to the user's email
        const result = await sendOtp(email, otp);

        if (result.success) {
            res.status(200).json({ message: 'OTP sent successfully' });
        } else {
            res.status(500).json({ message: 'Failed to send OTP email', error: result.error });
        }
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ message: 'Error sending OTP', error: error.message });
    }
});

// Route to verify OTP
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        // Find OTP record in the database (non-expired due to hook)
        const otpRecord = await Otp.findOne({ 
            where: { 
                email, 
                otp,
                verified: false
            } 
        });

        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // Mark OTP as verified
        await otpRecord.update({ verified: true });

        // Optionally, delete the OTP after verification
        // await otpRecord.destroy();

        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ message: 'Error verifying OTP', error: error.message });
    }
});

// Clean up expired OTPs (can be called by a cron job)
router.delete('/cleanup-expired', async (req, res) => {
    try {
        const result = await Otp.destroy({
            where: {
                expiresAt: {
                    [Otp.sequelize.Sequelize.Op.lt]: new Date()
                }
            }
        });

        res.status(200).json({ 
            message: 'Expired OTPs cleaned up', 
            deletedCount: result 
        });
    } catch (error) {
        console.error('Error cleaning up OTPs:', error);
        res.status(500).json({ message: 'Error cleaning up OTPs', error: error.message });
    }
});

module.exports = router;