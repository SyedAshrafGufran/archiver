
require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const {
  createDriveClient,
  uploadImage,
} = require('./drive-uploader');

const { logEvent } = require('./logger');

const GROUP_ID = process.env.WHATSAPP_GROUP_ID;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const TOKEN_PATH =
  process.env.GOOGLE_OAUTH_TOKEN_PATH || './oauth-token.json';

const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

// ---------------------------------------------------------
// Validate environment variables
// ---------------------------------------------------------

if (
  !GROUP_ID ||
  !CLIENT_ID ||
  !CLIENT_SECRET ||
  !FOLDER_ID
) {
  console.error(
    'Missing required .env values. Check .env.example for what is needed.'
  );

  // Try to log the configuration failure
  try {
    logEvent(
      'CONFIGURATION_ERROR',
      'Missing required .env values'
    );
  } catch (err) {
    // Logger itself may not be initialized correctly
  }

  process.exit(1);
}

// ---------------------------------------------------------
// PROCESS START
// ---------------------------------------------------------

logEvent(
  'PROCESS_START',
  'WhatsApp Drive Collector process started'
);

// ---------------------------------------------------------
// Google Drive
// ---------------------------------------------------------

const drive = createDriveClient(
  CLIENT_ID,
  CLIENT_SECRET,
  TOKEN_PATH
);

// ---------------------------------------------------------
// WhatsApp Client
// ---------------------------------------------------------

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'wa-drive-collector',
    dataPath: './session',
  }),

  puppeteer: {
    headless: true,

    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  },
});

// ---------------------------------------------------------
// State
// ---------------------------------------------------------

let isReady = false;
let qrDisplayed = false;
let uploadQueue = Promise.resolve();
let shuttingDown = false;

// ---------------------------------------------------------
// QR CODE
// ---------------------------------------------------------

client.on('qr', (qr) => {

  /*
   * WhatsApp may emit the QR event more than once.
   * Don't flood the terminal with multiple QR codes.
   */

  if (qrDisplayed) {

    console.log(
      'WhatsApp requested another QR code. Ignoring duplicate QR.'
    );

    logEvent(
      'QR_DUPLICATE',
      'WhatsApp requested another QR code; duplicate QR ignored'
    );

    return;
  }

  qrDisplayed = true;

  logEvent(
    'QR_REQUESTED',
    'WhatsApp authentication required; QR code generated'
  );

  console.log('');
  console.log('==============================================');
  console.log(' WhatsApp authentication required');
  console.log(' Scan the QR code with WhatsApp → Linked Devices');
  console.log('==============================================');
  console.log('');

  qrcode.generate(qr, {
    small: true,
  });
});

// ---------------------------------------------------------
// AUTHENTICATED
// ---------------------------------------------------------

client.on('authenticated', () => {

  console.log(
    'WhatsApp authenticated successfully.'
  );

  logEvent(
    'AUTHENTICATED',
    'WhatsApp authenticated successfully'
  );

  /*
   * Reset this so a future genuine authentication
   * request can display a QR.
   */

  qrDisplayed = false;
});

// ---------------------------------------------------------
// READY
// ---------------------------------------------------------

client.on('ready', () => {

  isReady = true;
  qrDisplayed = false;

  console.log('');
  console.log('==============================================');
  console.log(' WhatsApp client ready.');
  console.log(` Watching group: ${GROUP_ID}`);
  console.log('==============================================');
  console.log('');

  logEvent(
    'WHATSAPP_READY',
    `WhatsApp client ready. Listening to group: ${GROUP_ID}`
  );
});

// ---------------------------------------------------------
// AUTH FAILURE
// ---------------------------------------------------------

client.on('auth_failure', (msg) => {

  isReady = false;

  console.error('');
  console.error('WhatsApp authentication failure:');
  console.error(msg);
  console.error('');

  logEvent(
    'AUTH_FAILURE',
    `WhatsApp authentication failure: ${msg}`
  );
});

// ---------------------------------------------------------
// DISCONNECTED
// ---------------------------------------------------------

client.on('disconnected', (reason) => {

  isReady = false;

  console.error('');
  console.error('WhatsApp disconnected:', reason);
  console.error('');

  logEvent(
    'WHATSAPP_DISCONNECTED',
    `WhatsApp disconnected. Reason: ${reason}`
  );

  /*
   * IMPORTANT:
   *
   * Do NOT call client.initialize() here.
   *
   * Re-initializing immediately can cause:
   *
   * - multiple Chromium instances
   * - multiple QR codes
   * - session locks
   * - unexpected logout
   */
});

// ---------------------------------------------------------
// MESSAGE QUEUE
// ---------------------------------------------------------

/*
 * Serialize image uploads.
 *
 * If 10 people send images at almost the same time,
 * they are processed one after another instead of
 * hitting Google Drive simultaneously.
 */

client.on('message', (message) => {

  uploadQueue = uploadQueue
    .then(() => processMessage(message))
    .catch((err) => {

      console.error(
        'Queue processing error:',
        err.message
      );

      logEvent(
        'QUEUE_PROCESSING_ERROR',
        err.stack || err.message
      );
    });
});

// ---------------------------------------------------------
// PROCESS MESSAGE
// ---------------------------------------------------------

