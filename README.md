# Gundam UCE Pull Roadmap Builder

A static GitHub Pages app for building a visual Gundam UCE pull-priority roadmap with draggable unit icons, badges, notes, and Gantt-style meta-longevity bars.

## What it does

- Displays a dark-mode roadmap with 5 months × 4 weeks.
- Rows: Human Rights, Must Pull, Ideally Pull, Luxury Pull, Skip.
- Lets you add MS/pilot cards from a searchable catalog.
- Lets you drag cards between weeks/tiers.
- Lets you drag/resize meta-longevity bars.
- Supports 4 meta lanes per tier row.
- Saves edits to browser localStorage.
- Exports/imports roadmap JSON.
- Exports PNG, best when icons are hosted locally in the repo.
- Includes a GitHub Action scraper for:
  - MS: https://altema.jp/gundamuce/msrea/4
  - Pilots: https://altema.jp/gundamuce/chararea/4

## Recommended setup on GitHub Pages

1. Create a new public GitHub repository.
2. Upload all files from this folder.
3. Go to **Settings → Pages**.
4. Set source to your main branch, root folder.
5. Open the published site URL.

GitHub Pages serves static HTML/CSS/JS directly from a repository, which is exactly what this app uses.

## Getting the real Altema catalog/icons

The app ships with a tiny starter catalog so the UI works immediately. To generate the real catalog:

1. Push the repo to GitHub.
2. Go to **Actions → Update Altema catalog → Run workflow**.
3. The workflow fetches the Altema MS/pilot pages, downloads icon images into `icons/altema/`, and writes `data/catalog.json`.
4. Refresh the site and click **Load local catalog**.

You can also run it locally:

```bash
npm install
npm run update-catalog
```

## Editing workflow

1. Click **Load local catalog**.
2. Search for a unit or pilot.
3. Click **Add**.
4. Drag the icon card to its release week/tier.
5. Drag the colored meta bar or resize its handles.
6. Edit badges, color, note, tier, week, lane, and meta dates in the side panel.
7. Click **Export JSON** and commit that JSON as your saved roadmap.

## Important notes

- Live browser fetching from Altema may fail because static sites cannot always read third-party pages due to CORS. The GitHub Action scraper is the reliable route.
- PNG export may fail if remote images block canvas export. Using the GitHub Action to host icons locally in your repo fixes that.
- Respect the source site's terms and the rights of game assets when publishing icons publicly.
