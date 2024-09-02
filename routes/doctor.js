const express = require('express');
const router = express.Router();
const multer = require('multer');
const moment = require('moment');
const methodOverride = require('method-override');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Blog = require('../models/Blog');
const Doctor = require('../models/Doctor');
const Insurance = require('../models/Insurance');
const Admin = require('../models/Admin'); 
const Booking = require('../models/Booking');
const Chat = require('../models/Chat');
const Patient = require('../models/Patient');
const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

require('dotenv').config();

console.log('EMAIL_USER:', process.env.EMAIL_USER);
console.log('EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.use(methodOverride('_method'));

function isLoggedIn(req, res, next) {
    if (req.session && req.session.user && req.session.user.role === 'doctor') {
        req.user = req.session.user;
        return next();
    } else {
        console.warn('Unauthorized access attempt:', {
            ip: req.ip,
            originalUrl: req.originalUrl,
            user: req.session.user ? req.session.user.email : 'Guest'
        });
        res.redirect('/auth/login');
    }
}

function checkSubscription(req, res, next) {
    const user = req.session.user;
    const currentDate = new Date();

    if (user.subscriptionVerification === 'Verified') {
        if (user.subscriptionType === 'Free') {
            if (user.trialEndDate && currentDate <= new Date(user.trialEndDate)) {
                return next();
            } else {
                return res.redirect('/doctor/trial-expired');
            }
        } else if (user.subscriptionType === 'Premium' || user.subscriptionType === 'Standard') {
            return next();
        }
    }
    res.redirect('/doctor/subscription-message');
}


function isDoctor(req, res, next) {
    if (req.session.user && req.session.user.role === 'doctor') {
        return next();
    }
    res.redirect('/auth/login');
}

router.get('/doctor-index', isDoctor, isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;

        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        // Retrieve blogs with high priority and verified status
        const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).limit(5).exec();

        // Retrieve unique categories
        const categories = await Blog.distinct('categories', { verificationStatus: 'Verified' });

        // Retrieve unique hashtags and remove the '#' symbol
        let hashtags = await Blog.distinct('hashtags', { verificationStatus: 'Verified' });
        hashtags = hashtags.map(hashtag => hashtag.replace('#', ''));

        res.render('doctor-index', { doctor, blogs, categories, hashtags, user: req.session.user });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const insurances = await Insurance.find({ '_id': { $in: doctor.insurances } }).select('name logo');

        res.render('doctorProfile', { doctor, insurances });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

  
router.get('/edit', isLoggedIn, async (req, res) => {
    try {
      const doctorEmail = req.session.user.email;
      const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
      const allInsurances = await Insurance.find({}).select('_id name');
  
      if (!doctor.hospitals) {
        doctor.hospitals = [];
      }
  
      if (!doctor.insurances) {
        doctor.insurances = [];
      }
  
      res.render('editDoctorProfile', { doctor, allInsurances });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });
  
  router.post('/profile/update', upload.fields([
    { name: 'profilePicture' },
    { name: 'licenseProof' },
    { name: 'certificationProof' },
    { name: 'businessProof' }
]), isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        let hospitals = [];
        if (Array.isArray(req.body.hospitals)) {
            hospitals = req.body.hospitals.map((hospital) => {
                let hospitalData = {
                    name: hospital.name,
                    street: hospital.street,
                    city: hospital.city,
                    state: hospital.state,
                    country: hospital.country,
                    zip: hospital.zip
                };

                if (hospital.latitude && !isNaN(parseFloat(hospital.latitude))) {
                    hospitalData.lat = parseFloat(hospital.latitude);
                }
                if (hospital.longitude && !isNaN(parseFloat(hospital.longitude))) {
                    hospitalData.lng = parseFloat(hospital.longitude);
                }

                return hospitalData;
            });
        } else if (req.body.hospitals && req.body.hospitals.name) {
            let hospitalData = {
                name: req.body.hospitals.name,
                street: req.body.hospitals.street,
                city: req.body.hospitals.city,
                state: req.body.hospitals.state,
                country: req.body.hospitals.country,
                zip: req.body.hospitals.zip
            };

            if (req.body.hospitals.latitude && !isNaN(parseFloat(req.body.hospitals.latitude))) {
                hospitalData.lat = parseFloat(req.body.hospitals.latitude);
            }
            if (req.body.hospitals.longitude && !isNaN(parseFloat(req.body.hospitals.longitude))) {
                hospitalData.lng = parseFloat(req.body.hospitals.longitude);
            }

            hospitals = [hospitalData];
        }

        const insuranceIds = (Array.isArray(req.body.insurances) ? req.body.insurances : [req.body.insurances])
            .map(id => id.toString());

        const updateData = {
            ...req.body,
            aboutMe: req.body.aboutMe || doctor.aboutMe,
            speciality: Array.isArray(req.body.speciality) ? req.body.speciality : [req.body.speciality],
            languages: Array.isArray(req.body.languages) ? req.body.languages : [req.body.languages],
            insurances: insuranceIds,
            awards: Array.isArray(req.body.awards) ? req.body.awards : [req.body.awards],
            faqs: Array.isArray(req.body.faqs) ? req.body.faqs : [req.body.faqs],
            hospitals: hospitals,
            doctorFee: req.body.doctorFee ? parseFloat(req.body.doctorFee) : 85 
        };

        if (!updateData.documents) {
            updateData.documents = {};
        }

        updateData.documents.licenseProof = req.files['licenseProof'] && req.files['licenseProof'][0] ? {
            data: req.files['licenseProof'][0].buffer,
            contentType: req.files['licenseProof'][0].mimetype
        } : doctor.documents.licenseProof;

        updateData.documents.certificationProof = req.files['certificationProof'] && req.files['certificationProof'][0] ? {
            data: req.files['certificationProof'][0].buffer,
            contentType: req.files['certificationProof'][0].mimetype
        } : doctor.documents.certificationProof;

        updateData.documents.businessProof = req.files['businessProof'] && req.files['businessProof'][0] ? {
            data: req.files['businessProof'][0].buffer,
            contentType: req.files['businessProof'][0].mimetype
        } : doctor.documents.businessProof;

        if (req.files['profilePicture'] && req.files['profilePicture'][0]) {
            updateData.profilePicture = {
                data: req.files['profilePicture'][0].buffer,
                contentType: req.files['profilePicture'][0].mimetype
            };
        } else {
            updateData.profilePicture = doctor.profilePicture;
        }

        doctor = await Doctor.findOneAndUpdate({ email: doctorEmail }, updateData, { new: true });

        await doctor.save();

        res.redirect('/doctor/profile');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

    
router.get('/insights', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const totalPatients = await Booking.aggregate([
            { $match: { doctor: doctor._id, status: 'completed' } },
            { $group: { _id: "$patient" } },
            { $count: "uniquePatients" }
        ]);

        const totalConsultations = await Booking.countDocuments({ doctor: doctor._id, status: 'completed' });
        const totalReviews = doctor.reviews.length;

        const totalRatings = doctor.reviews.reduce((acc, review) => acc + review.rating, 0);
        const averageRating = totalReviews > 0 ? (totalRatings / totalReviews).toFixed(1) : 'No ratings';

        const bookingFilter = req.query['booking-filter'] || 'all';
        const insightsFilter = req.query['insight-filter'] || 'all';

        let startDate, endDate;

        if (bookingFilter === 'today') {
            startDate = new Date();
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date();
            endDate.setHours(23, 59, 59, 999);
        } else if (bookingFilter === 'week') {
            startDate = new Date();
            startDate.setDate(startDate.getDate() - startDate.getDay());
            endDate = new Date();
            endDate.setDate(endDate.getDate() + (6 - endDate.getDay()));
        } else if (bookingFilter === 'month') {
            startDate = new Date();
            startDate.setDate(1);
            endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0);
        } else if (bookingFilter === 'all') {
            startDate = new Date('1970-01-01'); 
            endDate = new Date(); 
        }

        const bookingRates = await Booking.aggregate([
            { $match: { doctor: doctor._id, date: { $gte: startDate, $lte: endDate } } },
            {
                $group: {
                    _id: { $dayOfWeek: '$date' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } } 
        ]);

        const totalUnreadMessages = await Chat.aggregate([
            { $match: { doctorId: doctor._id } },
            { $unwind: '$messages' },
            { $match: { 'messages.read': false, 'messages.senderId': { $ne: doctor._id } } },
            { $count: 'unreadCount' }
        ]);

        const waitingAppointmentsCount = await Booking.countDocuments({
            doctor: doctor._id,
            status: 'waiting'
        });

        const totalPostedSlots = doctor.timeSlots.length;
        const totalFilledSlots = doctor.timeSlots.filter(slot => slot.status === 'booked').length;

        const incomeByMonth = Array(5).fill(0);
        const currentDate = new Date();

        for (let i = 0; i < 5; i++) {
            const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
            const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 0);

            const monthlyIncome = await Booking.aggregate([
                { $match: { doctor: doctor._id, status: 'completed', paid: true, date: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$payment' } } }
            ]);

            incomeByMonth[4 - i] = monthlyIncome[0]?.total || 0;
        }

        const totalIncomeReceived = incomeByMonth.reduce((acc, income) => acc + income, 0);

        res.render('doctorInsights', {
            doctor,
            totalPatients: totalPatients[0]?.uniquePatients || 0,
            totalConsultations,
            totalReviews,
            averageRating,
            bookingRates,
            totalUnreadMessages: totalUnreadMessages[0]?.unreadCount || 0,
            waitingAppointmentsCount,
            totalPostedSlots,
            totalFilledSlots,
            totalIncomeReceived,
            incomeByMonth,
            bookingFilter,
            insightsFilter
        });
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

router.get('/bookings', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const bookings = await Booking.find({ doctor: req.session.user._id }).populate('patient');

        if (req.accepts('html')) {
            res.render('doctorBookings', { bookings });
        } else if (req.accepts('json')) {
            res.json({ bookings });
        } else {
            res.status(406).send('Not Acceptable');
        }
    } catch (error) {
        console.error(error.message);
        if (req.accepts('html')) {
            res.status(500).send('Server Error');
        } else if (req.accepts('json')) {
            res.status(500).json({ error: 'Server Error' });
        }
    }
});



router.post('/bookings/:id', isLoggedIn, async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId)
            .populate('doctor')
            .populate('patient');

        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const currentStatus = booking.status;

        const now = moment();

        const bookingDate = moment(booking.date);
        const bookingTimeStart = moment(booking.time.split(' - ')[0], 'HH:mm');
        const bookingTimeEnd = moment(booking.time.split(' - ')[1], 'HH:mm');

        const bookingStartDateTime = moment(bookingDate).set({
            hour: bookingTimeStart.get('hour'),
            minute: bookingTimeStart.get('minute')
        });

        const bookingEndDateTime = moment(bookingDate).set({
            hour: bookingTimeEnd.get('hour'),
            minute: bookingTimeEnd.get('minute')
        });

        if (now.isAfter(bookingEndDateTime)) {
            booking.status = 'completed';
        } else {
            booking.status = status;
        }

        if (status === 'accepted' && !booking.meetingLink && booking.consultationType === 'Video call') {
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
                    if (booking.consultationType === 'Video call') {
                        emailSubject = 'Appointment Confirmation';
                        emailContent = `<div style="font-family: Helvetica, Arial, sans-serif; min-width: 1000px; overflow: auto; line-height: 2;">
                                            <div style="margin: 50px auto; width: 70%; padding: 20px 0;">
                                                <div style="border-bottom: 1px solid #eee;">
                                                    <a href="" style="font-size: 1.4em; color: #00466a; text-decoration: none; font-weight: 600;">MedxBay</a>
                                                </div>
                                                <p style="font-size: 1.1em;">Hi ${booking.patient.name},</p>
                                                <p>Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                                <p>Join the meeting using the following link:</p>
                                                <a href="${booking.meetingLink}" style="background: #00466a; margin: 0 auto; width: max-content; padding: 0 10px; color: #fff; border-radius: 4px; text-decoration: none;">${booking.meetingLink}</a>
                                                <p style="font-size: 0.9em;">Best regards,<br />MedxBay Team</p>
                                                <hr style="border: none; border-top: 1px solid #eee;" />
                                                <div style="float: right; padding: 8px 0; color: #aaa; font-size: 0.8em; line-height: 1; font-weight: 300;">
                                                    <p>MedxBay</p>
                                                    <p>1600 Amphitheatre Parkway</p>
                                                    <p>California</p>
                                                </div>
                                            </div>
                                        </div>`;
                        await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                        const acceptanceEmailContent = `<div style="font-family: Helvetica, Arial, sans-serif; min-width: 1000px; overflow: auto; line-height: 2;">
                                                            <div style="margin: 50px auto; width: 70%; padding: 20px 0;">
                                                                <div style="border-bottom: 1px solid #eee;">
                                                                    <a href="" style="font-size: 1.4em; color: #00466a; text-decoration: none; font-weight: 600;">MedxBay</a>
                                                                </div>
                                                                <p style="font-size: 1.1em;">Hi Dr. ${doctor.name},</p>
                                                                <p>The appointment with ${booking.patient.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                                                <p>Join the meeting using the following link:</p>
                                                                <a href="${booking.meetingLink}" style="background: #00466a; margin: 0 auto; width: max-content; padding: 0 10px; color: #fff; border-radius: 4px; text-decoration: none;">${booking.meetingLink}</a>
                                                                <p style="font-size: 0.9em;">Best regards,<br />MedxBay Team</p>
                                                                <hr style="border: none; border-top: 1px solid #eee;" />
                                                                <div style="float: right; padding: 8px 0; color: #aaa; font-size: 0.8em; line-height: 1; font-weight: 300;">
                                                                    <p>MedxBay</p>
                                                                    <p>1600 Amphitheatre Parkway</p>
                                                                    <p>California</p>
                                                                </div>
                                                            </div>
                                                        </div>`;
                        await sendAppointmentEmail(doctor.email, doctor.name, 'Appointment Confirmation Notification', acceptanceEmailContent);

                        let chatMessage = `Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed. Join the meeting using the following link: ${booking.meetingLink}`;
                        await Chat.findOneAndUpdate(
                            { doctorId: booking.doctor, patientId: booking.patient },
                            { $push: { messages: { senderId: booking.doctor, text: chatMessage, timestamp: new Date() } } },
                            { upsert: true, new: true }
                        );
                    } else if (booking.consultationType === 'In-person') {
                        emailSubject = 'Appointment Confirmation';
                        emailContent = `<div style="font-family: Helvetica, Arial, sans-serif; min-width: 1000px; overflow: auto; line-height: 2;">
                                            <div style="margin: 50px auto; width: 70%; padding: 20px 0;">
                                                <div style="border-bottom: 1px solid #eee;">
                                                    <a href="" style="font-size: 1.4em; color: #00466a; text-decoration: none; font-weight: 600;">MedxBay</a>
                                                </div>
                                                <p style="font-size: 1.1em;">Hi ${booking.patient.name},</p>
                                                <p>Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed.</p>
                                                <p>Please visit the hospital at ${booking.hospital.name}, ${booking.hospital.location.street}, ${booking.hospital.location.city}, ${booking.hospital.location.state}, ${booking.hospital.location.country}, ${booking.hospital.location.zip}</p>
                                                <p style="font-size: 0.9em;">Best regards,<br />MedxBay Team</p>
                                                <hr style="border: none; border-top: 1px solid #eee;" />
                                                <div style="float: right; padding: 8px 0; color: #aaa; font-size: 0.8em; line-height: 1; font-weight: 300;">
                                                    <p>MedxBay</p>
                                                    <p>1600 Amphitheatre Parkway</p>
                                                    <p>California</p>
                                                </div>
                                            </div>
                                        </div>`;
                        await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                        let chatMessage = `Your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been confirmed. Please visit the hospital at ${booking.hospital.name}, ${booking.hospital.location.street}, ${booking.hospital.location.city}, ${booking.hospital.location.state}, ${booking.hospital.location.country}, ${booking.hospital.location.zip}`;
                        await Chat.findOneAndUpdate(
                            { doctorId: booking.doctor, patientId: booking.patient },
                            { $push: { messages: { senderId: booking.doctor, text: chatMessage, timestamp: new Date() } } },
                            { upsert: true, new: true }
                        );
                    }
                } else if (status === 'rejected') {
                    emailSubject = 'Appointment Rejection';
                    emailContent = `<div style="font-family: Helvetica, Arial, sans-serif; min-width: 1000px; overflow: auto; line-height: 2;">
                                        <div style="margin: 50px auto; width: 70%; padding: 20px 0;">
                                            <div style="border-bottom: 1px solid #eee;">
                                                <a href="" style="font-size: 1.4em; color: #00466a; text-decoration: none; font-weight: 600;">MedxBay</a>
                                            </div>
                                            <p style="font-size: 1.1em;">Hi ${booking.patient.name},</p>
                                            <p>We regret to inform you that your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.</p>
                                            <p style="font-size: 0.9em;">Best regards,<br />MedxBay Team</p>
                                            <hr style="border: none; border-top: 1px solid #eee;" />
                                            <div style="float: right; padding: 8px 0; color: #aaa; font-size: 0.8em; line-height: 1; font-weight: 300;">
                                                <p>MedxBay</p>
                                                <p>1600 Amphitheatre Parkway</p>
                                                <p>California</p>
                                            </div>
                                        </div>
                                    </div>`;
                    await sendAppointmentEmail(booking.patient.email, booking.patient.name, emailSubject, emailContent);

                    let chatMessage = `We regret to inform you that your appointment with Dr. ${doctor.name} on ${booking.date.toDateString()} at ${booking.time} has been rejected.`;
                    await Chat.findOneAndUpdate(
                        { doctorId: booking.doctor, patientId: booking.patient },
                        { $push: { messages: { senderId: booking.doctor, text: chatMessage, timestamp: new Date() } } },
                        { upsert: true, new: true }
                    );
                }
            }
        }

        res.redirect(`/doctor/bookings`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

router.get('/completed-bookings', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorId = req.session.user._id; 
        const completedBookings = await Booking.find({ doctor: doctorId, status: 'completed' })
                                               .populate('patient')
                                               .sort({ date: 'desc' });

        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            const bookingsWithPatientIds = completedBookings.map(booking => ({
                ...booking.toObject(),
                patientId: booking.patient._id
            }));
            res.json({ bookings: bookingsWithPatientIds });
        } else {
            res.render('completed-bookings', { bookings: completedBookings });
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.get('/reviews/:doctorId', isLoggedIn, async (req, res) => {
    try {
        const doctorId = req.params.doctorId;
        if (!doctorId) {
            return res.status(400).send('Doctor ID is required');
        }

        const doctor = await Doctor.findById(doctorId)
            .populate({
                path: 'reviews.patientId', 
                select: 'name' 
            });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const reviews = doctor.reviews;

        res.render('doctorReviews', { reviews, doctor });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.get('/bookings/:id/prescription', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const bookingId = req.params.id;
        const booking = await Booking.findById(bookingId).populate('patient').populate('doctor');
        
        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const patient = booking.patient;
        const doctor = booking.doctor;

        const today = new Date();
        const birthDate = new Date(patient.dateOfBirth);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDifference = today.getMonth() - birthDate.getMonth();
        if (monthDifference < 0 || (monthDifference === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        res.render('uploadPrescription', {
            booking,
            patient,
            doctor,
            patientAge: age
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.post('/prescriptions/upload', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const { patientId, doctorId, patientName, doctorName, doctorSpeciality, doctorEmail, patientAge, medicines, meetingDate, meetingTime } = req.body;

        const processedMedicines = medicines.map(medicine => ({
            name: medicine.name,
            dosage: medicine.dosage,
            beforeFood: !!medicine.beforeFood,
            afterFood: !!medicine.afterFood,
            timing: {
                morning: !!medicine.timing.morning,
                afternoon: !!medicine.timing.afternoon,
                night: !!medicine.timing.night
            }
        }));

        const prescription = new Prescription({
            patientId,
            doctorId,
            patientName,
            doctorName,
            doctorSpeciality,
            doctorEmail,
            patientAge,
            medicines: processedMedicines,
            meetingDate: new Date(meetingDate),
            meetingTime
        });

        await prescription.save();

        const downloadLink = `${req.protocol}://${req.get('host')}/patient/prescriptions/${prescription._id}/download`;
  
        const chatMessage = `You have a new prescription from Dr. ${doctorName}. You can download it using the following link: ${downloadLink}`;
        await Chat.findOneAndUpdate(
            { doctorId: doctorId, patientId: patientId },
            { $push: { messages: { senderId: doctorId, text: chatMessage, timestamp: new Date() } } },
            { upsert: true, new: true }
        );

        res.redirect('/doctor/completed-bookings');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.get('/doctor-view/:id/prescriptions', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const patientId = req.params.id;
        const prescriptions = await Prescription.find({ patientId }).populate('doctorId').populate('patientId');

        if (!prescriptions) {
            return res.status(404).send('No prescriptions found for this patient');
        }

        res.render('view-prescriptions', {
            prescriptions
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/manage-time-slots', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).populate('timeSlots.hospital').exec();
        
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
            doctor: doctor._id,
            date: {
                $gte: new Date(currentYear, currentMonth, 1),
                $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
            },
            status: 'accepted'
        });

        const data = {
            doctor,
            currentMonth,
            currentYear,
            daysInMonth,
            timeSlots: doctor.timeSlots,
            bookings,
            months: [
                'January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'
            ]
        };
        if (req.headers.accept && req.headers.accept.includes('application/json')) {
            res.json(data);
        } else {
            res.render('manageTimeSlots', data);
        }
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});
router.delete('/manage-time-slots/:id', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        console.log('Request Params:', req.params);

        const doctorEmail = req.session.user.email;
        const { id } = req.params;

        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }
        doctor.timeSlots = doctor.timeSlots.filter(slot => slot._id.toString() !== id);

        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.post('/add-time-slot', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { date, startTime, endTime, hospital, endDate } = req.body;

        const doctor = await Doctor.findOne({ email: doctorEmail });
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        if (doctor.subscriptionType === 'Free' && doctor.maxTimeSlots <= 0) {
            return res.json({ error: 'You have reached the limit of time slots for the free trial. Please subscribe to add more.' });
        }

        const selectedHospital = doctor.hospitals.find(h => h.name === hospital);
        if (!selectedHospital) {
            return res.status(404).send('Hospital not found');
        }

        const start = new Date(date);
        const end = new Date(endDate || date);

        if (isNaN(start.getTime()) || isNaN(end.getTime()) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(startTime) || !/^([01]\d|2[0-3]):([0-5]\d)$/.test(endTime)) {
            return res.status(400).send('Invalid date or time format');
        }

        let currentDate = new Date(start);
        let newTimeSlots = [];

        while (currentDate <= end) {
            if (doctor.subscriptionType === 'Free' && doctor.maxTimeSlots <= 0) {
                return res.json({ error: 'You have reached the limit of time slots for the free trial. Please subscribe to add more.' });
            }

            const newTimeSlot = {
                date: new Date(currentDate),
                startTime,
                endTime,
                status: 'free',
                hospital: hospital,
                hospitalLocation: {
                    street: selectedHospital.street,
                    city: selectedHospital.city,
                    state: selectedHospital.state,
                    country: selectedHospital.country,
                    zip: selectedHospital.zip
                }
            };

            if (selectedHospital.lat && selectedHospital.lng) {
                newTimeSlot.lat = selectedHospital.lat;
                newTimeSlot.lng = selectedHospital.lng;
            }

            newTimeSlots.push(newTimeSlot);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (doctor.subscriptionType === 'Free' && newTimeSlots.length > doctor.maxTimeSlots) {
            return res.json({ error: 'You are allowed to add only a limited number of time slots for the free trial. Please subscribe to add more.' });
        }

        doctor.timeSlots.push(...newTimeSlots);

        if (doctor.subscriptionType === 'Free') {
            doctor.maxTimeSlots -= newTimeSlots.length;
        }

        await doctor.save();
        // res.json({ success: 'Time slots added successfully.' });
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
        guestsCanModify: true, 
        guestsCanInviteOthers: true, 
        guestsCanSeeOtherGuests: true, 
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

router.get('/calendar', isLoggedIn, checkSubscription, async (req, res) => {
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

router.use(methodOverride('_method'));
router.get('/subscribe', isLoggedIn, async (req, res) => {
    res.render('subscriptionForm');
});

router.post('/subscribe', isLoggedIn, async (req, res) => {
    try {
        const { subscriptionType, subscriptionDuration } = req.body; 
        const paymentDetails = req.body.paymentDetails;
        const doctorId = req.session.user._id; 
        const amount = parseInt(paymentDetails.amount, 10);
        console.log(amount);
    
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).send('Invalid payment amount');
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${subscriptionType} Subscription`,
                    },
                    unit_amount: amount, 
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/doctor/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/doctor/subscription-failure`,
        });
    
        req.session.subscriptionInfo = {
            doctorId,
            subscriptionType,
            subscriptionDuration,  
            paymentDetails: {
                amount: amount,
                currency: 'usd'
            }
        };
    
        res.redirect(303, session.url);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Route to handle subscription success
router.get('/subscription-success', async (req, res) => {
    try {
        const session = await stripe.checkout.sessions.retrieve(req.query.session_id);

        if (session.payment_status === 'paid') {
            const { doctorId, subscriptionType, paymentDetails, subscriptionDuration } = req.session.subscriptionInfo;
            const subscriptionDate = new Date();

            const paymentDetailsString = JSON.stringify(paymentDetails);

            const updatedDoctor = await Doctor.findByIdAndUpdate(
                doctorId,
                {
                    subscription: 'Pending',
                    subscriptionType,
                    paymentDetails: paymentDetailsString,
                    subscriptionVerification: 'Verified', // Set to Verified
                    subscriptionDate,
                    subscriptionDuration: subscriptionDuration === 'annual' ? 'annual' : 'monthly'
                },
                { new: true }
            );

            res.render('subscriptionSuccess', { doctor: updatedDoctor });
        } else {
            res.status(400).send('Payment was not successful');
        }
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/subscription-failure', (req, res) => {
    res.send('Subscription payment failed. Please try again.');
});


router.get('/blog', (req, res) => {
    res.render('blog-upload-form'); 
});

router.post('/blog', isLoggedIn, checkSubscription, upload.single('image'), async (req, res) => {
    try {
        const authorEmail = req.session.user.email;
        const { title, author, description, categories, subcategories, hashtags, priority } = req.body;

        const doctor = await Doctor.findOne({ email: authorEmail });

        let authorId = null;
        if (doctor) {
            authorId = doctor._id; 
        }

        const newBlog = new Blog({
            title,
            author,
            description,
            authorEmail,
            authorId, 
            categories: categories,
            subcategories: subcategories, 
            hashtags: hashtags, 
            priority,
            image: {
                data: req.file.buffer,
                contentType: req.file.mimetype
            },
            verificationStatus: 'Pending'
        });

        await newBlog.save();

        res.render('blog-success', { message: 'Blog uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});


router.get('/blogs/category/:category', isDoctor, isLoggedIn, async (req, res) => {
    try {
        const { category } = req.params;

        // Fetch blogs by category
        const blogs = await Blog.find({ 
            categories: { $in: [category] }, 
            verificationStatus: 'Verified' 
        }).lean();

        // Fetch most read blogs
        const mostReadBlogs = await Blog.find({ verificationStatus: 'Verified' })
            .sort({ readCount: -1 })
            .limit(5)
            .lean();

        // Fetch related posts by the same category
        const relatedPosts = await Blog.find({
            verificationStatus: 'Verified',
            categories: { $in: [category] }
        })
        .limit(5)
        .lean();

        // Fetch all categories
        const categories = await Blog.distinct('categories');

        // Count the number of blogs in each category
        const categoryCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const categoryCountMapObj = categoryCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // Fetch all hashtags
        const hashtags = await Blog.distinct('hashtags');

        // Count the number of blogs in each hashtag
        const hashtagCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$hashtags' },
            { $group: { _id: '$hashtags', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const hashtagCountMapObj = hashtagCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        res.render('DoctorBlogs', {
            blogs,
            filterType: 'Category',
            filterValue: category,
            searchQuery: req.query.search || '',
            user: req.session.user,
            mostReadBlogs,
            relatedPosts,
            categories,
            hashtags,
            categoryCountMap: categoryCountMapObj,
            hashtagCountMap: hashtagCountMapObj
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});



router.get('/blogs/hashtag/:hashtag', isDoctor, isLoggedIn, async (req, res) => {
    try {
        // Retrieve hashtag from URL and format it
        let hashtagParam = req.params.hashtag;
        const hashtag = hashtagParam.startsWith('#') ? hashtagParam : `#${hashtagParam}`;

        // Fetch blogs by hashtag
        const blogs = await Blog.find({ 
            hashtags: { $in: [hashtag] }, 
            verificationStatus: 'Verified' 
        }).lean();

        // Fetch most read blogs
        const mostReadBlogs = await Blog.find({ verificationStatus: 'Verified' })
            .sort({ readCount: -1 })
            .limit(5)
            .lean();

        // Fetch related posts by the same hashtag
        const relatedPostsByHashtag = await Blog.find({
            verificationStatus: 'Verified',
            hashtags: { $in: [hashtag] }
        })
        .limit(5)
        .lean();

        // Fetch categories of the blogs that match the hashtag
        const relatedCategories = await Blog.find({ 
            hashtags: { $in: [hashtag] }, 
            verificationStatus: 'Verified' 
        }).distinct('categories');

        // Fetch most read blogs within these categories
        const mostReadBlogsByCategory = await Blog.find({
            categories: { $in: relatedCategories },
            verificationStatus: 'Verified'
        })
        .sort({ readCount: -1 })
        .limit(5)
        .lean();

        // Fetch all hashtags
        const hashtags = await Blog.distinct('hashtags');

        // Count the number of blogs in each hashtag
        const hashtagCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$hashtags' },
            { $group: { _id: '$hashtags', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const hashtagCountMapObj = hashtagCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        // Fetch all categories
        const categories = await Blog.distinct('categories');

        // Count the number of blogs in each category
        const categoryCountMap = await Blog.aggregate([
            { $match: { verificationStatus: 'Verified' } },
            { $unwind: '$categories' },
            { $group: { _id: '$categories', count: { $sum: 1 } } },
            { $project: { _id: 1, count: 1 } }
        ]).exec();

        const categoryCountMapObj = categoryCountMap.reduce((acc, curr) => {
            acc[curr._id] = curr.count;
            return acc;
        }, {});

        res.render('DoctorBlogs', {
            blogs,
            filterType: 'Hashtag',
            filterValue: hashtagParam,
            searchQuery: req.query.search || '',
            user: req.session.user,
            mostReadBlogs,
            relatedPosts: relatedPostsByHashtag,
            mostReadBlogsByCategory,
            categories,
            hashtags,
            categoryCountMap: categoryCountMapObj,
            hashtagCountMap: hashtagCountMapObj
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});



router.get('/profile/blogs', isLoggedIn, async (req, res) => {
    try {
      const doctorEmail = req.session.user.email; 
  
      const blogs = await Blog.find({ authorEmail: doctorEmail });
  
      res.render('profile-blogs', { blogs });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  router.get('/blogs/edit/:id', isLoggedIn, async (req, res) => {
    try {
      const blog = await Blog.findById(req.params.id);
  
      if (!blog) {
        console.error('Blog not found');
        return res.status(404).send('Blog not found');
      }
  
      if (!req.session.user || !req.session.user._id) {
        console.error('Unauthorized: No user session found');
        return res.status(403).send('Unauthorized');
      }
  
      if (!blog.authorId) {
        console.error('Blog author ID is not defined');
        return res.status(403).send('Unauthorized');
      }
  
      if (blog.authorId.toString() !== req.session.user._id.toString()) {
        return res.status(403).send('Unauthorized');
      }
  
      res.render('edit-blog', { blog });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
    }
  });
  
  router.post('/blogs/edit/:id', isLoggedIn, checkSubscription, upload.single('image'), async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        if (blog.authorId.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        const { title, description, summary, categories, subcategories, hashtags } = req.body;

        blog.title = title;
        blog.description = description;
        blog.summary = summary;
        blog.categories = Array.isArray(categories) ? categories : categories.split(',');
        blog.subcategories = Array.isArray(subcategories) ? subcategories : subcategories.split(',');
        blog.hashtags = Array.isArray(hashtags) ? hashtags : hashtags.split(',');

        blog.verificationStatus = 'pending';

        if (req.file) {
            blog.image.data = req.file.buffer;
            blog.image.contentType = req.file.mimetype;
        }

        await blog.save();

        res.redirect('/doctor/profile/blogs'); 
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/dashboard', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const doctor = await Doctor.findOne({ email: req.session.user.email }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        const chats = await Chat.find({ doctorId: doctor._id })
            .populate('patientId', 'name')
            .sort({ updatedAt: -1 })
            .lean(); 

        chats.forEach(chat => {
            chat.unreadCount = chat.messages.filter(message => 
                !message.read && message.senderId.toString() !== doctor._id.toString()
            ).length;
        });

        res.render('doctorDashboard', { doctor, chats });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});



router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
    try {
        const { message } = req.body;
        const doctor = await Doctor.findOne({ email: req.session.user.email });
        const chatId = req.params.chatId;

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        let chat = await Chat.findOneAndUpdate(
            { _id: chatId, doctorId: doctor._id },
            { $push: { messages: { senderId: doctor._id, text: message, timestamp: new Date(), read: false } } },
            { new: true }
        );

        const patient = await Patient.findById(chat.patientId);

        if (patient) {
            await Notification.create({
                userId: patient._id,
                message: `New message from Dr. ${doctor.name}: ${message}`, 
                type: 'chat',
                chatId: chat._id, 
                read: false,
                createdAt: new Date()
            });
        }

        res.redirect(`/doctor/chat/${chat._id}`);

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});
router.get('/chat/:id', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const chatId = req.params.id;

        console.log('Request Details:', {
            method: req.method,
            url: req.url,
            params: req.params,
            query: req.query,
            user: req.user
        });

        const chat = await Chat.findById(chatId)
            .populate('patientId', 'name email profilePicture') 
            .lean();

        if (!chat) {
            console.log('Chat not found');
            return res.status(404).json({ error: 'Chat not found' });
        }

        chat.messages.forEach(message => {
            if (!message.text) {
                console.error(`Message missing text found: ${message._id}`);
            }

            if (message.senderId.toString() !== req.user._id.toString() && !message.read) {
                message.read = true;
            }
        });

        await Chat.findByIdAndUpdate(chatId, { $set: { messages: chat.messages } });

        console.log('Updated Chat Data:', chat);

        res.json({ 
            chat, 
            patientProfilePicture: chat.patientId.profilePicture 
        });

    } catch (err) {
        console.error('Error Message:', err.message);
        res.status(500).json({ error: 'Server Error' });
    }
});

router.get('/blogs/view/:id', isLoggedIn, checkSubscription, async (req, res) => {
    try {
        const blogId = req.params.id;

        let blog = await Blog.findById(blogId).lean();
        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        if (!req.session.viewedBlogs) {
            req.session.viewedBlogs = [];
          }
      
          if (!req.session.viewedBlogs.includes(blogId)) {
            await Blog.findByIdAndUpdate(blogId, { $inc: { readCount: 1 } });
            req.session.viewedBlogs.push(blogId);
          }

        const relatedPosts = await Blog.find({
            $or: [
                { categories: { $in: blog.categories } },
                { hashtags: { $in: blog.hashtags } }
            ],
            _id: { $ne: blog._id }, 
            verificationStatus: "Verified" 
        }).limit(5).lean();

        const mostReadPosts = await Blog.find({
            _id: { $ne: blog._id },
            verificationStatus: "Verified" 
        }).sort({ readCount: -1 }).limit(5).lean();

        res.render('DoctorViewBlog', { blog, relatedPosts, mostReadPosts });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});



  
router.post('/blogs/comment/:id', isLoggedIn, async (req, res) => {
    try {
        const { comment } = req.body;
        const blogId = req.params.id;
        const blog = await Blog.findById(blogId);
  
        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        const user = req.session.user;

        blog.comments.push({
            username: user.name,
            comment: comment,
            profilePicture: {
                data: user.profilePicture.data, 
                contentType: user.profilePicture.contentType
            }
        });
  
        await blog.save();
  
        req.flash('success_msg', 'Comment added successfully');
        res.redirect(`/doctor/blogs/view/${blogId}`);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

  
  router.get('/author/:id', async (req, res) => {
    try {
      const authorId = req.params.id;
  
      let author = await Doctor.findById(authorId);
  
      if (!author) {
        author = await Admin.findById(authorId);
      }
  
      if (!author) {
        return res.status(404).send('Author not found');
      }
  
      const blogCount = await Blog.countDocuments({ authorId });
  
      res.render('doctor-author-info', {
        author,
        blogCount
      });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });
router.get('/priority-blogs', async (req, res) => {
      try {
        const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).lean();
  
        res.render('priorityblogs', { blogs });
      } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
      }
    });
function escapeRegex(text) {
        return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
      }
      
router.get('/blogs', isDoctor, isLoggedIn, async (req, res) => {
        try {
            let filter = { verificationStatus: 'Verified' };
    
            if (req.query.search) {
                const regex = new RegExp(escapeRegex(req.query.search), 'gi');
    
                filter = {
                    verificationStatus: 'Verified',
                    $or: [
                        { title: regex },
                        { categories: regex },
                        { hashtags: regex }
                    ]
                };
            }
    
            // Retrieve distinct categories and hashtags
            const categories = await Blog.distinct('categories', { verificationStatus: 'Verified' });
            const hashtags = await Blog.distinct('hashtags', { verificationStatus: 'Verified' });
    
            // Count the number of blogs in each category
            const categoryCountMap = await Blog.aggregate([
                { $match: { verificationStatus: 'Verified' } },
                { $unwind: '$categories' },
                { $group: { _id: '$categories', count: { $sum: 1 } } },
                { $project: { _id: 1, count: 1 } }
            ]).exec();
    
            const categoryCountMapObj = categoryCountMap.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {});
    
            // Count the number of blogs in each hashtag
            const hashtagCountMap = await Blog.aggregate([
                { $match: { verificationStatus: 'Verified' } },
                { $unwind: '$hashtags' },
                { $group: { _id: '$hashtags', count: { $sum: 1 } } },
                { $project: { _id: 1, count: 1 } }
            ]).exec();
    
            const hashtagCountMapObj = hashtagCountMap.reduce((acc, curr) => {
                acc[curr._id] = curr.count;
                return acc;
            }, {});
    
            // Find blogs based on the filter
            const verifiedBlogs = await Blog.find(filter).lean();
    
            // Fetch most read blogs
            const mostReadBlogs = await Blog.find({ verificationStatus: 'Verified' })
                .sort({ readCount: -1 })
                .limit(5)
                .lean();
    
            // Fetch related posts based on categories (exclude current category)
            const relatedPosts = await Blog.find({
                verificationStatus: 'Verified',
                categories: { $in: categories }
            })
            .limit(5)
            .lean();
    
            res.render('DoctorBlogs', { 
                blogs: verifiedBlogs, 
                searchQuery: req.query.search,
                categories,
                hashtags,
                categoryCountMap: categoryCountMapObj, // Pass category counts to template
                hashtagCountMap: hashtagCountMapObj, // Pass hashtag counts to template
                filterType: 'All', // Default filter type
                filterValue: '', // Default filter value
                mostReadBlogs, // Add most read blogs
                relatedPosts // Add related posts
            });
        } catch (err) {
            console.error(err.message);
            res.status(500).send('Server Error');
        }
    });
    
    
    
  router.get('/notifications', isLoggedIn, async (req, res) => {
    try {
      const notifications = await Notification.find({ userId: req.user._id }).lean();
  
      const chatNotifications = notifications.filter(notification => notification.type === 'chat');
      const otherNotifications = notifications.filter(notification => notification.type !== 'chat');
  
      const chatDetailsPromises = chatNotifications.map(async (notification) => {
        try {
          if (!notification.chatId) {
            console.warn(`No chatId for notification ${notification._id}`);
            return {
              ...notification,
              senderName: 'Unknown',
              senderProfilePic: null,
              message: 'No message available',
              timeAgo: 'Just now'
            };
          }
  
          const chat = await Chat.findById(notification.chatId)
                                .populate('doctorId patientId')
                                .lean();
  
          if (!chat) {
            console.warn(`Chat not found for notification ${notification._id}`);
            return {
              ...notification,
              senderName: 'Unknown',
              senderProfilePic: null,
              message: 'No message available',
              timeAgo: 'Just now'
            };
          }
  
          const sender = chat.doctorId._id.toString() === req.user._id.toString() ? chat.patientId : chat.doctorId;
  
          return {
            ...notification,
            senderName: sender.name || 'Unknown',
            senderProfilePic: sender.profilePicture ? `data:${sender.profilePicture.contentType};base64,${sender.profilePicture.data.toString('base64')}` : null,
            message: notification.message,
            timeAgo: getTimeAgo(notification.createdAt)
          };
        } catch (err) {
          console.error(`Error fetching chat details for notification ${notification._id}:`, err);
          return {
            ...notification,
            senderName: 'Error',
            senderProfilePic: null,
            message: 'Error fetching message',
            timeAgo: 'Just now'
          };
        }
      });
  
      const chatNotificationsWithDetails = await Promise.all(chatDetailsPromises);
  
      const otherNotificationsWithDetails = otherNotifications.map(notification => ({
        ...notification,
        timeAgo: getTimeAgo(notification.createdAt)
      }));
  
      const allNotifications = [...chatNotificationsWithDetails, ...otherNotificationsWithDetails];
  
      res.render('doctorNotifications', { notifications: allNotifications });
    } catch (error) {
      console.error('Error fetching notifications:', error);
      res.status(500).send('Server Error');
    }
  });
  
  function getTimeAgo(date) {
    const now = new Date();
    const secondsAgo = Math.floor((now - new Date(date)) / 1000);
  
    const intervals = [
      { label: 'year', seconds: 31536000 },
      { label: 'month', seconds: 2592000 },
      { label: 'day', seconds: 86400 },
      { label: 'hour', seconds: 3600 },
      { label: 'minute', seconds: 60 }
    ];
  
    for (const interval of intervals) {
      const count = Math.floor(secondsAgo / interval.seconds);
      if (count >= 1) {
        return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
      }
    }
  
    return 'Just now';
  }
  
  

router.post('/notifications/:id/mark-read', isLoggedIn, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.redirect('/doctor/notifications');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

router.post('/notifications/:id/delete', isLoggedIn, async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.redirect('/doctor/notifications');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});



module.exports = router;
