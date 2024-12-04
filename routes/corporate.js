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
const Blog = require('../models/Blog');
const Booking = require('../models/Booking');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const router = express.Router();

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'corporate') {
    req.user = req.session.user;
    return next();
  }
  res.redirect('/corporate/login');
}

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
        const user = await Corporate.findOne({
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() } 
        });
        console.log(token);

        if (!user) {
            req.flash('error_msg', 'Invalid or expired verification link');
            return res.redirect('/corporate/signup');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined;
        await user.save();

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
    res.render('corporateSignup'); 
  });
  
  router.post('/signup', async (req, res) => {
    const { corporateName, email, mobileNumber, password } = req.body;
  
    try {
      const existingCorporate = await Corporate.findOne({ email });
      if (existingCorporate) {
        return res.status(400).json({ message: 'Email already registered' });
      }
  
      const hashedPassword = await bcrypt.hash(password, 10);
  
      const token = generateVerificationToken();
      const tokenExpires = Date.now() + 3600000; 
  
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
        const corporate = await Corporate.findOne({ email: email });

        if (!corporate) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/corporate/login');
        }

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
    const corporateId = req.session.corporateId; 
    console.log(req.session.corporateId);
    const corporate = await Corporate.findById(corporateId).populate('doctors');

    if (!corporate) {
      req.flash('error_msg', 'Corporate not found');
      return res.redirect('/corporate/login'); 
    }

    res.render('corporateHome', {
      corporate,
      doctors: corporate.doctors,
      followerCount: corporate.followers.length 
    });
  } catch (err) {
    console.error('Error fetching corporate details:', err);
    req.flash('error_msg', 'Error fetching corporate details');
    res.redirect('/corporate/login');
  }
});

router.get('/profile', async (req, res) => {
  try {
    const corporateId = req.session.corporateId;

    const corporate = await Corporate.findById(corporateId)
      .populate('doctors')
      .populate({
        path: 'patientReviews.patientId', 
        model: 'Patient',
        select: 'name profilePicture',
      })
      .populate({
        path: 'doctorReviews.doctorId', 
        model: 'Doctor',
        select: 'name profilePicture',
      });

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/login');
    }

    const verifiedBlogs = await Blog.find({
      authorId: { $in: corporate.doctors.map(doctor => doctor._id) },
      verificationStatus: "Verified"
    })
      .select('title description image conditions authorId') 
      .populate({
        path: 'authorId',
        model: 'Doctor',
        select: 'name profilePicture',
      });

    const doctorReviews = corporate.doctorReviews || [];
    const patientReviews = corporate.patientReviews || [];

    res.render('corporateProfile', {
      corporate,
      doctors: corporate.doctors,
      blogs: verifiedBlogs,
      doctorReviews,
      patientReviews,
    });
  } catch (err) {
    console.error('Error fetching corporate profile:', err);
    req.flash('error_msg', 'Error fetching profile');
    res.redirect('/corporate/corporate-home');
  }
});

router.get('/edit-profile', async (req, res) => {
  try {
    const corporateId = req.session.corporateId;

    const corporate = await Corporate.findById(corporateId);

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/corporate-home');
    }

    res.render('corporateeditProfile', {
      corporate,
    });
  } catch (err) {
    console.error('Error fetching corporate profile for editing:', err);
    req.flash('error_msg', 'Error fetching corporate profile');
    res.redirect('/corporate/corporate-home');
  }
});
router.post('/edit-profile', upload.fields([{ name: 'profileImage' }, { name: 'coverPhoto' }]), async (req, res) => {
  const {
      corporateName,
      email,
      mobileNumber,
      alternateContactNumber,
      companyName,
      businessRegistrationNumber,
      taxIdentificationNumber,
      businessType,
      street,
      city,
      state,
      zipCode,
      country,
      tagline,
      overview
  } = req.body;

  const updateData = {
      corporateName,
      email,
      mobileNumber,
      alternateContactNumber,
      companyName,
      businessRegistrationNumber,
      taxIdentificationNumber,
      businessType,
      tagline,
      overview,
      address: { street, city, state, zipCode, country }
  };

  if (req.files['profileImage']) {
      updateData.profilePicture = {
          data: req.files['profileImage'][0].buffer,
          contentType: req.files['profileImage'][0].mimetype
      };
  }

  if (req.files['coverPhoto']) {
      updateData.coverPhoto = {
          data: req.files['coverPhoto'][0].buffer,
          contentType: req.files['coverPhoto'][0].mimetype
      };
  }

  try {
      await Corporate.findByIdAndUpdate(req.session.corporateId, updateData);
      req.flash('success_msg', 'Profile updated successfully');
      res.redirect('/corporate/profile');
  } catch (err) {
      console.error('Error updating profile:', err);
      req.flash('error_msg', 'Failed to update profile');
      res.redirect('/corporate/edit-profile');
  }
});

