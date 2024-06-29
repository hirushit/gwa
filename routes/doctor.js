    const express = require('express');
    const router = express.Router();
    const multer = require('multer');
    const methodOverride = require('method-override');
    const nodemailer = require('nodemailer');
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
                                        <p>GWA Healthcare Team</p>`;

                        await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                        const acceptanceEmailContent = `<p>Dear Dr. ${doctor.name},</p>
                                                        <p>The appointment with ${booking.patient.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                                        <p>Join the meeting using the following link: <a href="${booking.meetingLink}">${booking.meetingLink}</a></p>
                                                        <p>Best regards,</p>
                                                        <p>GWA Healthcare Team</p>`;
                        await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Confirmation Notification', acceptanceEmailContent);
                    } else if (status === 'rejected') {
                        emailSubject = 'Appointment Rejection';
                        emailContent = `<p>Dear ${booking.patient.name},</p>
                                        <p>We regret to inform you that your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.</p>
                                        <p>Please contact us for further assistance.</p>
                                        <p>Best regards,</p>
                                        <p>GWA Healthcare Team</p>`;

                        await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                        const rejectionEmailContent = `<p>Dear Dr. ${doctor.name},</p>
                                                    <p>The appointment with ${booking.patient.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.</p>
                                                    <p>Best regards,</p>
                                                    <p>GWA Healthcare Team</p>`;
                        await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Rejection Notification', rejectionEmailContent);
                    }
                }
            } else {
                return res.status(404).send('Time slot not found');
            }

            res.redirect('/doctor/bookings');
        } catch (error) {
            console.error(error.message);
            res.status(500).send('Server Error');
        }
    });

    async function sendAppointmentEmail(recipientEmail, recipientName, subject, content) {
        try {
            const transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: recipientEmail,
                subject: subject,
                html: content
            };

            await transporter.sendMail(mailOptions);
            console.log(`Email sent successfully to ${recipientEmail}`);
        } catch (error) {
            console.error(`Error sending email to ${recipientEmail}:`, error);
        }
    }


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
