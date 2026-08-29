require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createDriveClient, uploadImage } = require('./drive-uploader');

const GROUP_ID = process.env.WHATSAPP_GROUP_ID;
const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN_PATH || './oauth-token.json';
const FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

if (!GROUP_ID || !CLIENT_ID || !CLIENT_SECRET || !FOLDER_ID) {
  console.error('Missing required .env values. Check .env.example for what is needed.');
  process.exit(1);
}

const drive = createDriveClient(CLIENT_ID, CLIENT_SECRET, TOKEN_PATH);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './session' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  },
});

client.on('qr', (qr) => {
  console.log('Scan this QR code with WhatsApp (Linked Devices):');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('WhatsApp client ready. Watching group:', GROUP_ID);
});

client.on('auth_failure', (msg) => console.error('Auth failure:', msg));
client.on('disconnected', (reason) => console.log('Disconnected:', reason));

// Serialize uploads so bursts of messages don't fire overlapping requests
// at Google, which is what triggers "socket hang up" errors.
let uploadQueue = Promise.resolve();

client.on('message', async (message) => {
  uploadQueue = uploadQueue.then(() => processMessage(message));
});

async function processMessage(message) {
  try {
    // Only process messages from the target group
    if (message.from !== GROUP_ID) return;

    // Only process image attachments
    if (!message.hasMedia || message.type !== 'image') return;

    const media = await message.downloadMedia();
    if (!media) return;

    // WhatsApp increasingly masks real phone numbers with an internal LID for
    // group privacy. contact.number may still resolve to a real number if the
    // sender is in your own contacts; otherwise it falls back to the LID.
    const contact = await message.getContact();
    const rawId = contact.number || message.author?.split('@')[0] || 'unknown';
    const displayName = (contact.pushname || contact.name || '').replace(/[^a-zA-Z0-9]+/g, '_');
    const identifier = displayName ? `${displayName}_${rawId}` : rawId;

    const timestamp = new Date(message.timestamp * 1000)
      .toISOString()
      .replace(/[:.]/g, '-');

    const extension = media.mimetype.split('/')[1] || 'jpg';
    const filename = `${identifier}_${timestamp}.${extension}`;

    const buffer = Buffer.from(media.data, 'base64');

    const uploaded = await uploadImage(drive, FOLDER_ID, filename, buffer, media.mimetype);
    console.log(`Uploaded: ${uploaded.name} (${uploaded.id})`);
  } catch (err) {
    console.error('Error processing message:', err.message);
  }
}

client.initialize();