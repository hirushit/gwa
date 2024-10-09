const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const dotenv = require('dotenv');
const flash = require('connect-flash');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const Doctor = require('./models/Doctor');
const cors = require('cors'); 
const Blog = require('./models/Blog');
const Patient = require('./models/Patient');
const Leads = require('./models/Leads'); 
const compression = require('compression');
const Subscriptions = require('./models/Subscriptions');
const cookieParser = require('cookie-parser'); 
const methodOverride = require('method-override');
const oauthModel = require('./models/oauthModel');
const OAuth2Server = require('oauth2-server');


dotenv.config();

const app = express();
app.use(cors());
app.use(compression({ threshold: 0 })); 
require('./cronJobs'); 
require('./slotsDelete');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(cookieParser()); 

app.oauth = new OAuth2Server({
  model: oauthModel,
  accessTokenLifetime: 3600,
  allowBearerTokensInQueryString: true,
});


mongoose.connect(process.env.MONGODB_URI, { 
  useNewUrlParser: true, 
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 50000, 
  socketTimeoutMS: 45000 
})
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

app.use(methodOverride('_method'));

app.use('/auth', require('./routes/auth'));
app.use('/patient', require('./routes/patient'));
app.use('/doctor', require('./routes/doctor'));
app.use('/admin', require('./routes/admin'));
app.use('/oauth', require('./routes/oauth'));

function isLoggedIn(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.redirect('/auth/login');
}

app.get('/', (req, res) => {
  const user = req.user;
  const patient = req.patient;
  const doctor = req.doctor; 
  res.render('index', { user, patient, doctor });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

app.get('/auth/search-doctors', async (req, res) => {
  const { what, where, country, state, city, speciality, conditions, languages, gender, availability, dateAvailability, consultation } = req.query;

  try {
    let matchQuery = {
      role: 'doctor',
      verified: 'Verified',
      'timeSlots.status': 'free'
    };

    let projectFields = {
      _id: 1,
      name: 1,
      speciality: 1,
      rating: 1,
      availability: 1,
      city: '$timeSlots.hospitalLocation.city',
      state: '$timeSlots.hospitalLocation.state',
      country: '$timeSlots.hospitalLocation.country',
      hospitals: '$timeSlots.hospital',
      subscriptionType: 1, 
      timeSlots: 1 
    };

    if (country) matchQuery['timeSlots.hospitalLocation.country'] = { $regex: new RegExp(country, 'i') };
    if (state) matchQuery['timeSlots.hospitalLocation.state'] = { $regex: new RegExp(state, 'i') };
    if (city) matchQuery['timeSlots.hospitalLocation.city'] = { $regex: new RegExp(city, 'i') };
    if (speciality) matchQuery.speciality = { $in: [new RegExp(speciality, 'i')] };
    if (languages) matchQuery.languages = { $in: [new RegExp(languages, 'i')] };
    if (gender) matchQuery.gender = gender;
    if (availability) matchQuery.availability = availability === 'true';
    if (consultation) matchQuery.consultation = consultation;

    if (conditions) {
      const conditionsArray = conditions.split(',').map(cond => new RegExp(cond.trim(), 'i'));
      matchQuery.conditions = { $in: conditionsArray };
    }

    if (what) {
      matchQuery.$or = [
        { speciality: { $regex: new RegExp(what, 'i') } },
        { name: { $regex: new RegExp(what, 'i') } },
        { conditions: { $regex: new RegExp(what, 'i') } }
      ];
    }

    if (where) {
      matchQuery.$or = [
        { 'timeSlots.hospitalLocation.city': { $regex: new RegExp(where, 'i') } },
        { 'timeSlots.hospitalLocation.state': { $regex: new RegExp(where, 'i') } },
        { 'timeSlots.hospitalLocation.country': { $regex: new RegExp(where, 'i') } }
      ];
    }

    if (dateAvailability) {
      const searchDate = new Date(dateAvailability);
      matchQuery['timeSlots.date'] = searchDate;
    }

    const pipeline = [
      { $match: matchQuery },
      { $project: projectFields }
    ];

    const doctors = await Doctor.aggregate(pipeline);
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching doctors', error });
  }
});


app.get('/auth/countries', async (req, res) => {
  try {
    const countries = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' }, 
      { $group: { _id: '$timeSlots.hospitalLocation.country' } }, 
      { $sort: { _id: 1 } },
      { $project: { _id: 0, country: '$_id' } } 
    ]);

    const countryList = countries.map(country => country.country);
    
    res.json(countryList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching countries', error });
  }
});



app.get('/auth/states', async (req, res) => {
  try {
    const states = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' },
      { $match: {'timeSlots.status': 'free'} },
      { $group: { _id:  '$timeSlots.hospitalLocation.state' } },
      { $sort: { _id: 1}},
      { $project: { _id: 0, state: '$_id' } }
    ]);
    const stateList = states.map(state => state.state);
    res.json(stateList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching states', error });
  }
});




