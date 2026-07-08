import * as cheerio from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'icons', 'altema');
const dataDir = path.join(root, 'data');

const SOURCES = [
  { kind: 'ms', url: 'https://altema.jp/gundamuce/msrea/4' },
  { kind: 'pilot', url: 'https://altema.jp/gundamuce/chararea/4' }
];

const ATTRIBUTES = ['赤', '青', '緑', '黄', '紫'];
const ROLES = ['強襲', '重装', '汎用', '砲撃', '狙撃', '白兵', '支援'];
const USER_AGENT = 'Mozilla/5.0 (compatible; GundamUCERoadmapBuilder/1.0; +https://github.com/)';
const WAIT_MS = Number(process.env.ALTTEMA_WAIT_MS || 120);
const MAX_DETAIL_FETCHES = Number(process.env.ALTTEMA_MAX_DETAIL_FETCHES || 500);

async function main() {
  await mkdir(outDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const items = [];
  let detailFetchCount = 0;

  for (const source of SOURCES) {
    console.log(`Fetching ${source.kind}: ${source.url}`);
    const html = await fetchText(source.url);
    const parsed = parseListPage(html, source.kind, source.url);
    console.log(`Parsed ${parsed.length} ${source.kind} rows`);

    for (const item of parsed) {
      let iconUrl = item.remoteIcon;
      if (!iconUrl && detailFetchCount < MAX_DETAIL_FETCHES && item.sourceUrl) {
        detailFetchCount += 1;
        iconUrl = await findIconOnDetailPage(item.sourceUrl, item.name);
        await sleep(WAIT_MS);
      }

      let localIcon = '';
      if (iconUrl) {
        try {
          localIcon = await downloadIcon(iconUrl, item.kind, item.name);
        } catch (error) {
          console.warn(`Could not download icon for ${item.name}: ${error.message}`);
        }
      }

      items.push({
        id: `altema-${item.kind}-${hash(`${item.kind}:${item.name}:${item.sourceUrl}`).slice(0, 10)}`,
        kind: item.kind,
        name: item.name,
        icon: localIcon,
        sourceUrl: item.sourceUrl,
        attribute: item.attribute || '',
        role: item.role || '',
        rating: item.rating || ''
      });
    }
  }

  const result = {
    generatedAt: new Date().toISOString(),
    sources: SOURCES.map(s => s.url),
    items: uniqueItems(items)
  };

  await writeFile(path.join(dataDir, 'catalog.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(`Wrote data/catalog.json with ${result.items.length} items.`);
}

function parseListPage(html, kind, baseUrl) {
  const $ = cheerio.load(html);
  const rows = $('tr').toArray();
  const items = [];

  for (const row of rows) {
    const $row = $(row);
    const rowText = clean($row.text());
    if (!/\d+(?:\.\d+)?\s*点/.test(rowText)) continue;

    const $link = $row.find('a[href*="/gundamuce/"]').first();
    if (!$link.length) continue;

    const name = clean($link.text() || $link.attr('title') || '');
    if (!name || name.includes('一覧') || name.includes('検索')) continue;

    const sourceUrl = absolutize($link.attr('href'), baseUrl);
    const $img = $row.find('img').first();
    const remoteIcon = imageSrc($img, baseUrl);
    const cells = $row.find('td,th').toArray().map(cell => clean($(cell).text()));
    const rating = (rowText.match(/(\d+(?:\.\d+)?)\s*点/) || [])[1] || '';

    items.push({
      kind,
      name,
      sourceUrl,
      remoteIcon,
      attribute: kind === 'ms' ? findFirst(cells, ATTRIBUTES) : '',
      role: kind === 'ms' ? findFirst(cells, ROLES) : '',
      rating
    });
  }

  return uniqueItems(items);
}

async function findIconOnDetailPage(url, name) {
  try {
    const html = await fetchText(url);
    const $ = cheerio.load(html);
    const candidates = [];

    $('img').each((_, img) => {
      const $img = $(img);
      const src = imageSrc($img, url);
      if (!src) return;
      const alt = clean($img.attr('alt') || '');
      const cls = clean($img.attr('class') || '');
      const width = Number($img.attr('width') || 0);
      const height = Number($img.attr('height') || 0);
      const score = scoreImageCandidate(src, alt, cls, width, height, name);
      if (score > 0) candidates.push({ src, score });
    });

    const og = $('meta[property="og:image"]').attr('content');
    if (og) candidates.push({ src: absolutize(og, url), score: 2 });

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.src || '';
  } catch (error) {
    console.warn(`Detail page fetch failed for ${url}: ${error.message}`);
    return '';
  }
}

function scoreImageCandidate(src, alt, cls, width, height, name) {
  let score = 0;
  const n = clean(name);
  if (alt && (alt.includes(n) || n.includes(alt))) score += 10;
  if (/gundamuce|gundam/i.test(src)) score += 2;
  if (/chara|char|ms|unit|card|icon|thumbnail|thumb/i.test(src + ' ' + cls)) score += 3;
  if (width >= 80 && height >= 80) score += 2;
  if (/logo|banner|btn|common|sprite|ad|pr/i.test(src + ' ' + cls)) score -= 6;
  return score;
}

function imageSrc($img, baseUrl) {
  if (!$img || !$img.length) return '';
  const src = $img.attr('data-src') || $img.attr('data-original') || $img.attr('data-lazy-src') || $img.attr('src') || '';
  return src ? absolutize(src, baseUrl) : '';
}

async function downloadIcon(url, kind, name) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT, 'referer': 'https://altema.jp/gundamuce/' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength < 200) throw new Error('icon response too small');

  const urlPath = new URL(url).pathname;
  let ext = path.extname(urlPath).split('?')[0].toLowerCase();
  if (!ext || ext.length > 6) {
    const contentType = response.headers.get('content-type') || '';
    ext = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : contentType.includes('gif') ? '.gif' : '.jpg';
  }
  const filename = `${kind}-${slug(name)}-${hash(url).slice(0, 8)}${ext}`;
  const filepath = path.join(outDir, filename);
  await writeFile(filepath, buffer);
  return `icons/altema/${filename}`;
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return await response.text();
}

function clean(text) { return String(text || '').replace(/\s+/g, ' ').trim(); }
function findFirst(cells, values) { return values.find(v => cells.some(c => c.includes(v))) || ''; }
function absolutize(url, base) { try { return new URL(url, base).href; } catch { return url || ''; } }
function hash(text) { return createHash('sha1').update(String(text)).digest('hex'); }
function slug(text) {
  return clean(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unit';
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.kind}:${item.name}:${item.sourceUrl || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
