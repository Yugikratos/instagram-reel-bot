# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Run the bot (first run shows a QR code to scan)
node index.js
# or
npm start

# Run with PM2 (persistent/production)
pm2 start ecosystem.config.js
pm2 logs insta-reel-bot
pm2 restart insta-reel-bot
pm2 stop insta-reel-bot
```

## Environment

Create a `.env` file with:
```
MY_NUMBER=<your WhatsApp number, digits only, no +>
YTDLP_PATH=<optional: path to yt-dlp binary if not in PATH>
```

The bot falls back to `C:\Users\Yugi\AppData\Local\Microsoft\WinGet\Links\yt-dlp.exe` if `YTDLP_PATH` is not set and `yt-dlp` is not on PATH.

**Required system binaries:** `yt-dlp` and `ffmpeg` must be installed and accessible. ffmpeg is mandatory — yt-dlp uses it to merge DASH streams and re-encode to H.264/AAC for WhatsApp compatibility.

## Architecture

The entire bot lives in a single file: `index.js`.

**Flow:**
1. `whatsapp-web.js` (Puppeteer-based) authenticates via QR code on first run; session is persisted in `.wwebjs_auth/` via `LocalAuth`
2. The `message_create` event fires for every message; the handler filters to only messages sent by `MY_NUMBER` to itself (the "Saved Messages" chat)
3. Messages sent before `BOT_START_TIME` are ignored to avoid replaying history on restart
4. When an Instagram URL matching `INSTAGRAM_REGEX` is found, `downloadReel()` is called
5. `downloadReel()` shells out to `yt-dlp` with ffmpeg post-processing args, writes to a unique timestamped file in `temp/`
6. On success, `MessageMedia.fromFilePath()` reads the file and sends it via `chat.sendMessage()`; the temp file is deleted in `.finally()`

**Key constants in `index.js`:**
- `DOWNLOAD_TIMEOUT_MS` — 60s hard timeout on the yt-dlp process
- `INSTAGRAM_REGEX` — matches `/reel/` and `/p/` URL patterns
- `format` string in `downloadReel()` — yt-dlp format selector for best mp4+m4a

**Session reset:** Delete `.wwebjs_auth/` and restart to re-authenticate.

**Rate limiting / cookies:** Add `--cookies-from-browser chrome` to the `cmd` array in `downloadReel()` if Instagram blocks yt-dlp.
