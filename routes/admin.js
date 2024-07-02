const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin'); 

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Please log in to view this resource');
  res.redirect('/auth/login');
}

router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
    const doctors = await Doctor.find({ verified: { $ne: 'Verified' } }).lean();

    res.render('adminDashboard', { doctors, success_msg: req.flash('success_msg') });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/view/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const doctor = await Doctor.findById(doctorId).lean();

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    res.render('adminViewDoctor', { doctor });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/verify/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { verificationStatus } = req.body;

    if (!['Verified', 'Pending', 'Not Verified'].includes(verificationStatus)) {
      return res.status(400).send('Invalid verification status');
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    doctor.verified = verificationStatus;
    await doctor.save();

    req.flash('success_msg', 'Doctor verification status updated.');
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
