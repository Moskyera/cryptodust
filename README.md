# CryptoDUST 2.0

Immersive full-screen cryptocurrency bubble visualizer with **hybrid pricing** (Moralis + CoinGecko).

## Tech Stack
- React + TypeScript + Vite + Tailwind
- SWR for smart caching
- Canvas + DOM labels for beautiful, readable bubbles
- Fully responsive full-screen experience

## Local Development

```bash
npm install
npm run dev
```

## Environment Variables

1. Copy `.env.example` → `.env.local`
2. Add your keys:

```env
VITE_MORALIS_API_KEY=your_moralis_key
VITE_COINGECKO_API_KEY=your_coingecko_key
```

## Deployment to Vercel (Recommended)

### Step-by-step:

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial CryptoDUST React version"
   git remote add origin https://github.com/YOUR_USERNAME/cryptodust.git
   git branch -M main
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) → New Project
   - Import your GitHub repo
   - Vercel will auto-detect Vite
   - Add these **Environment Variables** in Vercel dashboard:
     - `VITE_MORALIS_API_KEY`
     - `VITE_COINGECKO_API_KEY` (optional)

3. Click **Deploy**

The site will be live at `https://your-project.vercel.app` with automatic deployments on every push.

## Notes
- The current Moralis integration needs real token contract addresses for the top 300 (see `src/lib/prices.ts`).
- All price fetching happens client-side.
- The visualization uses a safe export method to avoid any canvas tainting issues.

Enjoy the bubbles!
