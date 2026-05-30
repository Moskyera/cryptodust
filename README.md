# CryptoDUST

**An immersive, full-screen cryptocurrency visualizer with physics-based bubbles.**

Real-time market data from CoinGecko, beautiful canvas animations, and full PulseChain ecosystem support.

## ✨ Features

- **Physics-powered bubbles** — Drag, fling, and watch tokens interact with realistic movement
- **Live market data** — Prices, market cap, and 24h changes updated in real time
- **PulseChain Support** — Dedicated view for the PulseChain ecosystem with curated tokens
- **Fully responsive** — Works great on desktop, tablet, and mobile
- **Smart filters** — Big movers, gainers/losers, favorites, and more
- **Export & Share** — Save high-quality images of the visualization
- **Buy integration** — Quick access to RampNow for supported tokens

## 🚀 Live Demo

The best experience is on the deployed version:

→ [cryptodust.vercel.app](https://cryptodust.vercel.app) *(example — replace with your actual link)*

## 🛠 Tech Stack

- React + TypeScript + Vite
- Tailwind CSS
- HTML5 Canvas + custom physics engine
- SWR for data fetching
- CoinGecko API

## 🖥 Local Development

```bash
git clone https://github.com/Moskyera/cryptodust.git
cd cryptodust
npm install
npm run dev
```

Open the link shown in the terminal (usually `http://localhost:5173`).

> **Note:** Do not open `index.html` directly — it must run through the Vite dev server.

## 🔑 Environment Variables

Create a `.env.local` file:

```env
VITE_COINGECKO_API_KEY=your_key_here
VITE_COINGECKO_PULSE_DEMO_KEY=your_pulsechain_demo_key
```

The PulseChain key is recommended for better data on the PulseChain ecosystem.

## ☁️ Deployment

This project deploys easily on **Vercel**:

1. Push your code to GitHub
2. Import the repo on Vercel
3. Add your CoinGecko keys as environment variables
4. Deploy

Every push will trigger a new deployment.

## ❤️ Support the Project

If you enjoy CryptoDUST and want to help maintain and improve it:

**Ethereum donations:**
```
0x38be95f628ed004a000ddf8724142a95e3c4b492
```

Your support is greatly appreciated!

## 📄 License

MIT

---

Made with ❤️ for the crypto community. Enjoy the bubbles!