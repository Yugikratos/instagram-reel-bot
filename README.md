# instagram-reel-bot

A WhatsApp bot that watches your "Saved Messages" chat (messages you send to yourself). When you send an Instagram reel or post URL, it automatically downloads the video with **yt-dlp** and sends it back as a video message.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18 or newer |
| yt-dlp | latest (must be in PATH) |
| ffmpeg | latest (must be in PATH) |

> **Why ffmpeg?** yt-dlp downloads Instagram DASH streams (separate video + audio), merges them, and re-encodes to H.264 + AAC so WhatsApp accepts the file. Without ffmpeg the send will fail.

### Install yt-dlp on Windows

```powershell
# Option 1 — winget (recommended)
winget install yt-dlp

# Option 2 — download the binary from GitHub
# https://github.com/yt-dlp/yt-dlp/releases/latest
# Place yt-dlp.exe somewhere in your PATH (e.g. C:\Windows\System32)
```

### Install ffmpeg on Windows

```powershell
# Option 1 — winget (recommended)
winget install Gyan.FFmpeg

# Option 2 — download from https://ffmpeg.org/download.html
# Extract and add the bin/ folder to your PATH
```

Verify both work:

```powershell
yt-dlp --version
ffmpeg -version
```

---

## Setup

```bash
# 1. Clone / enter the project folder
cd instagram-reel-bot

# 2. Install Node dependencies
npm install

# 3. Configure your number
#    Edit .env and set MY_NUMBER to your WhatsApp number (digits only, no +)
#    Example: MY_NUMBER=1234567890
```

---

## Running

### First run — scan the QR code

```bash
node index.js
```

A QR code will appear in the terminal. Open WhatsApp on your phone → **Linked Devices** → **Link a device** and scan it. The session is saved locally so you only need to do this once.

### Continuous operation with PM2

```bash
# Install PM2 globally if you haven't already
npm install -g pm2

# Start the bot
pm2 start ecosystem.config.js

# Save the process list so it survives reboots
pm2 save
pm2 startup   # follow the printed instructions
```

Useful PM2 commands:

```bash
pm2 logs insta-reel-bot   # live logs
pm2 status                # process list
pm2 restart insta-reel-bot
pm2 stop insta-reel-bot
```

---

## Usage

1. Open WhatsApp and go to your own chat (**Saved Messages** / your own number).
2. Paste any Instagram reel or post URL, e.g.:
   - `https://www.instagram.com/reel/ABC123/`
   - `https://instagram.com/p/XYZ789/`
3. The bot replies with `⏳ Downloading reel...` and then sends the video.

---

## Instagram rate limiting & cookies

Instagram may block yt-dlp downloads after repeated requests or when not logged in. To work around this, pass your browser cookies to yt-dlp:

```bash
# Chrome example — yt-dlp reads cookies directly from the browser
yt-dlp --cookies-from-browser chrome "https://www.instagram.com/reel/..."
```

To use this in the bot, edit the `cmd` string in `index.js` and add `--cookies-from-browser chrome` to the yt-dlp arguments.

---

## Project structure

```
instagram-reel-bot/
├── index.js              # Main bot logic
├── ecosystem.config.js   # PM2 process config
├── package.json
├── .env                  # MY_NUMBER (not committed)
├── .gitignore
├── temp/                 # Temporary download folder (auto-created, not committed)
└── README.md
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| QR code not appearing | Delete `.wwebjs_auth/` and restart |
| `yt-dlp not found` | Ensure yt-dlp is installed and in PATH |
| `ffmpeg not found` / merge error | Install ffmpeg and ensure it is in PATH (`winget install Gyan.FFmpeg`) |
| WhatsApp rejects the video (`t: t` error) | ffmpeg is not installed or not in PATH — the bot re-encodes to H.264/AAC which requires ffmpeg |
| Video download fails | Try adding `--cookies-from-browser chrome` to the yt-dlp command in `index.js` |
| Bot doesn't react to messages | Verify `MY_NUMBER` in `.env` matches exactly (digits only, no `+`) |
