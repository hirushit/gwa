const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const otpGenerator = require('otp-generator');
const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin');

const router = express.Router();

router.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

router.use(flash());

router.use((req, res, next) => {
  res.locals.success_msg = req.flash('success_msg');
  res.locals.error_msg = req.flash('error_msg');
  next();
});

const sendOTP = async (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verification OTP for Password Reset',
    text: `Your OTP for password reset is: ${otp}`
  };

  await transporter.sendMail(mailOptions);
};

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

router.get('/signup', (req, res) => {
  const showOtpForm = req.session.newUser && req.session.newUser.otp;
  const selectRoleForm = req.session.selectRoleForm;
  res.render('signup', { showOtpForm, selectRoleForm });
});

router.post('/signup', async (req, res) => {
  const { name, email, password, role } = req.body;

  try {
    let existingUser = await Patient.findOne({ email }) ||
                       await Doctor.findOne({ email }) ||
                       await Admin.findOne({ email });

    if (existingUser) {
      req.flash('error_msg', 'User already exists');
      return res.redirect('/auth/signup');
    }

    const otp = otpGenerator.generate(6, { digits: true, upperCase: false, specialChars: false, alphabets: false });
    await sendOTP(email, otp);

    req.session.newUser = { name, email, password, role, otp };

    req.flash('success_msg', 'OTP has been sent to your email. Please verify.');
    return res.redirect('/auth/signup');
  } catch (err) {
    console.error('Error in signup:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup');
  }
});

router.post('/verify', async (req, res) => {
  const { otp } = req.body;
  const newUser = req.session.newUser;

  if (!newUser) {
    req.flash('error_msg', 'Session expired. Please sign up again.');
    return res.redirect('/auth/signup');
  }

  if (newUser.otp !== otp) {
    req.flash('error_msg', 'Invalid OTP');
    return res.redirect('/auth/signup');
  }

  try {
    const { name, email, password, role } = newUser;
    let user;

    if (role === 'patient') {
      user = new Patient({ name, email, password, role });
    } else if (role === 'doctor') {
      user = new Doctor({ name, email, password, role });
    } else if (role === 'admin') {
      user = new Admin({ name, email, password, role });
    } else {
      req.flash('error_msg', 'Invalid role');
      return res.redirect('/auth/signup');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    req.session.newUser = null;

    req.flash('success_msg', 'User created successfully, please log in');
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in OTP verification:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup');
  }
});

router.get('/login', (req, res) => {
  res.render('login');
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      req.flash('error_msg', 'Invalid Credentials');
      return res.redirect('/auth/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      req.flash('error_msg', 'Invalid Credentials');
      return res.redirect('/auth/login');
    }

    req.session.user = user;
    req.flash('success_msg', 'Logged in successfully');

    if (user.role === 'patient') {
      return res.redirect('/patient/profile'); 
    } else if (user.role === 'doctor') {
      return res.redirect('/doctor/profile'); 
    } else if (user.role === 'admin') {
      return res.redirect('/admin/dashboard'); 
    } else {
      req.flash('error_msg', 'Invalid role');
      return res.redirect('/auth/login');
    }
  } catch (err) {
    console.error('Error in login:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/login');
  }
});


router.get('/google', (req, res) => {
  const scopes = ['https://www.googleapis.com/auth/userinfo.profile', 'https://www.googleapis.com/auth/userinfo.email'];
  const url = oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' });
    const { data } = await oauth2.userinfo.get();

    const { name, email } = data;

    let existingUser = await Patient.findOne({ email }) ||
                       await Doctor.findOne({ email }) ||
                       await Admin.findOne({ email });

    if (existingUser) {
      req.session.user = existingUser;
      req.flash('success_msg', 'Logged in successfully');
      return res.redirect('/');
    } else {
      req.session.selectRoleForm = { name, email };
      return res.redirect('/auth/signup');
    }
  } catch (err) {
    console.error('Error in Google OAuth callback:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/login');
  }
});

router.post('/select-role', async (req, res) => {
  const { name, email, role } = req.body;

  try {
    let user;

    if (role === 'patient') {
      user = new Patient({ name, email, role });
    } else if (role === 'doctor') {
      user = new Doctor({ name, email, role });
    } else if (role === 'admin') {
      user = new Admin({ name, email, role });
    } else {
      req.flash('error_msg', 'Invalid role');
      return res.redirect('/auth/signup');
    }

    await user.save();

    req.session.selectRoleForm = null;
    req.session.user = user;

    req.flash('success_msg', 'User created successfully');
    return res.redirect('/');
  } catch (err) {
    console.error('Error in selecting role:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup');
  }
});

