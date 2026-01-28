const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_FILE_PATH = path.join(__dirname, 'service-account.json');

let drive;

try {
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
        console.log('✅ Loading credentials from Environment Variable.');
        const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
        auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    } else if (fs.existsSync(KEY_FILE_PATH)) {
        console.log('✅ Service Account credentials found in file.');
        auth = new google.auth.GoogleAuth({
            keyFile: KEY_FILE_PATH,
            scopes: ['https://www.googleapis.com/auth/drive'],
        });
    }

    if (auth) {
        drive = google.drive({ version: 'v3', auth });
    } else {
        console.log('⚠️ No Service Account credentials found.');
        drive = null;
    }
} catch (error) {
    console.error('Auth Init Error:', error.message);
    drive = null;
}

module.exports = {
    drive
};
