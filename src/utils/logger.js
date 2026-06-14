const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Log directory: <project_root>/logs/
// ---------------------------------------------------------------------------
const LOG_DIR = path.join(__dirname, "../../logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, "0");

const timestamp = () => {
  const d = new Date();
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`
  );
};

// Daily log file name: skillpay-YYYY-MM-DD.log
const logFileName = () => {
  const d = new Date();
  return `skillpay_logs_${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`;
};

const writeToFile = (line) => {
  const filePath = path.join(LOG_DIR, logFileName());
  fs.appendFile(filePath, line + "\n", (err) => {
    if (err) console.error("[Logger] Failed to write log:", err.message);
  });
};

// ---------------------------------------------------------------------------
// Core format:
//   [YYYY-MM-DD HH:mm:ss.mmm] [LEVEL] [TAG] message
//   payload (if any) printed as pretty JSON on next lines
// ---------------------------------------------------------------------------

const format = (level, tag, message, payload) => {
  const header = `[${timestamp()}] [${level.padEnd(5)}] [${tag}] ${message}`;
  if (payload === undefined || payload === null) return header;
  const body =
    typeof payload === "object"
      ? JSON.stringify(payload, null, 2)
      : String(payload);
  return `${header}\n${body}`;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const info = (tag, message, payload) => {
  const line = format("INFO", tag, message, payload);
  console.log(line);
  writeToFile(line);
};

const warn = (tag, message, payload) => {
  const line = format("WARN", tag, message, payload);
  console.warn(line);
  writeToFile(line);
};

const error = (tag, message, payload) => {
  const line = format("ERROR", tag, message, payload);
  console.error(line);
  writeToFile(line);
};

const debug = (tag, message, payload) => {
  const line = format("DEBUG", tag, message, payload);
  console.log(line);
  writeToFile(line);
};

// ---------------------------------------------------------------------------
// HTTP request/response shorthand used by controllers & services
// ---------------------------------------------------------------------------

const logRequest = (tag, url, payload) => {
  info(tag, `>> OUTGOING REQUEST  ${url}`, payload);
};

const logResponse = (tag, url, responseData) => {
  info(tag, `<< RESPONSE          ${url}`, responseData);
};

const logIncoming = (tag, route, payload) => {
  info(tag, `>> INCOMING REQUEST  ${route}`, payload);
};

const logOutgoing = (tag, route, responseData) => {
  info(tag, `<< OUTGOING RESPONSE ${route}`, responseData);
};

const logError = (tag, message, err) => {
  const payload = err
    ? {
        message: err.message,
        silkpayResponse: err.response?.data || null,
        stack: err.stack || null,
      }
    : undefined;
  error(tag, message, payload);
};

const logSign = (tag, signString, sign) => {
  debug(tag, "SIGNATURE", { signString, sign });
};

const logWebhook = (tag, route, payload) => {
  info(tag, `WEBHOOK RECEIVED     ${route}`, payload);
};

const logSignVerify = (tag, received, calculated, result) => {
  info(tag, `SIGNATURE VERIFY     result=${result ? "VALID" : "INVALID"}`, {
    receivedSign: received,
    calculatedSign: calculated,
    match: result,
  });
};

// ---------------------------------------------------------------------------
// Morgan write stream (pipes HTTP access log to the daily file)
// ---------------------------------------------------------------------------
const morganStream = {
  write: (message) => {
    const line = `[${timestamp()}] [HTTP ] [ACCESS] ${message.trim()}`;
    writeToFile(line);
  },
};

module.exports = {
  info,
  warn,
  error,
  debug,
  logRequest,
  logResponse,
  logIncoming,
  logOutgoing,
  logError,
  logSign,
  logWebhook,
  logSignVerify,
  morganStream,
};