app.get('/auth/cities', async (req, res) => {
  try {
    const cities = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' }, 
      { $match: { 'timeSlots.status': 'free' } }, 
      { $group: { _id: '$timeSlots.hospitalLocation.city' } }, 
      { $sort: { _id: 1 } }, 
      { $project: { _id: 0, city: '$_id' } } 
    ]);

    const cityList = cities.map(city => city.city);
    console.log(cityList);
    
    res.json(cityList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching cities', error });
  }
});



app.get('/auth/hospitals', async (req, res) => {
  try {
    const hospitals = await Doctor.aggregate([
      { $match: { role: 'doctor', verified: 'Verified', 'timeSlots.status': 'free' } },
      { $unwind: '$timeSlots' },
      { $group: { _id: '$timeSlots.hospital' } },
      { $project: { _id: 0, hospital: '$_id' } }
    ]);
    const hospitalList = hospitals.map(hospital => hospital.hospital);
    res.json(hospitalList);
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
    const searchQuery = req.query.search || '';  

    let specialities = await Doctor.distinct('speciality');

    if (searchQuery) {
      const queryRegex = new RegExp(searchQuery, 'i');
      specialities = specialities.filter(speciality => queryRegex.test(speciality));
    }

    let conditions = [];
    let doctors = [];
    if (searchQuery) {
      const conditionRegex = new RegExp(searchQuery, 'i');
      conditions = await Doctor.distinct('conditions', { conditions: conditionRegex });
      doctors = await Doctor.find({ name: conditionRegex }, 'name').lean();
    }

    res.json({
      specialities,  
      conditions,   
      doctors      
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching what options', error });
  }
});




app.get('/auth/where-options', async (req, res) => {
  try {
    const citiesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.city');
    const statesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.state');
    const countriesFromTimeSlots = await Doctor.distinct('timeSlots.hospitalLocation.country');

    const citiesFromHospitals = await Doctor.distinct('hospitals.city');
    const statesFromHospitals = await Doctor.distinct('hospitals.state');
    const countriesFromHospitals = await Doctor.distinct('hospitals.country');

    const cities = [...new Set([...citiesFromTimeSlots, ...citiesFromHospitals])];
    const states = [...new Set([...statesFromTimeSlots, ...statesFromHospitals])];
    const countries = [...new Set([...countriesFromTimeSlots, ...countriesFromHospitals])];
    const doctors = await Doctor.find().lean(); 

    res.json({
      cities,
      states,
      countries,
      doctors 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching where options', error });
  }
});



app.post('/submit-lead', async (req, res) => {
  const { name, email } = req.body;
  try {
    const lead = new Leads({ name, email });
    await lead.save();
    res.status(200).json({ message: 'Details saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving lead', error });
  }
});

app.post('/submit-email', async (req, res) => {
  const { email } = req.body;
  try {
    const subscription = new Subscriptions({ email });
    await subscription.save();
    res.status(200).json({ message: 'Details saved successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error saving lead', error });
  }
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
