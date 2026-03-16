require('dotenv').config();

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// ─── Config ──────────────────────────────────────────────────────────────────

const MY_NUMBER = process.env.MY_NUMBER;
if (!MY_NUMBER) {
  console.error('❌ MY_NUMBER is not set in .env');
  process.exit(1);
}

const TEMP_DIR = path.join(__dirname, 'temp');
const DOWNLOAD_TIMEOUT_MS = 60_000;

// yt-dlp path: try PATH first, fall back to common WinGet install location
const YTDLP_BIN =
  process.env.YTDLP_PATH ||
  'C:\\Users\\Yugi\\AppData\\Local\\Microsoft\\WinGet\\Links\\yt-dlp.exe';

// Only process messages sent AFTER the bot started (ignore replayed history)
const BOT_START_TIME = Date.now();

// Instagram reel / post URL pattern
const INSTAGRAM_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+\/?/;

// ─── Ensure temp directory exists ────────────────────────────────────────────

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ─── Check yt-dlp availability ───────────────────────────────────────────────

exec(`"${YTDLP_BIN}" --version`, (err, stdout) => {
  if (err) {
    console.warn(
      '⚠️  WARNING: yt-dlp not found. Downloads will fail.\n' +
        `   Tried: ${YTDLP_BIN}\n` +
        '   Set YTDLP_PATH in .env or install: winget install yt-dlp'
    );
  } else {
    console.log(`✅ yt-dlp found: v${stdout.trim()}`);
  }
});

// ─── WhatsApp client ─────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    // Run headless; add --no-sandbox for Linux/Docker environments
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', (qr) => {
  console.log('📱 Scan this QR code with WhatsApp:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log(`✅ WhatsApp bot ready — monitoring self-messages for ${MY_NUMBER}`);
});

client.on('auth_failure', (msg) => {
  console.error('❌ Authentication failed:', msg);
});

// ─── Message handler ─────────────────────────────────────────────────────────

client.on('message_create', async (msg) => {
  // Only react to messages sent by ourselves
  const selfId = `${MY_NUMBER}@c.us`;
  if (msg.from !== selfId && msg.author !== selfId) return;
  // Ignore messages that aren't from/to self chat (i.e. "Saved Messages")
  if (msg.from !== selfId) return;

  // Ignore messages sent before the bot started (avoid replaying history)
  const msgTime = (msg.timestamp || 0) * 1000;
  if (msgTime < BOT_START_TIME) return;

  const body = msg.body || '';
  const match = body.match(INSTAGRAM_REGEX);
  if (!match) return;

  const url = match[0];
  console.log(`🔗 Reel URL detected: ${url}`);

  const chat = await msg.getChat();
  await chat.sendMessage('⏳ Downloading reel...');

  // Unique output filename to avoid collisions
  const outFile = path.join(TEMP_DIR, `${Date.now()}.mp4`);

  downloadReel(url, outFile)
    .then(async () => {
      // Load and send the video
      console.log(`📂 Loading file: ${outFile} (${fs.statSync(outFile).size} bytes)`);
      const media = await MessageMedia.fromFilePath(outFile);
      console.log(`📤 Sending media, mimetype: ${media.mimetype}, size: ${media.data?.length}`);
      await chat.sendMessage(media, { sendMediaAsDocument: false });
      console.log(`✅ Sent reel to ${msg.from}`);
    })
    .catch(async (err) => {
      console.error('❌ Full error object:', err);
      console.error('❌ Error name:', err?.name);
      console.error('❌ Error message:', err?.message);
      console.error('❌ Error stack:', err?.stack);
      const reason = err?.message || String(err);
      await chat.sendMessage(`❌ Failed: ${reason}`);
    })
    .finally(() => {
      // Clean up temp file whether success or failure
      fs.rm(outFile, () => {});
    });
});

// ─── Download helper ─────────────────────────────────────────────────────────

/**
 * Downloads an Instagram reel to outFile using yt-dlp.
 * Resolves when the file is ready, rejects with an error on failure.
 */
function downloadReel(url, outFile) {
  return new Promise((resolve, reject) => {
    // Best quality mp4 with merged audio; fallback to best available
    const format =
      'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';

    const cmd = [
      `"${YTDLP_BIN}"`,
      `--output "${outFile}"`,
      '--merge-output-format mp4',
      `-f "${format}"`,
      // Force H.264 + AAC so WhatsApp Web accepts the video
      '--postprocessor-args', '"ffmpeg:-c:v libx264 -c:a aac -movflags +faststart"',
      `"${url}"`,
    ].join(' ');

    console.log(`⬇️  Running: ${cmd}`);

    const proc = exec(cmd, { timeout: DOWNLOAD_TIMEOUT_MS }, (err, stdout, stderr) => {
      if (err) {
        // Prefer a concise error from stderr if available
        const detail =
          (stderr && stderr.split('\n').find((l) => l.includes('ERROR'))) ||
          err.message;
        return reject(new Error(detail || 'yt-dlp exited with error'));
      }

      // Verify the file actually exists and has content
      if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
        return reject(new Error('yt-dlp finished but output file is missing or empty'));
      }

      resolve();
    });

    proc.stdout?.on('data', (d) => process.stdout.write(d));
    proc.stderr?.on('data', (d) => process.stderr.write(d));
  });
}

// ─── Graceful shutdown ───────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down...');
  await client.destroy();
  process.exit(0);
});

// ─── Start ───────────────────────────────────────────────────────────────────

client.initialize();
