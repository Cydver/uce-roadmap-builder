import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const catalogPath = path.join(root, 'data', 'catalog.json');
const mapPath = path.join(root, 'data', 'canonical-name-map.json');
const reviewPath = path.join(root, 'data', 'name-review.json');

const MAP_VERSION = 1;

async function main() {
  if (process.argv.includes('--self-test')) {
    runSelfTests();
    return;
  }

  const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
  if (!Array.isArray(catalog.items)) {
    throw new Error('data/catalog.json does not contain an items array.');
  }

  const canonicalMap = await loadCanonicalMap();
  const result = applyCanonicalMap(catalog.items, canonicalMap);

  catalog.items = result.items;
  catalog.nameMapping = {
    mapVersion: canonicalMap.version,
    mappedItems: result.stats.mappedItems,
    unresolvedItems: result.stats.unresolvedItems,
    unresolvedNames: result.reviewItems.length
  };

  const review = buildReviewFile(catalog, result);

  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  await writeFile(reviewPath, `${JSON.stringify(review, null, 2)}\n`, 'utf8');

  console.log(
    `Applied canonical name map: ${result.stats.mappedItems}/${catalog.items.length} catalog items mapped ` +
    `(${result.stats.mappedByCard} card overrides, ${result.stats.mappedByName} reusable name mappings).`
  );

  if (result.reviewItems.length) {
    console.log(
      `Wrote data/name-review.json with ${result.reviewItems.length} unresolved unique name(s) ` +
      `covering ${result.stats.unresolvedItems} catalog item(s).`
    );
    console.log('Upload data/name-review.json to ChatGPT for manual web-assisted name research, then replace data/canonical-name-map.json with the returned verified map.');
  } else {
    console.log('All catalog items are covered by data/canonical-name-map.json; data/name-review.json is empty.');
  }
}

async function loadCanonicalMap() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(mapPath, 'utf8'));
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    parsed = { version: MAP_VERSION, cards: {}, names: {} };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('data/canonical-name-map.json must contain a JSON object.');
  }
  if (Number(parsed.version || MAP_VERSION) !== MAP_VERSION) {
    throw new Error(`Unsupported canonical-name-map version ${parsed.version}; expected ${MAP_VERSION}.`);
  }
  if (parsed.cards != null && !isPlainObject(parsed.cards)) {
    throw new Error('canonical-name-map.json "cards" must be an object.');
  }
  if (parsed.names != null && !isPlainObject(parsed.names)) {
    throw new Error('canonical-name-map.json "names" must be an object.');
  }

  return {
    ...parsed,
    version: MAP_VERSION,
    cards: parsed.cards || {},
    names: parsed.names || {}
  };
}

function applyCanonicalMap(items, canonicalMap) {
  const reviewGroups = new Map();
  const stats = {
    mappedItems: 0,
    mappedByCard: 0,
    mappedByName: 0,
    unresolvedItems: 0
  };

  const mappedItems = items.map((item) => {
    const originalName = cleanText(item.nameJa || item.name);
    const pilotParts = item.kind === 'pilot' ? splitPilotCardSuffix(originalName) : { base: originalName, suffix: '' };
    const lookupName = item.kind === 'pilot' ? pilotParts.base : originalName;
    const cardKey = makeCardKey(item);
    const nameKey = makeNameKey(item.kind, lookupName);

    const cardEntry = cardKey ? parseMapEntry(canonicalMap.cards[cardKey], `cards.${cardKey}`) : null;
    const nameEntry = parseMapEntry(canonicalMap.names[nameKey], `names.${nameKey}`);
    const entry = cardEntry || nameEntry;

    const next = { ...item, nameJa: originalName };

    if (entry) {
      next.name = finalizeMappedName(entry, item.kind, pilotParts.suffix);
      stats.mappedItems += 1;
      if (cardEntry) stats.mappedByCard += 1;
      else stats.mappedByName += 1;
      return next;
    }

    next.name = originalName;
    stats.unresolvedItems += 1;
    addReviewOccurrence(reviewGroups, {
      item,
      originalName,
      lookupName,
      pilotSuffix: pilotParts.suffix,
      cardKey,
      nameKey
    });
    return next;
  });

  return {
    items: mappedItems,
    stats,
    reviewItems: [...reviewGroups.values()]
      .map(finalizeReviewGroup)
      .sort(compareReviewItems)
  };
}

