const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Doctor = require('./models/Doctor');
const Blog = require('./models/Blog');
const Patient = require('./models/Patient');

dotenv.config();

const app = express();

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));

mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

const sessionStore = MongoStore.create({
  mongoUrl: process.env.MONGODB_URI,
  collectionName: 'sessions',
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  store: sessionStore,
  cookie: { maxAge: 180 * 60 * 1000 } 
}));

app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  Doctor.findById(id, (err, user) => {
    done(err, user);
  });
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await Doctor.findOne({ googleId: profile.id });

      if (!user) {
        user = new Doctor({
          googleId: profile.id,
          name: profile.displayName,
          email: profile.emails[0].value,
          role: null, 
        });
        await user.save();
      }

      return done(null, user);
    } catch (err) {
      return done(err);
    }
  }
));

app.use('/auth', require('./routes/auth'));
app.use('/patient', require('./routes/patient'));
app.use('/doctor', require('./routes/doctor'));
app.use('/admin', require('./routes/admin'));

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}

app.get('/', async (req, res) => {
  try {
      const highPriorityBlogs = await Blog.find({ priority: 'high' }).limit(5).exec();
      const patientEmail = req.session.user.email; // Assuming you have user information in req.user
      const patient = await Patient.findOne({email: patientEmail}).lean(); // Assuming you have doctor information in req.doctor

      res.render('index', { blogs: highPriorityBlogs, patient });
  } catch (error) {
      console.error('Error fetching high-priority blogs:', error);
      res.status(500).send('Internal Server Error');
  }
});


app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});
app.use((err, req, res, next) => {
  console.error('Error:', err.stack);
  res.status(500).send('Something broke!');
});

app.get('/auth/search-doctors', async (req, res) => {
  const { what, where, country, state, city, speciality, conditions, languages, gender, hospitals, availability, dateAvailability, consultation } = req.query;

  try {
    let query = { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' };

    if (country) query.country = { $regex: new RegExp(country, 'i') };
    if (state) query.state = { $regex: new RegExp(state, 'i') };
    if (city) query.city = { $regex: new RegExp(city, 'i') };
    if (speciality) query.speciality = { $in: [new RegExp(speciality, 'i')] };
    if (languages) query.languages = { $in: [new RegExp(languages, 'i')] };
    if (gender) query.gender = gender;
    if (hospitals) query.hospitals = { $regex: new RegExp(hospitals, 'i') };
    if (availability) query.availability = availability === 'true';
    if (consultation) query.consultation = consultation;

    if (conditions) {
      const conditionsArray = conditions.split(',').map(cond => new RegExp(cond.trim(), 'i'));
      query.conditions = { $in: conditionsArray };
    }

    if (what) {
      query.$or = [
        { speciality: { $regex: new RegExp(what, 'i') } },
        { name: { $regex: new RegExp(what, 'i') } },
        { conditions: { $regex: new RegExp(what, 'i') } }
      ];
    }

    if (where) {
      query.$or = [
        { city: { $regex: new RegExp(where, 'i') } },
        { state: { $regex: new RegExp(where, 'i') } },
        { country: { $regex: new RegExp(where, 'i') } }
      ];
    }

    if (dateAvailability) {
      const searchDate = new Date(dateAvailability);
      query.timeSlots = {
        $elemMatch: {
          date: searchDate,
          status: 'free'
        }
      };
    }

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

app.get('/auth/conditions', async (req, res) => {
  try {
      const conditions = await Doctor.distinct('conditions');
      res.json(conditions);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching conditions', error });
  }
});

app.get('/auth/what-options', async (req, res) => {
  try {
    const specialities = await Doctor.distinct('speciality');
    const doctors = await Doctor.find({}, 'name').lean();
    const doctorNames = doctors.map(doctor => doctor.name);

    res.json({
      specialities,
      conditions: [], 
      doctors: doctorNames
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching what options', error });
  }
});

app.get('/auth/where-options', async (req, res) => {
  try {
    const cities = await Doctor.distinct('city');
    const states = await Doctor.distinct('state');
    const countries = await Doctor.distinct('country');

    res.json({
      cities,
      states,
      countries
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching where options', error });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
