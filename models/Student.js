const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '../database/students.json');

// Ensure database directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize empty database if not exists
if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ students: [] }, null, 2));
}

class StudentModel {
    constructor() {
        this.loadData();
    }

    loadData() {
        try {
            const data = fs.readFileSync(DB_PATH, 'utf8');
            this.data = JSON.parse(data);
        } catch (error) {
            this.data = { students: [] };
            this.saveData();
        }
    }

    saveData() {
        fs.writeFileSync(DB_PATH, JSON.stringify(this.data, null, 2));
    }

    /**
     * Create a new student
     */
    create(studentData) {
        const student = {
            id: uuidv4(),
            studentId: studentData.studentId,
            name: studentData.name || '',
            department: studentData.department || '',
            email: studentData.email || '',
            phone: studentData.phone || '',
            documents: {
                assignmentLinks: [],
                idCardLinks: [],
                certificateLinks: [],
                feeReceiptLinks: []
            },
            driveFolderId: studentData.driveFolderId || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.data.students.push(student);
        this.saveData();
        return student;
    }

    /**
     * Find student by studentId
     */
    findByStudentId(studentId) {
        this.loadData();
        return this.data.students.find(s =>
            s.studentId.toLowerCase() === studentId.toLowerCase()
        );
    }

    /**
     * Find student by internal ID
     */
    findById(id) {
        this.loadData();
        return this.data.students.find(s => s.id === id);
    }

    /**
     * Get all students
     */
    findAll() {
        this.loadData();
        return this.data.students;
    }

    /**
     * Update student
     */
    update(studentId, updateData) {
        this.loadData();
        const index = this.data.students.findIndex(s =>
            s.studentId.toLowerCase() === studentId.toLowerCase()
        );

        if (index === -1) return null;

        this.data.students[index] = {
            ...this.data.students[index],
            ...updateData,
            updatedAt: new Date().toISOString()
        };

        this.saveData();
        return this.data.students[index];
    }

    /**
     * Add document link to student
     */
    addDocumentLink(studentId, documentType, linkData) {
        this.loadData();
        const student = this.findByStudentId(studentId);

        if (!student) return null;

        const linkTypeMap = {
            'assignment': 'assignmentLinks',
            'idCard': 'idCardLinks',
            'certificate': 'certificateLinks',
            'feeReceipt': 'feeReceiptLinks'
        };

        const linkType = linkTypeMap[documentType];
        if (!linkType) return null;

        const documentEntry = {
            id: uuidv4(),
            fileName: linkData.fileName,
            shareableLink: linkData.shareableLink,
            downloadLink: linkData.downloadLink,
            fileId: linkData.fileId,
            uploadedAt: new Date().toISOString()
        };

        student.documents[linkType].push(documentEntry);
        this.update(studentId, { documents: student.documents });

        return documentEntry;
    }

    /**
     * Remove document link from student
     */
    removeDocumentLink(studentId, documentType, documentId) {
        this.loadData();
        const student = this.findByStudentId(studentId);

        if (!student) return false;

        const linkTypeMap = {
            'assignment': 'assignmentLinks',
            'idCard': 'idCardLinks',
            'certificate': 'certificateLinks',
            'feeReceipt': 'feeReceiptLinks'
        };

        const linkType = linkTypeMap[documentType];
        if (!linkType) return false;

        const index = student.documents[linkType].findIndex(d => d.id === documentId);
        if (index === -1) return false;

        student.documents[linkType].splice(index, 1);
        this.update(studentId, { documents: student.documents });

        return true;
    }

    /**
     * Delete student
     */
    delete(studentId) {
        this.loadData();
        const index = this.data.students.findIndex(s =>
            s.studentId.toLowerCase() === studentId.toLowerCase()
        );

        if (index === -1) return false;

        this.data.students.splice(index, 1);
        this.saveData();
        return true;
    }

    /**
     * Check if student exists
     */
    exists(studentId) {
        return !!this.findByStudentId(studentId);
    }

    /**
     * Get student's drive folder ID
     */
    getDriveFolderId(studentId) {
        const student = this.findByStudentId(studentId);
        return student ? student.driveFolderId : null;
    }

    /**
     * Set student's drive folder ID
     */
    setDriveFolderId(studentId, folderId) {
        return this.update(studentId, { driveFolderId: folderId });
    }

    /**
     * Search students by name or department
     */
    search(query) {
        this.loadData();
        const lowerQuery = query.toLowerCase();
        return this.data.students.filter(s =>
            s.name.toLowerCase().includes(lowerQuery) ||
            s.department.toLowerCase().includes(lowerQuery) ||
            s.studentId.toLowerCase().includes(lowerQuery)
        );
    }

    /**
     * Get document statistics for a student
     */
    getDocumentStats(studentId) {
        const student = this.findByStudentId(studentId);
        if (!student) return null;

        return {
            assignments: student.documents.assignmentLinks.length,
            idCards: student.documents.idCardLinks.length,
            certificates: student.documents.certificateLinks.length,
            feeReceipts: student.documents.feeReceiptLinks.length,
            total: Object.values(student.documents).reduce((sum, arr) => sum + arr.length, 0)
        };
    }
}

module.exports = new StudentModel();
