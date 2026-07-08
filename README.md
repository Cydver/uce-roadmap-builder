# Gundam UCE Roadmap Builder — v5 Patch

Upload these files to the root of your GitHub repo:

- `index.html`
- `styles.css`
- `app.js`
- `README.md`

Do **not** replace or delete:

- `data/catalog.json`
- `icons/altema/`

## v5 changes

- Default roadmap stays blank.
- Meta-status colors now use the same red / blue / green / yellow / purple ordering as the left row headers.
- Existing old default colors migrate to the new scheme, while custom edited colors are preserved.
- Left column row headers are now editable by clicking them.
- Meta-status legend labels/colors are still editable by clicking the legend pills.
- Meta bars now display the unit name only.
- Right-click a unit icon or meta bar to add a segment directly at that week.
- Form edits auto-apply; the manual Apply button was removed.
- Tags remain normalized/sorted as PVP / PVE / Core / Tech / Def.
- Buttons were restyled to look sharper and more modern while keeping rounded panels.

After uploading, wait for GitHub Pages to redeploy, then hard refresh the page with Cmd+Shift+R.
