const express = require('express');
const mysql = require('mysql2');
const path = require('path');
const multer = require('multer');
const { S3Client } = require('@aws-sdk/client-s3');
const multerS3 = require('multer-s3');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// 1. Setup AWS S3 Client
const s3 = new S3Client({ region: 'us-east-1' });

// 2. Configure Multer to upload directly to S3 (Bug #1 Fixed!)
const upload = multer({
    storage: multerS3({
        s3: s3,
        bucket: process.env.S3_BUCKET_NAME,
        contentType: multerS3.AUTO_CONTENT_TYPE, // Tells browser to display image, not download it
        key: function (req, file, cb) {
            cb(null, 'uploads/' + Date.now().toString() + path.extname(file.originalname));
        }
    })
});

// 3. Secure Database Connection
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    waitForConnections: true,
    connectionLimit: 10
});

// 4. Initialize Database & Tables (Bug #2 Fixed: Chained to prevent race conditions!)
db.query('CREATE DATABASE IF NOT EXISTS instaclone_pro;', () => {
    db.query(`CREATE TABLE IF NOT EXISTS instaclone_pro.users (id INT AUTO_INCREMENT PRIMARY KEY, username VARCHAR(50) UNIQUE NOT NULL, password VARCHAR(255) NOT NULL);`, () => {
        db.query(`CREATE TABLE IF NOT EXISTS instaclone_pro.posts (id INT AUTO_INCREMENT PRIMARY KEY, user_id INT, username VARCHAR(50), image_url VARCHAR(500) NOT NULL, caption TEXT, likes INT DEFAULT 0, FOREIGN KEY (user_id) REFERENCES instaclone_pro.users(id));`, () => {
            db.query(`CREATE TABLE IF NOT EXISTS instaclone_pro.comments (id INT AUTO_INCREMENT PRIMARY KEY, post_id INT, username VARCHAR(50), text TEXT, FOREIGN KEY (post_id) REFERENCES instaclone_pro.posts(id) ON DELETE CASCADE);`);
        });
    });
});

// --- API ROUTES ---

// Auth API: Signup
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    db.query('INSERT INTO instaclone_pro.users (username, password) VALUES (?, ?)', [username, password], (err, result) => {
        if (err) return res.status(400).json({ error: "Username taken." });
        res.json({ success: true, userId: result.insertId, username });
    });
});

// Auth API: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM instaclone_pro.users WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Invalid credentials." });
        res.json({ success: true, userId: results[0].id, username: results[0].username });
    });
});

// Feed API: Get Posts with Comments
app.get('/api/posts', (req, res) => {
    db.query('SELECT * FROM instaclone_pro.posts ORDER BY id DESC', (err, posts) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('SELECT * FROM instaclone_pro.comments', (err, comments) => {
            if (err) return res.status(500).json({ error: err.message });
            
            // Attach comments to their respective posts
            const feed = posts.map(post => {
                post.comments = comments.filter(c => c.post_id === post.id);
                return post;
            });
            res.json(feed);
        });
    });
});

// Feed API: Create Post (Uploads to S3)
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

// Feed API: Delete Post
app.delete('/api/posts/:id', (req, res) => {
    const { userId } = req.body;
    // Ensure the person deleting is the owner of the post
    db.query('DELETE FROM instaclone_pro.posts WHERE id = ? AND user_id = ?', [req.params.id, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Feed API: Like Post
app.post('/api/posts/:id/like', (req, res) => {
    db.query('UPDATE instaclone_pro.posts SET likes = likes + 1 WHERE id = ?', [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Feed API: Add Comment
app.post('/api/posts/:id/comment', (req, res) => {
    const { username, text } = req.body;
    db.query('INSERT INTO instaclone_pro.comments (post_id, username, text) VALUES (?, ?, ?)', [req.params.id, username, text], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
