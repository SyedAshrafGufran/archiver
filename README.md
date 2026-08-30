# WhatsApp Group → Google Drive Image Collector

Watches a WhatsApp group and automatically uploads every new image posted in that
group to Google Drive.

Images are organized into **separate folders for each sender/contact**, with filenames
containing the sender's display name, phone number, and timestamp.

The application also maintains an **append-only CSV activity log** and can be run
continuously using **Docker**.

Built on [whatsapp-web.js](https://wwebjs.dev/) (unofficial, drives WhatsApp Web via a
headless browser) and the Google Drive API. Both are free to use.

---

## Features

* 📱 Monitors a specific WhatsApp group
* 🖼️ Automatically detects newly received images
* ☁️ Uploads images directly to Google Drive
* 📁 Creates a separate Google Drive folder for each contact
* 🏷️ Names files using sender name + phone number + timestamp
* 📝 Maintains an append-only CSV activity log
* 🔐 Persists WhatsApp authentication/session data
* 🐳 Docker and Docker Compose support
* 🔄 Graceful shutdown on `Ctrl+C` and Docker termination
* ⚠️ Logs authentication failures, disconnections, errors, uploads, and shutdowns
* 🔁 Serializes uploads so multiple images don't hit Google Drive simultaneously

---

# Project Structure

```text
whatsapp_archiver/
│
├── index.js                  # Main WhatsApp listener
├── drive-uploader.js         # Google Drive upload/folder logic
├── logger.js                 # Persistent CSV logging system
│
├── authorize.js              # Google OAuth authorization
├── list-groups.js            # Lists WhatsApp groups and IDs
│
├── package.json
├── package-lock.json
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
├── .env.example
│
├── session/                  # Persistent WhatsApp Web session
│
├── .wwebjs_cache/            # WhatsApp Web/Puppeteer cache
│
└── logs/
    └── whatsapp-logs.csv     # Append-only application log
```

### Runtime folders

The following folders are generated/used while the application runs:

| Folder           | Purpose                                    |
| ---------------- | ------------------------------------------ |
| `session/`       | Stores the WhatsApp authentication session |
| `.wwebjs_cache/` | Stores WhatsApp Web/Puppeteer cache        |
| `logs/`          | Stores persistent application logs         |

These folders should generally **not be committed to Git**.

---

# 1. Install dependencies

If running directly on your computer:

```bash
npm install
```

---

# 2. Set up Google OAuth credentials

Google OAuth is used so that uploads go to your own Google Drive account.

> **Note:** Service accounts are not used here. Service accounts generally do not have
> normal consumer Drive storage quota, which can cause uploads to fail. The application
> instead authorizes your own Google account.

### Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project.
3. Enable the **Google Drive API**:

   * APIs & Services
   * Library
   * Search for **Google Drive API**
   * Enable it

### Configure OAuth consent

Go to:

```text
APIs & Services
→ OAuth consent screen
```

Configure the application as **External**.

Fill in the required application information and add your Google account under
**Test users**.

For personal use, it is fine to leave the application in **Testing** mode.

### Create OAuth credentials

Go to:

```text
APIs & Services
→ Credentials
→ Create Credentials
→ OAuth client ID
```

Choose:

```text
Application type: Desktop app
```

Copy the:

```text
Client ID
Client Secret
```

You will need these in `.env`.

---

# 3. Create your Google Drive folder

Create a main folder in Google Drive where the WhatsApp images should be stored.

For example:

```text
WhatsApp Archive
```

Open the folder and copy its ID from the URL:

```text
https://drive.google.com/drive/folders/XXXXXXXXXXXX
                                      ^^^^^^^^^^^^
                                      Folder ID
```

Put this ID into your `.env` file.

---

# 4. Configure environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then edit `.env`.

Example:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
GOOGLE_OAUTH_TOKEN_PATH=./oauth-token.json

GOOGLE_DRIVE_FOLDER_ID=your-main-drive-folder-id

