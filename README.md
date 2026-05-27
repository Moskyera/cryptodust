# CryptoDUST 2.0

> **⚠️ CRITICAL: Do NOT open `index.html` directly!**
>
> This is a modern Vite + React project. Double-clicking `index.html` will **not** work and will show CORS errors.
> You **must** run `npm run dev` (see instructions below).

Immersive full-screen cryptocurrency bubble visualizer powered by CoinGecko.

## Tech Stack
- React + TypeScript + Vite + Tailwind
- SWR for smart caching
- Canvas + DOM labels for beautiful, readable bubbles
- Fully responsive full-screen experience

## Local Development (Required)

**You cannot open this project by double-clicking `index.html`.**  
Doing so will always show the CORS error you are seeing (`file:///C:/src/main.tsx` blocked).

### Step-by-step to run locally on Windows:

1. **Fix npm first (very common issue on Windows)**

   Your Node installation has a corrupted npm. This is why commands fail.

   - Go to https://nodejs.org
   - Download the **LTS** version (not Current)
   - Run the installer
   - Choose **"Repair"** (or uninstall + reinstall)
   - **Important**: After reinstall, close and reopen PowerShell completely

2. **Run the project**

   Open PowerShell and run these commands **one by one**:

   ```powershell
   cd "C:\Users\KQHEX\AetherBubbles"
   ```

   ```powershell
   npm install
   ```

   ```powershell
   npm run dev
   ```

3. **Open the correct link**

   When the terminal says something like:
   `➜  Local:   http://localhost:5173/`

   **Copy and open that link** in Chrome/Edge.

   Do **not** open `index.html` from the folder.

### Easy Alternative (Recommended for beginners)

1. Install [Visual Studio Code](https://code.visualstudio.com/)
2. Open the `C:\Users\KQHEX\AetherBubbles` folder in VS Code
3. Press `Ctrl + `` ` to open the terminal inside VS Code
4. Run the three commands above in that terminal
5. Click the `http://localhost:...` link that appears

There's also a helper script included: `start-local.ps1`. You can right-click it → "Run with PowerShell" (after fixing npm).

This starts Vite's development server, which is required for the React version to work.

## Environment Variables

1. Copy `.env.example` → `.env.local`
2. Add your keys:

```env
VITE_COINGECKO_API_KEY=your_coingecko_key_optional
```

## Deployment to Vercel (Recommended - Fixes All Local Issues)

Once deployed to Vercel, the site works perfectly with no CORS or file:// problems.

### Step-by-step:

1. **Commit and push your latest code** (including the fixes):

   ```bash
   git add .
   git commit -m "fix: resolve build errors and add strong warnings"
   git push
   ```

2. **Deploy on Vercel**
   - Go to https://vercel.com → "Add New Project"
   - Import your GitHub repository
   - Vercel automatically detects it's a Vite project
   - **Add this Environment Variable** (optional but recommended for higher rate limits):
     - Name: `VITE_COINGECKO_API_KEY` → Value: your CoinGecko key

3. Click **Deploy**

Your live site will be at something like `https://cryptodust-xxx.vercel.app`. Every push to GitHub will trigger a new deployment.

**This is the best way to run and share CryptoDUST right now.**

## Notes
- All prices are fetched from CoinGecko (up to 1000 coins).
- All price fetching happens client-side.
- The visualization uses a safe export method to avoid any canvas tainting issues.

Enjoy the bubbles!
