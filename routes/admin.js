const express = require('express');
const router = express.Router();
const multer = require('multer');
const Doctor = require('../models/Doctor');
const Admin = require('../models/Admin'); 
const Blog = require('../models/Blog');


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

router.get('/subscriptions', isAdmin, async (req, res) => {
  try {
      const doctors = await Doctor.find({}).lean(); 

      res.render('adminSubscriptions', { doctors });
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
      
      res.render('adminBlogs', { blogs, success_msg: req.flash('success_msg') });
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

      res.render('adminViewBlog', { blog });
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

      req.flash('success_msg', 'Blog verification status updated.');
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

router.get('/blog', (req, res) => {
  res.render('admin-blog-upload-form'); 
});


router.post('/blog', upload.single('image'), async (req, res) => {
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

module.exports = router;