async function processMessage(message) {

  try {

    // -----------------------------------------------------
    // Only process messages from the target group
    // -----------------------------------------------------

    if (message.from !== GROUP_ID) {
      return;
    }

    // -----------------------------------------------------
    // Only process images
    // -----------------------------------------------------

    if (
      !message.hasMedia ||
      message.type !== 'image'
    ) {
      return;
    }

    console.log('');
    console.log('Image received. Processing...');

    logEvent(
      'IMAGE_RECEIVED',
      'Image received from target WhatsApp group'
    );

    // -----------------------------------------------------
    // Download image
    // -----------------------------------------------------

    const media = await message.downloadMedia();

    if (!media) {

      console.error(
        'Could not download media.'
      );

      logEvent(
        'MEDIA_DOWNLOAD_FAILED',
        'Could not download WhatsApp media'
      );

      return;
    }

    // -----------------------------------------------------
    // Get sender
    // -----------------------------------------------------

    const contact = await message.getContact();

    /*
     * Prefer the real phone number.
     *
     * If WhatsApp exposes only a LID, fall back to
     * message.author.
     */

    const rawId =
      contact.number ||
      message.author?.split('@')[0] ||
      'unknown';

    const contactId = String(rawId).trim();

    // -----------------------------------------------------
    // Display name
    // -----------------------------------------------------

    const displayName = (
      contact.pushname ||
      contact.name ||
      ''
    )
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

    // -----------------------------------------------------
    // Timestamp
    // -----------------------------------------------------

    const timestamp = new Date(
      message.timestamp * 1000
    )
      .toISOString()
      .replace(/[:.]/g, '-');

    // -----------------------------------------------------
    // File extension
    // -----------------------------------------------------

    let extension = 'jpg';

    if (media.mimetype) {

      const mimeExtension =
        media.mimetype.split('/')[1];

      if (mimeExtension) {

        if (mimeExtension === 'jpeg') {
          extension = 'jpg';
        } else {
          extension = mimeExtension;
        }
      }
    }

    // -----------------------------------------------------
    // Filename
    // -----------------------------------------------------

    const filename = displayName
      ? `${displayName}_${contactId}_${timestamp}.${extension}`
      : `${contactId}_${timestamp}.${extension}`;

    // -----------------------------------------------------
    // Convert base64 → Buffer
    // -----------------------------------------------------

    const buffer = Buffer.from(
      media.data,
      'base64'
    );

    console.log(
      `Uploading ${filename} into contact folder ${contactId}...`
    );

    // -----------------------------------------------------
    // Google Drive
    // -----------------------------------------------------

    const uploaded = await uploadImage(
      drive,
      FOLDER_ID,
      contactId,
      filename,
      buffer,
      media.mimetype
    );

    console.log(
      `Uploaded successfully: ${uploaded.name} (${uploaded.id})`
    );

    logEvent(
      'IMAGE_UPLOADED',
      `Uploaded ${filename} to Google Drive. File ID: ${uploaded.id}`
    );

  } catch (err) {

    console.error(
      'Error processing message:',
      err.message
    );

    logEvent(
      'IMAGE_PROCESSING_ERROR',
      err.stack || err.message
    );
  }
}

// ---------------------------------------------------------
// START CLIENT
// ---------------------------------------------------------

console.log(
  'Starting WhatsApp client...'
);

console.log(
  'Persistent session directory: ./session'
);

logEvent(
  'WHATSAPP_INITIALIZING',
  'Initializing WhatsApp client'
);

client.initialize();

// ---------------------------------------------------------
// CLEAN SHUTDOWN
// ---------------------------------------------------------

async function shutdown(signal) {

  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  console.log('');
  console.log(
    `Received ${signal}. Shutting down...`
  );

  logEvent(
    'PROCESS_SHUTDOWN_REQUESTED',
    `Process shutdown requested via ${signal}`
  );

  try {

    await client.destroy();

    console.log(
      'WhatsApp client closed.'
    );

    logEvent(
      'PROCESS_SHUTDOWN',
      `WhatsApp client closed successfully after ${signal}`
    );

  } catch (err) {

    console.error(
      'Error while shutting down WhatsApp:',
      err.message
    );

    logEvent(
      'SHUTDOWN_ERROR',
      `Error while shutting down WhatsApp: ${err.message}`
    );
  }

  process.exit(0);
}

// ---------------------------------------------------------
// SIGNAL HANDLERS
// ---------------------------------------------------------

process.on(
  'SIGINT',
  () => shutdown('SIGINT')
);

process.on(
  'SIGTERM',
  () => shutdown('SIGTERM')
);

// ---------------------------------------------------------
// UNEXPECTED ERRORS
// ---------------------------------------------------------

process.on(
  'uncaughtException',
  (err) => {

    console.error(
      'UNCAUGHT EXCEPTION:',
      err
    );

    logEvent(
      'UNCAUGHT_EXCEPTION',
      err.stack || err.message || String(err)
    );
  }
);

process.on(
  'unhandledRejection',
  (reason) => {

    console.error(
      'UNHANDLED REJECTION:',
      reason
    );

    logEvent(
      'UNHANDLED_REJECTION',
      reason?.stack ||
      reason?.message ||
      String(reason)
    );
  }
);

