const mongoose = require('mongoose');
const Doctor = require('./models/Doctor');  // Adjust the path as necessary
const slugify = require('slugify');

// MongoDB connection setup
mongoose.connect('mongodb+srv://sutheeshs:Sutheesh%40123@medxbay.zizbr.mongodb.net/GWA?retryWrites=true&w=majority&appName=medxbay', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.log('Error connecting to MongoDB:', error);
    process.exit(1);
  });

// Function to generate a random suffix for the slug to ensure uniqueness
function generateRandomSlugSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789'; 
  let result = '';
  
  result += numbers.charAt(Math.floor(Math.random() * numbers.length));

  const allChars = chars + numbers;
  for (let i = 0; i < 3; i++) {
    result += allChars.charAt(Math.floor(Math.random() * allChars.length));
  }

  return result;
}

// Function to update slugs for all existing doctors
async function updateSlugsForDoctors() {
  const doctors = await Doctor.find();

  for (const doctor of doctors) {
    if (doctor.name) {
      let baseSlug = slugify(doctor.name, { lower: true, strict: true });

      // Check if a doctor already exists with the same slug
      const existingDoctor = await Doctor.findOne({ slug: baseSlug });

      if (existingDoctor && existingDoctor._id.toString() !== doctor._id.toString()) {
        // If slug exists for another doctor, generate a unique slug
        let newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;

        // Ensure the new slug is unique
        while (await Doctor.findOne({ slug: newSlug })) {
          newSlug = `${baseSlug}-${generateRandomSlugSuffix()}`;
        }

        doctor.slug = newSlug;
        await doctor.save();
        console.log(`Updated slug for Doctor: ${doctor.name} to ${newSlug}`);
      } else {
        doctor.slug = baseSlug;
        await doctor.save();
        console.log(`Set slug for Doctor: ${doctor.name} to ${baseSlug}`);
      }
    }
  }
}

// Run the function to update slugs for doctors
updateSlugsForDoctors()
  .then(() => {
    console.log('Slugs updated successfully.');
    mongoose.disconnect();  // Disconnect from the database after the operation
  })
  .catch((error) => {
    console.error('Error updating slugs:', error);
    mongoose.disconnect();
  });
