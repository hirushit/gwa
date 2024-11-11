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
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios'); 
const querystring = require('querystring');
const Corporate = require('../models/Corporate');


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
    subject: 'Verification OTP for Signup',
    text: `Your OTP for signup is: ${otp}`
  };

  await transporter.sendMail(mailOptions);
};
const generateVerificationToken = () => {
  return crypto.randomBytes(20).toString('hex');
};

const sendVerificationEmail = async (name, email, token, role) => {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  const verificationLink = `http://localhost:3000/auth/verify-email?token=${token}&role=${role}`;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: '🎉 Almost There! Verify Your Email to Complete Your Sign-Up 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
        <h2 style="text-align: center;">
          <span style="color: #FF7F50;">Welcome to MedxBay!</span> 
        </h2>
        
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
  
        <p style="font-size: 16px;">Thank you for signing up with us! We’re thrilled to have you on board and can’t wait for you to explore everything we have in store.</p>
  
        <p style="font-size: 16px;">Before you dive in, we just need one small thing from you: to confirm your email address. This helps us ensure that we’ve got the right contact details for you and keeps your account secure.</p>
  
        <h3 style="color: #272848;">Here’s What You Need to Do:</h3>
  
        <p style="font-size: 16px;">Click the button below to verify your email address:</p>
  
        <div style="text-align: center; margin: 20px 0;">
          <a href="${verificationLink}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Verify Your Email Address</a>
        </div>
  
        <p style="font-size: 16px;">Or, copy and paste this link into your browser:</p>
        <p style="word-break: break-all; font-size: 16px;"><a href="${verificationLink}" style="color: #272848;">${verificationLink}</a></p>
  
        <p style="font-size: 16px;">Once you’ve verified your email, you’ll be all set to access your new account and start exploring. If you have any questions or need assistance, feel free to reach out to our support team—we’re here to help!</p>
  
        <p style="font-size: 16px; text-align: center;"><strong>Welcome aboard, and get ready for an amazing experience with MedxBay!</strong></p>
  
        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
  
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        
        <p style="font-size: 14px; color: #777;">P.S. If you didn’t sign up for an account, please disregard this email. No worries—nothing will change if you ignore it.</p>
      </div>
    `
  };
  


  await transporter.sendMail(mailOptions);
};

router.get('/signup/patient', (req, res) => {
  const showOtpForm = req.session.newUser && req.session.newUser.otp;
  res.render('signup_patient', { showOtpForm });
});

router.post('/signup/patient', async (req, res) => {
  const { name, email, password, phoneNumber } = req.body;

  try {
    let existingUser = await Patient.findOne({ email });

    if (existingUser) {
      req.flash('error_msg', 'User already exists');
      return res.redirect('/auth/signup/patient');
    }

    const token = generateVerificationToken();
    await sendVerificationEmail(name, email, token, 'patient');

    const newPatient = new Patient({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      phoneNumber,
      verificationToken: token
    });

    await newPatient.save();

    req.flash('success_msg', 'Verification email has been sent to your email. Please verify.');
    return res.redirect('/auth/signup/patient');
  } catch (err) {
    console.error('Error in patient signup:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup/patient');
  }
});


router.get('/signup/doctor', (req, res) => {
  const showOtpForm = req.session.newUser && req.session.newUser.otp;
  res.render('signup_doctor', { showOtpForm });
});

router.post('/signup/doctor', async (req, res) => {
  const { name, email, password, phoneNumber } = req.body;

  try {
    let existingUser = await Doctor.findOne({ email });

    if (existingUser) {
      req.flash('error_msg', 'User already exists');
      return res.redirect('/auth/signup/doctor');
    }

    const token = generateVerificationToken();
    await sendVerificationEmail(name, email, token, 'doctor');

    const newDoctor = new Doctor({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      phoneNumber,
      verificationToken: token
    });

    await newDoctor.save();

    req.flash('success_msg', 'Verification email has been sent to your email. Please verify.');
    return res.redirect('/auth/signup/doctor');
  } catch (err) {
    console.error('Error in doctor signup:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/signup/doctor');
  }
});

const sendWelcomeEmail = async (name, email, role) => {
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
    subject: '🎉 Welcome to MedxBay! 🎉',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #FF7F50; text-align: center;">🎉 Welcome to MedxBay! 🎉</h2>
        
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
  
        <p style="font-size: 16px;">Congratulations! Your email has been successfully verified, and we are delighted to welcome you to the MedxBay family!</p>
  
        <p style="font-size: 16px;">Now that you're all set, you can start exploring our platform. Whether you're a user looking for top-notch medical care or a provider ready to offer your expertise, we are here to support you every step of the way.</p>
  
        <p style="font-size: 16px;">If you have any questions, our support team is always here to help. We're excited to see you thrive on MedxBay!</p>
  
        <p style="font-size: 16px; text-align: center;"><strong>Welcome aboard!</strong></p>
  
        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
  
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
        <p style="font-size: 14px; color: #777;">If you have any issues, feel free to contact our support team.</p>
      </div>
    `
  };  
  

  await transporter.sendMail(mailOptions);
};


