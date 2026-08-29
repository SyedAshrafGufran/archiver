const { google } = require('googleapis');
const fs = require('fs');
const { Readable } = require('stream');

function createDriveClient(clientId, clientSecret, tokenPath) {
  const redirectUri = 'http://localhost:53682/oauth2callback';

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

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

  return google.drive({
    version: 'v3',
    auth: oauth2Client,
  });
}

/**
 * Find an existing folder for a contact inside the root folder.
 * If it doesn't exist, create it.
 *
 * Structure:
 *
 * Root Folder
 * ├── 919876543210/
 * ├── 918765432109/
 * └── 917654321098/
 */
async function getOrCreateContactFolder(drive, rootFolderId, contactId) {
  const folderName = String(contactId).trim();

  // Escape single quotes for Google Drive query syntax
  const escapedFolderName = folderName.replace(/'/g, "\\'");

  const response = await drive.files.list({
    q: [
      `'${rootFolderId}' in parents`,
      `name = '${escapedFolderName}'`,
      `mimeType = 'application/vnd.google-apps.folder'`,
      `trashed = false`,
    ].join(' and '),

    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 1,
  });

  // Folder already exists
  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  // Folder doesn't exist — create it
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [rootFolderId],
    },
    fields: 'id, name, webViewLink',
  });

  console.log(`Created Drive folder: ${folderName}`);

  return folder.data.id;
}

/**
 * Upload an image into the unique folder belonging to a contact.
 *
 * @param {object} drive - authenticated Google Drive client
 * @param {string} rootFolderId - root Drive folder ID
 * @param {string} contactId - unique contact identifier
 * @param {string} filename - desired filename
 * @param {Buffer} buffer - raw image bytes
 * @param {string} mimeType - e.g. image/jpeg
 * @param {number} maxRetries - number of retry attempts
 */
async function uploadImage(
  drive,
  rootFolderId,
  contactId,
  filename,
  buffer,
  mimeType,
  maxRetries = 3
) {
  let lastError;

  // Find or create the contact's folder
  const contactFolderId = await getOrCreateContactFolder(
    drive,
    rootFolderId,
    contactId
  );

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const stream = new Readable();

      stream.push(buffer);
      stream.push(null);

      const res = await drive.files.create({
        requestBody: {
          name: filename,
          parents: [contactFolderId],
        },

        media: {
          mimeType,
          body: stream,
        },

        fields: 'id, name, webViewLink, parents',
      });

      console.log(
        `Uploaded ${filename} → ${contactId}/`
      );

      return res.data;
    } catch (err) {
      lastError = err;

      const isRetryable =
        /socket hang up|ECONNRESET|ETIMEDOUT|EPIPE/i.test(
          err.message || ''
        ) ||
        (err.code &&
          [429, 500, 502, 503, 504].includes(err.code));

      if (!isRetryable || attempt === maxRetries) {
        break;
      }

      const delayMs = attempt * 1500;

      console.log(
        `Upload of ${filename} failed ` +
        `(attempt ${attempt}/${maxRetries}), ` +
        `retrying in ${delayMs}ms...`
      );

      await new Promise((resolve) =>
        setTimeout(resolve, delayMs)
      );
    }
  }

  throw lastError;
}

module.exports = {
  createDriveClient,
  getOrCreateContactFolder,
  uploadImage,
};