router.get('/logout', (req, res) => {
  req.flash('success_msg', 'Logged out successfully');
  req.session.destroy(err => {
    if (err) {
      console.error('Error in session destruction:', err);
      req.flash('error_msg', 'Error logging out');
      return res.redirect('/');
    }

    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});

router.get('/exit', (req, res) => {
  req.flash('success_msg', 'Exited successfully');
  req.session.destroy(err => {
    if (err) {
      console.error('Error in session destruction:', err);
      req.flash('error_msg', 'Error exiting');
      return res.redirect('/auth/signup');
    }

    res.clearCookie('connect.sid');
    res.redirect('/auth/signup');
  });
});

module.exports = router;


router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email']
  });
  res.redirect(authUrl);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const { data } = await oauth2.userinfo.get();
    const { name, email } = data;

    let existingUser = await Patient.findOne({ email }) ||
                       await Doctor.findOne({ email }) ||
                       await Admin.findOne({ email });

    if (existingUser) {
      req.session.user = existingUser;
      req.flash('success_msg', 'Logged in successfully');
      if (existingUser.role === 'patient') {
        return res.redirect('/patient/profile'); 
      } else if (existingUser.role === 'doctor') {
        return res.redirect('/doctor/profile'); 
      } else if (existingUser.role === 'admin') {
        return res.redirect('/admin/dashboard'); 
      } else {
        req.flash('error_msg', 'Invalid role');
        return res.redirect('/auth/login');
      }
    }

    req.session.selectRoleForm = { name, email };
    return res.redirect('/auth/signup'); 
  } catch (err) {
    console.error('Error in Google OAuth callback:', err);
    req.flash('error_msg', 'Authentication failed. Please try again.');
    return res.redirect('/auth/signup');
  }
});

router.post('/select-role', async (req, res) => {
  const { name, email, role } = req.body;

  if (!req.session.selectRoleForm || req.session.selectRoleForm.email !== email) {
    req.flash('error_msg', 'Session expired or invalid email');
    return res.redirect('/auth/signup');
  }

  const password = otpGenerator.generate(8, { digits: true, upperCase: true, lowerCase: true, specialChars: true });

  try {
    let user;
    if (role === 'patient') {
      user = new Patient({ name, email, password, role });
    } else if (role === 'doctor') {
      user = new Doctor({ name, email, password, role });
    } else if (role === 'admin') {
      user = new Admin({ name, email, password, role });
    } else {
      req.flash('error_msg', 'Invalid role');
      return res.redirect('/auth/signup');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    req.session.selectRoleForm = null;

    req.flash('success_msg', 'User created successfully, please log in');
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in selecting role:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup');
  }
});

router.get('/forgot-password', (req, res) => {
  res.render('forgot-password');
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/forgot-password');
    }

    const otp = otpGenerator.generate(6, { digits: true, upperCase: false, specialChars: false, alphabets: false });
    await sendOTP(email, otp);

    req.session.resetUser = { email, otp };

    req.flash('success_msg', 'OTP has been sent to your email. Please verify.');
    return res.redirect('/auth/reset-password');
  } catch (err) {
    console.error('Error in forgot password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/forgot-password');
  }
});

router.get('/reset-password', (req, res) => {
  const { email } = req.session.resetUser || {};
  if (!email) {
    req.flash('error_msg', 'Session expired. Please try again.');
    return res.redirect('/auth/forgot-password');
  }
  res.render('reset-password', { email });
});

router.post('/reset-password', async (req, res) => {
  const { otp, newPassword, confirmPassword } = req.body;
  const { email } = req.session.resetUser || {};

  if (!email || !otp || !newPassword || !confirmPassword) {
    req.flash('error_msg', 'Please fill all fields');
    return res.redirect('/auth/reset-password');
  }

  if (newPassword !== confirmPassword) {
    req.flash('error_msg', 'Passwords do not match');
    return res.redirect('/auth/reset-password');
  }

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      req.flash('error_msg', 'User not found');
      return res.redirect('/auth/forgot-password');
    }

    if (otp !== req.session.resetUser.otp) {
      req.flash('error_msg', 'Invalid OTP');
      return res.redirect('/auth/reset-password');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    req.session.resetUser = null;

    req.flash('success_msg', 'Password reset successful. Please login with your new password.');
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in password reset:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/reset-password');
  }
});

module.exports = router;
