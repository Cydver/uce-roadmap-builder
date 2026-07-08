# Gundam UCE Pull Roadmap Builder

A static GitHub Pages app for building a visual Gundam UCE pull-priority roadmap with draggable unit icons, tags, notes, and Gantt-style meta-longevity bars.

## What it does

- Displays a dark-mode roadmap with 5 months × 4 weeks.
- Rows: Human Rights, Must Pull, Ideally Pull, Luxury Pull, Skip.
- Starts as a clean blank template by default.
- Lets you add MS/pilot cards from a searchable local catalog.
- Lets you drag cards between weeks/tiers.
- Lets you drag/resize meta-longevity bars.
- Supports 4 meta lanes per tier row.
- Adds tag chips from a dropdown: PVP, PVE, Core, Tech, Def.
- Ties bar colors to editable meta statuses: Top meta, Strong, Niche, Fading, Custom.
- Saves edits to browser localStorage.
- Exports/imports roadmap JSON.
- Copies a self-contained share link using URL hash data.
- Exports PNG using a direct canvas renderer. Remote icons that cannot be drawn are replaced with placeholders instead of failing the whole export.
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

To generate the real catalog:

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
6. Edit tags, meta status, note, tier, week, lane, and meta dates in the side panel.
7. Click **Export JSON** and commit that JSON as your saved roadmap.

## Sharing options

### Quick share link

Click **Copy Share Link**. This puts the roadmap JSON into the URL hash. It is easy, but it can get very long once the chart has lots of units.

### Cleaner clan link

Export JSON, rename the file to:

```text
data/roadmap.json
```

Commit it to the repo. Then share this URL:

```text
https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/?view=published
```

That URL loads `data/roadmap.json` automatically, so clanmates do not need to upload JSON.

## Important notes

- This version removes the browser live Altema fetch button. Use the GitHub Action scraper to generate `data/catalog.json` and `icons/altema/`, then use **Load local catalog** in the app.
- PNG export works best with icons hosted locally in your repo. If an icon is remote and blocks canvas drawing, the exporter now draws a placeholder instead of failing the whole image.
- Respect the source site's terms and the rights of game assets when publishing icons publicly.

## v3 editor notes

- Blank template by default; no example MS or pilot cards.
- Removed the info bubble from unit cards because the entire card already has a hover tooltip.
- Renamed Badges to Tags.
- Tags now stack vertically from the top-right corner of each icon.
- Added fixed meta status options so bar meaning and color stay linked.
- Replaced thin lane guide lines with full lane tracks aligned exactly behind the bars.
- Improved unit dragging so the card follows the pointer while snapping still resolves to week/tier.
- Added published-roadmap loading via `?view=published`.

When patching an existing repo that already has a full catalog, replace only these files unless you intentionally want to regenerate the catalog:

- `index.html`
- `styles.css`
- `app.js`
- `README.md` optional

Do not upload a fresh starter `data/catalog.json` over your existing catalog unless you are okay regenerating it with the GitHub Action.
