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
        // Fallback or Pre-calculation using RegEx (can be used as context)
        const fallbackDocType = this.classifyDocumentType(filename);
        const fallbackStudentId = metadata.studentId || this.extractStudentId(filename, metadata);

        try {
            if (!process.env.GEMINI_API_KEY) {
                console.log('Gemini API Key missing, using Regex fallback.');
                throw new Error('No API Key');
            }

            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const studentId = metadata.studentId || fallbackStudentId || "UNKNOWN";

            const prompt = `
            You are a strict Classification AI for a College Management System.
            
            TASK:
            1. Analyze the filename: "${filename}"
            2. Determine the Document Type from these options: [assignment, idCard, certificate, feeReceipt]. Default to 'assignment' if unsure.
            3. Confirm the Student ID provided: "${studentId}". If filename contains a different ID, prioritize the filename's ID.
            
            CONTEXT:
            - Folder Exists: ${folderExists}
            
            OUTPUT FORMAT (Strict String):
            If folder exists:
            STORE: {studentId} → {documentType}

            If folder missing (Context says folderExists: false):
            CREATE_FOLDER: {studentId}
            THEN_STORE: {documentType}

            EXAMPLES:
            - "ST102_Math_HW.pdf", folderExists=true -> STORE: ST102 → assignment
            - "Fee_Receipt_Jan.pdf", ID="ST105", folderExists=false -> CREATE_FOLDER: ST105
            THEN_STORE: feeReceipt
            
            Do not provide explanations. Only return the string format.
            `;

            const result = await model.generateContent(prompt);
            const response = result.response.text().trim();
            console.log('Gemini Response:', response);

            // Basic validation of response format
            if (response.includes('STORE:') || response.includes('CREATE_FOLDER:')) {
                return response;
            } else {
                throw new Error('Invalid AI response format');
            }

        } catch (error) {
            console.error('AI Classification Failed (Using Fallback):', error.message);
            // Fallback logic
            const studentId = fallbackStudentId;
            if (!studentId) {
                return 'ERROR: NO_STUDENT_ID';
            }

            if (!folderExists) {
                return `CREATE_FOLDER: ${studentId}
THEN_STORE: ${fallbackDocType}`;
            }

            return `STORE: ${studentId} → ${fallbackDocType}`;
        }
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

    /**
     * General Chat Method
     */
    async chat(message) {
        try {
            if (!process.env.GEMINI_API_KEY) {
                console.error('❌ FATAL: GEMINI_API_KEY is missing in process.env!');
                throw new Error('API Key Missing');
            }

            const { GoogleGenerativeAI } = require("@google/generative-ai");
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

            // Using Flash for stability
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const prompt = `
            You are "CampusBot", an intelligent and helpful AI assistant for the College Management System.
            User: ${message}
            Bot:
            `;

            console.log(`🤖 CampusBot Request: ${message}`);
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            console.log('✅ CampusBot Reply:', text);
            return text;

        } catch (error) {
            console.error('❌ Chat Function Error:', error);
            if (error.message.includes('API Key')) return "My connection key is missing. Please check .env.";
            return "I'm having trouble connecting to my brain. (Check Server Logs)";
        }
    }
}

module.exports = new AIClassifier();
