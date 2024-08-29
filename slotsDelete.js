const cron = require('node-cron');
const Doctor = require('./models/Doctor'); 

cron.schedule('0 * * * *', async () => {
    console.log(`Cron Job Started at ${new Date().toISOString()}`);
    try {
        const currentDate = new Date();
        console.log(`Current Date and Time: ${currentDate}`);

        const doctors = await Doctor.find({ 
            "timeSlots.date": { $lt: currentDate }, 
            "timeSlots.status": 'free' 
        });

        console.log(`Number of doctors with expired slots: ${doctors.length}`);

        for (const doctor of doctors) {
            const originalSlotCount = doctor.timeSlots.length;

            doctor.timeSlots = doctor.timeSlots.filter(slot => !(slot.date < currentDate && slot.status === 'free'));

            const updatedSlotCount = doctor.timeSlots.length;
            await doctor.save();

            console.log(`Doctor ID: ${doctor._id} | Removed ${originalSlotCount - updatedSlotCount} expired slots.`);
        }

        console.log('Expired free time slots removal completed successfully.');
    } catch (error) {
        console.error('Error removing expired free time slots:', error);
    }
    console.log(`Cron Job Ended at ${new Date().toISOString()}`);
});