router.post('/add-specialty', upload.single('image'), async (req, res) => {
  try {
    const { name } = req.body;
    const image = req.file;

    const specialty = {
      name,
    };

    if (image) {
      specialty.image = {
        data: image.buffer,
        contentType: image.mimetype,
      };
    }

    const corporate = await Corporate.findById(req.session.corporateId);
    corporate.corporateSpecialties.push(specialty);
    await corporate.save();

    res.redirect('/corporate/profile');
  } catch (error) {
    console.error('Error adding specialty:', error);
    res.status(500).send('Internal Server Error');
  }
});


router.get('/add-doctors', async (req, res) => {
  const searchEmail = req.query.email || '';

  try {
      const doctors = await Doctor.find({
          email: { $regex: searchEmail, $options: 'i' }, 
      });

      const corporateId = req.session.corporateId;

      res.render('add-doctors', {
          doctors,
          searchEmail,
          corporateId, 
      });
  } catch (err) {
      console.error('Error fetching doctors:', err);
      req.flash('error_msg', 'Error fetching doctors');
      res.redirect('/corporate/corporate-home');
  }
});


router.post('/add-doctor/:doctorId', async (req, res) => {
  const doctorId = req.params.doctorId;
  const corporateId = req.session.corporateId; 

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/corporate-home');
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      req.flash('error_msg', 'Doctor not found');
      return res.redirect('/corporate/corporate-home');
    }

    const existingRequest = doctor.corporateRequests.find(
      request => request.corporateId.toString() === corporateId.toString()
    );

    if (existingRequest) {
      req.flash('info_msg', 'Request has already been sent to this doctor');
      return res.redirect('/corporate/add-doctors');
    }

    doctor.corporateRequests.push({
      corporateId: corporate._id,
      corporateName: corporate.corporateName,
      requestStatus: 'pending',
    });
    doctor.faqs = doctor.faqs || []; 

    doctor.faqs.push({
      question: 'What is your consultation fee?',
      answer: 'The consultation fee is $100.',
    });

    await doctor.save();

    req.flash('success_msg', 'Request has been sent to the doctor');
    res.redirect('/corporate/add-doctors');
  } catch (err) {
    console.error('Error sending corporate request to doctor:', err);
    req.flash('error_msg', 'Error sending request');
    res.redirect('/corporate/corporate-home');
  }
});

router.post('/update-doctor-review-visibility', async (req, res) => {
  try {
    const { reviewId, showOnPage } = req.body;

    const showOnPageBool = showOnPage === 'true';

    await Corporate.updateOne(
      { 'doctorReviews._id': reviewId },
      { $set: { 'doctorReviews.$.showOnPage': showOnPageBool } }
    );

    res.redirect('/corporate/profile');  
  } catch (err) {
    console.error('Error updating doctor review visibility:', err);
    req.flash('error_msg', 'Error updating doctor review visibility');
    res.redirect('/corporate/profile');
  }
});

