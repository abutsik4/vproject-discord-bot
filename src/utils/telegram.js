const fs = require('node:fs');
const https = require('node:https');

function getEnvValueFromFile(filePath, key) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line || line.startsWith('#')) continue;
      if (!line.startsWith(`${key}=`)) continue;
      let value = line.slice(key.length + 1);
      value = value.trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      return value.trim();
    }
  } catch {
    // ignore
  }
  return '';
}

function resolveTelegramConfig() {
  const fallbackEnv = '/opt/jepsencloud-bot/.env';

  const token =
    (process.env.TELEGRAM_BOT_TOKEN || '').trim() ||
    getEnvValueFromFile(fallbackEnv, 'TELEGRAM_BOT_TOKEN');

  const chatId =
    (process.env.TELEGRAM_CHAT_ID || '').trim() ||
    getEnvValueFromFile(fallbackEnv, 'TELEGRAM_CHAT_ID');

  return { token: token.trim(), chatId: chatId.trim() };
}

function truncateTelegramText(text) {
  const MAX_LEN = 3800;
  const s = String(text || '');
  if (s.length <= MAX_LEN) return s;
  return `${s.slice(0, MAX_LEN)}\n\n(truncated)`;
}

async function sendTelegram(text) {
  const { token, chatId } = resolveTelegramConfig();
  if (!token || !chatId) return false;

  const payload = new URLSearchParams({
    chat_id: chatId,
    text: truncateTelegramText(text),
    disable_web_page_preview: 'true'
  }).toString();

  const options = {
    hostname: 'api.telegram.org',
    path: `/bot${token}/sendMessage`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(payload)
    },
    timeout: 15000
  };

  return await new Promise(resolve => {
    const req = https.request(options, res => {
      // drain
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode >= 200 && res.statusCode < 300));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
    req.write(payload);
    req.end();
  });
}

module.exports = {
  resolveTelegramConfig,
  sendTelegram
};
