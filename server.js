const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const Doctor = require('./models/Doctor');
dotenv.config();

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
app.get('/', (req, res) => {
  res.render('index');
});

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


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