function buildReviewFile(catalog, result) {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    catalogGeneratedAt: catalog.generatedAt || '',
    instructions: [
      'This file contains only names not covered by data/canonical-name-map.json.',
      'Upload this file to ChatGPT for manual web-assisted research.',
      'The returned canonical-name-map.json should add verified entries under "names" for reusable mappings or "cards" for card-specific overrides.',
      'After committing the updated map, rerun the Update Altema catalog GitHub Action.'
    ],
    summary: {
      catalogItems: result.items.length,
      mappedItems: result.stats.mappedItems,
      unresolvedItems: result.stats.unresolvedItems,
      unresolvedUniqueNames: result.reviewItems.length
    },
    items: result.reviewItems
  };
}

function addReviewOccurrence(groups, info) {
  let group = groups.get(info.nameKey);
  if (!group) {
    group = {
      kind: info.item.kind,
      nameKey: info.nameKey,
      nameJa: info.lookupName,
      occurrences: 0,
      pilotCardIds: new Set(),
      cardKeys: new Set(),
      sourceUrls: new Set(),
      samples: []
    };
    groups.set(info.nameKey, group);
  }

  group.occurrences += 1;
  if (info.pilotSuffix) group.pilotCardIds.add(info.pilotSuffix.slice(1, -1));
  if (info.cardKey) group.cardKeys.add(info.cardKey);
  if (info.item.sourceUrl) group.sourceUrls.add(info.item.sourceUrl);

  if (group.samples.length < 5) {
    group.samples.push({
      id: info.item.id || '',
      cardKey: info.cardKey || '',
      originalNameJa: info.originalName,
      sourceUrl: info.item.sourceUrl || '',
      attribute: info.item.attribute || '',
      role: info.item.role || '',
      rating: info.item.rating || '',
      icon: info.item.icon || '',
      remoteIcon: info.item.remoteIcon || ''
    });
  }
}

function finalizeReviewGroup(group) {
  return {
    kind: group.kind,
    suggestedMapKey: group.nameKey,
    nameJa: group.nameJa,
    occurrences: group.occurrences,
    ...(group.pilotCardIds.size ? { pilotCardIds: [...group.pilotCardIds].sort() } : {}),
    cardKeys: [...group.cardKeys].sort(),
    sourceUrls: [...group.sourceUrls].sort(),
    samples: group.samples
  };
}

function parseMapEntry(raw, location) {
  if (raw == null) return null;

  if (typeof raw === 'string') {
    const name = cleanText(raw);
    if (!name) throw new Error(`Empty canonical name at ${location}.`);
    return { name, preservePilotCardId: true };
  }

  if (!isPlainObject(raw)) {
    throw new Error(`Canonical map entry ${location} must be a string or object.`);
  }

  const name = cleanText(raw.name);
  if (!name) throw new Error(`Canonical map entry ${location} is missing a non-empty "name".`);
  if (raw.verified === false) return null;

  return {
    ...raw,
    name,
    preservePilotCardId: raw.preservePilotCardId !== false
  };
}

function finalizeMappedName(entry, kind, pilotSuffix) {
  let name = entry.name;
  if (
    kind === 'pilot' &&
    pilotSuffix &&
    entry.preservePilotCardId !== false &&
    !name.endsWith(pilotSuffix)
  ) {
    name = `${name} ${pilotSuffix}`;
  }
  return name;
}

