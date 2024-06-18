// routes/patient.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'patient') {
    return next();
  }
  res.redirect('/auth/login');
}

router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('patientProfile', { patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/edit', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('editPatientProfile', { patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    let patient = await Patient.findOne({ email: patientEmail });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const updateData = {
      ...req.body,
      emergencyContacts: Array.isArray(req.body.emergencyContacts) ? req.body.emergencyContacts.map(contact => ({
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email
      })) : []
    };

    if (req.file) {
      updateData.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    Object.assign(patient, updateData);

    await patient.save();

    res.redirect('/patient/profile');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Route to display available doctors with sorting functionality
// routes/patient.js

router.get('/doctors', async (req, res) => {
  try {
    const sortOption = req.query.sort;
    let sortCriteria;

    switch (sortOption) {
      case 'mostReviewed':
        sortCriteria = { consultationsCompleted: -1 };
        break;
      case 'highestRated':
        sortCriteria = { rating: -1 };
        break;
      case 'mostViewed':
        sortCriteria = { profileViews: -1 };
        break;
      default:
        sortCriteria = {};
    }

    const doctors = await Doctor.find({ verified: 'Verified' }).sort(sortCriteria);
    res.render('patientDoctors', { doctors });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Other routes remain unchanged

router.get('/doctors/:id', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    // Increment the profile views
    doctor.profileViews = (doctor.profileViews || 0) + 1;
    await doctor.save();

    res.render('doctorProfileView', { doctor });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/doctor/:id/slots', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('bookTimeSlots', { doctor, availableSlots: doctor.timeSlots });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/book', isLoggedIn, async (req, res) => {
  try {
    const { doctorId, date, time, consultationType } = req.body;
    const patientId = req.session.user._id;

    const booking = new Booking({
      patient: patientId,
      doctor: doctorId,
      date: new Date(date),
      time: time,
      consultationType: consultationType,
      status: 'waiting'
    });

    await booking.save();

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    const slotToUpdate = doctor.timeSlots.find(slot => slot.date.toISOString() === date && slot.startTime === time.split(' - ')[0]);
    if (slotToUpdate) {
      slotToUpdate.status = 'booked';
      await doctor.save();
    }

    res.redirect('/patient/bookings');
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/bookings', isLoggedIn, async (req, res) => {
  try {
    const bookings = await Booking.find({ patient: req.session.user._id }).populate('doctor');
    res.render('patientBookings', { bookings });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
