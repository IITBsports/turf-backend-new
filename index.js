const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { connectToDatabase } = require('./config/database');
const { Student, MainInfo, Banned, Otp } = require('./models');
const { mailToId, verifyTransporter, emailQueue, transporter } = require('./services/emailService');
const otpRoutes = require('./routes/otpRoutes');
const { Op } = require('sequelize');

const app = express();

// CORS Configuration
const allowedOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://gymkhana.iitb.ac.in',
    'https://gymkhana.iitb.ac.in/sports',
    'https://gymkhana.iitb.ac.in/sports/'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            console.log('Blocked origin:', origin);
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.options('*', cors());

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        status: 'OK',
        message: 'Turf Booking System API is running (MySQL)',
        timestamp: new Date().toISOString(),
        database: 'MySQL'
    });
});

// Health check endpoint
app.get('/health', async (req, res) => {
    const emailStats = emailQueue.getStats();
    let emailHealth = 'unknown';
    let dbHealth = 'unknown';
    
    try {
        await transporter.verify();
        emailHealth = 'connected';
    } catch (error) {
        emailHealth = 'failed';
    }
    
    try {
        const { sequelize } = require('./config/database');
        await sequelize.authenticate();
        dbHealth = 'connected';
    } catch (error) {
        dbHealth = 'failed';
    }
    
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        emailHealth,
        dbHealth,
        emailStats,
        uptime: process.uptime(),
        database: 'MySQL'
    });
});

// Test email endpoint
app.get('/test-email/:email?', async (req, res) => {
    const testEmail = req.params.email || 'test@example.com';
    
    const testMessage = `IITB SMTP Test Email - ${new Date().toISOString()}

Environment: ${process.env.NODE_ENV || 'development'}
Server Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
Node Version: ${process.version}
Database: MySQL

This email confirms that the IITB SMTP configuration is working correctly.

Technical Details:
- SMTP Host: smtp-auth.iitb.ac.in:587
- TLS: Enabled
- Authentication: Successful`;
    
    try {
        const startTime = Date.now();
        const result = await mailToId(testEmail, testMessage, 'IITB SMTP Test - MySQL Backend');
        const endTime = Date.now();
        
        res.json({
            success: result.success,
            message: result.success ? 'Test email sent successfully via IITB SMTP' : 'Failed to send test email',
            attempt: result.attempt || result.finalAttempt,
            error: result.error || null,
            environment: process.env.NODE_ENV || 'development',
            duration: `${endTime - startTime}ms`,
            smtpHost: 'smtp-auth.iitb.ac.in'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending test email',
            error: error.message,
            environment: process.env.NODE_ENV || 'development'
        });
    }
});

// Email queue management endpoints
app.get('/email-queue-status', (req, res) => {
    res.json(emailQueue.getStats());
});

app.post('/retry-email-queue', (req, res) => {
    if (!emailQueue.processing && emailQueue.queue.length > 0) {
        emailQueue.processQueue();
        res.json({ message: 'Email queue processing restarted', queueLength: emailQueue.queue.length });
    } else if (emailQueue.processing) {
        res.json({ message: 'Email queue is already processing', queueLength: emailQueue.queue.length });
    } else {
        res.json({ message: 'Email queue is empty', queueLength: 0 });
    }
});

app.delete('/clear-email-queue', (req, res) => {
    emailQueue.clearQueue();
    res.json({ message: 'Email queue cleared successfully' });
});

// OTP Routes
app.use('/api/otp', otpRoutes);

