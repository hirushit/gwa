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
    const countries = await Doctor.distinct('country');
    const states = await Doctor.distinct('state');
    const cities = await Doctor.distinct('city');
    const specialities = await Doctor.distinct('speciality');
    const languages = await Doctor.distinct('languages');
    const hospitals = await Doctor.distinct('hospitals');
    const genders = await Doctor.distinct('gender');

    res.render('patientDoctors', {
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

router.get('/doctors/:id/slots', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('doctorProfileView', { doctor });
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

router.get('/search-doctors', async (req, res) => {
  try {
    const { what, where, country, state, city, speciality, languages, gender, hospital, availability, dateAvailability, consultation } = req.query;

    const filter = {};

    if (what) {
      filter.$or = [
        { speciality: new RegExp(what, 'i') },
        { conditionsTreated: new RegExp(what, 'i') },
        { name: new RegExp(what, 'i') }
      ];
    }

    if (where) {
      if (!filter.$or) filter.$or = [];
      filter.$or.push(
        { city: new RegExp(where, 'i') },
        { state: new RegExp(where, 'i') },
        { country: new RegExp(where, 'i') }
      );
    }

    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) filter.city = city;
    if (speciality) filter.speciality = speciality;
    if (languages) filter.languagesSpoken = { $in: languages.split(',') };
    if (gender) filter.gender = gender;
    if (hospital) filter.hospitals = hospital; // Assuming 'hospitals' is an array in the Doctor schema
    if (availability) filter.availability = availability === 'true';
    if (dateAvailability) filter.dateAvailability = new Date(dateAvailability);
    if (consultation) filter.consultation = consultation;

    const doctors = await Doctor.find(filter);
    res.json(doctors);
  } catch (error) {
    console.error('Error searching doctors:', error);
    res.status(500).send('Server error');
  }
});

router.post('/add-to-favorites', isLoggedIn, async (req, res) => {
  try {
    const { doctorId } = req.body;
    const patientId = req.session.user._id;

    // Find patient and doctor documents
    const patient = await Patient.findById(patientId);
    const doctor = await Doctor.findById(doctorId);

    if (!patient || !doctor) {
      return res.status(404).send('Patient or Doctor not found');
    }

    // Check if the patient's favoriteDoctors array exists
    if (!patient.favoriteDoctors) {
      patient.favoriteDoctors = []; // Initialize if it doesn't exist
    }

    // Check if the doctor is already in favorites
    if (patient.favoriteDoctors.includes(doctorId)) {
      return res.status(400).send('Doctor already in favorites');
    }

    // Add doctor to favorites
    patient.favoriteDoctors.push(doctorId);
    await patient.save();

    res.redirect('/patient/doctors'); // Redirect to doctors list or wherever appropriate
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).send('Server error');
  }
});


router.get('/favorites', isLoggedIn, async (req, res) => {
  try {
    const patientId = req.session.user._id;
    const patient = await Patient.findById(patientId).populate({
      path: 'favoriteDoctors',
      model: 'Doctor'
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    res.render('patientFavorites', { favoriteDoctors: patient.favoriteDoctors });
  } catch (error) {
    console.error('Error fetching favorite doctors:', error);
    res.status(500).send('Server error');
  }
});


module.exports = router;
