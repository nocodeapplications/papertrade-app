# PaperTrade — Deployment Guide

## What you have
A complete React web app with:
- User accounts (register / sign in)
- Per-user portfolio, trade history, theme preference
- AI-powered buy/short recommendations
- Live stock & crypto prices
- Price charts, paper trading (long & short)

---

## Step 1 — Install Node.js (one-time, free)

1. Go to **https://nodejs.org**
2. Click the big green **"LTS"** button to download
3. Open the downloaded file and follow the installer
4. When done, open **Terminal** (Mac) or **Command Prompt** (Windows)
5. Type `node -v` and press Enter — you should see a version number like `v20.x.x`

---

## Step 2 — Set up the project

1. Unzip the `papertrade-app` folder you downloaded
2. Open **Terminal** / **Command Prompt**
3. Navigate into the folder:
   ```
   cd path/to/papertrade-app
   ```
   *(Replace `path/to` with where you unzipped it — e.g. `cd Desktop/papertrade-app`)*

4. Install dependencies:
   ```
   npm install
   ```
   This takes 1–3 minutes. You'll see lots of text — that's normal.

5. Test it locally:
   ```
   npm start
   ```
   Your browser should open at **http://localhost:3000** showing the app.
   Press `Ctrl+C` in the terminal to stop it.

---

## Step 3 — Deploy to Netlify (free, shareable URL)

### Option A — Drag & Drop (easiest, no account needed initially)

1. Build the app:
   ```
   npm run build
   ```
   This creates a `build` folder.

2. Go to **https://app.netlify.com/drop**
3. **Drag the `build` folder** onto the page
4. Netlify gives you a live URL immediately — e.g. `https://amazing-app-123.netlify.app`
5. Share that URL with anyone!

### Option B — Netlify account (free, keeps your URL permanent)

1. Go to **https://netlify.com** and sign up for free
2. Click **"Add new site"** → **"Deploy manually"**
3. Run `npm run build` in your terminal
4. Drag the `build` folder to Netlify
5. Optionally rename your site to something memorable

---

## Step 4 — Share with others

Once deployed, just share the Netlify URL (e.g. `https://papertrade-demo.netlify.app`).

Anyone who opens it can:
- Create their own account with a username + password
- Their portfolio, trades, and theme are saved privately in their browser
- Each user's data is completely separate

**Important:** User data is stored in each person's browser (localStorage). This means:
- Data is private to each device/browser
- If someone clears their browser data, their account resets
- For true shared cloud storage across devices, a backend database (Firebase/Supabase) would be needed — let me know if you'd like that upgrade

---

## Updating the app

If you make changes to the code:
1. Run `npm run build` again
2. Re-upload the `build` folder to Netlify

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `npm: command not found` | Restart terminal after installing Node.js |
| White screen after deploy | Make sure you uploaded the `build` folder, not `src` |
| Prices not loading | The Yahoo Finance proxy may be rate-limited — wait a minute and refresh |
| AI picks not loading | The Anthropic API requires a key — see below |

---

## Adding your Anthropic API key (required for AI features)

The AI recommendations use the Anthropic API. To use this in production:

1. Get a key at **https://console.anthropic.com**
2. Open `src/useAI.js`
3. The app currently relies on the browser calling the API directly. For production security, add the key to a proxy server or use Netlify Functions.

For a quick test, the app will work without AI features — prices and trading still function.

---

## Need help?

Ask Claude to help you with any step — just paste the error message you see.
