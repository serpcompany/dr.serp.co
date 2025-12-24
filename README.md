# ✨ Welcome to Your Spark Template!
You've just launched your brand-new Spark Template Codespace — everything’s fired up and ready for you to explore, build, and create with Spark!

This template is your blank canvas. It comes with a minimal setup to help you get started quickly with Spark development.

🚀 What's Inside?
- A clean, minimal Spark environment
- Pre-configured for local development
- Ready to scale with your ideas
  
🧠 What Can You Do?

Right now, this is just a starting point — the perfect place to begin building and testing your Spark applications.

🧹 Just Exploring?
No problem! If you were just checking things out and don’t need to keep this code:

- Simply delete your Spark.
- Everything will be cleaned up — no traces left behind.

📄 License For Spark Template Resources 

The Spark Template files and resources from GitHub are licensed under the terms of the MIT license, Copyright GitHub, Inc.

## Domain Rating (DR)

This project includes a tiny local proxy that fetches DR via the public checker pages you provided (best-effort, may be rate-limited and can require a simple CAPTCHA that the UI will prompt you to solve).

1. Create an `.env` (copy from `.env.example`) if you want to override the proxy URL.
2. In one terminal: `npm run dev:ahrefs-proxy`
3. In another terminal: `npm run dev`

## Hosting (Vercel)

This repo is a Vite SPA + an optional serverless API route.

- Frontend: Vercel will build the Vite app and serve `dist/`.
- API: `api/ahrefs/domain-rating.js` runs on Vercel at `/api/ahrefs/domain-rating` on the same domain (no extra env vars required).

Deploy:
1. Push to GitHub.
2. Import the repo in Vercel.
3. Build command: `npm run build`
4. Output directory: `dist`

Notes:
- The DR lookup relies on third-party sites and may be rate-limited or require a CAPTCHA; by default it will fall back to another provider if one requires CAPTCHA.