router.get('/verify-email', async (req, res) => {
  const { token, role } = req.query;

  try {
    let user;
    if (role === 'patient') {
      user = await Patient.findOne({ verificationToken: token });
    } else if (role === 'doctor') {
      user = await Doctor.findOne({ verificationToken: token });
    } 

    if (!user) {
      req.flash('error_msg', 'Invalid or expired verification link');
      return res.redirect(`/auth/signup/${role}`);
    }

    user.isVerified = true;
    user.verificationToken = undefined;
    await user.save();

    req.flash('success_msg', 'Your account has been verified. You can now login.');
    await sendWelcomeEmail(user.name, user.email, role);

    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in email verification:', err);
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

    if (!user.isVerified) {
      req.flash('error_msg', 'Please verify your email before logging in.');
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
      return res.redirect('/patient/patient-index'); 
    } else if (user.role === 'doctor') {
      return res.redirect('/doctor/doctor-index'); 
    } else if (user.role === 'admin') {
      return res.redirect('/admin/doctor-profile-requests'); 
    } else if (user.role === 'supplier'){
      return res.redirect('/supplier/profile');
    }  else if (user.role === 'corporate'){
      return res,redirect('/coporate-home')
    }
    else {
      req.flash('error_msg', 'Invalid role');
      return res.redirect('/auth/login');
    }
  } catch (err) {
    console.error('Error in login:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/login');
  }
});

router.get('/token-login', (req, res) => {
  res.render('token-login', {
    error_msg: req.flash('error_msg'),
    success_msg: req.flash('success_msg')
  });
});

router.post('/token-login', async (req, res) => {
  const { email, password } = req.body;

  try {
    let user = await Patient.findOne({ email }) ||
               await Doctor.findOne({ email }) ||
               await Admin.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '1h' });

    console.log('Generated Token:', token);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', 
      maxAge: 3600000 
    };

    res.cookie('token', token, cookieOptions);

    return res.redirect('/auth/home');
  } catch (err) {
    console.error('Error in token login:', err);
    return res.status(500).json({ message: 'Server error' });
  }
});


const verifyToken = (req, res, next) => {
  const token = req.cookies.token; 

  if (!token) {
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(400).json({ message: 'Invalid token' });
  }
};

router.get('/home', verifyToken, (req, res) => {
  res.render('home', {
    user: req.user
  });
});


const {
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  OAUTH_AUTHORIZATION_URL,
  OAUTH_TOKEN_URL,
  OAUTH_USER_PROFILE_URL,
  OAUTH_LOGOUT_URL
} = process.env;

router.get('/authorize', (req, res) => {
  const authorizationUri = `${OAUTH_AUTHORIZATION_URL}?client_id=${OAUTH_CLIENT_ID}&redirect_uri=${OAUTH_REDIRECT_URI}&response_type=code`;
  res.redirect(authorizationUri);
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const response = await axios.post(OAUTH_TOKEN_URL, querystring.stringify({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: OAUTH_REDIRECT_URI,
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET
    }));

    const accessToken = response.data.access_token;

    const profileResponse = await axios.get(OAUTH_USER_PROFILE_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    const userProfile = profileResponse.data;



    res.redirect('/');
  } catch (error) {
    console.error('Error during callback:', error);
    res.status(500).send('Authentication failed');
  }
});


router.get('/protected', verifyToken, (req, res) => {
  res.json({ message: 'You have access to this protected route', user: req.user });
});


const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI;

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

router.get('/google/patient', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    state: JSON.stringify({ role: 'patient' }) 
  });
  res.redirect(authUrl);
});

router.get('/google/doctor', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['profile', 'email'],
    state: JSON.stringify({ role: 'doctor' }) 
  });
  res.redirect(authUrl);
});

