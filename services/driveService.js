const { drive } = require('../config/googleDrive');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DriveService {
    constructor() {
        this.parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
        this.folderCache = new Map();

        // Initial Mock Mode check
        this.isMockMode = !drive;

        if (this.isMockMode) {
            console.log('⚠️  GOOGLE DRIVE NOT CONFIGURED: Running in MOCK MODE (Local Storage)');
            this.setupMockStorage();
        } else {
            console.log('🚀 Service Account Loaded. Verifying Folder Access...');
            this.verifyAccess();
        }
    }

    setupMockStorage() {
        this.mockStoragePath = path.join(__dirname, '../public/uploads/mock_drive');
        if (!fs.existsSync(this.mockStoragePath)) {
            fs.mkdirSync(this.mockStoragePath, { recursive: true });
        }
    }

    /**
     * Verify access to the parent folder
     */
    async verifyAccess() {
        if (this.isMockMode || !this.parentFolderId) return;

        try {
            await drive.files.get({
                fileId: this.parentFolderId,
                fields: 'id, name'
            });
            console.log('✅ Access confirmed to Google Drive Folder:', this.parentFolderId);
        } catch (error) {
            console.error('❌ ACCESS DENIED to Google Drive Folder:', this.parentFolderId);
            console.error('👉 ACTION REQUIRED: Share this folder with:', require('../config/service-account.json').client_email);
            console.error('⚠️  Switching to MOCK MODE to prevent crashes.\n');
            this.isMockMode = true;
            this.setupMockStorage();
        }
    }

    /**
     * Create a folder in Google Drive (or Mock)
     */
    async createFolder(folderName, parentId = null) {
        if (this.isMockMode) return { id: 'mock-folder-' + folderName, name: folderName };

        const parents = parentId ? [parentId] : (this.parentFolderId ? [this.parentFolderId] : []);

        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parents
        };

        try {
            const response = await drive.files.create({
                resource: fileMetadata,
                fields: 'id, name, webViewLink'
            });

            return response.data;
        } catch (error) {
            console.error('Error creating folder (Switching to Mock):', error.message);
            this.isMockMode = true; // Failover to mock mode on error
            return { id: 'mock-folder-' + folderName, name: folderName };
        }
    }

    /**
     * Find or create student folder
     */
    async getStudentFolder(studentId) {
        if (this.isMockMode) return 'mock-folder-' + studentId;

        if (this.folderCache.has(studentId)) {
            return this.folderCache.get(studentId);
        }

        try {
            let query = `name='${studentId}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
            if (this.parentFolderId) {
                query += ` and '${this.parentFolderId}' in parents`;
            }

            const response = await drive.files.list({
                q: query,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                const folderId = response.data.files[0].id;
                this.folderCache.set(studentId, folderId);
                return folderId;
            }

            return null;
        } catch (error) {
            console.error('Error finding student folder:', error.message);
            this.isMockMode = true;
            return 'mock-folder-' + studentId;
        }
    }

    /**
     * Create student folder with document type subfolders
     */
    async createStudentFolder(studentId) {
        if (this.isMockMode) {
            this.folderCache.set(studentId, 'mock-folder-' + studentId);
            return 'mock-folder-' + studentId;
        }

        try {
            const mainFolder = await this.createFolder(studentId);

            const subfolders = ['assignments', 'idCards', 'certificates', 'feeReceipts'];

            for (const subfolder of subfolders) {
                // If creating subfolder fails (mock failover), this loop should handle it
                await this.createFolder(subfolder, mainFolder.id);
            }

            this.folderCache.set(studentId, mainFolder.id);
            return mainFolder.id;
        } catch (error) {
            console.error('Error creating student folder structure:', error.message);
            this.isMockMode = true;
            return 'mock-folder-' + studentId;
        }
    }

    /**
     * Get subfolder ID for document type
     */
    async getDocumentTypeFolder(studentFolderId, documentType) {
        if (this.isMockMode || String(studentFolderId).startsWith('mock-folder')) {
            return 'mock-folder-' + documentType;
        }

        const folderNames = {
            'assignment': 'assignments',
            'idCard': 'idCards',
            'certificate': 'certificates',
            'feeReceipt': 'feeReceipts'
        };

        const folderName = folderNames[documentType] || 'assignments';

        try {
            const response = await drive.files.list({
                q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and '${studentFolderId}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                return response.data.files[0].id;
            }

            const newFolder = await this.createFolder(folderName, studentFolderId);
            return newFolder.id;
        } catch (error) {
            console.error('Error getting document type folder:', error.message);
            return 'mock-folder-' + documentType;
        }
    }

    /**
     * Upload file to Google Drive
     */
    async uploadFile(filePath, fileName, mimeType, folderId) {
        if (this.isMockMode || String(folderId).startsWith('mock-')) {
            return this.uploadToMock(filePath, fileName);
        }

        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };

        const media = {
            mimeType: mimeType,
            body: fs.createReadStream(filePath)
        };

        try {
            const response = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id, name, webViewLink, webContentLink'
            });

            await drive.permissions.create({
                fileId: response.data.id,
                requestBody: { role: 'reader', type: 'anyone' }
            });

            const file = await drive.files.get({
                fileId: response.data.id,
                fields: 'webViewLink, webContentLink'
            });

            fs.unlinkSync(filePath);

            return {
                fileId: response.data.id,
                fileName: response.data.name,
                shareableLink: file.data.webViewLink,
                downloadLink: file.data.webContentLink
            };
        } catch (error) {
            console.error('Error uploading file (Simulating Success in Mock Mode):', error.message);
            return this.uploadToMock(filePath, fileName);
        }
    }

    uploadToMock(filePath, fileName) {
        this.setupMockStorage(); // Ensure dir exists
        const mockUrl = `/uploads/mock_drive/${Date.now()}-${fileName}`;
        const targetPath = path.join(this.mockStoragePath, path.basename(mockUrl));

        fs.copyFileSync(filePath, targetPath);
        fs.unlinkSync(filePath);

        return {
            fileId: 'mock-file-' + Date.now(),
            fileName: fileName,
            shareableLink: mockUrl,
            downloadLink: mockUrl
        };
    }

    async deleteFile(fileId) {
        if (this.isMockMode || String(fileId).startsWith('mock-')) return true;
        try {
            await drive.files.delete({ fileId });
            return true;
        } catch (error) {
            console.error('Error deleting file:', error.message);
            return false;
        }
    }
}

module.exports = new DriveService();
