const { google } = require('googleapis');
require('dotenv').config();

// OAuth2 Client Configuration
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Set credentials if refresh token exists
if (process.env.GOOGLE_REFRESH_TOKEN) {
    oauth2Client.setCredentials({
        refresh_token: process.env.GOOGLE_REFRESH_TOKEN
    });
}

// Create Drive instance
const drive = google.drive({ version: 'v3', auth: oauth2Client });

// Generate Auth URL for initial setup
const getAuthUrl = () => {
    const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.metadata.readonly'
    ];

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        prompt: 'consent'
    });
};

// Exchange code for tokens
const getTokens = async (code) => {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return tokens;
};

module.exports = {
    oauth2Client,
    drive,
    getAuthUrl,
    getTokens
};
