const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import services and models
const driveService = require('./services/driveService');
const aiClassifier = require('./services/aiClassifier');
const Student = require('./models/Student');
const { getAuthUrl, getTokens } = require('./config/googleDrive');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
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
        // Allow common document types
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

// Serve main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================
// GOOGLE DRIVE AUTH ROUTES
// ===============================

// Get auth URL for initial setup
app.get('/auth/google', (req, res) => {
    const authUrl = getAuthUrl();
    res.json({ authUrl });
});

// OAuth callback
app.get('/auth/google/callback', async (req, res) => {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: 'No authorization code provided' });
    }

    try {
        const tokens = await getTokens(code);
        res.json({
            message: 'Authentication successful!',
            refreshToken: tokens.refresh_token,
            note: 'Save this refresh token in your .env file as GOOGLE_REFRESH_TOKEN'
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to get tokens', details: error.message });
    }
});

// ===============================
// FILE UPLOAD ROUTE (MAIN)
// ===============================

/**
 * POST /upload
 * Main upload endpoint
 * 
 * Flow:
 * 1. Receive file
 * 2. AI classifies document type and determines student
 * 3. Upload to Google Drive
 * 4. Store link in database
 * 5. Return AI response in strict format
 */
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

        // Check if student exists
        let student = Student.findByStudentId(studentId);
        const folderExists = student && student.driveFolderId;

        // Get AI classification response
        const aiResponse = await aiClassifier.classify(filename, metadata, folderExists);
        const parsedResponse = aiClassifier.parseResponse(aiResponse);

        // Handle errors
        if (parsedResponse.action === 'error') {
            fs.unlinkSync(filePath); // Clean up uploaded file
            return res.status(400).json({
                aiResponse,
                error: parsedResponse.error
            });
        }

        // Create student if doesn't exist
        if (!student) {
            student = Student.create({
                studentId: parsedResponse.studentId,
                name: req.body.name || '',
                department: req.body.department || ''
            });
        }

        // Create folder if needed
        let studentFolderId = student.driveFolderId;
        if (parsedResponse.needsFolder || !studentFolderId) {
            studentFolderId = await driveService.createStudentFolder(parsedResponse.studentId);
            Student.setDriveFolderId(parsedResponse.studentId, studentFolderId);
        }

        // Get the specific document type folder
        const docTypeFolderId = await driveService.getDocumentTypeFolder(
            studentFolderId,
            parsedResponse.documentType
        );

        // Upload file to Google Drive
        const uploadResult = await driveService.uploadFile(
            filePath,
            filename,
            mimeType,
            docTypeFolderId
        );

        // Store link in database
        const documentEntry = Student.addDocumentLink(
            parsedResponse.studentId,
            parsedResponse.documentType,
            uploadResult
        );

        // Return strict AI response format
        res.json({
            aiResponse,
            success: true,
            documentId: documentEntry.id
        });

    } catch (error) {
        console.error('Upload error:', error);

        // Clean up file if exists
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

// Get all students
app.get('/api/students', (req, res) => {
    const students = Student.findAll();
    res.json(students);
});

// Get single student
app.get('/api/students/:studentId', (req, res) => {
    const student = Student.findByStudentId(req.params.studentId);

    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student);
});

// Create student
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

// Delete student
app.delete('/api/students/:studentId', (req, res) => {
    const deleted = Student.delete(req.params.studentId);

    if (!deleted) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json({ message: 'Student deleted successfully' });
});

// ===============================
// DOCUMENT ROUTES
// ===============================

// Get student documents
app.get('/api/students/:studentId/documents', (req, res) => {
    const student = Student.findByStudentId(req.params.studentId);

    if (!student) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json(student.documents);
});

// Get document stats
app.get('/api/students/:studentId/stats', (req, res) => {
    const stats = Student.getDocumentStats(req.params.studentId);

    if (!stats) {
        return res.status(404).json({ error: 'Student not found' });
    }

    res.json(stats);
});

// Delete document
app.delete('/api/students/:studentId/documents/:docType/:docId', async (req, res) => {
    const { studentId, docType, docId } = req.params;

    try {
        // Get document info first
        const student = Student.findByStudentId(studentId);
        if (!student) {
            return res.status(404).json({ error: 'Student not found' });
        }

        const linkTypeMap = {
            'assignment': 'assignmentLinks',
            'idCard': 'idCardLinks',
            'certificate': 'certificateLinks',
            'feeReceipt': 'feeReceiptLinks'
        };

        const linkType = linkTypeMap[docType];
        const document = student.documents[linkType]?.find(d => d.id === docId);

        if (!document) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete from Google Drive
        if (document.fileId) {
            await driveService.deleteFile(document.fileId);
        }

        // Remove from database
        Student.removeDocumentLink(studentId, docType, docId);

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===============================
// SEARCH ROUTES
// ===============================

app.get('/api/search', (req, res) => {
    const { q } = req.query;

    if (!q) {
        return res.json([]);
    }

    const results = Student.search(q);
    res.json(results);
});

// ===============================
// HEALTH CHECK
// ===============================

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
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
║  API Endpoints:                                            ║
║    POST /upload          - Upload document                 ║
║    GET  /api/students    - List all students               ║
║    POST /api/students    - Create student                  ║
║    GET  /api/search?q=   - Search students                 ║
╚═══════════════════════════════════════════════════════════╝
    `);
});

module.exports = app;
