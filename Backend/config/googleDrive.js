const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

const KEY_FILE_PATH = path.join(__dirname, 'service-account.json');

let drive;

if (fs.existsSync(KEY_FILE_PATH)) {
    console.log('✅ Service Account credentials found.');
    const auth = new google.auth.GoogleAuth({
        keyFile: KEY_FILE_PATH,
        scopes: ['https://www.googleapis.com/auth/drive'],
    });

    drive = google.drive({ version: 'v3', auth });
} else {
    console.log('⚠️ Service Account credentials NOT found. Please add config/service-account.json');
    drive = null;
}

module.exports = {
    drive
};
