const express = require('express');
const router = express.Router();
const multer = require('multer');
const Patient = require('../models/Patient');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');
const Admin = require('../models/Admin'); 
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const Blog = require('../models/Blog');
const Chat = require('../models/Chat');
const Prescription = require('../models/Prescription');
const Notification = require('../models/Notification');

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

function isLoggedIn(req, res, next) {
  if (req.session.user && req.session.user.role === 'patient') {
    req.user = req.session.user;
    return next();
  }
  res.redirect('/auth/login');
}

router.get('/patient-index', async (req, res) => {
  try {
    const highPriorityBlogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).limit(5).exec();
      const patientEmail = req.session.user.email; 
      const patient = await Patient.findOne({email: patientEmail}).lean(); 

      res.render('patient-index', { blogs: highPriorityBlogs, patient });
  } catch (error) {
      console.error('Error fetching high-priority blogs:', error);
      res.status(500).send('Internal Server Error');
  }
});

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

router.get('/doctors', async (req, res) => {
  try {
    const sortOption = req.query.sort;
    let sortCriteria;

    switch (sortOption) {
      case 'mostReviewed':
        sortCriteria = { consultationsCompleted: -1 };
        break;
      case 'highestRated':
        sortCriteria = { rating: -1 };
        break;
      case 'mostViewed':
        sortCriteria = { profileViews: -1 };
        break;
      default:
        sortCriteria = {};
    }

    // Fetch doctors with populated hospitals from time slots
    const doctors = await Doctor.find({ verified: 'Verified' })
      .populate({
        path: 'hospitals',
        select: 'name city -_id' // Include only name and city fields
      })
      .sort(sortCriteria);

    // Prepare other dropdown options and data needed for rendering
    const countries = await Doctor.distinct('country');
    const states = await Doctor.distinct('state');
    const cities = await Doctor.distinct('city');
    const specialities = await Doctor.distinct('speciality');
    const languages = await Doctor.distinct('languages');
    const genders = await Doctor.distinct('gender');

    res.render('patientDoctors', {
      doctors,
      countries,
      states,
      cities,
      specialities,
      languages,
      genders
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.get('/doctors/:id/slots', isLoggedIn, async (req, res) => {
  try {
    const doctor = await Doctor.findById(req.params.id);
    if (!doctor) {
      return res.status(404).send('Doctor not found');
    }
    res.render('doctorProfileView', { doctor });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/book', isLoggedIn, async (req, res) => {
  try {
      const { doctorId, date, time, consultationType } = req.body;
      const patientId = req.session.user._id;

      const doctor = await Doctor.findById(doctorId);
      if (!doctor) {
          return res.status(404).send('Doctor not found');
      }

      const slot = doctor.timeSlots.find(slot =>
          slot && slot.date && slot.date.toISOString() === new Date(date).toISOString() && slot.startTime === time.split(' - ')[0]
      );

      if (!slot) {
          return res.status(400).send('Time slot not found');
      }

      const booking = new Booking({
          patient: patientId,
          doctor: doctorId,
          date: new Date(date),
          time: time,
          consultationType: consultationType,
          status: 'waiting',
          hospital: {
              name: slot.hospital,
              location: slot.hospitalLocation
          }
      });

      await booking.save();

      slot.status = 'booked';
      await doctor.save();

      res.redirect('/patient/bookings');
  } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
  }
});



router.get('/bookings', isLoggedIn, async (req, res) => {
  try {
    const bookings = await Booking.find({ patient: req.session.user._id }).populate('doctor');
    res.render('patientBookings', { bookings });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.post('/add-to-favorites', isLoggedIn, async (req, res) => {
  try {
    const { doctorId } = req.body;
    const patientId = req.session.user._id;

    const patient = await Patient.findById(patientId);
    const doctor = await Doctor.findById(doctorId);

    if (!patient || !doctor) {
      return res.status(404).send('Patient or Doctor not found');
    }

    if (!patient.favoriteDoctors) {
      patient.favoriteDoctors = []; 
    }

    if (patient.favoriteDoctors.includes(doctorId)) {
      return res.status(400).send('Doctor already in favorites');
    }

    patient.favoriteDoctors.push(doctorId);
    await patient.save();

    res.redirect('/patient/doctors'); 
  } catch (error) {
    console.error('Error adding to favorites:', error);
    res.status(500).send('Server error');
  }
});


router.get('/favorites', isLoggedIn, async (req, res) => {
  try {
    const patientId = req.session.user._id;
    const patient = await Patient.findById(patientId).populate({
      path: 'favoriteDoctors',
      model: 'Doctor'
    });

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    res.render('patientFavorites', { favoriteDoctors: patient.favoriteDoctors });
  } catch (error) {
    console.error('Error fetching favorite doctors:', error);
    res.status(500).send('Server error');
  }
});


router.get('/calendar', isLoggedIn, async (req, res) => {
  try {
      const patientId = req.session.user._id; 
      const patient = await Patient.findById(patientId);
      if (!patient) {
          return res.status(404).send('Patient not found');
      }

      const currentDate = new Date();
      let currentMonth = parseInt(req.query.month) || currentDate.getMonth();
      let currentYear = parseInt(req.query.year) || currentDate.getFullYear();

      if (currentMonth < 0 || currentMonth > 11) {
          currentMonth = currentDate.getMonth();
      }
      if (currentYear < 1900 || currentYear > 2100) {
          currentYear = currentDate.getFullYear();
      }

      const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

      const bookings = await Booking.find({
          patient: patientId,
          date: {
              $gte: new Date(currentYear, currentMonth, 1),
              $lte: new Date(currentYear, currentMonth, daysInMonth, 23, 59, 59)
          },
          status: 'accepted'
      });

      res.render('patientCalendar', {
          patient,
          currentMonth,
          currentYear,
          daysInMonth,
          bookings,
          today: currentDate,
          months: [
              'January', 'February', 'March', 'April', 'May', 'June',
              'July', 'August', 'September', 'October', 'November', 'December'
          ]
      });
  } catch (error) {
      console.error('Error fetching calendar data:', error);
      res.status(500).send('Server error');
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
      blog.comments.push({
          username: req.session.user.name, 
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

    let author = await Doctor.findById(authorId);

    if (!author) {
      author = await Admin.findById(authorId);
    }

    if (!author) {
      return res.status(404).send('Author not found');
    }

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
router.get('/priority-blogs', async (req, res) => {
    try {
      const blogs = await Blog.find({ priority: 'high', verificationStatus: 'Verified' }).lean();

      res.render('priorityblogs', { blogs });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

router.get('/blogs', async (req, res) => {
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

    res.render('blogs', { blogs: verifiedBlogs, searchQuery: req.query.search });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

router.get('/dashboard', isLoggedIn, async (req, res) => {
  try {
      const patient = await Patient.findOne({ email: req.session.user.email }).lean();
      if (!patient) {
          return res.status(404).send('Patient not found');
      }

      // Fetch chats and include doctorId
      const chats = await Chat.find({ patientId: patient._id })
          .populate('doctorId', 'name')
          .sort({ updatedAt: -1 })
          .lean(); // Use lean() to get plain JavaScript objects

      // Calculate unread message counts for each chat
      chats.forEach(chat => {
          // Count unread messages where the sender is a doctor
          chat.unreadCount = chat.messages.filter(message => 
              !message.read && message.senderId.toString() !== patient._id.toString()
          ).length;
      });

      res.render('patientDashboard', { patient, chats });
  } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
  }
});


router.get('/chat/:id', isLoggedIn, async (req, res) => {
  try {
    const chatId = req.params.id;
    const chat = await Chat.findById(chatId).populate('doctorId').lean();

    if (!chat) {
      return res.status(404).send('Chat not found');
    }

    // Update only received messages (senderId != logged-in user's ID)
    const updatedChat = await Chat.findById(chatId);

    if (updatedChat) {
      updatedChat.messages.forEach(message => {
        if (message.senderId.toString() !== req.user._id.toString() && !message.read) {
          message.read = true;
        }
      });

      await updatedChat.save();
    }

    res.render('patientChat', { chat: updatedChat.toObject() });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});



router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
  try {
    const { message } = req.body;
    const patient = await Patient.findOne({ email: req.session.user.email });
    const chatId = req.params.chatId;

    if (!patient) {
      return res.status(404).send('Patient not found');
    }

    let chat = await Chat.findOneAndUpdate(
      { _id: chatId, patientId: patient._id },
      { $push: { messages: { senderId: patient._id, text: message, timestamp: new Date(), read: false } } },
      { upsert: true, new: true }
    );

    const doctor = await Doctor.findById(chat.doctorId);

    if (doctor) {
      await Notification.create({
        userId: doctor._id,
        message: `New message from ${patient.name}`,
        type: 'chat',
        read: false,
        createdAt: new Date()
      });
    }

    res.redirect(`/patient/chat/${chat._id}`);

  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});

router.get('/prescriptions', isLoggedIn, async (req, res) => {
  try {
    const patientId = req.session.user._id;
    const patientPrescriptions = await Prescription.find({ patientId: patientId })
      .sort({ createdAt: 'desc' });

    res.render('patient-prescriptions', { prescriptions: patientPrescriptions });
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


router.get('/prescriptions/:id/download', isLoggedIn, async (req, res) => {
  try {
    const prescription = await Prescription.findById(req.params.id)
      .populate('doctorId', 'name speciality')
      .exec();

    if (!prescription) {
      return res.status(404).send('Prescription not found');
    }

    const doctor = prescription.doctorId;

    const booking = await Booking.findOne({
      patient: prescription.patientId,
      doctor: prescription.doctorId
    });

    if (!booking) {
      return res.status(404).send('Booking not found');
    }

    const hospital = booking.hospital;

    const doc = new PDFDocument({ margin: 40 });
    const fileName = `prescription-${prescription._id}.pdf`;
    const prescriptionsDir = path.join(__dirname, '../public/prescriptions');

    if (!fs.existsSync(prescriptionsDir)) {
      fs.mkdirSync(prescriptionsDir, { recursive: true });
    }

    const filePath = path.join(prescriptionsDir, fileName);

    doc.info.Title = 'E-Prescription';
    doc.info.Author = 'MedxBay';

    const logoX = 40;
    const titleX = 45;
    const doctorInfoX = 400;
    const headerY = 40;

    const watermarkX = (doc.page.width - 195) / 2; 
    const watermarkY = (doc.page.height - 175) / 2; 

    doc
      .opacity(0.15) 
      .image('x.png', watermarkX, watermarkY, { width: 200, height: 200 }) 
      .opacity(1); 

    doc
      .image('logo.png', logoX, headerY, { width: 105 })
      .font('Helvetica-Bold') 
      .fontSize(16)
      .text('E-Prescription', titleX, headerY, { align: 'center' })
      .fontSize(12)
      .font('Helvetica')
      .text('MedxBay', titleX, headerY + 20, { align: 'center' })
      .fontSize(10)
      .text('Your Trusted Health Partner', titleX, headerY + 35, { align: 'center' })
      .moveDown(1.5);

    doc
      .font('Helvetica-Bold') 
      .fontSize(10)
      .text(`Doctor Name: ${doctor.name}`, doctorInfoX, headerY, { align: 'right' })
      .text(`Specialization: ${doctor.speciality.join(', ')}`, doctorInfoX, headerY + 15, { align: 'right' })
      .text(`Email: ${prescription.doctorEmail}`, doctorInfoX, headerY + 30, { align: 'right' })
      .moveDown();

    doc
      .moveTo(40, headerY + 60)
      .lineTo(570, headerY + 60)
      .stroke()
      .moveDown(2);

    doc
      .font('Helvetica')
      .fontSize(12)
      .text(`Patient Name: ${prescription.patientName}`, 40)
      .moveDown(0.5)
      .text(`Patient Age: ${prescription.patientAge}`)
      .moveDown(0.5)
      .text(`Meeting Date: ${new Date(prescription.meetingDate).toLocaleDateString()}`)
      .moveDown(0.5)
      .text(`Meeting Time: ${prescription.meetingTime}`)
      .moveDown(1.5);

    doc
      .fontSize(14)
      .font('Helvetica-Bold') 
      .text('Medicines', { underline: true })
      .moveDown()
      .font('Helvetica') 
      .fontSize(12);

    const medicineLineSpacing = 0.5;

    prescription.medicines.forEach(medicine => {
      doc
        .font('Helvetica-Bold') 
        .text(`• Name: ${medicine.name}`)
        .moveDown(medicineLineSpacing)
        .font('Helvetica') 
        .text(`  - Dosage: ${medicine.dosage}`)
        .moveDown(medicineLineSpacing)
        .text(`  - Before Food: ${medicine.beforeFood ? 'Yes' : 'No'}`)
        .moveDown(medicineLineSpacing)
        .text(`  - After Food: ${medicine.afterFood ? 'Yes' : 'No'}`)
        .moveDown(medicineLineSpacing)
        .text(`  - Timing: Morning: ${medicine.timing.morning ? 'Yes' : 'No'}, Afternoon: ${medicine.timing.afternoon ? 'Yes' : 'No'}, Night: ${medicine.timing.night ? 'Yes' : 'No'}`)
        .moveDown(1);
    });

    doc
      .moveDown()
      .font('Helvetica-Bold')
      .text('Doctor\'s Signature:', { align: 'right' })
      .moveDown()
      .font('Helvetica')
      .text(doctor.name, { align: 'right', fontSize: 14, italics: true });

    doc
      .moveTo(40, doc.page.height - 100)
      .lineTo(570, doc.page.height - 100)
      .stroke();

    doc.y = doc.page.height - 90;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .text(hospital.name, { align: 'center' })
      .font('Helvetica')
      .fontSize(10)
      .text(
        `${hospital.location.street}, ${hospital.location.city}, ${hospital.location.state}, ${hospital.location.country} - ${hospital.location.zip}`,
        { align: 'center' }
      );

    doc.pipe(fs.createWriteStream(filePath)).on('finish', () => {
      res.setHeader('Content-disposition', 'attachment; filename=' + fileName);
      res.setHeader('Content-type', 'application/pdf');
      fs.createReadStream(filePath).pipe(res);
    });

    doc.end();
  } catch (error) {
    console.error(error.message);
    res.status(500).send('Server Error');
  }
});


router.get('/notifications', isLoggedIn, async (req, res) => {
  try {
      const notifications = await Notification.find({ userId: req.user._id }).lean();
      res.render('patientNotifications', { notifications });
  } catch (error) {
      console.error(error);
      res.status(500).send('Server Error');
  }
  });
  
router.post('/notifications/:id/mark-read', isLoggedIn, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { read: true });
        res.redirect('/patient/notifications');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});
  
  
router.post('/notifications/:id/delete', isLoggedIn, async (req, res) => {
    try {
        await Notification.findByIdAndDelete(req.params.id);
        res.redirect('/patient/notifications');
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
