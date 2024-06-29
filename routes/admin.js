const express = require('express');
const router = express.Router();
const Doctor = require('../models/Doctor');
const multer = require('multer');
const Admin = require('../models/Admin'); // Ensure consistent casing
const Patient = require('../models/Patient'); // Adjust the path to match your file structure
const Blog = require('../models/Blog');



const storage = multer.memoryStorage(); // Store in memory
const upload = multer({ storage: storage });
// Middleware to check if user is logged in as admin
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


// GET route to render admin dashboard
router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
    // Fetch all doctors with pending verification
    const doctors = await Doctor.find({ verified: { $ne: 'Verified' } }).lean();

    // Render admin dashboard with doctors data and success message if exists
    res.render('adminDashboard', { doctors, success_msg: req.flash('success_msg') });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// GET route to view a doctor's profile details
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

// POST route to update doctor's verification status
router.post('/verify/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { verificationStatus } = req.body;

    // Validate verificationStatus
    if (!['Verified', 'Pending', 'Not Verified'].includes(verificationStatus)) {
      return res.status(400).send('Invalid verification status');
    }

    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    // Update doctor's verification status
    doctor.verified = verificationStatus;
    await doctor.save();

    req.flash('success_msg', 'Doctor verification status updated.');
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/blogs', isLoggedIn, async (req, res) => {
  try {
      // Fetch all blogs
      const blogs = await Blog.find().lean();
      
      // Render admin dashboard with blogs data and success message if exists
      res.render('adminBlogs', { blogs, success_msg: req.flash('success_msg') });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


// GET route to view a blog post's details
// GET route to view and edit a blog
router.get('/blogs/view/:id', isLoggedIn, async (req, res) => {
  try {
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId).lean();

      if (!blog) {
          return res.status(404).send('Blog not found');
      }

      res.render('adminViewBlog', { blog });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


// POST route to update blog's verification status
router.post('/blogs/verify/:id', isLoggedIn, async (req, res) => {
  try {
      const blogId = req.params.id;
      const { verificationStatus } = req.body;

      // Validate verificationStatus
      if (!['Verified', 'Pending', 'Not Verified'].includes(verificationStatus)) {
          return res.status(400).send('Invalid verification status');
      }

      const blog = await Blog.findById(blogId);

      if (!blog) {
          return res.status(404).send('Blog not found');
      }

      // Update blog's verification status
      blog.verificationStatus = verificationStatus;
      await blog.save();

      req.flash('success_msg', 'Blog verification status updated.');
      res.redirect('/admin/blogs');
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


// POST route to update a blog post
router.post('/blogs/edit/:id', isLoggedIn, upload.single('image'), async (req, res) => {
  try {
    const { title, author, description, summary, authorEmail } = req.body;
    const blogId = req.params.id;

    // Find the blog by ID
    const blog = await Blog.findById(blogId);

    if (!blog) {
      return res.status(404).send('Blog not found');
    }

    // Update blog fields
    blog.title = title;
    blog.author = author;
    blog.description = description;
    blog.summary = summary;
    blog.authorEmail = authorEmail;

    // Handle image upload if included in the form
    if (req.file) {
      blog.image = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    // Save updated blog
    await blog.save();

    req.flash('success_msg', 'Blog updated successfully');
    res.redirect('/admin/blogs');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/verify-subscription/:id', isLoggedIn, async (req, res) => {
  try {
    const doctorId = req.params.id;
    const { verificationStatus } = req.body;

    // Validate verificationStatus
    if (!['Verified', 'Rejected', 'Pending'].includes(verificationStatus)) {
      return res.status(400).send('Invalid subscription verification status');
    }

    // Find the doctor by ID
    const doctor = await Doctor.findById(doctorId);

    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    // Update doctor's subscription verification status
    doctor.subscriptionVerification = verificationStatus;
    await doctor.save();

    req.flash('success_msg', 'Doctor subscription verification status updated.');
    res.redirect('/admin/dashboard'); // Redirect to admin dashboard or appropriate page
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


module.exports = router;
