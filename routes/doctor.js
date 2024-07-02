const express = require('express');
const router = express.Router();
const multer = require('multer');
const moment = require('moment');
const methodOverride = require('method-override');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');

require('dotenv').config();

console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD);

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
        res.render('editDoctorProfile', { doctor });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        const updateData = {
            ...req.body,
            speciality: Array.isArray(req.body.speciality) ? req.body.speciality : [req.body.speciality],
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

        const booking = await Booking.findById(bookingId).populate('doctor').populate('patient');
        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const currentStatus = booking.status;

        booking.status = status;
        if (status === 'accepted' && !booking.meetingLink) {
            booking.meetingLink = await createGoogleMeetLink(booking);
        }
        await booking.save();

        const doctor = booking.doctor;
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const timeSlotIndex = doctor.timeSlots.findIndex(slot =>
            slot.date.toISOString() === booking.date.toISOString() &&
            slot.startTime === booking.time.split(' - ')[0]
        );

        if (timeSlotIndex !== -1) {
            if (currentStatus === 'rejected' && (status === 'waiting' || status === 'accepted')) {
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            } else if (status === 'rejected') {
                doctor.timeSlots[timeSlotIndex].status = 'free';
            } else {
                doctor.timeSlots[timeSlotIndex].status = 'booked';
            }

            await doctor.save();

            if (status === 'accepted' || status === 'rejected') {
                let emailSubject, emailContent;

                if (status === 'accepted') {
                    emailSubject = 'Appointment Confirmation';
                    emailContent = `<p>Dear ${booking.patient.name},</p>
                                    <p>Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                    <p>Join the meeting using the following link: <a href="${booking.meetingLink}">${booking.meetingLink}</a></p>
                                    <p>Best regards,</p>
                                    <p>Global Wellness Alliance Team</p>`;

                    await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                    const acceptanceEmailContent = `<p>Dear Dr. ${doctor.name},</p>
                                                    <p>The appointment with ${booking.patient.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                                    <p>Join the meeting using the following link: <a href="${booking.meetingLink}">${booking.meetingLink}</a></p>
                                                    <p>Best regards,</p>
                                                    <p>Global Wellness Alliance Team<</p>`;
                    await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Confirmation Notification', acceptanceEmailContent);
                } else if (status === 'rejected') {
                    emailSubject = 'Appointment Rejection';
                    emailContent = `<p>Dear ${booking.patient.name},</p>
                                    <p>We regret to inform you that your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.</p>
                                    <p>Please contact us for further assistance.</p>
                                    <p>Best regards,</p>
                                    <p>Global Wellness Alliance Team<</p>`;
                    await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);
                }
            }
        } else {
            console.error('Time slot not found for the given date and time');
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
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.post('/add-time-slot', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { date, startTime, endTime } = req.body;

        const doctor = await Doctor.findOne({ email: doctorEmail });
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const newTimeSlot = {
            date: moment(date).toDate(),
            startTime,
            endTime,
            status: 'free'
        };

        doctor.timeSlots.push(newTimeSlot);
        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

async function createGoogleMeetLink(booking) {
    const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const event = {
        summary: `Appointment with Dr. ${booking.doctor.name}`,
        description: `Appointment with Dr. ${booking.doctor.name} and patient ${booking.patient.name}`,
        start: {
            dateTime: booking.date.toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        end: {
            dateTime: new Date(booking.date.getTime() + 30 * 60000).toISOString(),
            timeZone: 'America/Los_Angeles',
        },
        attendees: [
            { email: booking.doctor.email },
            { email: booking.patient.email },
        ],
        conferenceData: {
            createRequest: {
                requestId: 'some-random-string',
                conferenceSolutionKey: {
                    type: 'hangoutsMeet'
                }
            }
        },
    };

    try {
        const response = await calendar.events.insert({
            calendarId: 'primary',
            resource: event,
            conferenceDataVersion: 1,
        });

        return response.data.hangoutLink;
    } catch (error) {
        console.error('Error creating Google Meet link:', error);
        throw new Error('Unable to create Google Meet link');
    }
}

async function sendAppointmentEmail(to, name, subject, content) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: content,
    };

    try {
        await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Unable to send email');
    }
}


router.get('/calendar', isLoggedIn, async (req, res) => {
    try {
        const doctorId = req.session.user._id; 
        const doctor = await Doctor.findById(doctorId);
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const currentDate = new Date();
        let currentMonth = parseInt(req.query.month) || currentDate.getMonth();
        let currentYear = parseInt(req.query.year) || currentDate.getFullYear();

        if (currentMonth < 0 || currentMonth > 11) {
            currentMonth = currentDate.getMonth();
        }
        if (currentYear < 1900 || currentYear > 2100) {
            currentYear = currentDate.getFullYear();
        }

        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

        const bookings = await Booking.find({
            doctor: doctorId,
            date: {
                $gte: new Date(currentYear, currentMonth, 1),
                $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
            },
            status: 'accepted'
        });

        const currentTime = {
            hours: currentDate.getHours(),
            minutes: currentDate.getMinutes(),
            seconds: currentDate.getSeconds()
        };

        res.render('doctorCalendar', {
            doctor,
            currentMonth,
            currentYear,
            daysInMonth,
            bookings,
            today: currentDate,
            currentTime, 
            months: [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ]
        });
    } catch (error) {
        console.error('Error fetching calendar data:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;
