// Run this once to find the ID of the group you want to monitor.
// It logs in via QR code, then prints every group chat + its ID, and exits.

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

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

client.on('ready', async () => {
  console.log('\nLogged in. Fetching chats...\n');
  const chats = await client.getChats();
  const groups = chats.filter((chat) => chat.isGroup);

  if (groups.length === 0) {
    console.log('No groups found on this account.');
  } else {
    console.log('Your groups:\n');
    groups.forEach((g) => {
      console.log(`  ${g.name}  ->  ${g.id._serialized}`);
    });
    console.log('\nCopy the ID of the group you want and put it in your .env as WHATSAPP_GROUP_ID.');
  }

  process.exit(0);
});

client.initialize();
