const express = require('express');
const router = express.Router();
const multer = require('multer');
const methodOverride = require('method-override');
const Doctor = require('../models/Doctor');
const Booking = require('../models/Booking');
const Chat = require('../models/Chat');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Blog = require('../models/Blog');

const storage = multer.memoryStorage(); // Store in memory
const upload = multer({ storage: storage });

router.use(methodOverride('_method'));

function isLoggedIn(req, res, next) {
    if (req.session.user && req.session.user.role === 'doctor') {
        return next();
    }
    res.redirect('/auth/login');
}
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.status(403).send('Access denied.');
  };
  

router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }
        res.render('doctorProfile', { doctor });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/edit', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail });
        res.render('editDoctorProfile', { doctor: doctor, index: 0 });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// Route to handle blog uploads
router.get('/blog', (req, res) => {
    res.render('blog-upload-form'); // Replace 'blog-upload-form' with your actual EJS file name
});

// POST route for handling blog uploads

router.post('/blog', upload.single('image'), async (req, res) => {
    try {
        const authorEmail = req.session.user.email;
        const { title, author, description, summary, categories, hashtags, priority } = req.body;

        // Find the doctor by authorEmail
        const doctor = await Doctor.findOne({ email: authorEmail });

        let authorId = null;
        if (doctor) {
            authorId = doctor._id; // Get the doctor's ID
        }

        const newBlog = new Blog({
            title,
            author,
            description,
            summary,
            authorEmail,
            authorId, // Store authorId in the Blog schema
            categories: categories, // Handle empty or undefined categories
            hashtags: hashtags, // Handle empty or undefined hashtags
            priority,
            image: {
                data: req.file.buffer,
                contentType: req.file.mimetype
            },
            verificationStatus: 'Pending' // Default status is pending
        });

        await newBlog.save();

        // Render the blog-success.ejs template after successful blog upload
        res.render('blog-success', { message: 'Blog uploaded successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Server error' });
    }
});



