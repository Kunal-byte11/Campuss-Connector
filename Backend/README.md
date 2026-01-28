# Campus Connector 🎓

A College Management System with Google Drive file storage for student document management.

## Features

- **Student Management**: Add, view, search students
- **Document Upload**: Upload documents with drag & drop
- **Google Drive Integration**: Files stored in Google Drive with shareable links
- **AI Classification**: Automatic document type detection
- **Modern UI**: Glassmorphism design with dark theme

## AI Response Format

```
STORE: {studentId} → {documentType}
```

Document Types: `assignment`, `idCard`, `certificate`, `feeReceipt`

## Setup

1. Clone and install:
```bash
npm install
```

2. Copy `.env.example` to `.env` and add Google Drive credentials

3. Run:
```bash
npm start
```

4. Visit `http://localhost:3000`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /upload | Upload document |
| GET | /api/students | List students |
| POST | /api/students | Create student |
| GET | /api/students/:id | Get student |

## Tech Stack

- Node.js + Express
- Google Drive API
- Vanilla JS Frontend
