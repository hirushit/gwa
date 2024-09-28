const cron = require('node-cron');
const Doctor = require('./models/Doctor'); 

cron.schedule('* * * * *', async () => {
    try {
        const currentDate = new Date();
        const bufferDate = new Date(currentDate.getTime() - (55 * 60 * 1000)); 

        const doctors = await Doctor.find({ 
            "timeSlots.date": { $lt: bufferDate }, 
            "timeSlots.status": 'free' 
        });

        for (const doctor of doctors) {
            const originalSlotCount = doctor.timeSlots.length;

            doctor.timeSlots = doctor.timeSlots.filter(slot => !(slot.date < bufferDate && slot.status === 'free'));

            const updatedSlotCount = doctor.timeSlots.length;
            
            if (originalSlotCount !== updatedSlotCount) {
                await doctor.save();
            }
        }
    } catch (error) {
        console.error('Error removing expired free time slots:', error);
    }
});
