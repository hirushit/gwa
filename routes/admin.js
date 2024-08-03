const express = require('express');
const router = express.Router();
const multer = require('multer');
const Doctor = require('../models/Doctor');
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

    const message = `Your profile has been ${verificationStatus.toLowerCase()}.`;
    const notification = new Notification({
      userId: doctor._id, 
      message,
      type: 'verification',
      read: false
    });
    await notification.save();

    req.flash('success_msg', 'Doctor verification status updated.');
    res.redirect('/admin/dashboard');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.get('/subscriptions', isAdmin, async (req, res) => {
  try {
      const doctors = await Doctor.find({}, 'name subscriptionType subscriptionVerification documents').lean(); 

      console.log(doctors);

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

router.get('/blog', (req, res) => {
  res.render('admin-blog-upload-form'); 
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
  res.render('adminNewInsurance');
});

// Route to handle the form submission for adding new insurance
router.post('/insurance', isAdmin, upload.single('logo'), async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || !req.file) {
      req.flash('error_msg', 'Insurance name and logo are required.');
      return res.redirect('/admin/insurance/new');
    }

    // Create a new insurance entry
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

// Route to display all insurances
router.get('/insurances', isAdmin, async (req, res) => {
  try {
    const insurances = await Insurance.find().lean();
    res.render('adminInsurances', { insurances });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

// Route to view a specific insurance
router.get('/insurance/:id', isAdmin, async (req, res) => {
  try {
    const insuranceId = req.params.id;
    const insurance = await Insurance.findById(insuranceId).lean();

    if (!insurance) {
      return res.status(404).send('Insurance not found');
    }

    res.render('adminViewInsurance', { insurance });
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
