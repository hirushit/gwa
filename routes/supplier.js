const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const Supplier = require('../models/Supplier'); 
const Product = require('../models/Product'); 
const Doctor = require('../models/Doctor');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const multer = require('multer');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const Order = require('../models/Order');
const Blog = require('../models/Blog');


function isLoggedIn(req, res, next) {
    if (req.session && req.session.supplierId) {
        return next(); 
    } else {
        console.warn('Unauthorized access attempt:', {
            ip: req.ip,
            originalUrl: req.originalUrl,
            user: req.session.supplierId ? req.session.supplierId : 'Guest'
        });
        req.flash('error_msg', 'You must be logged in to access that page.');
        return res.redirect('/supplier/login'); 
    }
}

const generateVerificationToken = () => {
    return crypto.randomBytes(20).toString('hex');
};

const sendVerificationEmail = async (name, email, token, role) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    const verificationLink = `http://localhost:3000/supplier/verify-email?token=${token}`;

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: '🎉 Almost There! Verify Your Email to Complete Your Sign-Up 🎉',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="text-align: center;">
                    <span style="color: #FF7F50;">Welcome to MedxBay!</span> 
                </h2>
                <p style="font-size: 16px;">Hi <strong>${name}</strong>,</p>
                <p style="font-size: 16px;">Thank you for signing up with us! We’re thrilled to have you on board and can’t wait for you to explore everything we have in store.</p>
                <p style="font-size: 16px;">Before you dive in, we just need one small thing from you: to confirm your email address.</p>
                <h3 style="color: #272848;">Here’s What You Need to Do:</h3>
                <p style="font-size: 16px;">Click the button below to verify your email address:</p>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${verificationLink}" style="padding: 14px 24px; color: white; background-color: #FF7F50; text-decoration: none; border-radius: 5px; font-size: 16px;">Verify Your Email Address</a>
                </div>
                <p style="font-size: 16px;">Best regards,</p>
                <p style="font-size: 16px;"><strong>The MedxBay Team</strong></p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 14px; color: #777;">P.S. If you didn’t sign up for an account, please disregard this email.</p>
            </div>
        `
    };

    await transporter.sendMail(mailOptions);
};

const sendWelcomeEmail = async (name, email, role) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSWORD
        }
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: email,
        subject: `Welcome to MedxBay, ${name}!`,
        html: `
            <h2>Welcome, ${name}!</h2>
            <p>Thank you for verifying your account. You can now start using our platform.</p>
        `
    };

    await transporter.sendMail(mailOptions);
};


router.get('/marketplace', (req, res) => {
    res.render('marketplace');
});

router.get('/register', (req, res) => {
    res.render('supplierRegister', { success_msg: req.flash('success_msg'), error_msg: req.flash('error_msg') }); 
});
router.post('/register', async (req, res) => {
    const { name, email, password, phone, companyName, street, city, state, zipCode, country } = req.body;

    try {
        const existingSupplier = await Supplier.findOne({ contactEmail: email });
        if (existingSupplier) {
            req.flash('error_msg', 'Supplier already exists');
            return res.redirect('/supplier/register');
        }
        const existingDoctor = await Doctor.findOne({ email });
        if (existingDoctor) {
            req.flash('success_msg', 'An account with Medxbay as a doctor already exists. You can sign in using the same credentials.');
            return res.redirect('/supplier/login'); 
        }

        const token = generateVerificationToken();
        const tokenExpires = Date.now() + 3600000; 
        await sendVerificationEmail(name, email, token, 'supplier');

        const newSupplier = new Supplier({
            name,
            contactEmail: email,
            phone,
            password: await bcrypt.hash(password, 10),
            address: { street, city, state, zipCode, country },
            companyName,
            verificationToken: token,
            verificationTokenExpires: tokenExpires, 
            isVerified: false
        });

        await newSupplier.save();

        req.flash('success_msg', 'Verification email has been sent to your email. Please verify.');
        res.redirect('/supplier/register');
    } catch (err) {
        console.error('Error in supplier registration:', err);
        req.flash('error_msg', 'Server error');
        res.redirect('/supplier/register');
    }
});

router.get('/verify-email', async (req, res) => {
    const { token } = req.query;

    try {
        const user = await Supplier.findOne({ 
            verificationToken: token,
            verificationTokenExpires: { $gt: Date.now() } 
        });

        if (!user) {
            req.flash('error_msg', 'Invalid or expired verification link');
            return res.redirect('/supplier/register');
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpires = undefined; 
        await user.save(); 

        req.flash('success_msg', 'Your account has been verified. You can now log in.');
        await sendWelcomeEmail(user.name, user.contactEmail, 'supplier');

        res.redirect('/supplier/login'); 
    } catch (err) {
        console.error('Error in supplier email verification:', err);
        req.flash('error_msg', 'Server error');
        res.redirect('/supplier/register');
    }
});

router.get('/login', (req, res) => {
    res.render('supplierLogin', { 
        messages: {
            success: req.flash('success_msg'),
            error: req.flash('error_msg')
        }
    });
});

router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const supplier = await Supplier.findOne({ contactEmail: email });

        if (!supplier) {
            const doctor = await Doctor.findOne({ email });
            if (doctor && await bcrypt.compare(password, doctor.password)) {
                req.flash('success_msg', 'Logged in with your Medxbay doctor account!');
                req.session.supplierId = doctor._id; 
                return res.redirect('/supplier/dashboard'); 
            }
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/supplier/login');
        }

        if (!await bcrypt.compare(password, supplier.password)) {
            req.flash('error_msg', 'Invalid email or password');
            return res.redirect('/supplier/login');
        }

        if (!supplier.isVerified) {
            req.flash('error_msg', 'Please verify your account first');
            return res.redirect('/supplier/login');
        }

        req.session.supplierId = supplier._id; 
        req.flash('success_msg', 'Login successful!');
        res.redirect('/supplier/dashboard'); 
    } catch (err) {
        console.error('Error in supplier login:', err);
        req.flash('error_msg', 'Server error');
        res.redirect('/supplier/login');
    }
});

router.get('/dashboard', isLoggedIn, (req, res) => {
    res.render('supplierIndex'); 
});

router.get('/profile', isLoggedIn, async (req, res) => {
    try {
        const supplier = await Supplier.findById(req.session.supplierId);

        const category = req.query.category;
        let products = [];

        if (category) {
            products = await Product.find({ uploadedBy: req.session.supplierId, category: category, countInStock: { $gt: 0 } });
        } else {
            products = await Product.find({ uploadedBy: req.session.supplierId, countInStock: { $gt: 0 } });
        }

        const blogs = await Blog.find({ authorId: req.session.supplierId });

        const blogsWithAuthors = await Promise.all(
            blogs.map(async (blog) => {
                const author = await Supplier.findById(blog.authorId);
                return {
                    ...blog.toObject(),
                    authorName: author?.name || 'Unknown Author',
                    authorProfilePicture: author?.profilePicture || null,
                };
            })
        );

        res.render('supplierProfile', { supplier, products, blogs: blogsWithAuthors });
    } catch (err) {
        console.error('Error fetching supplier data:', err);
        req.flash('error_msg', 'Failed to fetch profile data');
        res.redirect('/supplier/dashboard'); 
    }
});

router.get('/edit-profile', isLoggedIn, async (req, res) => {
    const supplier = await Supplier.findById(req.session.supplierId);
    res.render('editSupplierProfile', { supplier });
});

router.post('/update-profile', isLoggedIn, upload.fields([{ name: 'profileImage' }, { name: 'coverPhoto' }]), async (req, res) => {
    const { name, contactEmail, phone, alternateContactNumber, companyName, businessRegistrationNumber, taxIdentificationNumber, businessType, street, city, state, zipCode, country, province, tagline, overview } = req.body;
    
    const productCategories = Array.isArray(req.body.productCategories) ? req.body.productCategories : [req.body.productCategories];

    const updateData = {
        name,
        contactEmail,
        phone,
        alternateContactNumber,
        companyName,
        businessRegistrationNumber,
        taxIdentificationNumber,
        businessType,
        tagline,
        overview,
        productCategories,
        address: { street, city, state, zipCode, country }
    };

    if (req.files['profileImage']) {
        updateData.profilePicture = {
            data: req.files['profileImage'][0].buffer,
            contentType: req.files['profileImage'][0].mimetype
        };
    }

    if (req.files['coverPhoto']) {
        updateData.coverPhoto = {
            data: req.files['coverPhoto'][0].buffer,
            contentType: req.files['coverPhoto'][0].mimetype
        };
    }

    try {
        await Supplier.findByIdAndUpdate(req.session.supplierId, updateData);
        req.flash('success_msg', 'Profile updated successfully');
        res.redirect('/supplier/profile');
    } catch (err) {
        console.error('Error updating profile:', err);
        req.flash('error_msg', 'Failed to update profile');
        res.redirect('/supplier/edit-profile');
    }
});

router.get('/manage-products', isLoggedIn, async (req, res) => {
    try {
        const products = await Product.find({ uploadedBy: req.session.supplierId }).lean();

        products.forEach(product => {
            product.images = product.images.map(image => ({
                data: `data:${image.contentType};base64,${image.data.toString('base64')}`
            }));
        });

        res.render('manage-products', { products });
    } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send("Error fetching products.");
    }
});

router.get('/add-product', isLoggedIn, (req, res) => {
    res.render('addProduct'); 
});

router.post('/add-product', isLoggedIn, upload.array('images', 5), async (req, res) => {
    const { name, description, price, countInStock, category, subCategory } = req.body;

    const newProduct = {
        name,
        uploadedBy: req.session.supplierId,
        description,
        images: req.files.map(file => ({ data: file.buffer, contentType: file.mimetype })),
        price,
        countInStock,
        category,
        subCategory,
        rating: 0,
        reviews: []
    };

    try {
        await Product.create(newProduct);
        req.flash('success_msg', 'Product added successfully');
        res.redirect('/supplier/manage-products');
    } catch (err) {
        console.error('Error adding product:', err);
        req.flash('error_msg', 'Failed to add product');
        res.redirect('/supplier/add-product');
    }
});

router.get('/edit-product/:id', isLoggedIn, async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId).lean();

        if (!product) {
            req.flash('error_msg', 'Product not found');
            return res.redirect('/supplier/manage-products');
        }

        product.images = product.images.map(image => ({
            data: `data:${image.contentType};base64,${image.data.toString('base64')}`
        }));

        res.render('edit-product', { product });
    } catch (error) {
        console.error("Error fetching product for editing:", error);
        res.status(500).send("Error fetching product.");
    }
});

router.post('/edit-product/:id', isLoggedIn, upload.array('images', 5), async (req, res) => {
    const productId = req.params.id;
    const { name, description, price, countInStock, category, subCategory } = req.body;

    const updatedProduct = {
        name,
        description,
        images: req.files.map(file => ({ data: file.buffer, contentType: file.mimetype })),
        price,
        countInStock,
        category,
        subCategory,
    };

    try {
        await Product.findByIdAndUpdate(productId, updatedProduct);
        req.flash('success_msg', 'Product updated successfully');
        res.redirect('/supplier/manage-products');
    } catch (err) {
        console.error('Error updating product:', err);
        req.flash('error_msg', 'Failed to update product');
        res.redirect(`/supplier/edit-product/${productId}`);
    }
});

router.get('/delete-product/:id', isLoggedIn, async (req, res) => {
    const productId = req.params.id;

    try {
        await Product.findByIdAndDelete(productId);
        req.flash('success_msg', 'Product deleted successfully');
        res.redirect('/supplier/manage-products');
    } catch (error) {
        console.error("Error deleting product:", error);
        req.flash('error_msg', 'Failed to delete product');
        res.redirect('/supplier/manage-products');
    }
});


router.delete('/delete-image/:imageId', isLoggedIn, async (req, res) => {
    const imageId = req.params.imageId; 
    console.log("Received DELETE request for image ID:", req.params.imageId); 

    try {
        const supplierId = req.session.supplierId;

        const result = await Product.updateOne(
            { uploadedBy: supplierId, "images._id": imageId },
            { $pull: { images: { _id: imageId } } }
        );

        if (result.modifiedCount > 0) {
            return res.status(200).send("Image deleted successfully.");
        } else {
            return res.status(404).send("Image not found or not associated with this supplier.");
        }
    } catch (error) {
        console.error("Error deleting image:", error);
        res.status(500).send("Failed to delete image.");
    }
});


router.get('/manage-orders', isLoggedIn, (req, res) => {
    res.render('manageOrders'); 
});


router.get('/all-suppliers', async (req, res) => {
    try {
        const suppliers = await Supplier.find();
        res.render('allSuppliers', { suppliers });
    } catch (err) {
        console.error('Error fetching suppliers:', err);
        res.redirect('/');
    }
});


router.get('/supplier/:id', async (req, res) => {
    try {
        const supplier = await Supplier.findById(req.params.id);
        const products = await Product.find({ uploadedBy: req.params.id, countInStock: { $gt: 0 } });
        res.render('supplierDetails', { supplier, products });
    } catch (err) {
        console.error('Error fetching supplier details:', err);
        res.redirect('/supplier/all-suppliers');
    }
});



router.get('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).send("Failed to log out.");
        }
        res.redirect('/supplier/marketplace'); 
    });
});




module.exports = router;
