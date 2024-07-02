// booking.js (Assuming this is where you manage bookings)
const Booking = require('../models/Booking');
const Chat = require('../models/Chat');

// Update booking status to confirmed and enable chat
router.post('/bookings/confirm/:id', async (req, res) => {
    try {
        const bookingId = req.params.id;
        const booking = await Booking.findByIdAndUpdate(bookingId, { status: 'confirmed' }, { new: true });

        // Create a new chat or find existing chat
        let chat = await Chat.findOne({ doctorId: booking.doctor, patientId: booking.patient });

        if (!chat) {
            // Create new chat
            chat = new Chat({
                doctorId: booking.doctor,
                patientId: booking.patient,
                messages: []
            });
        }

        // Optionally, you can notify the doctor or patient here

        await chat.save();

        res.redirect('/patient/dashboard'); // Redirect to patient dashboard
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});