WHATSAPP_GROUP_ID=your-whatsapp-group-id
```

### Environment variables

| Variable                     | Description                       |
| ---------------------------- | --------------------------------- |
| `GOOGLE_OAUTH_CLIENT_ID`     | Google OAuth Client ID            |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Google OAuth Client Secret        |
| `GOOGLE_OAUTH_TOKEN_PATH`    | Location of the saved OAuth token |
| `GOOGLE_DRIVE_FOLDER_ID`     | Main Google Drive folder          |
| `WHATSAPP_GROUP_ID`          | WhatsApp group to monitor         |

---

# 5. Authorize your Google account

Run:

```bash
npm run authorize
```

The application will print a Google authorization URL.

Open it in your browser and sign in with the Google account where you want the images
stored.

Approve the requested permissions.

A token file will then be saved locally:

```text
oauth-token.json
```

You normally only need to complete this authorization once.

> **Important:** `oauth-token.json` contains authentication credentials and should
> never be committed to Git.

---

# 6. Find your WhatsApp group ID

Run:

```bash
npm run list-groups
```

A QR code will appear.

Scan it using WhatsApp:

```text
WhatsApp
→ Settings
→ Linked Devices
→ Link a Device
```

The application will then list the groups available to that WhatsApp account.

Example:

```text
Group: RFH Footzilla
ID: 120363429280908427@g.us
```

Copy the ID of the group you want to monitor and add it to:

```env
WHATSAPP_GROUP_ID=120363429280908427@g.us
```

> The WhatsApp account used for authentication must be a member of the target group.

---

# 7. Run the collector locally

Once everything is configured:

```bash
npm start
```

On the first run, a QR code may be displayed.

Scan it using:

```text
WhatsApp
→ Settings
→ Linked Devices
→ Link a Device
```

The authenticated session is stored in:

```text
session/
```

Therefore, you normally won't need to scan the QR code every time the application
restarts.

When the application is ready, you should see:

```text
==============================================
 WhatsApp client ready.
 Watching group: 120363429280908427@g.us
==============================================
```

The event is also recorded in:

```text
logs/whatsapp-logs.csv
```

---

# 8. Google Drive folder separation

Images are automatically separated by contact.

For example, the main Google Drive folder might become:

```text
WhatsApp Archive/
│
├── 919876543210/
│   ├── Rahul_919876543210_2026-08-30T05-30-12-000Z.jpg
│   ├── Rahul_919876543210_2026-08-30T06-12-41-000Z.jpg
│   └── Rahul_919876543210_2026-08-30T07-03-22-000Z.jpg
│
├── 919812345678/
│   ├── Priya_919812345678_2026-08-30T05-45-12-000Z.jpg
│   └── Priya_919812345678_2026-08-30T08-11-32-000Z.jpg
│
└── 919900001111/
    └── Unknown_919900001111_2026-08-30T09-20-42-000Z.jpg
```

The contact folder is identified by the sender's phone number.

If a folder does not already exist, the application creates it automatically.

---

# 9. File naming

Uploaded images follow this format:

```text
DISPLAY_NAME_PHONE_NUMBER_TIMESTAMP.extension
```

Example:

```text
Rahul_919876543210_2026-08-30T05-30-12-000Z.jpg
```

If WhatsApp does not expose a display name, the filename falls back to:

```text
PHONE_NUMBER_TIMESTAMP.extension
```

Example:

```text
919876543210_2026-08-30T05-30-12-000Z.jpg
```

---

# 10. Logging system

The application maintains an append-only CSV log:

```text
logs/whatsapp-logs.csv
```

The logger automatically creates the `logs/` directory and CSV file if they don't
already exist.

Existing logs are **never overwritten**.

Example:

```csv
timestamp,event,message
2026-08-30T05:20:01.123Z,PROCESS_START,"WhatsApp Drive Collector process started"
2026-08-30T05:20:01.125Z,WHATSAPP_INITIALIZING,"Initializing WhatsApp client"
2026-08-30T05:20:05.431Z,WHATSAPP_READY,"WhatsApp client ready. Listening to group: 120363429280908427@g.us"
2026-08-30T05:25:11.521Z,IMAGE_RECEIVED,"Image received from target WhatsApp group"
2026-08-30T05:25:12.922Z,IMAGE_UPLOADED,"Uploaded Rahul_919876543210_....jpg to Google Drive"
```

### Events recorded

The logger records events including:

* `PROCESS_START`
* `WHATSAPP_INITIALIZING`
* `QR_REQUESTED`
* `QR_DUPLICATE`
* `AUTHENTICATED`
* `WHATSAPP_READY`
* `AUTH_FAILURE`
* `WHATSAPP_DISCONNECTED`
* `IMAGE_RECEIVED`
* `MEDIA_DOWNLOAD_FAILED`
* `IMAGE_UPLOADED`
* `IMAGE_PROCESSING_ERROR`
* `QUEUE_PROCESSING_ERROR`
* `PROCESS_SHUTDOWN_REQUESTED`
* `PROCESS_SHUTDOWN`
* `SHUTDOWN_ERROR`
* `UNCAUGHT_EXCEPTION`
* `UNHANDLED_REJECTION`

This makes it possible to determine whether the application:

* started successfully
* became ready
* received images
* uploaded images
* lost the WhatsApp session
* was stopped using `Ctrl+C`
* was terminated by Docker
* encountered an unexpected error

---

# 11. Docker

The application can be run using Docker, so you don't need to manually install Node.js
or configure the runtime environment on the deployment machine.

Build and start the application:

```bash
docker compose up --build
```

To run it in the background:

```bash
docker compose up --build -d
```

View logs:

```bash
docker compose logs -f
```

Stop the application:

```bash
docker compose down
```

---

# 12. Persistent Docker storage

The Docker Compose configuration mounts the important runtime directories as volumes.

Example:

```yaml
volumes:
  - ./session:/app/session
  - ./.wwebjs_cache:/app/.wwebjs_cache
  - ./logs:/app/logs
