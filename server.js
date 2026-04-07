const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Setup AWS S3 Client (It automatically grabs the IAM Role we created!)
const s3 = new S3Client({ region: 'us-east-1' });

// Configure Multer to upload directly to S3
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        key: function (req, file, cb) {
            // This creates a unique filename in the bucket
            cb(null, 'uploads/' + Date.now().toString() + path.extname(file.originalname));
        }
    })
});

// Secure Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10
});

// --- EVERYTHING BELOW THIS LINE STAYS THE SAME ---
// (Keep your database table creation, login, signup, etc.)
// BUT REPLACE your app.post('/api/posts') route with this updated one:

// Feed API: Create Post (Uploads to S3!)
app.post('/api/posts', upload.single('image'), (req, res) => {
    const { userId, username, caption } = req.body;
    if (!req.file) return res.status(400).json({ error: "Image required" });
    
    // multer-s3 automatically gives us the public AWS S3 URL!
    const image_url = req.file.location; 

    db.query('INSERT INTO instaclone_pro.posts (user_id, username, image_url, caption) VALUES (?, ?, ?, ?)', [userId, username, image_url, caption], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});
