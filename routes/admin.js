const express = require('express');
const router = express.Router();
const multer = require('multer');
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const Admin = require('../models/Admin'); 
const Blog = require('../models/Blog');
const Notification = require('../models/Notification'); 
const Insurance = require('../models/Insurance'); 
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

    const message = `Your profile has been ${verificationStatus.toLowerCase()}.`;
    const notification = new Notification({
      userId: doctor._id, 
      message,
      type: 'verification',
      read: false
    });
    await notification.save();

    req.flash('success_msg', 'Doctor verification status updated.');
    res.redirect('/doctor-profile-requests');
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

      blog.verificationStatus = verificationStatus;
      await blog.save();

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
    const { title, author, description, summary, authorEmail, priority } = req.body;
    const blogId = req.params.id;

    const blog = await Blog.findById(blogId);

    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    blog.title = title;
    blog.author = author;
    blog.description = description;
    blog.summary = summary;
    blog.authorEmail = authorEmail;
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

router.get('/blog', isLoggedIn, (req, res) => {
  res.render('admin-blog-upload-form', { activePage: 'blog-upload' });
});



router.post('/blog-all', upload.single('image'), async (req, res) => {
  try {
      const authorEmail = req.session.user.email;
      const { title, author, description, summary, categories, hashtags, priority } = req.body;

      const admin = await Admin.findOne({ email: authorEmail });

      let authorId = null;
      if (admin) {
          authorId = admin._id; 
      }

      const newBlog = new Blog({
          title,
          author,
          description,
          summary,
          authorEmail,
          authorId, 
          categories: categories, 
          hashtags: hashtags, 
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

module.exports = router;