router.post('/update-patient-review-visibility', async (req, res) => {
  try {
    const { reviewId, showOnPage } = req.body;

    const showOnPageBool = showOnPage === 'true';

    await Corporate.updateOne(
      { 'patientReviews._id': reviewId },
      { $set: { 'patientReviews.$.showOnPage': showOnPageBool } }
    );

    res.redirect('/corporate/profile');  
  } catch (err) {
    console.error('Error updating patient review visibility:', err);
    req.flash('error_msg', 'Error updating patient review visibility');
    res.redirect('/corporate/profile');
  }
});



router.get('/followers', async (req, res) => {
  try {
    const corporateId = req.session.corporateId;

    const corporate = await Corporate.findById(corporateId).populate({
      path: 'followers',
      select: 'name profilePicture', 
    });
    console.log(corporate);

    if (!corporate) {
      req.flash('error_msg', 'Corporate profile not found');
      return res.redirect('/corporate/login');
    }

    res.render('followers', {
      followers: corporate.followers,
    });
  } catch (err) {
    console.error('Error fetching followers:', err);
    req.flash('error_msg', 'Error fetching followers');
    res.redirect('/corporate/corporate-home');
  }
});

router.get('/insights', async (req, res) => {
  try {
    const corporateId = req.session?.corporateId;
    if (!corporateId) {
      return res.status(400).json({ error: 'Corporate ID is required' });
    }

    const linkedDoctors = await Doctor.find({
      corporateRequests: {
        $elemMatch: { 
          corporateId: corporateId, 
          requestStatus: 'accepted' 
        }
      }
    });

    const doctorIds = linkedDoctors.map(doctor => doctor._id);

    const totalDoctors = doctorIds.length;

    const totalPremiumDoctors = await Doctor.countDocuments({
      _id: { $in: doctorIds },
      subscriptionType: { $ne: 'Free' }
    });

    const totalPatients = await Booking.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds }
        }
      },
      {
        $group: {
          _id: '$patient'
        }
      },
      {
        $count: 'uniquePatients'
      }
    ]).then(result => result[0]?.uniquePatients || 0);

const totalBlogs = await Blog.countDocuments({
  authorId: { $in: doctorIds }
});

const blogsVerified = await Blog.countDocuments({
  authorId: { $in: doctorIds },
  verificationStatus: 'Verified' 
});

const blogsPendingRequest = await Blog.countDocuments({
  authorId: { $in: doctorIds },
  verificationStatus: 'Pending' 
});

    const totalConsultations = await Booking.countDocuments({
      doctor: { $in: doctorIds },
      status: 'completed'
    });

    const totalReviews = await Doctor.aggregate([
      { $match: { _id: { $in: doctorIds } } },
      { $unwind: '$reviews' },
      { $count: 'totalReviews' }
    ]).then(result => result[0]?.totalReviews || 0);

    const bookingFilter = req.query['booking-filter'] || 'all';
    let startDate, endDate;

    switch (bookingFilter) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'week':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - startDate.getDay());
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date();
        endDate.setDate(startDate.getDate() + 6);
        endDate.setHours(23, 59, 59, 999);
        break;
      case 'month':
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      default:
        startDate = new Date('1970-01-01');
        endDate = new Date();
    }

    const bookingRates = await Booking.aggregate([
      {
        $match: {
          doctor: { $in: doctorIds },
          date: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: { $dayOfWeek: '$date' },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    res.render('corporateInsights', {
      totalDoctors,
      totalPremiumDoctors,
      totalPatients,
      totalBlogs,
      blogsVerified,
      blogsPendingRequest,
      totalConsultations,
      totalReviews,
      bookingRates,
      bookingFilter,
      corporateId,
      linkedDoctors 
    });
  } catch (err) {
    console.error('Error fetching corporate insights:', err.message);
    res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy(err => {
      if (err) {
          console.error("Error destroying session:", err);
          return res.status(500).send("Failed to log out.");
      }
      res.redirect('/corporate/login'); 
  });
});


module.exports = router;
