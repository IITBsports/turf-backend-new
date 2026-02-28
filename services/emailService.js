const nodemailer = require('nodemailer');

// IITB SMTP Configuration
const createIITBTransporter = () => {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST || "smtp-auth.iitb.ac.in",
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: process.env.SMTP_USER || '23b3934@iitb.ac.in',
            pass: process.env.SMTP_PASS || 'your_password_here'
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 60000,
        pool: true,
        maxConnections: 1,
        maxMessages: 10,
        rateDelta: 2000,
        rateLimit: 1,
        ignoreTLS: false,
        requireTLS: true,
        tls: {
            rejectUnauthorized: false,
            servername: 'smtp-auth.iitb.ac.in'
        }
    });
};

let transporter = createIITBTransporter();

// Verify transporter on startup
const verifyTransporter = async () => {
    try {
        console.log('Verifying SMTP connection...');
        await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('SMTP verification timeout')), 30000)
            )
        ]);
        
        console.log('✓ IITB SMTP server is ready');
        return true;
    } catch (error) {
        console.error('✗ SMTP connection failed:', error.message);
        transporter = createIITBTransporter();
        return false;
    }
};

// Send email function
const mailToId = async (receiverEmailId, message, subject = "Turf Booking System") => {
    const senderEmailId = process.env.SENDER_EMAIL || "noreply.23b3934@iitb.ac.in";
    
    const mailOptions = {
        from: senderEmailId,
        to: receiverEmailId,
        subject: subject,
        text: message
    };

    const maxRetries = 3;
    const baseRetryDelay = 3000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Sending email to ${receiverEmailId} (attempt ${attempt}/${maxRetries})`);
            
            const emailPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Email timeout after 45 seconds (attempt ${attempt})`));
                }, 45000);

                transporter.sendMail(mailOptions, (error, info) => {
                    clearTimeout(timeout);
                    if (error) {
                        reject(error);
                    } else {
                        resolve(info);
                    }
                });
            });

            const info = await emailPromise;
            
            console.log(`✓ Email sent successfully to ${receiverEmailId} on attempt ${attempt}`);
            
            return { success: true, info, attempt };
            
        } catch (error) {
            console.error(`✗ Email attempt ${attempt} failed:`, error.message);
            
            if (attempt < maxRetries) {
                const retryDelay = baseRetryDelay * attempt;
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
                    console.log('Recreating transporter due to connection error...');
                    transporter = createIITBTransporter();
                }
            } else {
                console.error(`Failed to send email to ${receiverEmailId} after ${maxRetries} attempts`);
                return { 
                    success: false, 
                    error: error.message,
                    finalAttempt: attempt
                };
            }
        }
    }
    
    return { success: false, error: 'Max retries exceeded' };
};

// Send OTP function
const sendOtp = async (email, otp) => {
    const message = `Your OTP for turf booking is ${otp}. It is valid for 5 minutes.`;
    return await mailToId(email, message, 'Your OTP for Booking');
};

// Email Queue class
class EmailQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.successCount = 0;
        this.failureCount = 0;
        this.lastError = null;
    }

    async addToQueue(receiverEmailId, message, subject) {
        this.queue.push({ 
            receiverEmailId, 
            message, 
            subject, 
            timestamp: new Date(),
            id: Date.now() + Math.random() 
        });
        
        console.log(`[QUEUE] Email added for ${receiverEmailId}. Queue length: ${this.queue.length}`);
        
        if (!this.processing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            console.log('✓ Email queue processing completed');
            return;
        }

        this.processing = true;
        const emailData = this.queue.shift();
        
        try {
            const result = await mailToId(emailData.receiverEmailId, emailData.message, emailData.subject);
            
            if (result.success) {
                this.successCount++;
                console.log(`✓ Queue email sent successfully to ${emailData.receiverEmailId}`);
            } else {
                this.failureCount++;
                this.lastError = result.error;
                console.error(`✗ Queue email failed for ${emailData.receiverEmailId}:`, result.error);
            }
            
        } catch (error) {
            this.failureCount++;
            this.lastError = error.message;
            console.error(`✗ Queue processing error for ${emailData.receiverEmailId}:`, error.message);
        }

        setTimeout(() => this.processQueue(), 3000);
    }

    getStats() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            successCount: this.successCount,
            failureCount: this.failureCount,
            lastError: this.lastError,
            environment: process.env.NODE_ENV || 'development'
        };
    }

    clearQueue() {
        this.queue = [];
        console.log('Email queue cleared');
    }
}

const emailQueue = new EmailQueue();

module.exports = { 
    sendOtp, 
    mailToId, 
    verifyTransporter, 
    emailQueue,
    transporter
};