function makeCardKey(item) {
  const url = String(item.sourceUrl || '');
  const match = url.match(/\/gundamuce\/(ms|chara)\/(\d+)/i);
  if (match) {
    const kind = match[1].toLowerCase() === 'chara' ? 'pilot' : 'ms';
    return `${kind}:${match[2]}`;
  }
  return item.id ? `${item.kind || 'item'}:${item.id}` : '';
}

function makeNameKey(kind, name) {
  return `${kind}|${normalizeMapKeyText(name)}`;
}

function splitPilotCardSuffix(name) {
  const normalized = cleanText(name);
  const match = normalized.match(/\s*(\((?:C)?\d{4}\))\s*$/i);
  if (!match) return { base: normalized, suffix: '' };
  return {
    base: cleanText(normalized.slice(0, match.index)),
    suffix: match[1].toUpperCase().startsWith('(C') ? match[1].toUpperCase() : match[1]
  };
}

function normalizeMapKeyText(value) {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function compareReviewItems(a, b) {
  if (a.kind !== b.kind) return a.kind === 'ms' ? -1 : 1;
  return a.nameJa.localeCompare(b.nameJa, 'ja');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function runSelfTests() {
  const catalogItems = [
    {
      id: 'a',
      kind: 'ms',
      name: 'シナンジュ',
      sourceUrl: 'https://altema.jp/gundamuce/ms/123',
      attribute: '赤',
      role: '強襲'
    },
    {
      id: 'b',
      kind: 'pilot',
      name: 'ハマーン・カーン(C0456)',
      sourceUrl: 'https://altema.jp/gundamuce/chara/369'
    },
    {
      id: 'c',
      kind: 'pilot',
      name: 'ハマーン・カーン(C0378)',
      sourceUrl: 'https://altema.jp/gundamuce/chara/200'
    },
    {
      id: 'd',
      kind: 'pilot',
      name: 'イオ・フレミング(0215)',
      sourceUrl: 'https://altema.jp/gundamuce/chara/215'
    },
    {
      id: 'e',
      kind: 'ms',
      name: '未知のMS',
      sourceUrl: 'https://altema.jp/gundamuce/ms/999'
    }
  ];

  const map = {
    version: 1,
    cards: {
      'chara:never-used': { name: 'Wrong' },
      'pilot:215': { name: 'Io Fleming', source: 'manual-review', verified: true }
    },
    names: {
      'ms|シナンジュ': { name: 'Sinanju', verified: true },
      'pilot|ハマーン・カーン': { name: 'Haman Karn', verified: true }
    }
  };

  const result = applyCanonicalMap(catalogItems, map);
  assertEqual(result.items[0].name, 'Sinanju', 'MS reusable name mapping');
  assertEqual(result.items[1].name, 'Haman Karn (C0456)', 'pilot C-ID preservation 1');
  assertEqual(result.items[2].name, 'Haman Karn (C0378)', 'pilot C-ID preservation 2');
  assertEqual(result.items[3].name, 'Io Fleming (0215)', 'card override and numeric pilot suffix preservation');
  assertEqual(result.items[4].name, '未知のMS', 'unresolved Japanese name preservation');
  assertEqual(result.items[4].nameJa, '未知のMS', 'unresolved nameJa preservation');
  assertEqual(result.reviewItems.length, 1, 'review unique-name grouping');
  assertEqual(result.reviewItems[0].suggestedMapKey, 'ms|未知のMS', 'review suggested map key');
  assertEqual(result.stats.mappedItems, 4, 'mapped count');
  assertEqual(result.stats.unresolvedItems, 1, 'unresolved count');
  assertEqual(makeCardKey(catalogItems[0]), 'ms:123', 'MS source URL card key');
  assertEqual(makeCardKey(catalogItems[1]), 'pilot:369', 'pilot source URL card key');
  assertEqual(splitPilotCardSuffix('ハマーン・カーン(C0456)').base, 'ハマーン・カーン', 'pilot C-ID stripped for reusable map');

  console.log('canonical-name mapper self-tests passed');
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

await main();
