/**
 * AI Document Classifier
 * Determines document type and target student based on filename/metadata
 * 
 * Response Format (STRICT):
 * STORE: {studentId} → {documentType}
 * 
 * If folder missing:
 * CREATE_FOLDER: {studentId}
 * THEN_STORE: {documentType}
 */

class AIClassifier {
    constructor() {
        // Document type patterns
        this.patterns = {
            assignment: [
                /assignment/i,
                /homework/i,
                /project/i,
                /submission/i,
                /task/i,
                /lab\s*report/i,
                /practical/i
            ],
            idCard: [
                /id\s*card/i,
                /identity/i,
                /student\s*id/i,
                /college\s*id/i,
                /photo\s*id/i
            ],
            certificate: [
                /certificate/i,
                /diploma/i,
                /degree/i,
                /award/i,
                /achievement/i,
                /completion/i,
                /merit/i
            ],
            feeReceipt: [
                /fee/i,
                /receipt/i,
                /payment/i,
                /invoice/i,
                /challan/i,
                /transaction/i,
                /bill/i
            ]
        };

        // Student ID patterns
        this.studentIdPatterns = [
            /ST\d{3,}/i,           // ST101, ST1234
            /STU\d{3,}/i,          // STU101, STU1234
            /\d{4}[A-Z]{2,}\d{3,}/i, // 2024CS001
            /[A-Z]{2,}\d{4,}/i      // CS20240001
        ];
    }

    /**
     * Classify document type from filename
     */
    classifyDocumentType(filename) {
        const normalizedName = filename.toLowerCase();

        for (const [docType, patterns] of Object.entries(this.patterns)) {
            for (const pattern of patterns) {
                if (pattern.test(normalizedName)) {
                    return docType;
                }
            }
        }

        // Default to assignment if no match
        return 'assignment';
    }

    /**
     * Extract student ID from filename or metadata
     */
    extractStudentId(filename, metadata = {}) {
        // Try to extract from filename
        for (const pattern of this.studentIdPatterns) {
            const match = filename.match(pattern);
            if (match) {
                return match[0].toUpperCase();
            }
        }

        // Try from metadata
        if (metadata.studentId) {
            return metadata.studentId.toUpperCase();
        }

        return null;
    }

    /**
     * Main classification method
     * Returns AI response in strict format
     */
    async classify(filename, metadata = {}, folderExists = true) {
        const documentType = this.classifyDocumentType(filename);
        const studentId = metadata.studentId || this.extractStudentId(filename, metadata);

        if (!studentId) {
            return 'ERROR: NO_STUDENT_ID';
        }

        if (!folderExists) {
            return `CREATE_FOLDER: ${studentId}\nTHEN_STORE: ${documentType}`;
        }

        return `STORE: ${studentId} → ${documentType}`;
    }

    /**
     * Parse AI response to get action details
     */
    parseResponse(aiResponse) {
        const result = {
            action: null,
            studentId: null,
            documentType: null,
            needsFolder: false
        };

        if (aiResponse.startsWith('ERROR:')) {
            result.action = 'error';
            result.error = aiResponse.replace('ERROR: ', '');
            return result;
        }

        if (aiResponse.includes('CREATE_FOLDER:')) {
            result.needsFolder = true;
            const folderMatch = aiResponse.match(/CREATE_FOLDER:\s*(\S+)/);
            const typeMatch = aiResponse.match(/THEN_STORE:\s*(\S+)/);

            if (folderMatch) result.studentId = folderMatch[1];
            if (typeMatch) result.documentType = typeMatch[1];
            result.action = 'create_and_store';
        } else if (aiResponse.includes('STORE:')) {
            const match = aiResponse.match(/STORE:\s*(\S+)\s*→\s*(\S+)/);
            if (match) {
                result.studentId = match[1];
                result.documentType = match[2];
                result.action = 'store';
            }
        }

        return result;
    }
}

module.exports = new AIClassifier();