router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email'
    ],
    prompt: 'consent', 
  });
  res.redirect(url);
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

    let existingUser = await Patient.findOne({ email })
                       || await Doctor.findOne({ email })
                       || await Admin.findOne({ email });

    if (existingUser) {
      req.session.user = existingUser;
      req.flash('success_msg', 'Logged in successfully');
      if (existingUser.role === 'patient') {
        return res.redirect('/patient/patient-index'); 
      } else if (existingUser.role === 'doctor') {
        return res.redirect('/doctor/doctor-index'); 
      } else if (existingUser.role === 'admin') {
        return res.redirect('/admin/admin-home'); 
      } else {
        req.flash('error_msg', 'Invalid role');
        return res.redirect('/auth/login');
      }
    } else {
      const { role } = JSON.parse(req.query.state); 

      let newUser;
      if (role === 'patient') {
        newUser = new Patient({
          name,
          email,
          role: 'patient', 
        });
      } else if (role === 'doctor') {
        newUser = new Doctor({
          name,
          email,
          role: 'doctor', 
        });
      } else {
        req.flash('error_msg', 'Invalid role');
        return res.redirect('/auth/login');
      }

      const salt = await bcrypt.genSalt(10);
      newUser.password = await bcrypt.hash(email, salt); 

      await newUser.save();

      req.session.user = newUser;
      req.flash('success_msg', 'Logged in successfully');
      
      if (role === 'patient') {
        return res.redirect('/patient/profile');
      } else if (role === 'doctor') {
        return res.redirect('/doctor/profile');
      } else {
        req.flash('error_msg', 'Invalid role');
        return res.redirect('/auth/login');
      }
    }
  } catch (err) {
    console.error('Error in Google OAuth callback:', err);
    req.flash('error_msg', 'Authentication failed. Please try again.');
    return res.redirect('/auth/login');
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
    res.redirect('/auth/login');
  });
});

module.exports = router;



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

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = Date.now() + 3600000; 

    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = resetTokenExpires;

    await user.save();

    const resetUrl = `http://localhost:3000/auth/reset-password?token=${resetToken}`;
    await sendResetPasswordEmail(user.email, user.name,resetUrl);

    req.flash('success_msg', 'A password reset link has been sent to your email.');
    return res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('Error in forgot password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/forgot-password');
  }
});

const generateResetToken = () => {
  return crypto.randomBytes(20).toString('hex');
};

const sendResetPasswordEmail = async (email, name, resetUrl) => {
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
    subject: '🔒 Password Reset Request',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="color: #272848; text-align: center;">🔒 Password Reset Request</h2>
        
        <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
  
        <p style="font-size: 16px;">We received a request to reset your password. If you did not request this, please ignore this email.</p>
  
        <p style="font-size: 16px;">To reset your password, click the button below:</p>
  
        <div style="text-align: center; margin: 20px 0;">
          <a href="${resetUrl}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Reset Your Password</a>
        </div>
  
        <p style="font-size: 16px;">If the button doesn't work, copy and paste the following link into your browser:</p>
        <p style="word-break: break-all; font-size: 16px;"><a href="${resetUrl}" style="color: #272848;">${resetUrl}</a></p>
  
        <p style="font-size: 16px;">For security purposes, this link will expire in 60 minutes.</p>
  
        <p style="font-size: 16px;">Best regards,</p>
        <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
  
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  
        <p style="font-size: 14px; color: #777;">If you didn't request a password reset, please ignore this email. Your account remains safe.</p>
      </div>
    `
  };
  

  await transporter.sendMail(mailOptions);
};

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

    const token = generateResetToken();
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; 

    await user.save();

    await sendResetEmail(email, token);

    req.flash('success_msg', 'Reset link has been sent to your email.');
    return res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('Error in forgot password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/forgot-password');
  }
});

router.get('/reset-password', async (req, res) => {
  const { token } = req.query;

  if (!token) {
    req.flash('error_msg', 'Invalid or expired password reset token');
    return res.redirect('/auth/forgot-password');
  }

  try {
    let user = await Patient.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Doctor.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Admin.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) {
      req.flash('error_msg', 'Invalid or expired password reset token');
      return res.redirect('/auth/forgot-password');
    }

    res.render('reset-password', { token });
  } catch (err) {
    console.error('Error in reset password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect('/auth/forgot-password');
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, newPassword, confirmPassword } = req.body;

  if (!token || !newPassword || !confirmPassword) {
    req.flash('error_msg', 'Please fill all fields');
    return res.redirect(`/auth/reset-password?token=${token}`);
  }

  if (newPassword !== confirmPassword) {
    req.flash('error_msg', 'Passwords do not match');
    return res.redirect(`/auth/reset-password?token=${token}`);
  }

  try {
    let user = await Patient.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Doctor.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } }) ||
               await Admin.findOne({ resetPasswordToken: token, resetPasswordExpires: { $gt: Date.now() } });

    if (!user) {
      req.flash('error_msg', 'Invalid or expired password reset token');
      return res.redirect('/auth/forgot-password');
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    req.flash('success_msg', 'Password reset successful. Please login with your new password.');
    return res.redirect('/auth/login');
  } catch (err) {
    console.error('Error in reset password:', err);
    req.flash('error_msg', 'Server error');
    return res.redirect(`/auth/reset-password?token=${token}`);
  }
});




module.exports = router;
