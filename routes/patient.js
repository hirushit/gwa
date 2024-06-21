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

// Route to display available doctors
router.get('/doctors', async (req, res) => {
  try {
    const patient = await Patient.find({subscriptionTier: 'Free'})
    const doctors = await Doctor.find({ verified: 'Verified', subscriptionType: { $ne: 'Free' } });
    const countries = await Doctor.distinct('country');
    const states = await Doctor.distinct('state');
    const cities = await Doctor.distinct('city');
    const specialities = await Doctor.distinct('speciality');
    const languages = await Doctor.distinct('languages');
    const hospitals = await Doctor.distinct('hospitals');
    const genders = await Doctor.distinct('gender');
    res.render('patientDoctors', {
      patient,
      doctors,
      countries,
      states,
      cities,
      specialities,
      languages,
      hospitals,
      genders
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Route to view a doctor's profile
router.get('/doctors/:id', isLoggedIn, async (req, res) => {
  try {
    
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('doctorProfileView', { doctor,user: req.user });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

// Route to view and book time slots for a doctor
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

    // Create new booking
    const booking = new Booking({
      patient: patientId,
      doctor: doctorId,
      date: new Date(date),
      time: time,
      consultationType: consultationType,
      status: 'waiting' // Assuming this field exists in Booking schema to track booking status
    });

    // Save booking
    await booking.save();

    // Update doctor's time slot status (assuming 'timeSlots' is an array of objects in Doctor schema)
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    // Find the matching time slot and update its status
    const slotToUpdate = doctor.timeSlots.find(slot => slot && slot.date && slot.date.toISOString() === date && slot.startTime === time.split(' - ')[0]);
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

// Route to view patient's bookings
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
