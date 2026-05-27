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

### Correct way to run locally:

1. Fix your Node.js installation if `npm` is broken (common on Windows after updates).
2. Open a terminal in this folder and run:

```bash
npm install
npm run dev
```

3. Open the URL shown in the terminal (usually `http://localhost:5173` or `http://localhost:3000`).

This starts Vite's development server, which is required for React, TypeScript, and module imports to work.

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
