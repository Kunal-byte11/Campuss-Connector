const { drive } = require('../config/googleDrive');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

class DriveService {
    constructor() {
        this.parentFolderId = process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID;
        this.folderCache = new Map(); // Cache for student folder IDs
    }

    /**
     * Create a folder in Google Drive
     */
    async createFolder(folderName, parentId = null) {
        const fileMetadata = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder',
            parents: parentId ? [parentId] : [this.parentFolderId]
        };

        try {
            const response = await drive.files.create({
                resource: fileMetadata,
                fields: 'id, name, webViewLink'
            });

            return response.data;
        } catch (error) {
            console.error('Error creating folder:', error.message);
            throw error;
        }
    }

    /**
     * Find or create student folder
     */
    async getStudentFolder(studentId) {
        // Check cache first
        if (this.folderCache.has(studentId)) {
            return this.folderCache.get(studentId);
        }

        try {
            // Search for existing folder
            const response = await drive.files.list({
                q: `name='${studentId}' and mimeType='application/vnd.google-apps.folder' and '${this.parentFolderId}' in parents and trashed=false`,
                fields: 'files(id, name)',
                spaces: 'drive'
            });

            if (response.data.files.length > 0) {
                const folderId = response.data.files[0].id;
                this.folderCache.set(studentId, folderId);
                return folderId;
            }

            // Folder doesn't exist
            return null;
        } catch (error) {
            console.error('Error finding student folder:', error.message);
            throw error;
        }
    }

    /**
     * Create student folder with document type subfolders
     */
    async createStudentFolder(studentId) {
        try {
            // Create main student folder
            const mainFolder = await this.createFolder(studentId);

            // Create subfolders for each document type
            const subfolders = ['assignments', 'idCards', 'certificates', 'feeReceipts'];

            for (const subfolder of subfolders) {
                await this.createFolder(subfolder, mainFolder.id);
            }

            this.folderCache.set(studentId, mainFolder.id);
            return mainFolder.id;
        } catch (error) {
            console.error('Error creating student folder structure:', error.message);
            throw error;
        }
    }

    /**
     * Get subfolder ID for document type
     */
    async getDocumentTypeFolder(studentFolderId, documentType) {
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

            // Create if not exists
            const newFolder = await this.createFolder(folderName, studentFolderId);
            return newFolder.id;
        } catch (error) {
            console.error('Error getting document type folder:', error.message);
            throw error;
        }
    }

    /**
     * Upload file to Google Drive
     */
    async uploadFile(filePath, fileName, mimeType, folderId) {
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

            // Make file shareable
            await drive.permissions.create({
                fileId: response.data.id,
                requestBody: {
                    role: 'reader',
                    type: 'anyone'
                }
            });

            // Get shareable link
            const file = await drive.files.get({
                fileId: response.data.id,
                fields: 'webViewLink, webContentLink'
            });

            // Clean up local file
            fs.unlinkSync(filePath);

            return {
                fileId: response.data.id,
                fileName: response.data.name,
                shareableLink: file.data.webViewLink,
                downloadLink: file.data.webContentLink
            };
        } catch (error) {
            console.error('Error uploading file:', error.message);
            throw error;
        }
    }

    /**
     * Delete file from Google Drive
     */
    async deleteFile(fileId) {
        try {
            await drive.files.delete({ fileId });
            return true;
        } catch (error) {
            console.error('Error deleting file:', error.message);
            throw error;
        }
    }

    /**
     * List files in a folder
     */
    async listFiles(folderId) {
        try {
            const response = await drive.files.list({
                q: `'${folderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType, webViewLink, createdTime)',
                orderBy: 'createdTime desc'
            });

            return response.data.files;
        } catch (error) {
            console.error('Error listing files:', error.message);
            throw error;
        }
    }
}

module.exports = new DriveService();
