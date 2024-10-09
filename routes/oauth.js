const express = require('express');
const router = express.Router();
const oauthServer = require('oauth2-server');
const Request = oauthServer.Request;
const Response = oauthServer.Response;
const Doctor = require('../models/Doctor');
const Patient = require('../models/Patient');
const oauthModel = require('../models/oauthModel');
const bcrypt = require('bcrypt');

const CLIENT_ID = '76c6d001-b04d4954df83'; 
const CLIENT_SECRET = '115eb09508334189b3c5e8cac8ce5191';  
const REDIRECT_URI = 'https://earth-guardians-713w9xhu.bettermode.io/ssos/redirect';  

router.get('/login', (req, res) => {
  res.render('loginPage');
});

router.post('/login', async (req, res) => {
  const { email, password, client_id, redirect_uri } = req.body;

  try {
    let user = await Doctor.findOne({ email });
    if (!user) {
      user = await Patient.findOne({ email });
    }

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    req.session.user = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    if (!client_id || !redirect_uri) {
      return res.status(400).json({ message: 'Missing client_id or redirect_uri parameter' });
    }
    if (client_id !== CLIENT_ID) {
      return res.status(400).json({ message: 'Invalid client_id parameter' });
    }

    res.redirect(`/oauth/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent(redirect_uri)}`);
  } catch (err) {
    console.error('Error in login:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/authorize', async (req, res) => {
  if (!req.session.user) {
    return res.redirect('/oauth/login');
  }

  const { client_id, redirect_uri } = req.query;

  if (!redirect_uri || client_id !== CLIENT_ID) {
    return res.status(400).json({ message: 'Invalid redirect_uri or client_id' });
  }

  const urlPattern = /^https?:\/\/.+/;
  if (!urlPattern.test(redirect_uri)) {
    return res.status(400).json({ message: 'Invalid redirect_uri format' });
  }

  const code = generateAuthCode();
  console.log(`Generated Auth Code: ${code}`); 

  await oauthModel.storeAuthCode(code, req.session.user.id, client_id);

  res.redirect(`${redirect_uri}?code=${code}&client_id=${client_id}`);
});

router.post('/token', async (req, res) => {
  const { code, client_id, client_secret, redirect_uri } = req.body;

  if (client_id !== CLIENT_ID || client_secret !== CLIENT_SECRET || redirect_uri !== REDIRECT_URI) {
    return res.status(400).json({ error: 'Invalid client credentials or redirect URI' });
  }

  try {
    const authCodeData = await oauthModel.getAuthCode(code);

    if (!authCodeData) {
      return res.status(400).json({ error: 'Invalid authorization code' });
    }

    const accessToken = generateAccessToken();
    await oauthModel.storeAccessToken(accessToken, authCodeData.userId, authCodeData.clientId);

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600
    });
  } catch (err) {
    console.error('Error in token exchange:', err);
    res.status(500).json({ error: 'Unable to exchange token', details: err.message });
  }
});

router.get('/callback', async (req, res) => {
  const { code, client_id } = req.query;

  if (!code || !client_id || client_id !== CLIENT_ID) {
    return res.status(400).json({ message: 'Invalid authorization code or client_id' });
  }

  try {
    const authCodeData = await oauthModel.getAuthCode(code);

    if (!authCodeData) {
      return res.status(400).json({ error: 'Invalid authorization code' });
    }

    const accessToken = generateAccessToken();
    await oauthModel.storeAccessToken(accessToken, authCodeData.userId, authCodeData.clientId);

    res.json({
      message: 'Authorization successful',
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600
    });
  } catch (err) {
    console.error('Error handling callback:', err);
    res.status(500).json({ error: 'Error handling authorization callback', details: err.message });
  }
});

router.get('/userinfo', async (req, res) => {
  const { access_token } = req.query;

  try {
    const userData = await oauthModel.getAccessToken(access_token);

    if (!userData) {
      return res.status(401).json({ error: 'Invalid access token' });
    }

    const user = await getUserById(userData.userId);

    res.json({
      id: user._id,
      email: user.email,
      name: user.name,
      externalId: user._id,
      profilePicture: user.profilePicture,
    });
  } catch (err) {
    console.error('Error fetching user profile:', err);
    res.status(500).json({ error: 'Unable to fetch user info', details: err.message });
  }
});

router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ message: 'Error logging out' });
    }

    res.json({ message: 'Logged out successfully' });
  });
});

function generateAuthCode() {
  return Math.random().toString(36).substring(2, 15);
}

function generateAccessToken() {
  return Math.random().toString(36).substring(2, 15);
}

async function getUserById(userId) {
  let user = await Doctor.findById(userId);
  if (!user) {
    user = await Patient.findById(userId);
  }
  return user;
}

module.exports = router;
