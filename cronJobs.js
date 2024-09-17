const cron = require('node-cron');
const Doctor = require('./models/Doctor'); 
const nodemailer = require('nodemailer'); 

const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
});

const sendEmailReminder = async (doctor, daysLeft) => {
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: doctor.email, 
        subject: `Your subscription expires in ${daysLeft} day(s)`,
        text: `Dear Dr. ${doctor.name}, your subscription will expire in ${daysLeft} day(s). Please renew your subscription to continue enjoying our services.`,
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log(`Email sent to Dr. ${doctor.name} (${doctor.email}) for ${daysLeft} day(s) remaining.`);
    } catch (error) {
        console.error(`Error sending email to Dr. ${doctor.name}:`, error);
    }
};

cron.schedule('0 0 * * *', async () => {
    try {
        const today = new Date();

        const doctors = await Doctor.find({
            subscriptionType: { $in: ['Standard', 'Premium'] }
        });

        doctors.forEach(async (doctor) => {
            const subscriptionDate = new Date(doctor.subscriptionDate);
            const subscriptionDuration = doctor.subscriptionDuration;

            let expirationDate;
            if (subscriptionDuration === 'monthly') {
                expirationDate = new Date(subscriptionDate);
                expirationDate.setMonth(subscriptionDate.getMonth() + 1);
            } else if (subscriptionDuration === 'annual') {
                expirationDate = new Date(subscriptionDate);
                expirationDate.setFullYear(subscriptionDate.getFullYear() + 1);
            }

            const timeDiff = expirationDate.getTime() - today.getTime();
            const daysLeft = Math.ceil(timeDiff / (1000 * 3600 * 24)); 

            if (daysLeft === 7 || daysLeft === 3 || daysLeft === 2 || daysLeft === 1 || daysLeft === 0) {
                await sendEmailReminder(doctor, daysLeft);
            }
            if (daysLeft <= 0) {
                await Doctor.findByIdAndUpdate(doctor._id, {
                    subscriptionType: 'Free',
                    subscriptionVerification: 'Verified'
                });
                console.log(`Subscription updated to Free for Doctor ID: ${doctor._id}`);
            }
        });
    } catch (error) {
        console.error('Error during subscription downgrade:', error);
    }
});
