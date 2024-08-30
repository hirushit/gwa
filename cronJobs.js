const cron = require('node-cron');
const Doctor = require('./models/Doctor'); 

cron.schedule('0 0 * * *', async () => { 
    try {
        const today = new Date();
        
        const doctors = await Doctor.find({
            subscription: 'Pending', 
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

            if (today >= expirationDate) {
                await Doctor.findByIdAndUpdate(doctor._id, {
                    subscriptionType: 'Free',
                    subscriptionVerification: 'Pending'
                });
                console.log(`Subscription updated to Free for Doctor ID: ${doctor._id}`);
            }
        });
    } catch (error) {
        console.error('Error during subscription downgrade:', error);
    }
});
