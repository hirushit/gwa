const express = require('express');
const router = express.Router();
const multer = require('multer');
const methodOverride = require('method-override');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.use(methodOverride('_method'));

function isLoggedIn(req, res, next) {
    if (req.session.user && req.session.user.role === 'doctor') {
        return next();
    }
    res.redirect('/auth/login');
}

router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }
        res.render('doctorProfile', { doctor });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/edit', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail });
        res.render('editDoctorProfile', { doctor: doctor, index: 0 });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        // Convert speciality to array if it's a single value
        const speciality = Array.isArray(req.body.speciality) ? req.body.speciality : [req.body.speciality];

        const updateData = {
            ...req.body,
            speciality,  // Use the array value
            languages: Array.isArray(req.body.languages) ? req.body.languages : [req.body.languages],
            hospitals: Array.isArray(req.body.hospitals) ? req.body.hospitals : [req.body.hospitals],
            insurances: Array.isArray(req.body.insurances) ? req.body.insurances : [req.body.insurances],
            awards: Array.isArray(req.body.awards) ? req.body.awards : [req.body.awards],
            faqs: Array.isArray(req.body.faqs) ? req.body.faqs : [req.body.faqs],
        };

        doctor = await Doctor.findOneAndUpdate({ email: doctorEmail }, updateData, { new: true });

        if (req.file) {
            doctor.profilePicture = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await doctor.save();

        res.redirect('/doctor/profile');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.post('/profile/verify', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.verified = 'Pending';
        await doctor.save();

        req.flash('success_msg', 'Verification request sent. You will be notified once verified.');
        res.redirect('/doctor/profile');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/bookings', isLoggedIn, async (req, res) => {
    try {
        const bookings = await Booking.find({ doctor: req.session.user._id }).populate('patient');
        res.render('doctorBookings', { bookings });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.post('/bookings/:id', isLoggedIn, async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const currentStatus = booking.status; // Get current status before update

        // Update booking status
        booking.status = status;
        await booking.save();

        const doctor = await Doctor.findById(booking.doctor);
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        // Find the index of the time slot to update
        const timeSlotIndex = doctor.timeSlots.findIndex(slot =>
            slot.date.toISOString() === booking.date.toISOString() &&
            slot.startTime === booking.time.split(' - ')[0] // Extract start time from "14:05 - 14:10"
        );

        if (timeSlotIndex !== -1) {
            // Handle different status scenarios
            if (currentStatus === 'rejected' && (status === 'waiting' || status === 'accepted')) {
                // If status changes from rejected to waiting or accepted, mark time slot as booked
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            } else if (status === 'rejected') {
                // If status is rejected, mark time slot as free
                doctor.timeSlots[timeSlotIndex].status = 'free';
            } else {
                // Default: mark time slot as booked for waiting or accepted status
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            }

            await doctor.save();
        } else {
            return res.status(404).send('Time slot not found');
        }

        res.redirect('/doctor/bookings');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});



router.get('/manage-time-slots', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        res.render('manageTimeSlots', { doctor });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.post('/manage-time-slots', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { date, startTime, endTime } = req.body;

        if (!date || !startTime || !endTime) {
            return res.status(400).send('Invalid data format for time slot');
        }

        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.timeSlots.push({
            date: new Date(date),
            startTime,
            endTime,
            status: 'free'
        });

        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.delete('/manage-time-slots/:index', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { index } = req.params;

        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.timeSlots.splice(index, 1);
        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/patients', isLoggedIn, async (req, res) => {
    try {
        const patients = await Patient.find();
        res.json(patients);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
