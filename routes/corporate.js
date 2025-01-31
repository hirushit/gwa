const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const flash = require('connect-flash');
const Chat = require('../models/Chat');
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
const Specialty = require('../models/Specialty'); 
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const router = express.Router();
const NODE_URL = process.env.NODE_URL;


function isLoggedIn(req, res, next) {
  const corporateId = req.session.corporateId; 

  if (corporateId) {
    req.user = req.session.user; 
    return next();
  }

  res.redirect('/corporate/login'); 
}



function isCorporate(req, res, next) {
  const corporateId = req.session.corporateId; 

  if (corporateId) {
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

const sendInvitationEmail = (email, inviteLink, hospitalName) => {
  const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
      },
  });

  const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: `Invitation to Join ${hospitalName} Hospital Network`, 
      html: `
          <p>Hello,</p>
          <p>We would like to invite you to join the ${hospitalName} hospital network. Please follow the steps below:</p>
          <ul>
              <li>If you are not a member yet, <a href="https://beta.medxbay.com/signup">register here</a> and fill out your details.</li>
              <li>If you are already a member, <a href="https://beta.medxbay.com/login">log in here</a>.</li>
              <li>After logging in, click the following invite link to join the hospital: <a href="${inviteLink}">${inviteLink}</a></li>
          </ul>
          <p>Best regards,</p>
          <p>Your ${hospitalName} Team</p>
      `,
  };

  return new Promise((resolve, reject) => {
      transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
              reject(error);
          } else {
              resolve(info);
          }
      });
  });
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

    const inviteLinks = corporate.doctors.map(doctor => {
      return {
        doctorId: doctor._id,
        inviteLink: `${NODE_URL}/doctor/accept-invite/${corporateId}/${doctor._id}`
      };
    });


    res.render('corporateProfile', {
      corporate,
      doctors: corporate.doctors,
      blogs: verifiedBlogs,
      doctorReviews,
      patientReviews,
      inviteLinks,  
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

    const specialties = await Specialty.find();

    res.render('corporateeditProfile', {
      corporate,
      specialties 
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
    overview,
    showSpecialties,
    showDoctors,
    showConditionLibrary,
    showReviews, 
    specialties, 
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
    address: { street, city, state, zipCode, country },
    showSpecialties: showSpecialties === 'true',
    showDoctors: showDoctors === 'true', 
    showConditionLibrary: showConditionLibrary === 'true',
    showReviews: showReviews === 'true', 
    corporateSpecialties: specialties ? specialties : [], 
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

router.post('/remove-specialty/:index', async (req, res) => {
  try {
    const corporate = await Corporate.findById(req.session.corporateId);
    const index = parseInt(req.params.index, 10);

    if (!corporate || index < 0 || index >= corporate.corporateSpecialties.length) {
      return res.status(400).send('Invalid specialty index');
    }

    corporate.corporateSpecialties.splice(index, 1);
    await corporate.save();

    res.redirect('/corporate/profile');
  } catch (error) {
    console.error('Error removing specialty:', error);
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
      const corporate = await Corporate.findById(corporateId);

      res.render('add-doctors', {
          doctors,
          searchEmail,
          corporateId,
          corporateDoctors: corporate ? corporate.doctors.map(id => id.toString()) : [],
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

      if (corporate.doctors.includes(doctor._id)) {
          req.flash('info_msg', 'Doctor is already a member of this corporate.');
          return res.redirect('/corporate/add-doctors');
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

router.post('/send-invite', async (req, res) => {
  const { email, inviteLink } = req.body;
  const corporateId = req.session.corporateId; 

  if (!email || !inviteLink || !corporateId) {
    return res.status(400).json({ message: 'Email, invite link, and corporate ID are required' });
  }

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      return res.status(404).json({ message: 'Corporate not found' });
    }

    const hospitalName = corporate.corporateName; 
    const info = await sendInvitationEmail(email, inviteLink, hospitalName);

    return res.status(200).json({ message: 'Invitation sent successfully', info });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: 'Error sending email', error });
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


router.get('/corporate-list', async (req, res) => {
  const { 
    state, 
    country, 
    city, 
    treatmentApproach, 
    corporateName, 
    doctorLanguage, 
    speciality, 
    condition 
  } = req.query; 

  const filter = {
    $or: [
      { verificationStatus: 'Verified' },
      { createdByAdmin: true }
    ]
  };

  if (state) filter['address.state'] = state;
  if (country) filter['address.country'] = country;
  if (city) filter['address.city'] = city;
  if (corporateName) filter['corporateName'] = { $regex: corporateName, $options: 'i' };

  try {
    const corporates = await Corporate.find(filter)
      .select('corporateName tagline address profilePicture profileTransferRequest createdByAdmin')
      .populate({
        path: 'doctors',
        match: {
          ...(treatmentApproach && { treatmentApproach: { $in: [treatmentApproach] } }),
          ...(doctorLanguage && { languages: { $in: [doctorLanguage] } }),
          ...(speciality && { speciality: { $in: [speciality] } }), 
          ...(condition && { conditions: { $in: [condition] } }),  
        },
        select: 'speciality conditions treatmentApproach languages',
      })
      .lean();

    const filteredCorporates = corporates;

    const states = await Corporate.distinct('address.state', { verificationStatus: 'Verified' });
    const countries = await Corporate.distinct('address.country', { verificationStatus: 'Verified' });
    const cities = await Corporate.distinct('address.city', { verificationStatus: 'Verified' });
    const treatmentApproaches = await Doctor.distinct('treatmentApproach');
    const languagesSpoken = await Doctor.distinct('languages');
    const specialities = await Doctor.distinct('speciality'); 
    const conditions = await Doctor.distinct('conditions');

    res.render('corporate-list', {
      corporates: filteredCorporates,
      states,
      countries,
      cities,
      treatmentApproaches,
      languagesSpoken,
      specialities, 
      conditions, 
      selectedFilters: { 
        state, 
        country, 
        city, 
        treatmentApproach, 
        corporateName, 
        doctorLanguage, 
        speciality, 
        condition 
      },
    });
  } catch (err) {
    console.error('Error fetching corporate list:', err);
    req.flash('error_msg', 'Error retrieving corporate list');
  }
});

router.post('/claim-profile', upload.single('document'), async (req, res) => {
  const { corporateId, email } = req.body;
  const document = req.file;

  try {
    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      return res.status(404).send('Corporate profile not found.');
    }

    if (!document || !email) {
      return res.status(400).send('Email and document are required.');
    }

    corporate.profileTransferRequest = 'Pending';

    corporate.profileVerification.push({
      email,
      document: {
        data: document.buffer,
        contentType: document.mimetype,
      },
    });

    await corporate.save();

    res.redirect('/corporate/corporate-list'); 
  } catch (err) {
    console.error('Error submitting claim:', err);
    res.status(500).send('Internal server error.');
  }
});

router.get('/:corporateId/doctors', async (req, res) => {
  try {
    const { corporateId } = req.params;

    if (req.session.corporateId !== corporateId) {
      req.flash('error_msg', 'Unauthorized access');
      return res.redirect('/corporate/login');
    }

    const corporate = await Corporate.findById(corporateId).populate('doctors');

    if (!corporate) {
      req.flash('error_msg', 'Corporate not found');
      return res.redirect('/corporate/login');
    }

    res.render('corporateDoctors', {
      corporate,
      doctors: corporate.doctors,
      followerCount: corporate.followers.length,
    });

  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error');
    res.redirect('/corporate/dashboard');
  }
});


router.get('/doctor/insights/:doctorId', async (req, res) => {
  try {
    const doctorId = req.params.doctorId;

    const doctor = await Doctor.findById(doctorId).populate('reviews');

    if (!doctor) {
        return res.status(404).json({ message: "Doctor not found" });
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
    const currentDate = new Date();

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
    } else {
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

    const unreadMessages = await Chat.aggregate([
        { $match: { doctorId: doctor._id } },
        { $unwind: '$messages' },
        { $match: { 'messages.read': false, 'messages.senderId': { $ne: doctor._id } } },
        { $count: 'unreadCount' }
    ]);

    const totalUnreadMessages = unreadMessages.length > 0 ? unreadMessages[0].unreadCount : 0;

    const waitingAppointmentsCount = await Booking.countDocuments({
        doctor: doctor._id,
        status: 'waiting'
    });

    const totalPostedSlots = doctor.timeSlots.length;
    const totalFilledSlots = doctor.timeSlots.filter(slot => slot.status === 'booked').length;

    const incomeByMonth = Array(5).fill(0);

    for (let i = 0; i < 5; i++) {
        const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i, 1);
        const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - i + 1, 0);

        const monthlyIncome = await Booking.aggregate([
            { $match: { doctor: doctor._id, status: 'completed', paid: true, date: { $gte: startOfMonth, $lte: endOfMonth } } },
            { $group: { _id: null, total: { $sum: '$payment' } } }
        ]);

        incomeByMonth[4 - i] = monthlyIncome.length > 0 ? monthlyIncome[0].total : 0;
    }

    const totalIncomeReceived = incomeByMonth.reduce((acc, income) => acc + income, 0);

    res.render('corporateDoctorInsights', {
        doctor,
        insights: {
            totalPatients: totalPatients.length > 0 ? totalPatients[0].uniquePatients : 0,
            totalConsultations,
            totalReviews,
            averageRating,
            waitingAppointmentsCount,
            totalUnreadMessages,
            totalPostedSlots,
            totalFilledSlots,
            totalIncomeReceived,
            incomeByMonth,
            
            
        },insightsFilter, bookingFilter, bookingRates
    });

} catch (error) {
    console.error("Error fetching doctor insights:", error);
    res.status(500).json({ message: "Internal server error" });
}
});

router.get('/doctor/bookings/:doctorId', async (req, res) => {
  try {
    const { doctorId } = req.params;
    const { searchQuery, filterDate, filterStatus, filterConsultation } = req.query;

    let query = { doctor: doctorId };

    if (searchQuery) {
      query.$or = [
        { patient: { $exists: true } },
        { hospital: { $exists: true } } 
      ];
    }

    if (filterDate) {
      query.date = filterDate;
    }

    if (filterStatus) {
      query.status = filterStatus.toLowerCase();
    }

    if (filterConsultation) {
      query.consultationType = filterConsultation;
    }

    
    const bookings = await Booking.find(query)
      .populate('patient', 'name') 
      .populate('hospital', 'name');

    if (searchQuery) {
      const filteredBookings = bookings.filter(
        (booking) =>
          (booking.patient?.name?.toLowerCase().includes(searchQuery.toLowerCase())) ||
          (booking.hospital?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
      );

      return res.render('corporateDoctorBookings', {
        bookings: filteredBookings,
        doctorId,
        searchQuery,
        filterDate,
        filterStatus,
        filterConsultation,
      });
    }

    res.render('corporateDoctorBookings', {
      bookings,
      doctorId,
      searchQuery,
      filterDate,
      filterStatus,
      filterConsultation,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});




router.post('/remove-doctor/:doctorId', isLoggedIn, async (req, res) => {
  try {
    const corporateId = req.session.corporateId;

    if (req.session.corporateId !== corporateId) {
      return res.status(403).send('Unauthorized');
    }

    const { doctorId } = req.params;

    await Corporate.updateOne(
      { _id: corporateId },
      { $pull: { doctors: doctorId } }
    );

    res.send('Doctor removed successfully');
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/corporate/doctor-patients/:doctorId', isLoggedIn, async (req, res) => {
  try {
    const corporateId = req.session.corporateId;
    const { doctorId } = req.params;

    if (!corporateId) {
      return res.status(403).send('Unauthorized');
    }

    const completedBookings = await Booking.find({ doctor: doctorId, status: 'completed' })
      .populate('patient')
      .populate('doctor');
    console.log(completedBookings);

    res.render('corporateDoctorPatients', { completedBookings, doctorId });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/create-account', isCorporate, (req, res) => {
  res.render('corporateCreateAccount', {
    success_msg: req.flash('success_msg'),
    error_msg: req.flash('error_msg'),
    activePage: 'create-account', 
  });
});

router.post('/create-account', isCorporate, async (req, res) => {
  const { name, email, password } = req.body;
  const corporateId = req.session.corporateId; 

  try {
    if (!name || !email || !password) {
      req.flash('error_msg', 'All fields are required.');
      return res.redirect('/corporate/create-account');
    }

    const existingDoctor = await Doctor.findOne({ email });
    if (existingDoctor) {
      req.flash('error_msg', 'Account email is already created.');
      return res.redirect('/corporate/create-account');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const corporate = await Corporate.findById(corporateId);
    if (!corporate) {
      req.flash('error_msg', 'Corporate account not found.');
      return res.redirect('/corporate/create-account');
    }

    const hospital = {
      name: corporate.corporateName, 
      street: corporate.address.street,
      city: corporate.address.city,
      state: corporate.address.state,
      country: corporate.address.country,
      zip: corporate.address.zipCode
    };

    const newDoctor = new Doctor({
      name,
      email,
      password: hashedPassword,
      role: 'doctor',
      hospitals: [hospital],
      createdByCorporate: true,
      verified: "Verified",
      isVerified: true
    });

    await newDoctor.save();

    newDoctor.corporateRequests.push({
      corporateId: corporate._id,
      corporateName: corporate.corporateName,
      requestStatus: "accepted"
    });

    await newDoctor.save();

    req.flash('success_msg', 'Doctor account created successfully.');
    res.redirect('/corporate/create-account');
  } catch (err) {
    console.error('Error creating doctor account:', err);
    req.flash('error_msg', 'An error occurred while creating the account.');
    res.redirect('/corporate/create-account');
  }
});



module.exports = router;
