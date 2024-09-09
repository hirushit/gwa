const mongoose = require('mongoose');

const SpecialtySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }
});

module.exports = mongoose.model('Specialty', SpecialtySchema);