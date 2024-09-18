const cron = require('node-cron');
const Doctor = require('./models/Doctor'); 

cron.schedule('* * * * *', async () => {
    try {
        const currentDate = new Date();
        const bufferDate = new Date(currentDate.getTime() - (55 * 60 * 1000)); // 55 minutes buffer

        // Find doctors with expired free time slots
        const doctors = await Doctor.find({ 
            "timeSlots.date": { $lt: bufferDate }, 
            "timeSlots.status": 'free' 
        });

        for (const doctor of doctors) {
            const originalSlotCount = doctor.timeSlots.length;

            // Filter out expired free slots
            doctor.timeSlots = doctor.timeSlots.filter(slot => !(slot.date < bufferDate && slot.status === 'free'));

            const updatedSlotCount = doctor.timeSlots.length;
            
            // Save only if slots were removed to avoid unnecessary saves
            if (originalSlotCount !== updatedSlotCount) {
                await doctor.save();
            }
        }
    } catch (error) {
        console.error('Error removing expired free time slots:', error);
    }
});
