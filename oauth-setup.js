// Run this once (npm run authorize) to link your own Google account.
// It opens a browser auth URL, catches the redirect locally, and saves
// a reusable token file so index.js can upload as you (using your free quota).

require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const TOKEN_PATH = process.env.GOOGLE_OAUTH_TOKEN_PATH || './oauth-token.json';
const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in .env');
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\nOpen this URL in your browser and sign in with the Google account you want to use:\n');
console.log(authUrl);
console.log('\nWaiting for you to finish signing in...\n');

const server = http
  .createServer(async (req, res) => {
    if (!req.url.startsWith('/oauth2callback')) return;

    const qs = new URL(req.url, REDIRECT_URI).searchParams;
    const code = qs.get('code');

    if (!code) {
      res.end('No code received. Check the terminal and try again.');
      return;
    }

    res.end('Authentication successful! You can close this tab and go back to the terminal.');

    try {
      const { tokens } = await oauth2Client.getToken(code);
      fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
      console.log(`Saved credentials to ${TOKEN_PATH}. You can now run: npm start`);
    } catch (err) {
      console.error('Failed to exchange code for tokens:', err.message);
    } finally {
      server.close();
      process.exit(0);
    }
  })
  .listen(PORT);