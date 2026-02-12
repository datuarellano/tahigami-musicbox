# tahigami-musicbox

## Development (Vite)

- Install dependencies with `pnpm install` (or `npm install`/`yarn` if preferred)
- Start dev server: `pnpm run dev` (opens at http://localhost:5173 by default)
- Build for production: `pnpm run build` (output in `dist/`)
- Preview production build: `pnpm run preview`

> Note: This project uses Vite for fast development and native ESM support.

## Vite config

A `vite.config.js` file is included with sensible defaults:
- `base: '/tahigami-musicbox/'` set for a GitHub Pages **project** site (change this to `/` for a user/organization site or to a custom path if different)
- Dev server: `host: true`, `port: 5173` and `open: true` (set `host: false` or remove to restrict to localhost)
- Build output: `dist/`
- A simple `@` alias pointing to the project root

You can customize `vite.config.js` as needed for your deployment or tooling.

## Deploy to GitHub Pages

To publish to GitHub Pages (project site):
1. Install `gh-pages` as a dev dependency: `pnpm add -D gh-pages`
2. Run `pnpm run deploy` (this builds and publishes the `dist/` folder)

Note: Make sure your repository is set up on GitHub and that the `base` option above matches the repository name (e.g., `/your-repo-name/`).

### CI / GitHub Actions

A GitHub Action is included at `.github/workflows/deploy.yml` that will automatically build and publish the `dist/` folder to GitHub Pages whenever you push to the `main` branch. The workflow uses `pnpm` and `peaceiris/actions-gh-pages` with the built-in `GITHUB_TOKEN` for publishing. If you prefer deploying from a different branch or using a different action, I can update the workflow.