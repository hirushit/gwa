const express = require('express');
const router = express.Router();
const multer = require('multer');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');
const Blog = require('../models/Blog');
const Admin = require('../models/Admin');
const Chat = require('../models/Chat');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'patient') {
    return next();
  }
  res.redirect('/auth/login');
}

router.get('/profile', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('patientProfile', { patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.get('/edit', isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    const patient = await Patient.findOne({ email: patientEmail }).lean();
    if (!patient) {
      return res.status(404).send('Patient not found');
    }
    res.render('editPatientProfile', { patient });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
  try {
    const patientEmail = req.session.user.email;
    let patient = await Patient.findOne({ email: patientEmail });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    const updateData = {
      ...req.body,
      emergencyContacts: Array.isArray(req.body.emergencyContacts) ? req.body.emergencyContacts.map(contact => ({
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        email: contact.email
      })) : []
    };

    if (req.file) {
      updateData.profilePicture = {
        data: req.file.buffer,
        contentType: req.file.mimetype
      };
    }

    Object.assign(patient, updateData);

    await patient.save();

    res.redirect('/patient/profile');
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Route to display available doctors
router.get('/doctors', async (req, res) => {
  try {
    const patient = await Patient.find({subscriptionTier: 'Free'})
    const doctors = await Doctor.find({ verified: 'Verified', subscriptionType: { $ne: 'Free' } });
    const countries = await Doctor.distinct('country');
    const states = await Doctor.distinct('state');
    const cities = await Doctor.distinct('city');
    const specialities = await Doctor.distinct('speciality');
    const languages = await Doctor.distinct('languages');
    const hospitals = await Doctor.distinct('hospitals');
    const genders = await Doctor.distinct('gender');
    res.render('patientDoctors', {
      patient,
      doctors,
      countries,
      states,
      cities,
      specialities,
      languages,
      hospitals,
      genders
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Route to view a doctor's profile
router.get('/doctors/:id', isLoggedIn, async (req, res) => {
  try {
    
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('doctorProfileView', { doctor,user: req.user });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

// Route to view and book time slots for a doctor
router.get('/doctor/:id/slots', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('bookTimeSlots', { doctor, availableSlots: doctor.timeSlots });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/book', isLoggedIn, async (req, res) => {
  try {
    const { doctorId, date, time, consultationType } = req.body;
    const patientId = req.session.user._id;

    // Create new booking
    const booking = new Booking({
      patient: patientId,
      doctor: doctorId,
      date: new Date(date),
      time: time,
      consultationType: consultationType,
      status: 'waiting' // Assuming this field exists in Booking schema to track booking status
    });

    // Save booking
    await booking.save();

    // Update doctor's time slot status (assuming 'timeSlots' is an array of objects in Doctor schema)
    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }

    // Find the matching time slot and update its status
    const slotToUpdate = doctor.timeSlots.find(slot => slot && slot.date && slot.date.toISOString() === date && slot.startTime === time.split(' - ')[0]);
    if (slotToUpdate) {
      slotToUpdate.status = 'booked';
      await doctor.save();
    }

    res.redirect('/patient/bookings');
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

// Route to view patient's bookings
router.get('/bookings', isLoggedIn, async (req, res) => {
  try {
    const bookings = await Booking.find({ patient: req.session.user._id }).populate('doctor');
    res.render('patientBookings', { bookings });
  } catch (error) {
    console.error(error.message);
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

      res.render('PatientViewBlog', { blog });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});



router.post('/blogs/comment/:id', isLoggedIn, async (req, res) => {
  try {
      const { comment } = req.body;
      const blogId = req.params.id;
      const blog = await Blog.findById(blogId);

      if (!blog) {
          return res.status(404).send('Blog not found');
      }
      console.log(req.session.user.name)
      // Add comment to blog
      blog.comments.push({
          username: req.session.user.name, // Assuming username is stored in session
          comment: comment
      });

      await blog.save();

      req.flash('success_msg', 'Comment added successfully');
      res.redirect(`/patient/blogs/view/${blogId}`);
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});

router.get('/author/:id', async (req, res) => {
  try {
    const authorId = req.params.id;

    // First, try to find the author in the Doctor collection
    let author = await Doctor.findById(authorId);

    // If author is not found in Doctor collection, try to find in Admin collection
    if (!author) {
      author = await Admin.findById(authorId);
    }

    // If author still not found, return 404
    if (!author) {
      return res.status(404).send('Author not found');
    }

    // Count the number of blogs posted by the author
    const blogCount = await Blog.countDocuments({ authorId });

    res.render('author-info', {
      author,
      blogCount
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});
// Assuming you have a route to fetch blogs
router.get('/priority-blogs', async (req, res) => {
  try {
    // Fetch blogs with priority 'high'
    const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).lean();

    // Render the EJS template with blogs data
    res.render('priorityblogs', { blogs });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Route to render patient dashboard with chats
router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
      const patient = await Patient.findOne({ email: req.session.user.email }).lean();
      if (!patient) {
          return res.status(404).send('Patient not found');
      }

      // Fetch all chats for the patient
      const chats = await Chat.find({ patientId: patient._id })
          .populate('doctorId', 'name') // Populate doctor details
          .sort({ updatedAt: -1 }); // Sort by latest updated chat

      res.render('patientDashboard', { patient, chats });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});

// Corrected route to render patient chat based on chat ID
router.get('/chat/:id', isLoggedIn, async (req, res) => {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findById(chatId).populate('doctorId').lean();

    if (!chat) {
      return res.status(404).send('Chat not found');
    }

    res.render('patientChat', { chat });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


// Route to send a message from patient to doctor
router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
  try {
    const { message } = req.body;
    const patient = await Patient.findOne({ email: req.session.user.email });
    const chatId = req.params.chatId;

    // Ensure patient exists
    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    // Find or create the chat based on chatId
    let chat = await Chat.findOneAndUpdate(
      { _id: chatId, patientId: patient._id },
      { $push: { messages: { senderId: patient._id, text: message, timestamp: new Date() } } },
      { upsert: true, new: true }
    );

    // Redirect to the chat page for the patient after sending message
    res.redirect(`/patient/chat/${chat._id}`);

  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

module.exports = router;