router.get('/profile/blogs', isLoggedIn, async (req, res) => {
    try {
      const doctorEmail = req.session.user.email; // Assuming user email is stored in session
  
      // Find all blogs by the logged-in doctor
      const blogs = await Blog.find({ authorEmail: doctorEmail });
  
      res.render('profile-blogs', { blogs });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  router.get('/blogs/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        // Ensure the logged-in user is the author of the blog
        if (blog.authorId.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        res.render('edit-blog', { blog });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Update blog route
router.post('/blogs/edit/:id', isLoggedIn, upload.single('image'), async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).send('Blog not found');
        }

        // Ensure the logged-in user is the author of the blog
        if (blog.authorId.toString() !== req.session.user._id.toString()) {
            return res.status(403).send('Unauthorized');
        }

        const { title, description, summary, categories, hashtags } = req.body;

        blog.title = title;
        blog.description = description;
        blog.summary = summary;
        blog.categories = categories.split(',');
        blog.hashtags = hashtags.split(',');
     
        blog.verificationStatus = 'pending';

        if (req.file) {
            blog.image.data = req.file.buffer;
            blog.image.contentType = req.file.mimetype;
        }

        await blog.save();

        res.redirect('/doctor/profile/blogs'); // Redirect to doctor's profile page after editing
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});


router.post('/profile/update', upload.single('profilePicture'), isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        // Convert speciality to array if it's a single value
        const speciality = Array.isArray(req.body.speciality) ? req.body.speciality : [req.body.speciality];

        const updateData = {
            ...req.body,
            speciality,  // Use the array value
            languages: Array.isArray(req.body.languages) ? req.body.languages : [req.body.languages],
            hospitals: Array.isArray(req.body.hospitals) ? req.body.hospitals : [req.body.hospitals],
            insurances: Array.isArray(req.body.insurances) ? req.body.insurances : [req.body.insurances],
            awards: Array.isArray(req.body.awards) ? req.body.awards : [req.body.awards],
            faqs: Array.isArray(req.body.faqs) ? req.body.faqs : [req.body.faqs],
        };

        doctor = await Doctor.findOneAndUpdate({ email: doctorEmail }, updateData, { new: true });

        if (req.file) {
            doctor.profilePicture = {
                data: req.file.buffer,
                contentType: req.file.mimetype
            };
        }

        await doctor.save();

        res.redirect('/doctor/profile');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


router.post('/profile/verify', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        let doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.verified = 'Pending';
        await doctor.save();

        req.flash('success_msg', 'Verification request sent. You will be notified once verified.');
        res.redirect('/doctor/profile');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.get('/bookings', isLoggedIn, async (req, res) => {
    try {
        const bookings = await Booking.find({ doctor: req.session.user._id }).populate('patient');
        res.render('doctorBookings', { bookings });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

// Assuming you have required necessary models and middleware

router.post('/bookings/:id', isLoggedIn, async (req, res) => {
    try {
        const { status } = req.body;
        const bookingId = req.params.id;

        const booking = await Booking.findById(bookingId);
        if (!booking) {
            return res.status(404).send('Booking not found');
        }

        const currentStatus = booking.status; // Get current status before update

        // Update booking status
        booking.status = status;
        await booking.save();

        const doctor = await Doctor.findById(booking.doctor);
        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        // Add message to chat if status is accepted
        if (status === 'accepted') {
            const chat = await Chat.findOneAndUpdate(
                { doctorId: booking.doctor, patientId: booking.patient },
                { $push: { messages: { senderId: booking.doctor, text: 'Your slot is booked.', timestamp: new Date() } } },
                { upsert: true, new: true }
            );
        }

        res.redirect('/doctor/bookings');

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});


router.get('/manage-time-slots', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const doctor = await Doctor.findOne({ email: doctorEmail }).lean();

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        res.render('manageTimeSlots', { doctor });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.post('/manage-time-slots', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { date, startTime, endTime } = req.body;

        if (!date || !startTime || !endTime) {
            return res.status(400).send('Invalid data format for time slot');
        }

        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        doctor.timeSlots.push({
            date: new Date(date),
            startTime,
            endTime,
            status: 'free'
        });

        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.delete('/manage-time-slots/:index', isLoggedIn, async (req, res) => {
    try {
        const doctorEmail = req.session.user.email;
        const { index } = req.params;

        const doctor = await Doctor.findOne({ email: doctorEmail });

        if (!doctor) {
            return res.status(404).send('Doctor not found');
        }

        if (doctor.subscriptionType === 'Free') {
            return res.status(403).send('You need to subscribe to manage time slots.');
        }

        doctor.timeSlots.splice(index, 1);
        await doctor.save();

        res.redirect('/doctor/manage-time-slots');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.get('/patients', isLoggedIn, async (req, res) => {
    try {
        const patients = await Patient.find();
        res.json(patients);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
});

router.use(methodOverride('_method'));

router.get('/subscribe', isLoggedIn, async (req, res) => {
    res.render('subscriptionForm');
});

router.post('/subscribe', upload.fields([{ name: 'licenseProof' }, { name: 'certificationProof' }, { name: 'businessProof' }]), isLoggedIn, async (req, res) => {
    try {
    const { subscriptionType } = req.body;
    const paymentDetails = req.body.paymentDetails;
    const doctorId = req.session.user._id; // Use session to get user ID
    const amount = parseInt(paymentDetails.amount, 10);
    console.log(amount);
    
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).send('Invalid payment amount');
        }
    
        // Retrieve the uploaded files
        const licenseProof = req.files['licenseProof'][0];
        const certificationProof = req.files['certificationProof'][0];
        const businessProof = req.files['businessProof'][0];
    
        // Create a Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: `${subscriptionType} Subscription`,
                    },
                    unit_amount: amount, // Amount in cents
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${req.protocol}://${req.get('host')}/doctor/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${req.protocol}://${req.get('host')}/doctor/subscription-failure`,
        });
    
        // Save the session info in the session or database
        req.session.subscriptionInfo = {
            doctorId,
            subscriptionType,
            paymentDetails: {
                amount: amount,
                currency: 'usd'
            },
            licenseProof,
            certificationProof,
            businessProof
        };
    
        res.redirect(303, session.url);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
    });
    
    // GET subscription success
router.get('/subscription-success', async (req, res) => {
        try {
            const session = await stripe.checkout.sessions.retrieve(req.query.session_id);
        
            if (session.payment_status === 'paid') {
                const { doctorId, subscriptionType, paymentDetails, licenseProof, certificationProof, businessProof } = req.session.subscriptionInfo;
    
                // Stringify the paymentDetails object
                const paymentDetailsString = JSON.stringify(paymentDetails);
        
                // Update the doctor document in the database
                const updatedDoctor = await Doctor.findByIdAndUpdate(
                    doctorId,
                    {
                        subscription: 'Pending',
                        subscriptionType,
                        paymentDetails: paymentDetailsString,
                        'documents.licenseProof': {
                            data: licenseProof.buffer,
                            contentType: licenseProof.mimetype
                        },
                        'documents.certificationProof': {
                            data: certificationProof.buffer,
                            contentType: certificationProof.mimetype
                        },
                        'documents.businessProof': {
                            data: businessProof.buffer,
                            contentType: businessProof.mimetype
                        },
                        subscriptionVerification: 'Pending'
                    },
                    { new: true }
                );
        
                res.render('subscriptionSuccess', { doctor: updatedDoctor });
            } else {
                res.status(400).send('Payment was not successful');
            }
        } catch (error) {
            console.error(error.message);
            res.status(500).send('Server Error');
        }
    });
    
    
    

router.get('/subscription-failure', (req, res) => {
    res.send('Subscription payment failed. Please try again.');
});


router.get('/admin/subscriptions', isAdmin, async (req, res) => {
    try {
        const doctors = await Doctor.find({}).lean(); // Fetch all doctors

        res.render('adminSubscriptions', { doctors });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


  
router.post('/admin/verify-subscription/:id', isAdmin, async (req, res) => {
    try {
        const doctorId = req.params.id;
        const { verificationStatus } = req.body;
  
        const updatedDoctor = await Doctor.findByIdAndUpdate(
            doctorId,
            { subscriptionVerification: verificationStatus },
            { new: true }
        );
  
        res.redirect('/admin/dashboard');
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Server Error');
    }
  });

// Route to render doctor dashboard with chats
router.get('/dashboard', isLoggedIn, async (req, res) => {
    try {
      const doctor = await Doctor.findOne({ email: req.session.user.email }).lean();
      if (!doctor) {
        return res.status(404).send('Doctor not found');
      }
  
      // Fetch all chats for the doctor
      const chats = await Chat.find({ doctorId: doctor._id })
        .populate('patientId', 'name') // Populate patient details
        .sort({ updatedAt: -1 }); // Sort by latest updated chat
  
      res.render('doctorDashboard', { doctor, chats });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });

  router.post('/chats/:chatId/send-message', isLoggedIn, async (req, res) => {
    try {
      const { message } = req.body;
      const doctor = await Doctor.findOne({ email: req.session.user.email });
      const chatId = req.params.chatId;
  
      // Ensure doctor exists
      if (!doctor) {
        return res.status(404).send('Doctor not found');
      }
  
      // Find or create the chat based on chatId
      let chat = await Chat.findOneAndUpdate(
        { _id: chatId, doctorId: doctor._id },
        { $push: { messages: { senderId: doctor._id, text: message, timestamp: new Date() } } },
        { upsert: true, new: true }
      );
  
      // Redirect to the chat page for the doctor after sending message
      res.redirect(`/doctor/chat/${chat._id}`);
  
    } catch (error) {
      console.error(error.message);
      res.status(500).send('Server Error');
    }
  });  

  router.get('/chat/:id', isLoggedIn, async (req, res) => {
    try {
      const chatId = req.params.id;
      const chat = await Chat.findById(chatId).populate('patientId').lean();
  
      if (!chat) {
        return res.status(404).send('Chat not found');
      }
  
      res.render('doctorChat', { chat });
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  });
  
module.exports = router;
