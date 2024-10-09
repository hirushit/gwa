const mongoose = require('mongoose');

const authCodeSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  clientId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '5m' } 
});

const accessTokenSchema = new mongoose.Schema({
  token: { type: String, required: true, unique: true },
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  clientId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: '1h' } 
});

const AuthCode = mongoose.model('AuthCode', authCodeSchema);
const AccessToken = mongoose.model('AccessToken', accessTokenSchema);

async function storeAuthCode(code, userId, clientId) {
  const authCode = new AuthCode({ code, userId, clientId });
  await authCode.save();
}

async function getAuthCode(code) {
  return await AuthCode.findOne({ code });
}

async function storeAccessToken(token, userId, clientId) {
  const accessToken = new AccessToken({ token, userId, clientId });
  await accessToken.save();
}

async function getAccessToken(token) {
  return await AccessToken.findOne({ token });
}

module.exports = {
  storeAuthCode,
  getAuthCode,
  storeAccessToken,
  getAccessToken,
};
