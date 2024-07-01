const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const Doctor = require('./models/Doctor');
const Patient = require('./models/Patient');
const passport = require('passport');
require('dotenv').config();
require('./passport-setup');
const Blog = require('./models/Blog');

const app = express();

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Initialize MongoStore with session
const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
});

// Session middleware
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 180 * 60 * 1000 } // Session expiration (e.g., 3 hours)
}));

// Flash messages middleware
app.use(flash());

// Routes
app.use('/auth', require('./routes/auth'));
app.use('/patient', require('./routes/patient'));
app.use('/doctor', require('./routes/doctor'));
app.use('/admin', require('./routes/admin'));

// Landing Page Route
app.get('/', async (req, res) => {
  try {
    let filter = { verificationStatus: 'Verified' }; // Default filter for verified blogs

    // Check if search query parameters are present
    if (req.query.search) {
      const regex = new RegExp(escapeRegex(req.query.search), 'gi'); // 'gi' for global and case-insensitive search

      // Update filter to search by title, categories, and hashtags fields
      filter = {
        verificationStatus: 'Verified',
        $or: [
          { title: regex },
          { categories: regex },
          { hashtags: regex }
          // Add more fields if needed
        ]
      };
    }

    // Fetch verified blogs based on the filter
    const verifiedBlogs = await Blog.find(filter).lean();

    // Render home page with verified blogs data and search query for display
    res.render('index', { verifiedBlogs, searchQuery: req.query.search });

  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// Function to escape special characters for regex search
function escapeRegex(text) {
  return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
}

// Logout route
app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Something broke!');
});

app.get('/auth/search-doctors', async (req, res) => {
  const { country, state, city, speciality, languages, gender, hospitals, availability, dateAvailability } = req.query;

  try {
      let query = {
          role: 'doctor',
          $and: [
              { subscriptionType: { $in: ['Premium', 'Standard', 'Enterprise'] } }, // Include doctors with subscriptionType 'Premium', 'Standard', or 'Enterprise'
              { verified: 'Verified' } // Include doctors with 'Verified' verification status
          ]
      };

      if (country) query.country = { $regex: new RegExp(country, 'i') };
      if (state) query.state = { $regex: new RegExp(state, 'i') };
      if (city) query.city = { $regex: new RegExp(city, 'i') };
      if (speciality) query.speciality = { $in: [new RegExp(speciality, 'i')] };
      if (languages) query.languages = { $in: [new RegExp(languages, 'i')] };
      if (gender) query.gender = gender;
      if (hospitals) query.hospitals = { $regex: new RegExp(hospitals, 'i') };
      if (availability) query.availability = availability === 'true';

      const doctors = await Doctor.find(query);
      res.json(doctors);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching doctors', error });
  }
});


// countries
app.get('/auth/countries', async (req, res) => {
  try {
      const countries = await Doctor.distinct('country');
      res.json(countries);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching countries', error });
  }
});

app.get('/auth/states', async (req, res) => {
  try {
      const states = await Doctor.distinct('state');
      res.json(states);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching states', error });
  }
});

app.get('/auth/cities', async (req, res) => {
  try {
      const cities = await Doctor.distinct('city');
      res.json(cities);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching cities', error });
  }
});

app.get('/auth/hospitals', async (req, res) => {
  try {
      const hospitals = await Doctor.distinct('hospitals');
      res.json(hospitals);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching hospitals', error });
  }
});

app.get('/auth/languages', async (req, res) => {
  try {
      const languages = await Doctor.distinct('languages');
      res.json(languages);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching languages', error });
  }
});

app.get('/auth/specialities', async (req, res) => {
  try {
      const specialities = await Doctor.distinct('speciality');
      res.json(specialities);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching specialities', error });
  }
});

app.use(passport.initialize());
app.use(passport.session());

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/auth/login' }),
  async (req, res) => {
    try {
      if (!req.user) {
        return res.redirect('/auth/login');
      }

      // Check if the authentication result contains a redirectTo field
      if (req.authInfo && req.authInfo.redirectTo) {
        return res.redirect(req.authInfo.redirectTo);
      }

      const userExists = await Patient.exists({ _id: req.user._id }) || await Doctor.exists({ _id: req.user._id });

      if (userExists) {
        res.redirect('/auth/login');
      } else {
        res.redirect('/auth/signup');
      }
    } catch (err) {
      console.error('Error in Google callback:', err);
      res.redirect('/auth/login');
    }
  });




app.get('/select-role', (req, res) => {
  if (!req.user) {
    return res.redirect('/auth/login');
  }
  res.send(`
    <h1>Select Role</h1>
    <form action="/auth/role-selection" method="POST">
      <label for="role">Role:</label>
      <select id="role" name="role">
        <option value="patient">Patient</option>
        <option value="doctor">Doctor</option>
      </select>
      <button type="submit">Submit</button>
    </form>
  `);
});

app.post('/auth/role-selection', async (req, res) => {
  if (req.user) {
    const { role } = req.body;
    const newUser = {
      googleId: req.user.googleId,
      name: req.user.name,
      email: req.user.email,
      role: role
    };

    try {
      if (role === 'patient') {
        const patient = new Patient(newUser);
        await patient.save();
        req.login(patient, (err) => {
          if (err) return res.status(500).send(err);
          return res.redirect('/');
        });
      } else if (role === 'doctor') {
        const doctor = new Doctor(newUser);
        await doctor.save();
        req.login(doctor, (err) => {
          if (err) return res.status(500).send(err);
          return res.redirect('/');
        });
      } else {
        return res.status(400).send('Invalid role');
      }
    } catch (err) {
      res.status(500).send(err);
    }
  } else {
    res.redirect('/auth/login');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
