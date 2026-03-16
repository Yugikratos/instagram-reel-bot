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

// Instagram reel / post URL pattern
const INSTAGRAM_REGEX =
  /https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+\/?/;

// ─── Ensure temp directory exists ────────────────────────────────────────────

if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// ─── Check yt-dlp availability ───────────────────────────────────────────────

exec('yt-dlp --version', (err, stdout) => {
  if (err) {
    console.warn(
      '⚠️  WARNING: yt-dlp not found in PATH. Downloads will fail.\n' +
        '   Install it: winget install yt-dlp   OR   https://github.com/yt-dlp/yt-dlp/releases'
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
      const media = MessageMedia.fromFilePath(outFile);
      await chat.sendMessage(media, { sendMediaAsDocument: false });
      console.log(`✅ Sent reel to ${msg.from}`);
    })
    .catch(async (err) => {
      const reason = err.message || String(err);
      console.error('❌ Download failed:', reason);
      await chat.sendMessage(`❌ Download failed: ${reason}`);
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
      'yt-dlp',
      `--output "${outFile}"`,
      '--merge-output-format mp4',
      `-f "${format}"`,
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
