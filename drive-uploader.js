const { google } = require('googleapis');
const fs = require('fs');
const { Readable } = require('stream');

function createDriveClient(clientId, clientSecret, tokenPath) {
  const redirectUri = 'http://localhost:53682/oauth2callback';
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (!fs.existsSync(tokenPath)) {
    throw new Error(
      `No token file found at ${tokenPath}. Run "npm run authorize" first to link your Google account.`
    );
  }

  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
  oauth2Client.setCredentials(tokens);

  // Persist refreshed access tokens so future runs don't need re-auth
  oauth2Client.on('tokens', (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    fs.writeFileSync(tokenPath, JSON.stringify(merged, null, 2));
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Uploads a base64-decoded image buffer to a Drive folder, retrying on
 * transient network errors (e.g. socket hang up, ECONNRESET, timeouts).
 * @param {object} drive - authenticated Drive client
 * @param {string} folderId - target Drive folder ID
 * @param {string} filename - desired filename, e.g. "919876543210_2026-08-10T12-30-00.jpg"
 * @param {Buffer} buffer - raw image bytes
 * @param {string} mimeType - e.g. "image/jpeg"
 * @param {number} maxRetries - number of retry attempts before giving up
 */
async function uploadImage(drive, folderId, filename, buffer, mimeType, maxRetries = 3) {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const stream = new Readable();
      stream.push(buffer);
      stream.push(null);

      const res = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [folderId],
        },
        media: {
          mimeType,
          body: stream,
        },
        fields: 'id, name, webViewLink',
      });

      return res.data;
    } catch (err) {
      lastError = err;
      const isRetryable =
        /socket hang up|ECONNRESET|ETIMEDOUT|EPIPE/i.test(err.message || '') ||
        (err.code && [429, 500, 502, 503, 504].includes(err.code));

      if (!isRetryable || attempt === maxRetries) break;

      const delayMs = attempt * 1500; // 1.5s, 3s, 4.5s...
      console.log(`Upload of ${filename} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

module.exports = { createDriveClient, uploadImage };