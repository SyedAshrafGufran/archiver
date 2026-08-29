# WhatsApp Group → Google Drive Image Collector

Watches a WhatsApp group, and every time someone posts an image, uploads it to a
Google Drive folder with the sender's phone number (+ timestamp) as the filename.

Built on [whatsapp-web.js](https://wwebjs.dev/) (unofficial, drives WhatsApp Web via a
headless browser) and the Google Drive API. Both are free to use.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up Google OAuth credentials (free)

Note: service accounts don't work here — Google gives them zero storage quota, so
uploads fail unless you're on a paid Workspace plan with Shared Drives. Instead, we
authorize as *your own* Google account, so uploads use your normal free 15GB.

1. Go to [Google Cloud Console](https://console.cloud.google.com/) and create a project.
2. Enable the **Google Drive API** for that project (APIs & Services → Library).
3. Configure the **OAuth consent screen** (APIs & Services → OAuth consent screen):
   choose **External**, fill in the required app name/email fields, and add your own
   Google account under **Test users**. It's fine to leave it in "Testing" mode — no
   verification needed for personal use.
4. Create an **OAuth client ID** (APIs & Services → Credentials → Create Credentials →
   OAuth client ID). Application type: **Desktop app**.
5. Copy the **Client ID** and **Client Secret** shown after creation.
6. In Google Drive, create (or pick) a folder for the images, and copy its ID from the
   URL: `drive.google.com/drive/folders/<THIS_PART>`.

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
- `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` → from step 2.5
- `GOOGLE_DRIVE_FOLDER_ID` → the folder ID from step 2.6
- `WHATSAPP_GROUP_ID` → leave blank for now, you'll get this in step 5

## 4. Authorize your Google account

```bash
npm run authorize
```

This prints a URL — open it in your browser, sign in with the Google account you want
uploads to go to, and approve access. It saves a token file (`oauth-token.json`)
locally so you only need to do this once.

## 5. Find your group's ID

```bash
npm run list-groups
```

This prints a QR code — scan it with WhatsApp on your phone
(**Settings → Linked Devices → Link a Device**). It then lists every group you're in
along with its ID (e.g. `1234567890-1234567890@g.us`). Copy the ID of the group you
want and paste it into `.env` as `WHATSAPP_GROUP_ID`.

Note: the account you scan in must actually be a member of the group.

## 6. Run the collector

```bash
npm start
```

Scan the QR code again if prompted (a `session/` folder is saved locally so you
normally only need to do this once). Leave the process running — it uploads each new
image as it arrives, named like:

```
919876543210_2026-08-10T13-45-02-123Z.jpg
```

## Keeping it running long-term

For continuous operation, run it under a process manager so it restarts on crashes/
reboots, e.g.:

```bash
npm install -g pm2
pm2 start index.js --name wa-drive-collector
pm2 save
```

## Notes & limits

- This uses an **unofficial** library that automates WhatsApp Web. It's widely used
  and free, but it isn't an official WhatsApp/Meta product, so accounts can in theory
  be flagged for automated behavior — this is generally low-risk for personal/small
  group use but worth knowing.
- Only **new** images sent after the script starts are captured (it doesn't backfill
  old media in the group history).
- Google Drive's free tier gives you 15GB, shared across your whole Google account.
- Be transparent with the group that images are being archived this way, since it also
  logs members' phone numbers as filenames.