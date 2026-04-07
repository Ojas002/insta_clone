const express = require('express');
const mysql = require('mysql2');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Secure Database Connection using Environment Variables
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: 'instaclone_pro',
    waitForConnections: true,
    connectionLimit: 10
});

// Initialize Database & Tables
db.query('CREATE DATABASE IF NOT EXISTS instaclone_pro;', () => {
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(50) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL
        );
    `;
    const createPostsTable = `
        CREATE TABLE IF NOT EXISTS posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT,
            username VARCHAR(50),
            image_url VARCHAR(500) NOT NULL,
            caption TEXT,
            likes INT DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `;
    db.query(createUsersTable);
    db.query(createPostsTable);
});

// Auth API: Signup
app.post('/api/signup', (req, res) => {
    const { username, password } = req.body;
    db.query('INSERT INTO users (username, password) VALUES (?, ?)', [username, password], (err, result) => {
        if (err) return res.status(400).json({ error: "Username might already exist." });
        res.json({ success: true, userId: result.insertId, username });
    });
});

// Auth API: Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password], (err, results) => {
        if (err || results.length === 0) return res.status(401).json({ error: "Invalid credentials." });
        res.json({ success: true, userId: results[0].id, username: results[0].username });
    });
});

// Feed API: Get Posts
app.get('/api/posts', (req, res) => {
    db.query('SELECT * FROM posts ORDER BY id DESC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// Feed API: Create Post
app.post('/api/posts', (req, res) => {
    const { userId, username, image_url, caption } = req.body;
    db.query('INSERT INTO posts (user_id, username, image_url, caption) VALUES (?, ?, ?, ?)', [userId, username, image_url, caption], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

const PORT = process.env.PORT || 80;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
