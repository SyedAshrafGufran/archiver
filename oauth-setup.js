
// Run this once to link your Google account.
// In Docker:
//   docker compose --profile setup run --rm authorize
//
// This opens a Google OAuth URL, receives the callback through
// the Docker-exposed localhost port, and saves a reusable token
// to oauth-token.json.

require('dotenv').config();

const { google } = require('googleapis');
const http = require('http');
const fs = require('fs');
const path = require('path');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;

const TOKEN_PATH =
  process.env.GOOGLE_OAUTH_TOKEN_PATH || '/app/oauth-token.json';

const PORT = 53682;

// IMPORTANT:
// The browser will access 127.0.0.1 on your Windows host.
// Docker forwards that port into this container.
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    'Missing GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET in .env'
  );
  process.exit(1);
}

console.log('Starting Google OAuth setup...');
console.log(`Token path: ${TOKEN_PATH}`);
console.log(`Redirect URI: ${REDIRECT_URI}`);

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/drive.file'],
});

console.log('\n============================================================');
console.log('OPEN THIS URL IN YOUR BROWSER');
console.log('============================================================\n');
console.log(authUrl);
console.log('\n============================================================');
console.log('Waiting for Google OAuth callback...');
console.log('============================================================\n');

const server = http.createServer(async (req, res) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);

  if (!req.url || !req.url.startsWith('/oauth2callback')) {
    res.writeHead(404, {
      'Content-Type': 'text/plain',
    });
    res.end('Not found');
    return;
  }

  const qs = new URL(req.url, REDIRECT_URI).searchParams;

  // Google can return an error instead of an authorization code.
  const error = qs.get('error');

  if (error) {
    const errorDescription =
      qs.get('error_description') || 'No description provided';

    console.error('\nGoogle OAuth returned an error:');
    console.error(`Error: ${error}`);
    console.error(`Description: ${errorDescription}`);

    res.writeHead(400, {
      'Content-Type': 'text/plain',
    });

    res.end(
      `Google authentication failed.\n\nError: ${error}\n${errorDescription}`
    );

    server.close();
    process.exit(1);
  }

  const code = qs.get('code');

  if (!code) {
    console.error('No authorization code received.');

    res.writeHead(400, {
      'Content-Type': 'text/plain',
    });

    res.end('No authorization code received. Check the terminal.');

    return;
  }

  // Tell the browser authentication succeeded.
  res.writeHead(200, {
    'Content-Type': 'text/html',
  });

  res.end(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Google Authentication Successful</title>
      </head>
      <body style="font-family: Arial, sans-serif; padding: 40px;">
        <h2>Authentication successful! ✅</h2>
        <p>You can close this tab and return to the terminal.</p>
      </body>
    </html>
  `);

  try {
    console.log('\nAuthorization code received.');
    console.log('Exchanging code for Google tokens...');

    const { tokens } = await oauth2Client.getToken(code);

    // Make sure the parent directory exists.
    const tokenDir = path.dirname(TOKEN_PATH);

    if (!fs.existsSync(tokenDir)) {
      fs.mkdirSync(tokenDir, { recursive: true });
    }

    fs.writeFileSync(
      TOKEN_PATH,
      JSON.stringify(tokens, null, 2),
      'utf8'
    );

    console.log('\n============================================================');
    console.log('GOOGLE AUTHENTICATION SUCCESSFUL ✅');
    console.log('============================================================');
    console.log(`Token saved to: ${TOKEN_PATH}`);
    console.log('You can now start the bot with:');
    console.log('docker compose up -d');
    console.log('============================================================\n');

  } catch (err) {
    console.error('\nFailed to exchange authorization code for tokens.');

    if (err.response?.data) {
      console.error('Google response:', err.response.data);
    } else {
      console.error('Error:', err.message);
    }

    process.exitCode = 1;
  } finally {
    server.close(() => {
      console.log('OAuth callback server closed.');
      process.exit();
    });
  }
});

// Catch port/network errors explicitly.
server.on('error', (err) => {
  console.error('\nOAuth callback server failed to start.');

  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Stop the process/container using this port and try again.');
  } else {
    console.error(err);
  }

  process.exit(1);
});

// IMPORTANT:
// 0.0.0.0 allows Docker to forward the host port into this container.
server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `OAuth callback server listening on 0.0.0.0:${PORT}`
  );
  console.log(
    `Browser callback URL: ${REDIRECT_URI}`
  );
});

