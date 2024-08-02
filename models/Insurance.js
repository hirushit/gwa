const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const InsuranceSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  logo: {
    data: Buffer,
    contentType: String
  }
});

module.exports = mongoose.model('Insurance', InsuranceSchema);