// Get all students
app.get('/students', async (req, res) => {
    try {
        const students = await Student.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get all main info
app.get('/maininfos', async (req, res) => {
    try {
        const mainInfos = await MainInfo.findAll({
            order: [['createdAt', 'DESC']]
        });
        res.json(mainInfos);
    } catch (error) {
        console.error('Error fetching main info:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get pending requests sorted by request time (FIFO)
app.get('/pending-requests/:slot/:date', async (req, res) => {
    try {
        const { slot, date } = req.params;
        
        const pendingRequests = await Student.findAll({
            where: {
                slot: slot,
                date: date,
                status: 'pending'
            },
            order: [['createdAt', 'ASC']]
        });

        res.status(200).json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending requests:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get slot availability status
app.get('/api/slots', async (req, res) => {
    try {
        // Fetch all student records from the database
        const mainInfos = await Student.findAll();

        // Helper function to convert UTC time to IST time and format as 'YYYY-MM-DD'
        const formatDateToIST = (date) => {
            const istOffset = 5 * 60 + 30;
            const istDate = new Date(date.getTime() + istOffset * 60 * 1000);
            return istDate.toISOString().split('T')[0];
        };

        // Get today's and tomorrow's dates in IST
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        const todayDate = formatDateToIST(today);
        const tomorrowDate = formatDateToIST(tomorrow);

        // Initialize slots array for both days
        const slotsStatus = [
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',
                date: todayDate
            })),
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',
                date: tomorrowDate
            }))
        ];

        // Group main info entries by slot number and date
        const slotGroups = {};
        mainInfos.forEach(info => {
            const slotNumber = info.slot;
            const slotDate = info.date;
            if (!slotGroups[slotNumber]) {
                slotGroups[slotNumber] = {};
            }
            if (!slotGroups[slotNumber][slotDate]) {
                slotGroups[slotNumber][slotDate] = [];
            }
            slotGroups[slotNumber][slotDate].push(info.status);
        });

        // Determine the status for each slot
        for (let i = 1; i <= 14; i++) {
            [todayDate, tomorrowDate].forEach(slotDate => {
                const statuses = (slotGroups[i] && slotGroups[i][slotDate]) || [];

                if (statuses.includes('accepted')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'booked';
                } else if (statuses.includes('pending')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'requested';
                } else if (statuses.every(status => status === 'declined')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'available';
                }
            });
        }

        res.status(200).json(slotsStatus);
    } catch (error) {
        console.error('Error fetching slot statuses:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create new student booking request with queued email
app.post('/', async (req, res) => {
    try {
        const {
            name,
            rollno,
            email,
            purpose,
            player_roll_no,
            no_of_players,
            status,
            slot,
            date,
        } = req.body;

        // Check if user is banned
        const isBanned = await Banned.findOne({ where: { rollno } });
        if (isBanned) {
            return res.status(403).json({ message: 'Booking denied: You are currently restricted from this service' });
        }

        const slotTimeMap = {
            1: "6:30 AM - 7:30 AM",
            2: "7:30 AM - 8:30 AM",
            3: "8:30 AM - 9:30 AM",
            4: "9:30 AM - 10:30 AM",
            5: "10:30 AM - 11:30 AM",
            6: "11:30 AM - 12:30 PM",
            7: "12:30 PM - 1:30 PM",
            8: "1:30 PM - 2:30 PM",
            9: "2:30 PM - 3:30 PM",
            10: "3:30 PM - 5:00 PM",
            11: "5:00 PM - 6:00 PM",
            12: "6:00 PM - 7:00 PM",
            13: "7:00 PM - 8:00 PM",
            14: "8:00 PM - 9:30 PM"
        };

        const slotTime = slotTimeMap[slot] || 'Unknown time range';

        // Create new student record
        const newStudent = await Student.create({
            name,
            rollno,
            email,
            purpose,
            player_roll_no,
            no_of_players,
            status: status || 'pending',
            slot,
            date,
            requestTime: new Date()
        });

        // Create new mainInfo record
        const newMainInfo = await MainInfo.create({
            rollno: newStudent.rollno,
            slot: newStudent.slot,
            status: newStudent.status,
            date: date,
            requestTime: newStudent.createdAt
        });

        // Prepare acknowledgment email message
        const message = `Greetings,

This email acknowledges your request to book the Gymkhana Football Turf. Please find the details of your request below:

Name: ${name}
Requested Time: ${slotTime}
Requested Date: ${date}
Request submitted at: ${newStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Please note that this is just an acknowledgment of your booking request. You will receive a final email confirming your booking if it is approved by the Institute Football Secretary.

Requests are processed on a first-come-first-served basis based on submission time.

We kindly request you to await the confirmation email before making any plans regarding the turf usage.

If you have any questions or need further assistance, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 8849468317`;

        // Add email to queue
        emailQueue.addToQueue(email, message, 'Turf Booking Request Received');

        res.status(200).json({
            student: newStudent,
            mainInfo: newMainInfo,
            message: `Request submitted successfully. You are in queue position based on ${newStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
            emailQueued: true
        });

    } catch (e) {
        console.error('Error creating booking:', e);
        res.status(500).json({ message: e.message });
    }
});

// Delete student request by ID
app.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const info = await Student.findByPk(id);

        if (!info) {
            return res.status(404).json({ message: "Request not found" });
        }

        // Delete corresponding mainInfo entry
        await MainInfo.destroy({ 
            where: { 
                rollno: info.rollno, 
                slot: info.slot 
            } 
        });

        // Delete student record
        await info.destroy();

        res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
        console.error('Error deleting request:', e);
        res.status(500).json({ message: e.message });
    }
});

// Update student status with FIFO approval
app.put('/student/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    try {
        if (!['accepted', 'declined'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const updatedStudent = await Student.findByPk(id);

        if (!updatedStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }

        // Update student status
        await updatedStudent.update({ status });

        // Update corresponding mainInfo record
        await MainInfo.update(
            { status: status },
            { 
                where: { 
                    rollno: updatedStudent.rollno, 
                    slot: updatedStudent.slot 
                } 
            }
        );

        let otherPendingRequests = [];

        // If accepting a request
        if (status === 'accepted') {
            // Check if this is the earliest pending request
            const earliestPendingRequest = await Student.findOne({
                where: {
                    slot: updatedStudent.slot,
                    date: updatedStudent.date,
                    status: 'pending'
                },
                order: [['createdAt', 'ASC']]
            });

            if (earliestPendingRequest && earliestPendingRequest.id !== parseInt(id)) {
                console.warn(`Warning: Accepting request ${id} but earlier pending request ${earliestPendingRequest.id} exists`);
            }

            // Get all other pending requests
            otherPendingRequests = await Student.findAll({
                where: {
                    slot: updatedStudent.slot,
                    date: updatedStudent.date,
                    status: 'pending',
                    id: { [Op.ne]: id }
                }
            });

            // Auto-decline all other pending requests
            await Student.update(
                { status: 'declined' },
                {
                    where: {
                        slot: updatedStudent.slot,
                        date: updatedStudent.date,
                        status: 'pending',
                        id: { [Op.ne]: id }
                    }
                }
            );

            // Update corresponding mainInfo records
            await MainInfo.update(
                { status: 'declined' },
                {
                    where: {
                        slot: updatedStudent.slot,
                        date: updatedStudent.date,
                        status: 'pending'
                    }
                }
            );

            // Queue decline emails for other pending requests
            for (const otherRequest of otherPendingRequests) {
                const declineMessage = `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined as the slot has been allocated to an earlier request.

Slot: ${updatedStudent.slot}
Date: ${updatedStudent.date}

We process requests on a first-come-first-served basis. Please try booking another available slot.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;

                emailQueue.addToQueue(otherRequest.email, declineMessage, 'Booking Declined - Slot Already Booked');
            }
        }

        const slotTimeMap = {
            1: "6:30 AM - 7:30 AM",
            2: "7:30 AM - 8:30 AM",
            3: "8:30 AM - 9:30 AM",
            4: "9:30 AM - 10:30 AM",
            5: "10:30 AM - 11:30 AM",
            6: "11:30 AM - 12:30 PM",
            7: "12:30 PM - 1:30 PM",
            8: "1:30 PM - 2:30 PM",
            9: "2:30 PM - 3:30 PM",
            10: "3:30 PM - 5:00 PM",
            11: "5:00 PM - 6:00 PM",
            12: "6:00 PM - 7:00 PM",
            13: "7:00 PM - 8:00 PM",
            14: "8:00 PM - 9:30 PM"
        };

        const updatedslotTime = slotTimeMap[updatedStudent.slot] || 'Unknown time range';

        // Prepare status update email
        let message = '';
        let emailSubject = '';

        if (status === 'accepted') {
            emailSubject = 'Turf Booking Confirmation';
            message = `Greetings,

This email is to confirm your booking of the Gymkhana Football Turf. Please find the booking details below:

Name: ${updatedStudent.name}
Time: ${updatedslotTime}
Date: ${updatedStudent.date}
Original Request Time: ${updatedStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

We kindly request you to make the most of this facility while adhering to the rules and regulations that help us maintain it for everyone's enjoyment.

If you have any questions or need further assistance, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;
        } else if (status === 'declined') {
            emailSubject = 'Booking Declined';
            message = `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined. We apologize for any inconvenience this may cause.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;
        }

        // Add status update email to queue
        emailQueue.addToQueue(updatedStudent.email, message, emailSubject);

        res.status(200).json({ 
            message: 'Status updated successfully', 
            student: updatedStudent,
            autoDeclinedCount: otherPendingRequests.length,
            emailQueued: true
        });
    } catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: error.message });
    }
});

// Ban a user
app.post('/banUser', async (req, res) => {
    const { rollno, reason } = req.body;
    try {
        const bannedUser = await Banned.create({ rollno, reason });
        res.status(200).json({ student: bannedUser });
    } catch (error) {
        console.error('Error banning user:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get main info for a specific slot and date
app.get('/maininfo/:slot/:date', async (req, res) => {
    const { slot, date } = req.params;

    try {
        const mainInfoInstance = await MainInfo.findOne({
            where: {
                slot: slot, 
                status: 'accepted',
                date: date
            }
        });

        if (!mainInfoInstance) {
            return res.status(404).json({ message: 'Empty slot' });
        }

        res.status(200).json({
            message: 'Slot found',
            data: mainInfoInstance
        });

    } catch (e) {
        console.error('Error fetching main info:', e);
        res.status(500).json({ message: e.message });
    }
});

// Get queue position for a specific request
app.get('/queue-position/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const studentRequest = await Student.findByPk(id);
        
        if (!studentRequest) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (studentRequest.status !== 'pending') {
            return res.status(200).json({ 
                message: `Request is ${studentRequest.status}`,
                position: null,
                status: studentRequest.status
            });
        }

        // Count earlier pending requests
        const earlierRequests = await Student.count({
            where: {
                slot: studentRequest.slot,
                date: studentRequest.date,
                status: 'pending',
                createdAt: { [Op.lt]: studentRequest.createdAt }
            }
        });

        const queuePosition = earlierRequests + 1;

        res.status(200).json({
            message: 'Queue position calculated',
            position: queuePosition,
            status: studentRequest.status,
            requestTime: studentRequest.createdAt,
            slot: studentRequest.slot,
            date: studentRequest.date
        });

    } catch (error) {
        console.error('Error calculating queue position:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Start the server
async function startServer() {
    try {
        console.log('Starting Turf Booking System (MySQL)...');
        
        // Connect to database
        await connectToDatabase();
        
        // Verify email transporter
        await verifyTransporter();
        
        const PORT = process.env.PORT || 3000;
        
        const server = app.listen(PORT, () => {
            console.log(`✓ Server running on port ${PORT}`);
            console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`✓ Database: MySQL`);
            console.log(`✓ Health check: http://localhost:${PORT}/health`);
        });

        // Handle server errors
        server.on('error', (err) => {
            console.error('✗ Server error:', err);
            process.exit(1);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM received, shutting down gracefully');
            server.close(() => {
                const { sequelize } = require('./config/database');
                sequelize.close();
                process.exit(0);
            });
        });

        return server;
    } catch (error) {
        console.error('✗ Server startup failed:', error);
        process.exit(1);
    }
}

console.log('Initializing Turf Booking System...');
startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
});