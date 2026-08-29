const fs = require('fs');
const path = require('path');

const LOG_DIR = process.env.LOG_DIR || './logs';
const LOG_FILE = path.join(LOG_DIR, 'whatsapp-logs.csv');

// Make sure the log directory exists
fs.mkdirSync(LOG_DIR, { recursive: true });

// Create CSV with headers ONLY if the file doesn't exist
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(
    LOG_FILE,
    'timestamp,event,message\n',
    'utf8'
  );
}

/**
 * Escape a value for CSV.
 */
function csvEscape(value) {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // Escape quotes by doubling them
  return `"${str.replace(/"/g, '""')}"`;
}

/**
 * Append one log entry.
 */
function logEvent(event, message = '') {
  const timestamp = new Date().toISOString();

  const row = [
    timestamp,
    event,
    message,
  ]
    .map(csvEscape)
    .join(',') + '\n';

  fs.appendFileSync(LOG_FILE, row, 'utf8');
}

module.exports = {
  logEvent,
  LOG_FILE,
};