const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import services and models
const driveService = require('./services/driveService');
const aiClassifier = require('../AI/aiClassifier');
const Student = require('./models/Student');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const os = require('os');

// Ensure uploads directory exists (Use /tmp in production/serverless)
const uploadsDir = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    // try/catch for read-only filesystem issues
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (e) {
        console.log('Uploads dir creation skipped (likely read-only fs)');
    }
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/gif',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type'), false);
        }
    }
});

// ===============================
// ROUTES
// ===============================

// ===============================
// AUTH ROUTES
// ===============================

app.get('/api/config', (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    // Simple Hardcoded Auth (Demo Purpose)
    if (username === 'admin' && password === 'admin123') {
        const token = 'mock-jwt-token-' + Date.now();
        res.json({
            success: true,
            token,
            user: { name: 'Admin User', email: 'admin@college.edu', role: 'admin' }
        });
    } else {
        res.status(401).json({ error: 'Invalid credentials' });
    }
});

app.post('/api/auth/google', async (req, res) => {
    const { credential } = req.body;
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    try {
        const ticket = await client.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });
        const payload = ticket.getPayload();

        // STRICT DOMAIN CHECK: @ltce.in
        if (payload.hd !== 'ltce.in') {
            return res.status(403).json({ error: 'Access restricted to @ltce.in emails only' });
        }

        const token = 'google-session-' + Date.now();
        res.json({
            success: true,
            token,
            user: {
                name: payload.name,
                email: payload.email,
                avatar: payload.picture,
                role: 'student' // Default role
            }
        });

    } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(401).json({ error: 'Google authentication failed' });
    }
});

// Serve main page (Protected View)
app.get('/', (req, res) => {
    // Note: In a real app, we might check cookies here or handle it client-side.
    // We'll let client-side JS handle the redirect to login.html if token missing.
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// Serve Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'login.html'));
});

app.post('/api/chat', async (req, res) => {
    const { message } = req.body;
    const response = await aiClassifier.chat(message);
    res.json({ reply: response });
});

// ===============================
// FILE UPLOAD ROUTE (MAIN)
// ===============================

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { studentId } = req.body;
        const filename = req.file.originalname;
        const filePath = req.file.path;
        const mimeType = req.file.mimetype;

        // AI Classification
        const metadata = { studentId };

        let student = Student.findByStudentId(studentId);
        const folderExists = student && student.driveFolderId;

        const aiResponse = await aiClassifier.classify(filename, metadata, folderExists);
        const parsedResponse = aiClassifier.parseResponse(aiResponse);

        if (parsedResponse.action === 'error') {
            fs.unlinkSync(filePath);
            return res.status(400).json({
                aiResponse,
                error: parsedResponse.error
            });
        }

        if (!student) {
            student = Student.create({
                studentId: parsedResponse.studentId,
                name: req.body.name || '',
                department: req.body.department || ''
            });
        }

        let studentFolderId = student.driveFolderId;
        if (parsedResponse.needsFolder || !studentFolderId) {
            studentFolderId = await driveService.createStudentFolder(parsedResponse.studentId);
            Student.setDriveFolderId(parsedResponse.studentId, studentFolderId);
        }

        const docTypeFolderId = await driveService.getDocumentTypeFolder(
            studentFolderId,
            parsedResponse.documentType
        );

        const uploadResult = await driveService.uploadFile(
            filePath,
            filename,
            mimeType,
            docTypeFolderId
        );

        const documentEntry = Student.addDocumentLink(
            parsedResponse.studentId,
            parsedResponse.documentType,
            uploadResult
        );

        res.json({
            aiResponse,
            success: true,
            documentId: documentEntry.id,
            documentType: parsedResponse.documentType
        });

    } catch (error) {
        console.error('Upload error:', error);

        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            aiResponse: 'ERROR: UPLOAD_FAILED',
            error: error.message
        });
    }
});

// ===============================
// STUDENT CRUD ROUTES
// ===============================

app.get('/api/students', (req, res) => {
    const students = Student.findAll();
    res.json(students);
});

app.get('/api/students/:studentId', (req, res) => {
    const student = Student.findByStudentId(req.params.studentId);

    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
});

app.post('/api/students', (req, res) => {
    const { studentId, name, department, email, phone } = req.body;

    if (!studentId) {
        return res.status(400).json({ error: 'Student ID is required' });
    }

    if (Student.exists(studentId)) {
        return res.status(409).json({ error: 'Student already exists' });
    }

    const student = Student.create({ studentId, name, department, email, phone });
    res.status(201).json(student);
});

// Update student
app.put('/api/students/:studentId', (req, res) => {
    const student = Student.update(req.params.studentId, req.body);

    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
});

app.delete('/api/students/:studentId', (req, res) => {
    const deleted = Student.delete(req.params.studentId);
    if (!deleted) return res.status(404).json({ error: 'Student not found' });
    res.json({ message: 'Student deleted successfully' });
});

app.get('/api/students/:studentId/documents', (req, res) => {
    const student = Student.findByStudentId(req.params.studentId);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    res.json(student.documents);
});

app.get('/api/students/:studentId/stats', (req, res) => {
    const stats = Student.getDocumentStats(req.params.studentId);
    if (!stats) return res.status(404).json({ error: 'Student not found' });
    res.json(stats);
});

app.delete('/api/students/:studentId/documents/:docType/:docId', async (req, res) => {
    const { studentId, docType, docId } = req.params;

    try {
        const student = Student.findByStudentId(studentId);
        if (!student) return res.status(404).json({ error: 'Student not found' });

        const linkTypeMap = {
            'assignment': 'assignmentLinks',
            'idCard': 'idCardLinks',
            'certificate': 'certificateLinks',
            'feeReceipt': 'feeReceiptLinks'
        };

        const linkType = linkTypeMap[docType];
        const document = student.documents[linkType]?.find(d => d.id === docId);

        if (!document) return res.status(404).json({ error: 'Document not found' });

        if (document.fileId) {
            await driveService.deleteFile(document.fileId);
        }

        Student.removeDocumentLink(studentId, docType, docId);

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/search', (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);
    const results = Student.search(q);
    res.json(results);
});

app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: err.message || 'Something went wrong!' });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║         CAMPUS CONNECTOR - College Management System       ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://localhost:${PORT}                  ║
║  Auth Mode: Service Account                                ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
