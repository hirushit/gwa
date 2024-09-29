const express = require('express');
const router = express.Router();
const multer = require('multer');
const nodemailer = require('nodemailer');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Admin = require('../models/Admin'); 
const Blog = require('../models/Blog');
const Booking = require('../models/Booking');
const Notification = require('../models/Notification'); 
const Insurance = require('../models/Insurance'); 
const Specialty = require('../models/Specialty');
const Condition = require('../models/Condition');
const storage = multer.memoryStorage(); 
const upload = multer({ storage: storage });

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
    return next();
  }
  req.flash('error_msg', 'Please log in to view this resource');
  res.redirect('/auth/login');
}
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') {
      return next();
  }
  res.status(403).send('Access denied.');
};

const transporter = nodemailer.createTransport({
  service: 'gmail', // or any other email service you use
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
}
});

router.get('/admin-home', async (req, res) => {
  try {
      const highPriorityBlogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).limit(5).exec();
      const adminEmail = req.session.user.email;
      const admin = await Admin.findOne({ email: adminEmail }).lean(); 

      res.render('admin-index', { blogs: highPriorityBlogs, admin });
  } catch (error) {
      console.error('Error fetching high-priority blogs:', error);
      res.status(500).send('Internal Server Error');
  }
});


router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
    const doctors = await Doctor.find({ verified: { $ne: 'Verified' } }).lean();

    res.render('adminDashboard', { doctors, success_msg: req.flash('success_msg') });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/doctor-profile-requests', isLoggedIn, async (req, res) => {
  try {
    const profileRequests = await Doctor.find({ profileVerified: { $ne: 'Verified' } }).lean();
    res.render('doctorProfileRequests', {
      profileRequests,
      success_msg: req.flash('success_msg'),
      activePage: 'doctor-profile-requests'
    });
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

    const insurances = await Insurance.find({ _id: { $in: doctor.insurances } }).lean();

    res.render('adminViewDoctor', { doctor, insurances, activePage: 'view-doctor' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/verify/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { verificationStatus, reason, trialPeriod, maxTimeSlots } = req.body;

    if (!['Verified', 'Pending', 'Not Verified'].includes(verificationStatus)) {
      return res.status(400).send('Invalid verification status');
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    doctor.verified = verificationStatus;

    if (verificationStatus === 'Verified') {
      const customTrialPeriod = parseInt(trialPeriod) || 60;
      const customMaxTimeSlots = parseInt(maxTimeSlots) || 3;

      doctor.subscriptionVerification = 'Verified';
      doctor.trialEndDate = new Date(Date.now() + customTrialPeriod * 24 * 60 * 60 * 1000);
      doctor.maxTimeSlots = customMaxTimeSlots;
    }

    await doctor.save();

    let message = `Your profile has been ${verificationStatus.toLowerCase()}.`;

    if (verificationStatus === 'Verified') {
      const customTrialPeriod = parseInt(trialPeriod) || 60;
      const customMaxTimeSlots = parseInt(maxTimeSlots) || 3;
      message = `Your profile has been verified. You have a trial period of ${customTrialPeriod} days and you can add up to ${customMaxTimeSlots} time slots.`;
    }

    if (verificationStatus === 'Not Verified' && reason) {
      message = `Your profile has been rejected. Reason: ${reason}`;
    }

    // Save notification to the database
    const notification = new Notification({
      userId: doctor._id, 
      message,
      type: 'verification',
      read: false
    });
    await notification.save();

    // Send email notification
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: doctor.email, // Ensure doctor has an email field
      subject: '🎉 Your Profile Status Has Been Updated 🎉',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #F4F7FC;">
          <h2 style="text-align: center; color: #FF7F50;">Profile Verification Status</h2>
          <p style="font-size: 16px; color: #272848;">Hi <strong>${doctor.name}</strong>,</p>
          <p style="font-size: 16px; color: #272848;">${message}</p>
          <p style="font-size: 16px; color: #272848;">Best regards,</p>
          <p style="font-size: 16px; color: #272848;"><strong>The MedxBay Team</strong></p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="font-size: 14px; color: #777;">P.S. If you have not requested this update, please contact our support team immediately.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    req.flash('success_msg', 'Doctor verification status updated and email sent.');
    res.redirect('/admin/doctor-profile-requests');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.get('/view-doctors', isLoggedIn, async (req, res) => {
  try {
    const doctors = await Doctor.find().lean();
    res.render('viewDoctors', { doctors, activePage: 'view-doctors' });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/manage-payments', isLoggedIn, async (req, res) => {
  try {
    const { name, email, subscriptionType } = req.query;

    // Build the search query
    let query = {};

    if (name) {
      query.name = new RegExp(name, 'i'); // Case-insensitive regex search for the name
    }

    if (email) {
      query.email = new RegExp(email, 'i'); // Case-insensitive regex search for the email
    }

    // Filter by subscriptionType only if provided in the query; otherwise, default to Standard, Premium, and Enterprise
    if (subscriptionType) {
      query.subscriptionType = subscriptionType;
    } else {
      query.subscriptionType = { $in: ['Standard', 'Premium', 'Enterprise'] };
    }

    // Fetch doctors based on the constructed query
    const doctors = await Doctor.find(query).lean();

    res.render('managePayments', { doctors, activePage: 'manage-payments', name, email, subscriptionType });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/update-payments/:doctorId', isAdmin, async (req, res) => {
  try {
    const doctorId = req.params.doctorId;
    const doctor = await Doctor.findById(doctorId).lean();

    // Check if the subscription type is 'Standard', 'Premium', or 'Enterprise'
    if (doctor.subscriptionType === 'Standard' || 
        doctor.subscriptionType === 'Premium' || 
        doctor.subscriptionType === 'Enterprise') {
      
      res.render('updatePayments', { doctor });
      
    } else {
      // If subscriptionType is not 'Standard', 'Premium', or 'Enterprise', redirect or show error
      res.status(403).send('Access denied: The doctor does not have the correct subscription type.');
    }
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.post('/update-payments/:doctorId', isAdmin, async (req, res) => {
  try {
      const doctorId = req.params.doctorId;
      const updateData = {};

      // Check if tempDoctorFee is provided in the request body
      if (req.body.tempDoctorFee !== undefined) {
          updateData.tempDoctorFee = req.body.tempDoctorFee * 100;
          console.log(updateData); // Convert to cents (assuming the value in the form is in dollars)
      }

      // Check if tempDoctorFeeStatus is provided in the request body
      if (req.body.tempDoctorFeeStatus !== undefined) {
          updateData.tempDoctorFeeStatus = req.body.tempDoctorFeeStatus;
      }
      console.log(updateData)

      // Update the doctor document with the new values
      const doctor = await Doctor.findByIdAndUpdate(doctorId, updateData, { new: true });

      if (!doctor) {
          return res.status(404).send('Doctor not found');
      }

      // Redirect after successful update
      res.redirect('/admin/manage-payments');
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});

router.get('/edit-doctor/:doctorId', isAdmin, async (req, res) => {
  try {
      const doctorId = req.params.doctorId;
      const doctor = await Doctor.findById(doctorId).lean();
      const allInsurances = await Insurance.find({}).select('_id name');

      if (!doctor.hospitals) {
          doctor.hospitals = [];
      }

      if (!doctor.insurances) {
          doctor.insurances = [];
      }

      res.render('AdminEditDoctorProfile', { doctor, allInsurances });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});

router.post('/update-doctor/:doctorId', upload.single('profilePicture'), isAdmin, async (req, res) => {
  try {
      const doctorId = req.params.doctorId;
      let doctor = await Doctor.findById(doctorId);

      if (!doctor) {
          return res.status(404).send('Doctor not found');
      }

      let hospitals = [];
      if (Array.isArray(req.body.hospitals)) {
          hospitals = req.body.hospitals.map(hospital => ({
              name: hospital.name,
              street: hospital.street,
              city: hospital.city,
              state: hospital.state,
              country: hospital.country,
              zip: hospital.zip
          }));
      } else if (req.body.hospitals && req.body.hospitals.name) {
          hospitals = [{
              name: req.body.hospitals.name,
              street: req.body.hospitals.street,
              city: req.body.hospitals.city,
              state: req.body.hospitals.state,
              country: req.body.hospitals.country,
              zip: req.body.hospitals.zip
          }];
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
          hospitals: hospitals
      };

      if (req.file) {
          updateData.profilePicture = {
              data: req.file.buffer,
              contentType: req.file.mimetype
          };
      }

      if (req.body.tempDoctorFee !== undefined) {
          updateData.tempDoctorFee = req.body.tempDoctorFee;
      }

      if (req.body.tempDoctorFeeStatus !== undefined) {
          updateData.tempDoctorFeeStatus = req.body.tempDoctorFeeStatus;
      }

      doctor = await Doctor.findByIdAndUpdate(doctorId, updateData, { new: true });

      await doctor.save();

      res.redirect('/admin/view-doctors');
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});



router.get('/view-patients', isLoggedIn, async (req, res) => {
  try {
    const patients = await Patient.find().lean();
    res.render('viewPatients', { 
      patients,
      activePage: 'view-patients'  
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/edit-patient/:patientId', async (req, res) => {
  try {
    const patientId = req.params.patientId;
    // Fetch patient details by ID from the database
    const patient = await Patient.findById(patientId);
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('AdminEditPatient', { patient, activePage: 'edit-patient' });
  } catch (error) {
    res.status(500).send('Server error');
  }
});



router.post('/update-patient/:patientId', upload.single('profilePicture'), async (req, res) => {
  try {
    const { patientId } = req.params;

    const updatedData = {
      name: req.body.name,
      email: req.body.email,
      phoneNumber: req.body.phoneNumber,
      dateOfBirth: req.body.dateOfBirth,
      address: req.body.address,
      insuranceProvider: req.body.insuranceProvider,
      policyNumber: req.body.policyNumber,
      emergencyContacts: JSON.parse(req.body.emergencyContacts || '[]'),
    };

    if (req.file) {
      updatedData.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    const updatedPatient = await Patient.findByIdAndUpdate(patientId, updatedData, { new: true });

    if (!updatedPatient) {
      return res.status(404).send('Patient not found');
    }

    res.redirect('/admin/view-patients');
  } catch (error) {
    console.error('Error updating patient:', error);
    res.status(500).send('Server error');
  }
});


router.post('/delete-doctor/:id', isLoggedIn, async (req, res) => {
  try {
    await Doctor.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Doctor deleted successfully');
    res.redirect('/admin/view-doctors');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/delete-patient/:id', isLoggedIn, async (req, res) => {
  try {
    await Patient.findByIdAndDelete(req.params.id);
    req.flash('success_msg', 'Patient deleted successfully');
    res.redirect('/admin/view-patients');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/change-to-patient/:doctorId', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    console.log('Doctor data:', doctor);

    const existingPatient = await Patient.findOne({ email: doctor.email });
    if (existingPatient) {
      return res.status(400).send('A patient with this email already exists');
    }

    const newPatient = new Patient({
      name: doctor.name,
      email: doctor.email,
      password: doctor.password, 
      isVerified: true, 
      role: 'patient'
    });

    console.log('New Patient data before saving:', newPatient);

    try {
      await newPatient.save();
      console.log('New patient saved successfully');
    } catch (saveError) {
      console.error('Error saving the new patient:', saveError);
      return res.status(500).send('Error saving the new patient');
    }

    await Doctor.findByIdAndDelete(req.params.doctorId);
    res.redirect('/admin/view-patients'); 

  } catch (error) {
    console.error('Error in changing doctor to patient:', error.message);
    res.status(500).send('Server Error');
  }
});




router.post('/change-to-doctor/:patientId', isLoggedIn, async (req, res) => {
  try {
    const patient = await Patient.findById(req.params.patientId);

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const newDoctor = new Doctor({
      name: patient.name,
      email: patient.email,
      password: patient.password,
      isVerified: true  
    });

    await newDoctor.save(); 
    await Patient.findByIdAndDelete(req.params.patientId);

    res.redirect('/admin/view-doctors'); 
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


router.get('/subscriptions', isAdmin, async (req, res) => {
  try {
    const doctors = await Doctor.find({}, 'name subscriptionType subscriptionVerification documents').lean(); 
    console.log(doctors);

    res.render('adminSubscriptions', { 
      doctors, 
      activePage: 'subscriptions' 
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



router.post('/verify-subscription/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { verificationStatus } = req.body;

    if (!['Verified', 'Rejected', 'Pending'].includes(verificationStatus)) {
      return res.status(400).send('Invalid subscription verification status');
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    doctor.subscriptionVerification = verificationStatus;
    await doctor.save();

    const message = `Your subscription has been ${verificationStatus.toLowerCase()}.`;
    const notification = new Notification({
      userId: doctor._id, 
      message,
      type: 'verification',
      read: false
    });
    await notification.save();

    req.flash('success_msg', 'Doctor subscription verification status updated.');
    res.redirect('/admin/dashboard'); 
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.get('/blogs', isLoggedIn, async (req, res) => {
  try {
    const blogs = await Blog.find().lean();
    res.render('adminBlogs', { 
      blogs, 
      success_msg: req.flash('success_msg'),
      activePage: 'blogs' // Add this line
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



router.get('/blogs/view/:id', isLoggedIn, async (req, res) => {
  try {
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId).lean();

      if (!blog) {
          return res.status(404).send('Blog not found');
      }

      res.render('adminViewBlog', { blog, activePage: 'blogs' }); 
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});



router.post('/blogs/verify/:id', isLoggedIn, async (req, res) => {
  try {
      const blogId = req.params.id;
      const { verificationStatus } = req.body;

      if (!['Verified', 'Pending', 'Not Verified'].includes(verificationStatus)) {
          return res.status(400).send('Invalid verification status');
      }

      const blog = await Blog.findById(blogId);

      if (!blog) {
          return res.status(404).send('Blog not found');
      }

      await Blog.updateOne({ _id: blogId }, { verificationStatus });

      const notification = new Notification({
          userId: blog.authorId, 
          message: `Your blog titled "${blog.title}" has been ${verificationStatus.toLowerCase()}.`,
          type: 'verification',
      });

      await notification.save();

      req.flash('success_msg', 'Blog verification status updated and user notified.');
      res.redirect('/admin/blogs');
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


router.post('/blogs/edit/:id', isLoggedIn, upload.single('image'), async (req, res) => {
  try {
    const { title, description, summary, categories, subcategories, priority, hashtags } = req.body;
    const blogId = req.params.id;

    const blog = await Blog.findById(blogId);

    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    blog.title = title;
    blog.description = description;
    blog.summary = summary;
    blog.categories = Array.isArray(categories) ? categories : categories.split(',');
    blog.subcategories = Array.isArray(subcategories) ? subcategories : subcategories.split(',');
    blog.hashtags = Array.isArray(hashtags) ? hashtags : hashtags.split(',');
    blog.priority = priority;

    if (req.file) {
      blog.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    await blog.save();

    req.flash('success_msg', 'Blog updated successfully');
    res.redirect('/admin/blogs');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/blog', isLoggedIn, async (req, res) => {
  try {
      const doctors = await Doctor.find(); // Fetch all doctors
      const admin = await Admin.findOne({ email: req.session.user.email }); // Fetch the logged-in admin

      if (!admin) {
          return res.status(403).send('Unauthorized');
      }

      res.render('admin-blog-upload-form', { activePage: 'blog-upload', doctors, admin });
  } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
  }
});

router.post('/blog-all', upload.single('image'), async (req, res) => {
  try {
      const { title, description, summary, categories, subcategories, hashtags, priority, authorId } = req.body;

      let author = null;
      let authorEmail = null;

      // Determine if the selected author is a doctor or admin
      const doctor = await Doctor.findById(authorId);
      if (doctor) {
          author = doctor.name;
          authorEmail = doctor.email;
      } else {
          const admin = await Admin.findById(authorId);
          if (admin) {
              author = admin.name;
              authorEmail = admin.email;
          }
      }

      if (!author || !authorEmail) {
          return res.status(400).send('Invalid author selection');
      }

      const newBlog = new Blog({
          title,
          author,
          description,
          summary,
          authorEmail,
          authorId, 
          categories,
          subcategories: subcategories, 
          hashtags, 
          priority,
          image: {
              data: req.file.buffer,
              contentType: req.file.mimetype
          },
          verificationStatus: 'Pending' 
      });

      await newBlog.save();

      res.render('admin-blog-success', { message: 'Blog uploaded successfully' });
  } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server error' });
  }
});

router.get('/blogs-all/view/:id', isLoggedIn, async (req, res) => {
  try {
    const blogId = req.params.id;

    if (!req.session.viewedBlogs) {
      req.session.viewedBlogs = [];
    }

    if (!req.session.viewedBlogs.includes(blogId)) {
      await Blog.findByIdAndUpdate(blogId, { $inc: { readCount: 1 } });
      req.session.viewedBlogs.push(blogId);
    }

    const blog = await Blog.findById(blogId).lean();
    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    const relatedPosts = await Blog.find({
      _id: { $ne: blog._id }, 
      verificationStatus: "Verified", 
      $or: [
        { categories: { $in: blog.categories } },
        { hashtags: { $in: blog.hashtags } }
      ]
    }).lean().limit(5); 

    const mostReadPosts = await Blog.find({
      _id: { $ne: blog._id }, 
      verificationStatus: "Verified" 
    })
      .sort({ readCount: -1 }) 
      .limit(5) 
      .lean();

    res.render('AdminViewAllBlog', { blog, relatedPosts, mostReadPosts });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



router.post('/blogs-all/comment/:id', isLoggedIn, async (req, res) => {
  try {
      const { comment } = req.body;
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId);

      if (!blog) {
          return res.status(404).send('Blog not found');
      }
      console.log(req.session.user.name)
      blog.comments.push({
          username: req.session.user.name, 
          comment: comment
      });

      await blog.save();

      req.flash('success_msg', 'Comment added successfully');
      res.redirect(`/admin/blogs-all/view/${blogId}`);
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

    res.render('Adminauthor-info', {
      author,
      blogCount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});
// router.get('/priority-blogs', async (req, res) => {
//     try {
//       const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).lean();

//       res.render('priorityblogs', { blogs });
//     } catch (err) {
//       console.error(err.message);
//       res.status(500).send('Server Error');
//     }
//   });

router.get('/blogs-all', async (req, res) => {
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

    const verifiedBlogs = await Blog.find(filter).lean();

    res.render('AdminSearchBlogs', { blogs: verifiedBlogs, searchQuery: req.query.search });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/insurance/new', isAdmin, (req, res) => {
  // Set the activePage variable for the 'insurance' section
  const activePage = 'insurances';

  // Render the template with the activePage variable
  res.render('adminNewInsurance', { activePage });
});


router.post('/insurance', isAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !req.file) {
      req.flash('error_msg', 'Insurance name and logo are required.');
      return res.redirect('/admin/insurance/new');
    }

    const newInsurance = new Insurance({
      name,
      logo: {
        data: req.file.buffer,
        contentType: req.file.mimetype
      }
    });

    await newInsurance.save();

    req.flash('success_msg', 'Insurance added successfully.');
    res.redirect('/admin/insurances');
  } catch (err) {
    console.error(err);
    req.flash('error_msg', 'Server error. Could not add insurance.');
    res.redirect('/admin/insurance/new');
  }
});

router.get('/insurances', isAdmin, async (req, res) => {
  try {
    const insurances = await Insurance.find().lean();
    res.render('adminInsurances', { insurances,  activePage: 'insurance'});
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/insurances/edit/:id', isAdmin, async (req, res) => {
  try {
    const insurance = await Insurance.findById(req.params.id).lean();
    if (!insurance) {
      return res.status(404).send('Insurance not found');
    }
    res.render('editInsurance', { insurance, activePage: 'insurance' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.post('/insurances/edit/:id', isAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { name } = req.body;
    const insurance = await Insurance.findById(req.params.id);

    if (!insurance) {
      return res.status(404).send('Insurance not found');
    }

    // Update the insurance name
    insurance.name = name;

    // Update the logo if a new file is uploaded
    if (req.file) {
      insurance.logo.data = req.file.buffer;
      insurance.logo.contentType = req.file.mimetype;
    }

    // Save the updated insurance
    await insurance.save();

    res.redirect('/admin/insurances'); // Redirect back to the insurance list
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/insurance/:id', isAdmin, async (req, res) => {
  try {
    const insuranceId = req.params.id;
    const insurance = await Insurance.findById(insuranceId).lean();

    if (!insurance) {
      return res.status(404).send('Insurance not found');
    }

    // Set the activePage variable here
    const activePage = 'insurances';

    res.render('adminViewInsurance', { insurance, activePage });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});


// Route to handle insurance deletion
router.post('/insurance/delete/:id', isAdmin, async (req, res) => {
  try {
    const insuranceId = req.params.id;

    await Insurance.findByIdAndDelete(insuranceId);

    req.flash('success_msg', 'Insurance deleted successfully.');
    res.redirect('/admin/insurances');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/view-appointments', isLoggedIn, async (req, res) => {
  try {
      const bookings = await Booking.find()
          .populate('doctor')
          .populate('patient')
          .exec();
      res.render('view-appointments', { bookings, activePage: 'view-appointments' });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  }
});

// Update appointment status
router.post('/view-appointments/:id', isLoggedIn, async (req, res) => {
  try {
      const { status } = req.body;
      const bookingId = req.params.id;

      const booking = await Booking.findById(bookingId)
          .populate('doctor')
          .populate('patient');

      if (!booking) {
          return res.status(404).send('Booking not found');
      }

      // Handle status update logic, including sending notifications if needed
      booking.status = status;
      await booking.save();

      res.redirect('/admin/view-appointments');
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  }
});

// router.get('/bookings', async (req, res) => {
//   try {
//       const bookings = await Booking.find().select('doctor patient date consultationType').lean();

//       // Prepare an array to hold booking details
//       const bookingDetails = await Promise.all(
//           bookings.map(async (booking) => {
//               try {
//                   // Fetch the doctor details using doctorId
//                   const doctor = await Doctor.findById(booking.doctor, 'name email').lean();
//                   if (!doctor) {
//                       throw new Error('Doctor not found');
//                   }

//                   // Fetch the patient details using patientId
//                   const patient = await Patient.findById(booking.patient, 'name').lean();
//                   if (!patient) {
//                       throw new Error('Patient not found');
//                   }

//                   // Combine the data
//                   return {
//                       _id: booking._id,
//                       patientName: patient.name,
//                       doctorName: doctor.name,
//                       doctorEmail: doctor.email,
//                       appointmentDate: booking.date,
//                       appointmentTime: booking.time,
//                       consultationType: booking.consultationType,
//                       status: booking.status,
//                       meetingLink: booking.meetingLink,
//                       hospital: booking.hospital,
//                       payment: booking.payment,
//                       paid: booking.paid
//                   };
//               } catch (error) {
//                   console.error('Error fetching details:', error);
//                   return {
//                       _id: booking._id,
//                       patientName: 'Error',
//                       doctorName: 'Error',
//                       doctorEmail: 'Error',
//                       appointmentDate: booking.date,
//                       appointmentTime: booking.time,
//                       consultationType: booking.consultationType,
//                       status: booking.status,
//                       meetingLink: booking.meetingLink,
//                       hospital: booking.hospital,
//                       payment: booking.payment,
//                       paid: booking.paid
//                   };
//               }
//           })
//       );

//       res.render('bookings', { bookings: bookingDetails });
//   } catch (error) {
//       console.error('Error fetching bookings:', error);
//       res.status(500).send('Internal Server Error');
//   }
// });

router.get('/bookings', async (req, res) => {
  try {
      const { doctorName, doctorEmail, consultationType, patientName, appointmentDate } = req.query;

      // Initialize empty arrays to store IDs
      let doctorIds = [];
      let patientIds = [];

      // Fetch doctor IDs based on doctorName and doctorEmail
      if (doctorName || doctorEmail) {
          const doctorQuery = {};
          if (doctorName) doctorQuery.name = new RegExp(doctorName, 'i'); // Case-insensitive search
          if (doctorEmail) doctorQuery.email = doctorEmail;

          const doctors = await Doctor.find(doctorQuery, '_id').lean();
          doctorIds = doctors.map(doc => doc._id);
      }

      // Fetch patient IDs based on patientName
      if (patientName) {
          const patientQuery = { name: new RegExp(patientName, 'i') }; // Case-insensitive search

          const patients = await Patient.find(patientQuery, '_id').lean();
          patientIds = patients.map(patient => patient._id);
      }

      // Build the booking query using the doctor and patient IDs
      const bookingQuery = {};
      if (doctorIds.length > 0) bookingQuery.doctor = { $in: doctorIds };
      if (patientIds.length > 0) bookingQuery.patient = { $in: patientIds };
      if (consultationType) bookingQuery.consultationType = consultationType;

      // Handle appointment date filtering
      if (appointmentDate) {
          const date = new Date(appointmentDate);
          bookingQuery.date = {
              $gte: new Date(date.setHours(0, 0, 0, 0)),
              $lt: new Date(date.setHours(23, 59, 59, 999))
          };
      }

      // Fetch bookings based on the query
      const bookings = await Booking.find(bookingQuery).lean();

      // Prepare the booking details with doctor and patient info
      const bookingDetails = await Promise.all(
          bookings.map(async (booking) => {
              const doctor = await Doctor.findById(booking.doctor, 'name email').lean();
              const patient = await Patient.findById(booking.patient, 'name').lean();

              return {
                  _id: booking._id,
                  patientName: patient ? patient.name : 'Unknown',
                  doctorName: doctor ? doctor.name : 'Unknown',
                  doctorEmail: doctor ? doctor.email : 'Unknown',
                  appointmentDate: booking.date,
                  consultationType: booking.consultationType,
                  status: booking.status,
                  meetingLink: booking.meetingLink,
                  hospital: booking.hospital,
                  payment: booking.payment,
                  paid: booking.paid
              };
          })
      );

      // Render the results
      res.render('bookings', { bookings: bookingDetails, query: req.query || {} });
  } catch (error) {
      console.error('Error fetching bookings:', error);
      res.status(500).send('Internal Server Error');
  }
});


router.get('/booking-details/:bookingId', isLoggedIn, isAdmin, async (req, res) => {
  try {
      const bookingId = req.params.bookingId;

      // Fetch the booking details using the bookingId
      const booking = await Booking.findById(bookingId).lean();
      
      if (!booking) {
          return res.status(404).send('Booking not found');
      }
      console.log(booking.doctor)
      // Fetch the doctor details using doctorId
      const doctor = await Doctor.findById(booking.doctor, 'name email').lean();
      if (!doctor) {
          return res.status(404).send('Doctor not found');
      }
      console.log(doctor);
      // Fetch the patient details using patientId
      const patient = await Patient.findById(booking.patient, 'name').lean();
      if (!patient) {
          return res.status(404).send('Patient not found');
      }

      // Combine the data
      const bookingDetails = {
        doctorName: doctor.name,
        doctorEmail: doctor.email,
        patientName: patient.name,
        appointmentDate: booking.date,
        appointmentTime: booking.time,
        consultationType: booking.consultationType,
        status: booking.status,
        meetingLink: booking.meetingLink,
        hospital: booking.hospital,
        payment: booking.payment,
        paid: booking.paid
    };


      // Send the booking details as response
      res.render('booking-details', { booking: bookingDetails });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server error');
  }
});



router.get('/insights', async (req, res) => {
  try {
      const totalDoctors = await Doctor.countDocuments({});
      const totalPremiumDoctors = await Doctor.countDocuments({ subscriptionType: { $ne: 'Free' } });
      const totalPatients = await Patient.countDocuments({});

      const totalBlogs = await Blog.countDocuments({});
      const blogsVerified = await Blog.countDocuments({ verificationStatus: 'verified' });
      const blogsPendingRequest = await Blog.countDocuments({ verificationStatus: 'pending' });

      const totalConsultations = await Booking.countDocuments({ status: 'completed' });
      const totalReviews = await Doctor.aggregate([{ $unwind: "$reviews" }, { $count: "totalReviews" }]);
      
      const bookingFilter = req.query['booking-filter'] || 'all';
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
          { $match: { date: { $gte: startDate, $lte: endDate } } },
          {
              $group: {
                  _id: { $dayOfWeek: '$date' },
                  count: { $sum: 1 }
              }
          },
          { $sort: { _id: 1 } } 
      ]);

      res.render('adminInsights', {
          totalDoctors,
          totalPremiumDoctors,
          totalPatients,
          totalBlogs,
          blogsVerified,
          blogsPendingRequest,
          totalConsultations,
          totalReviews: totalReviews[0]?.totalReviews || 0,
          bookingRates,
          bookingFilter
      });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


// Render the Add Specialty page
router.get('/specialty/new', isAdmin, async (req, res) => {
  try {
      const specialties = await Specialty.find().lean();
      res.render('adminNewSpecialty', { specialties, activePage: 'specialties' });
  } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
  }
});

// Handle Add Specialty form submission
router.post('/specialty', isAdmin, async (req, res) => {
  try {
      const { name } = req.body;

      if (!name) {
          req.flash('error_msg', 'Specialty name is required.');
          return res.redirect('/admin/specialty/new');
      }

      const newSpecialty = new Specialty({ name });
      await newSpecialty.save();

      req.flash('success_msg', 'Specialty added successfully.');
      res.redirect('/admin/specialty/new');
  } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error. Could not add specialty.');
      res.redirect('/admin/specialty/new');
  }
});

// Delete a specialty
router.post('/specialty/:id/delete', isAdmin, async (req, res) => {
  try {
      await Specialty.findByIdAndDelete(req.params.id);
      req.flash('success_msg', 'Specialty deleted successfully.');
      res.redirect('/admin/specialty/new');
  } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error. Could not delete specialty.');
      res.redirect('/admin/specialty/new');
  }
});

// Render the Add Condition page
router.get('/condition/new', isAdmin, async (req, res) => {
  try {
      const conditions = await Condition.find().lean();
      res.render('adminNewCondition', { conditions, activePage: 'conditions' });
  } catch (err) {
      console.error(err);
      res.status(500).send('Server Error');
  }
});

// Handle Add Condition form submission
router.post('/condition', isAdmin, async (req, res) => {
  try {
      const { name } = req.body;

      if (!name) {
          req.flash('error_msg', 'Condition name is required.');
          return res.redirect('/admin/condition/new');
      }

      const newCondition = new Condition({ name });
      await newCondition.save();

      req.flash('success_msg', 'Condition added successfully.');
      res.redirect('/admin/condition/new');
  } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error. Could not add condition.');
      res.redirect('/admin/condition/new');
  }
});

// Delete a condition
router.post('/condition/:id/delete', isAdmin, async (req, res) => {
  try {
      await Condition.findByIdAndDelete(req.params.id);
      req.flash('success_msg', 'Condition deleted successfully.');
      res.redirect('/admin/condition/new');
  } catch (err) {
      console.error(err);
      req.flash('error_msg', 'Server error. Could not delete condition.');
      res.redirect('/admin/condition/new');
  }
});


module.exports = router;
