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
  
    const verificationLink = `http://localhost:3000/corporate/verify-email?token=${token}`;
  
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
        subject: `Welcome to MedxBay, ${name}!`,
        html: `
            <h2>Welcome, ${name}!</h2>
            <p>Thank you for verifying your account. You can now start using our platform.</p>
        `
    };

    await transporter.sendMail(mailOptions);
};

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    try {
        // Find the user based on the token and check if it has not expired
        const user = await Corporate.findOne({
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() } // Ensure token has not expired
        });
        console.log(token);

        if (!user) {
            req.flash('error_msg', 'Invalid or expired verification link');
            return res.redirect('/corporate/signup');
        }

        // Update user details
        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

        // Send welcome email
        await sendWelcomeEmail(user.corporateName, user.email, 'corporate');

        req.flash('success_msg', 'Your account has been verified. You can now log in.');
        res.redirect('/corporate/login');
    } catch (err) {
        console.error('Error in corporate email verification:', err);
        req.flash('error_msg', 'Server error');
        res.redirect('/corporate/signup');
    }
});

  router.get('/signup', (req, res) => {
    res.render('corporateSignup'); // Renders the 'corporateSignup' template
  });
  
  router.post('/signup', async (req, res) => {
    const { corporateName, email, mobileNumber, password } = req.body;
  
    try {
      // Check if the email is already registered
      const existingCorporate = await Corporate.findOne({ email });
      if (existingCorporate) {
        return res.status(400).json({ message: 'Email already registered' });
      }
  
      // Hash the password
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Generate a verification token
      const token = generateVerificationToken();
      const tokenExpires = Date.now() + 3600000; 
  
      // Create a new corporate profile
      const newCorporate = new Corporate({
        corporateName,
        email,
        mobileNumber,
        password: hashedPassword,
        verificationToken: token,
        verificationTokenExpires: tokenExpires, 
        isVerified: false,
        role: 'corporate',
      });
  
      // Save to the database
      await newCorporate.save();
  
      
      await sendVerificationEmail(corporateName, email, token, 'corporate');
  
    
      return res.redirect(`/corporate/login`);
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: 'Server error' });
    }
  });


router.get('/login', (req, res) => {
    res.render('Corporatelogin');
  });
  
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // Check if email exists in Supplier collection
        const corporate = await Corporate.findOne({ email: email });

        // If no Supplier account, check in Doctor collection
        if (!corporate) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/corporate/login');
        }

        // Check password for supplier and verification status
        if (!await bcrypt.compare(password, corporate.password)) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/corporate/login');
        }

        if (!corporate.isVerified) {
            req.flash('error_msg', 'Please verify your account first');
            return res.redirect('/corporate/login');
        }

        req.session.corporateId = corporate._id;
        console.log(req.session.corporateId); 
        req.flash('success_msg', 'Login successful!');
        res.redirect('/corporate/corporate-home'); 
    } catch (err) {
        console.error('Error in corporate login:', err);
        req.flash('error_msg', 'Server error');
        res.redirect('/corporate/login');
    }
});

router.get('/corporate-home', async (req, res) => {
  try {
    // Replace `corporateId` with the actual ID from the session or request as needed
    const corporateId = req.session.corporateId; // Assuming the corporate user is logged in and stored in session
    console.log(req.session.corporateId);
    // Find the corporate by ID and populate the 'doctors' field
    const corporate = await Corporate.findById(corporateId).populate('doctors');

    if (!corporate) {
      req.flash('error_msg', 'Corporate not found');
      return res.redirect('/corporate/login'); // Redirect to login or another appropriate page
    }

    // Render the 'corporateHome' template with the corporate and doctor data
    res.render('corporateHome', {
      corporate,
      doctors: corporate.doctors,
      followerCount: corporate.followers.length // Assuming `followers` is an array of follower IDs
    });
  } catch (err) {
    console.error('Error fetching corporate details:', err);
    req.flash('error_msg', 'Error fetching corporate details');
    res.redirect('/corporate/login');
  }
});


router.get('/add-doctors', async (req, res) => {
    const searchEmail = req.query.email || ''; // Search by email, default to empty string if no query parameter
  
    try {
      // Find doctors based on search term
      const doctors = await Doctor.find({
        email: { $regex: searchEmail, $options: 'i' }, // Search case-insensitively
      });
  
      res.render('add-doctors', {
        doctors,
        searchEmail, // Pass search term to the view
      });
    } catch (err) {
      console.error('Error fetching doctors:', err);
      req.flash('error_msg', 'Error fetching doctors');
      res.redirect('/corporate/corporate-home');
    }
  });

  
// Route to add a doctor to corporate's list
router.post('/add-doctor/:doctorId', async (req, res) => {
    const doctorId = req.params.doctorId;
    const corporateId = req.session.corporateId; // Corporate profile ID from session
  
    try {
      // Find the corporate profile
      const corporate = await Corporate.findById(corporateId);
      if (!corporate) {
        req.flash('error_msg', 'Corporate profile not found');
        return res.redirect('/corporate/corporate-home');
      }
  
      // Find the doctor to send a request
      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
        req.flash('error_msg', 'Doctor not found');
        return res.redirect('/corporate/corporate-home');
      }
  
      // Check if the corporate has already sent a request
      const existingRequest = doctor.corporateRequests.find(
        request => request.corporateId.toString() === corporateId.toString()
      );
  
      if (existingRequest) {
        req.flash('info_msg', 'Request has already been sent to this doctor');
        return res.redirect('/corporate/add-doctors');
      }
  
      // Add a new corporate request to the doctor's profile
      doctor.corporateRequests.push({
        corporateId: corporate._id,
        corporateName: corporate.corporateName,
        requestStatus: 'pending',
      });
  
      // Ensure faqs is initialized as an empty array if not used
      doctor.faqs = doctor.faqs || []; // Initialize faqs if not present
  
      // Add sample FAQ to the faqs field (ensure it's an object)
      doctor.faqs.push({
        question: 'What is your consultation fee?',
        answer: 'The consultation fee is $100.',
      });
  
      // Save the doctor document
      await doctor.save();
  
      req.flash('success_msg', 'Request has been sent to the doctor');
      res.redirect('/corporate/add-doctors');
    } catch (err) {
      console.error('Error sending corporate request to doctor:', err);
      req.flash('error_msg', 'Error sending request');
      res.redirect('/corporate/corporate-home');
    }
  });

  // Route to show followers of a corporate profile
router.get('/followers', async (req, res) => {
  try {
    // Get the corporate ID from the session
    const corporateId = req.session.corporateId;

    // Find the corporate profile and populate followers' details
    const corporate = await Corporate.findById(corporateId).populate({
      path: 'followers',
      select: 'name profilePicture', // Select only necessary fields
    });
    console.log(corporate);

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/login');
    }

    // Render the 'followers' view template with the followers' data
    res.render('followers', {
      followers: corporate.followers,
    });
  } catch (err) {
    console.error('Error fetching followers:', err);
    req.flash('error_msg', 'Error fetching followers');
    res.redirect('/corporate/corporate-home');
  }
});

  

module.exports = router;