```

This is important because the WhatsApp session and application logs should survive
container restarts.

The structure on the host remains:

```text
whatsapp_archiver/
│
├── session/
├── .wwebjs_cache/
│
└── logs/
    └── whatsapp-logs.csv
```

Therefore, recreating the Docker container does not automatically delete these files.

---

# 13. Docker authentication

If the WhatsApp session has not been authenticated yet, start the container normally:

```bash
docker compose up --build
```

The application will display a QR code in the terminal.

Scan it using WhatsApp's **Linked Devices** feature.

After successful authentication, the session is stored in:

```text
session/
```

Future container restarts can reuse the saved session.

---

# 14. Running continuously

For long-term operation, Docker can keep the service running with a restart policy such
as:

```yaml
restart: unless-stopped
```

This allows Docker to restart the application if the process crashes or the machine
reboots.

You can also use a process manager such as PM2 when running without Docker:

```bash
npm install -g pm2

pm2 start index.js --name wa-drive-collector

pm2 save
```

---

# 15. Git and sensitive files

The following files/directories contain runtime data or secrets and should **not** be
committed:

```text
.env
oauth-token.json
session/
.wwebjs_cache/
logs/
node_modules/
```

A recommended `.gitignore` is:

```gitignore
node_modules/

.env
oauth-token.json

session/
.wwebjs_cache/

logs/

npm-debug.log*
```

The source code for the logger **should** be committed:

```text
logger.js
```

but the generated runtime log should remain outside Git:

```text
logger.js          ← commit this
logs/              ← don't commit this
```

---

# 16. Stopping the application

The application handles graceful shutdown signals.

### Ctrl+C

When running locally, press:

```text
Ctrl+C
```

The application records the shutdown in the CSV and attempts to close the WhatsApp
client cleanly.

### Docker

When Docker stops the container, the application handles `SIGTERM` and records the
shutdown.

This allows the log to distinguish between events such as:

```text
PROCESS_SHUTDOWN_REQUESTED
```

and:

```text
WHATSAPP_DISCONNECTED
```

---

# 17. Important limitations

### WhatsApp Web library

This project uses **whatsapp-web.js**, which is an unofficial library that automates
WhatsApp Web through a browser.

It is not an official WhatsApp/Meta API.

Accounts using automation can theoretically be flagged or restricted by WhatsApp.
Use responsibly, especially with large groups or high-volume automation.

### New images only

The collector processes images received **after the listener is running**.

It does not automatically backfill all historical images from the WhatsApp group.

### Google Drive storage

Google Drive storage is shared across your Google account.

The available storage depends on the Google account being used.

### Internet connection

The application requires a stable internet connection for:

* WhatsApp Web
* Google Drive API
* Image uploads

---

# 18. Privacy

This application archives images from a WhatsApp group and may use members' phone
numbers in:

* Google Drive folder names
* Image filenames
* Application logs

Make sure the group members are appropriately informed that images are being archived.

Keep:

```text
.env
oauth-token.json
session/
logs/
```

private and do not publish them in a public Git repository.

---

# 19. Quick start with Docker

For a fresh setup:

```bash
git clone <repository-url>

cd whatsapp_archiver

cp .env.example .env
```

Configure `.env`, then authorize Google:

```bash
docker compose run --rm authorize
```

Find your WhatsApp group:

```bash
docker compose run --rm list-groups
```

Set:

```env
WHATSAPP_GROUP_ID=your-group-id
```

Then start the collector:

```bash
docker compose up --build -d
```

View the application output:

```bash
docker compose logs -f
```

Your persistent logs will be available on the host at:

```text
logs/whatsapp-logs.csv
```

Your WhatsApp session will be stored at:

```text
session/
```

and uploaded images will appear in the configured Google Drive folder, separated by
contact.

---

# License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

```
```
