const MONTHS = ["This Month", "Next Month", "2 Months Later", "3 Months Later", "4 Months Later"];
const TIERS = [
  { id: "human", label: "Human Rights", color: "#ff4b59" },
  { id: "must", label: "Must Pull", color: "#ffa12a" },
  { id: "ideal", label: "Ideally Pull", color: "#47a9ff" },
  { id: "luxury", label: "Luxury Pull", color: "#a66bff" },
  { id: "skip", label: "Skip", color: "#9aa0ab" }
];
const LANE_COUNT = 4;
const WEEK_COUNT = 20;
const CELL_W = 200;
const LEFT_W = 260;
const MONTH_H = 58;
const WEEK_H = 48;
const HEADER_H = MONTH_H + WEEK_H;
const TIER_H = 330;
const ICON_W = 176;
const ICON_TOP = 28;
const BAR_TOP = 222;
const BAR_GAP = 23;
const STORAGE_KEY = "gundam-u-c-e-roadmap-builder-v1";

const DEFAULT_ROADMAP = {
  updated: new Date().toISOString(),
  units: [
    {
      id: crypto.randomUUID(),
      name: "Example MS",
      kind: "ms",
      tier: "must",
      week: 5,
      lane: 1,
      icon: "",
      badges: ["PvP", "DPS"],
      note: "Drag this card and resize its meta bar. Replace with an Altema catalog unit later.",
      metaStart: 5,
      metaEnd: 13,
      color: "#37e6ff"
    },
    {
      id: crypto.randomUUID(),
      name: "Example Pilot",
      kind: "pilot",
      tier: "ideal",
      week: 9,
      lane: 2,
      icon: "",
      badges: ["Pilot", "EX"],
      note: "Catalog items can be added directly once data/catalog.json is generated.",
      metaStart: 9,
      metaEnd: 17,
      color: "#67ef87"
    }
  ]
};

let state = structuredClone(DEFAULT_ROADMAP);
let catalog = [];
let selectedId = null;
let selectedPart = "unit";
let filterKind = "all";
let searchTerm = "";
let tooltipEl = null;
let drag = null;

const els = {
  roadmap: document.getElementById("roadmap"),
  catalogList: document.getElementById("catalogList"),
  catalogStatus: document.getElementById("catalogStatus"),
  saveStatus: document.getElementById("saveStatus"),
  editForm: document.getElementById("editForm"),
  noSelection: document.getElementById("noSelection"),
  catalogSearch: document.getElementById("catalogSearch"),
  importJson: document.getElementById("importJson")
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function tierIndex(id) { return Math.max(0, TIERS.findIndex(t => t.id === id)); }
function weekX(week) { return LEFT_W + (week - 1) * CELL_W; }
function tierY(tier) { return HEADER_H + tierIndex(tier) * TIER_H; }
function laneY(unit) { return tierY(unit.tier) + BAR_TOP + (unit.lane - 1) * BAR_GAP; }
function iconY(unit) { return tierY(unit.tier) + ICON_TOP; }
function iconX(unit) { return weekX(unit.week) + Math.round((CELL_W - ICON_W) / 2); }
function normalizeWeek(n) { return clamp(Math.round(Number(n) || 1), 1, WEEK_COUNT); }
function normalizeLane(n) { return clamp(Math.round(Number(n) || 1), 1, LANE_COUNT); }
function idOfWeekFromX(x) { return normalizeWeek(Math.round((x - LEFT_W - CELL_W / 2) / CELL_W) + 2); }
function idOfTierFromY(y) { return TIERS[clamp(Math.floor((y - HEADER_H) / TIER_H), 0, TIERS.length - 1)].id; }
function laneFromY(y, tier) {
  const top = tierY(tier) + BAR_TOP;
  return normalizeLane(Math.round((y - top) / BAR_GAP) + 1);
}
function setStatus(message) { els.saveStatus.textContent = message; }
function sanitizeText(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
function fileSafeName(name) { return sanitizeText(name).toLowerCase().replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/gi, "-").replace(/^-+|-+$/g, "") || "roadmap"; }

function init() {
  loadLocal();
  buildStaticGrid();
  buildTierSelect();
  renderAll();
  bindUI();
}

function buildStaticGrid() {
  els.roadmap.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "month-head";
  corner.style.left = "0px";
  corner.style.width = `${LEFT_W}px`;
  corner.textContent = "";
  els.roadmap.appendChild(corner);

  MONTHS.forEach((month, i) => {
    const head = document.createElement("div");
    head.className = "month-head";
    head.style.left = `${LEFT_W + i * 4 * CELL_W}px`;
    head.style.width = `${4 * CELL_W}px`;
    head.textContent = month;
    els.roadmap.appendChild(head);
  });

  for (let w = 1; w <= WEEK_COUNT; w++) {
    const week = document.createElement("div");
    week.className = "week-head";
    week.style.left = `${weekX(w)}px`;
    week.textContent = `W${((w - 1) % 4) + 1}`;
    els.roadmap.appendChild(week);
  }

  TIERS.forEach((tier, i) => {
    const label = document.createElement("div");
    label.className = `tier-label ${tier.id}`;
    label.style.top = `${HEADER_H + i * TIER_H}px`;
    label.textContent = tier.label;
    els.roadmap.appendChild(label);
  });

  for (let w = 0; w <= WEEK_COUNT; w++) {
    const line = document.createElement("div");
    line.className = `grid-line v${w % 4 === 0 ? " month" : ""}`;
    line.style.left = `${LEFT_W + w * CELL_W}px`;
    els.roadmap.appendChild(line);
  }

  for (let r = 0; r <= TIERS.length; r++) {
    const line = document.createElement("div");
    line.className = "grid-line h";
    line.style.top = `${HEADER_H + r * TIER_H}px`;
    els.roadmap.appendChild(line);
  }

  TIERS.forEach((tier) => {
    for (let lane = 1; lane <= LANE_COUNT; lane++) {
      const line = document.createElement("div");
      line.className = "lane-line";
      line.style.top = `${tierY(tier.id) + BAR_TOP + (lane - 1) * BAR_GAP + 9}px`;
      els.roadmap.appendChild(line);
    }
  });
}

function buildTierSelect() {
  const select = els.editForm.elements.tier;
  select.innerHTML = TIERS.map(t => `<option value="${t.id}">${t.label}</option>`).join("");
}

function bindUI() {
  document.getElementById("btnAddBlank").addEventListener("click", () => addUnit({ name: "New Unit", kind: "custom" }));
  document.getElementById("btnExportJson").addEventListener("click", exportJson);
  document.getElementById("btnSaveLocal").addEventListener("click", saveLocal);
  document.getElementById("btnClearLocal").addEventListener("click", clearLocal);
  document.getElementById("btnExportPng").addEventListener("click", exportPng);
  document.getElementById("btnLoadCatalog").addEventListener("click", loadCatalog);
  document.getElementById("btnLiveFetch").addEventListener("click", liveFetchCatalog);
  document.getElementById("btnDelete").addEventListener("click", deleteSelected);

  els.catalogSearch.addEventListener("input", (e) => {
    searchTerm = e.target.value.toLowerCase().trim();
    renderCatalog();
  });

  document.querySelectorAll(".seg").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".seg").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      filterKind = btn.dataset.kind;
      renderCatalog();
    });
  });

  els.importJson.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const json = JSON.parse(text);
      state = { updated: new Date().toISOString(), units: Array.isArray(json) ? json : (json.units || []) };
      normalizeState();
      selectedId = null;
      renderAll();
      setStatus(`Imported ${state.units.length} unit(s).`);
    } catch (error) {
      alert(`Could not import JSON: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  });

  els.editForm.addEventListener("submit", (event) => {
    event.preventDefault();
    applyForm();
  });

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Delete" || event.key === "Backspace") {
      if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") deleteSelected();
    }
  });
}

function normalizeState() {
  state.units = (state.units || []).map((u) => ({
    id: u.id || crypto.randomUUID(),
    name: sanitizeText(u.name || "Unnamed Unit"),
    kind: u.kind || "custom",
    tier: TIERS.some(t => t.id === u.tier) ? u.tier : "must",
    week: normalizeWeek(u.week || 1),
    lane: normalizeLane(u.lane || 1),
    icon: u.icon || "",
    badges: Array.isArray(u.badges) ? u.badges.map(sanitizeText).filter(Boolean).slice(0, 8) : [],
    note: u.note || "",
    metaStart: normalizeWeek(u.metaStart || u.week || 1),
    metaEnd: normalizeWeek(u.metaEnd || u.metaStart || u.week || 1),
    color: /^#[0-9a-f]{6}$/i.test(u.color || "") ? u.color : defaultColorForKind(u.kind)
  })).map(u => ({ ...u, metaStart: Math.min(u.metaStart, u.metaEnd), metaEnd: Math.max(u.metaStart, u.metaEnd) }));
}

function renderAll() {
  normalizeState();
  buildStaticGrid();
  renderUnits();
  renderForm();
}

function renderUnits() {
  state.units.forEach(unit => {
    const card = document.createElement("article");
    card.className = `unit-card${selectedId === unit.id && selectedPart === "unit" ? " selected" : ""}`;
    card.dataset.id = unit.id;
    card.style.left = `${iconX(unit)}px`;
    card.style.top = `${iconY(unit)}px`;
    card.title = unit.note || unit.name;

    if (unit.icon) {
      const img = document.createElement("img");
      img.src = unit.icon;
      img.alt = unit.name;
      img.crossOrigin = "anonymous";
      img.onerror = () => { img.replaceWith(placeholder(unit.name)); };
      card.appendChild(img);
    } else {
      card.appendChild(placeholder(unit.name));
    }

    const badges = document.createElement("div");
    badges.className = "badges";
    unit.badges.slice(0, 5).forEach(b => {
      const span = document.createElement("span");
      span.className = "badge";
      span.textContent = b;
      badges.appendChild(span);
    });
    card.appendChild(badges);

    if (unit.note) {
      const note = document.createElement("div");
      note.className = "note-pin";
      note.textContent = "i";
      card.appendChild(note);
    }

    const plate = document.createElement("div");
    plate.className = "nameplate";
    plate.textContent = unit.name;
    card.appendChild(plate);

    card.addEventListener("pointerdown", (event) => beginDragUnit(event, unit.id));
    card.addEventListener("click", (event) => { event.stopPropagation(); select(unit.id, "unit"); });
    card.addEventListener("mouseenter", (event) => showTooltip(event, unit));
    card.addEventListener("mouseleave", hideTooltip);
    card.addEventListener("pointermove", moveTooltip);
    els.roadmap.appendChild(card);

    const bar = document.createElement("div");
    bar.className = `meta-bar${selectedId === unit.id && selectedPart === "bar" ? " selected" : ""}`;
    bar.dataset.id = unit.id;
    bar.style.left = `${weekX(unit.metaStart) + 12}px`;
    bar.style.top = `${laneY(unit)}px`;
    bar.style.width = `${(unit.metaEnd - unit.metaStart + 1) * CELL_W - 24}px`;
    bar.style.setProperty("--bar", unit.color || defaultColorForKind(unit.kind));
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = unit.name;
    bar.appendChild(label);
    const left = document.createElement("span");
    left.className = "handle left";
    left.dataset.handle = "left";
    const right = document.createElement("span");
    right.className = "handle right";
    right.dataset.handle = "right";
    bar.append(left, right);
    bar.addEventListener("pointerdown", (event) => beginDragBar(event, unit.id));
    bar.addEventListener("click", (event) => { event.stopPropagation(); select(unit.id, "bar"); });
    bar.addEventListener("mouseenter", (event) => showTooltip(event, unit));
    bar.addEventListener("mouseleave", hideTooltip);
    bar.addEventListener("pointermove", moveTooltip);
    els.roadmap.appendChild(bar);
  });

  els.roadmap.addEventListener("click", (event) => {
    if (event.target === els.roadmap) select(null);
  }, { once: true });
}

function placeholder(name) {
  const div = document.createElement("div");
  div.className = "placeholder";
  div.textContent = initials(name);
  return div;
}

function initials(name) {
  const parts = sanitizeText(name).split(/[\s・()\-_/]+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function defaultColorForKind(kind) {
  if (kind === "pilot") return "#67ef87";
  if (kind === "ms") return "#37e6ff";
  return "#c18cff";
}

function select(id, part = "unit") {
  selectedId = id;
  selectedPart = part;
  renderAll();
}

function getSelected() { return state.units.find(u => u.id === selectedId); }

function renderForm() {
  const unit = getSelected();
  if (!unit) {
    els.noSelection.classList.remove("hidden");
    els.editForm.classList.add("hidden");
    return;
  }
  els.noSelection.classList.add("hidden");
  els.editForm.classList.remove("hidden");
  const f = els.editForm.elements;
  f.name.value = unit.name;
  f.icon.value = unit.icon;
  f.kind.value = unit.kind;
  f.tier.value = unit.tier;
  f.week.value = unit.week;
  f.lane.value = unit.lane;
  f.metaStart.value = unit.metaStart;
  f.metaEnd.value = unit.metaEnd;
  f.badges.value = unit.badges.join(", ");
  f.color.value = unit.color || defaultColorForKind(unit.kind);
  f.note.value = unit.note;
}

function applyForm() {
  const unit = getSelected();
  if (!unit) return;
  const f = els.editForm.elements;
  unit.name = sanitizeText(f.name.value) || "Unnamed Unit";
  unit.icon = f.icon.value.trim();
  unit.kind = f.kind.value;
  unit.tier = f.tier.value;
  unit.week = normalizeWeek(f.week.value);
  unit.lane = normalizeLane(f.lane.value);
  unit.metaStart = normalizeWeek(f.metaStart.value);
  unit.metaEnd = normalizeWeek(f.metaEnd.value);
  if (unit.metaEnd < unit.metaStart) [unit.metaStart, unit.metaEnd] = [unit.metaEnd, unit.metaStart];
  unit.badges = f.badges.value.split(",").map(sanitizeText).filter(Boolean).slice(0, 8);
  unit.color = f.color.value;
  unit.note = f.note.value.trim();
  state.updated = new Date().toISOString();
  renderAll();
  autoSave();
}

function addUnit(partial = {}) {
  const newUnit = {
    id: crypto.randomUUID(),
    name: partial.name || "New Unit",
    kind: partial.kind || "custom",
    tier: partial.tier || "must",
    week: partial.week || 1,
    lane: partial.lane || 1,
    icon: partial.icon || "",
    badges: partial.badges || [],
    note: partial.note || "",
    metaStart: partial.metaStart || partial.week || 1,
    metaEnd: partial.metaEnd || Math.min(WEEK_COUNT, (partial.week || 1) + 5),
    color: partial.color || defaultColorForKind(partial.kind)
  };
  state.units.push(newUnit);
  state.updated = new Date().toISOString();
  select(newUnit.id, "unit");
  autoSave();
}

function deleteSelected() {
  if (!selectedId) return;
  state.units = state.units.filter(u => u.id !== selectedId);
  selectedId = null;
  state.updated = new Date().toISOString();
  renderAll();
  autoSave();
}

function beginDragUnit(event, id) {
  if (event.button !== 0) return;
  const unit = state.units.find(u => u.id === id);
  if (!unit) return;
  select(id, "unit");
  const rect = els.roadmap.getBoundingClientRect();
  drag = {
    type: "unit",
    id,
    startX: event.clientX,
    startY: event.clientY,
    originLeft: iconX(unit),
    originTop: iconY(unit),
    rect
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function beginDragBar(event, id) {
  if (event.button !== 0) return;
  const unit = state.units.find(u => u.id === id);
  if (!unit) return;
  select(id, "bar");
  const handle = event.target.dataset.handle || "move";
  drag = {
    type: "bar",
    handle,
    id,
    startX: event.clientX,
    startY: event.clientY,
    originStart: unit.metaStart,
    originEnd: unit.metaEnd,
    originLane: unit.lane,
    originTier: unit.tier
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!drag) return;
  const unit = state.units.find(u => u.id === drag.id);
  if (!unit) return;

  if (drag.type === "unit") {
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    const rawX = drag.originLeft + dx;
    const rawY = drag.originTop + dy;
    unit.week = idOfWeekFromX(rawX + ICON_W / 2);
    unit.tier = idOfTierFromY(rawY + ICON_W / 2);
    unit.metaStart = clamp(unit.metaStart, 1, WEEK_COUNT);
    unit.metaEnd = clamp(unit.metaEnd, unit.metaStart, WEEK_COUNT);
    renderAll();
  }

  if (drag.type === "bar") {
    const dxWeeks = Math.round((event.clientX - drag.startX) / CELL_W);
    const dy = event.clientY - drag.startY;
    if (drag.handle === "left") {
      unit.metaStart = clamp(drag.originStart + dxWeeks, 1, unit.metaEnd);
    } else if (drag.handle === "right") {
      unit.metaEnd = clamp(drag.originEnd + dxWeeks, unit.metaStart, WEEK_COUNT);
    } else {
      const span = drag.originEnd - drag.originStart;
      const newStart = clamp(drag.originStart + dxWeeks, 1, WEEK_COUNT - span);
      unit.metaStart = newStart;
      unit.metaEnd = newStart + span;
      const tier = idOfTierFromY(tierY(drag.originTier) + BAR_TOP + (drag.originLane - 1) * BAR_GAP + dy);
      unit.tier = tier;
      unit.lane = laneFromY(tierY(drag.originTier) + BAR_TOP + (drag.originLane - 1) * BAR_GAP + dy, tier);
    }
    renderAll();
  }
}

function onPointerUp() {
  if (!drag) return;
  drag = null;
  state.updated = new Date().toISOString();
  autoSave();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setStatus(`Saved locally at ${new Date().toLocaleTimeString()}.`);
}
function autoSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setStatus("Auto-saved locally. Export JSON when you want to commit changes.");
}
function loadLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    state = JSON.parse(saved);
    normalizeState();
  } catch { state = structuredClone(DEFAULT_ROADMAP); }
}
function clearLocal() {
  if (!confirm("Clear local saved roadmap and reset to examples?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(DEFAULT_ROADMAP);
  selectedId = null;
  renderAll();
  setStatus("Local data cleared.");
}
function exportJson() {
  const blob = new Blob([JSON.stringify({ ...state, updated: new Date().toISOString() }, null, 2)], { type: "application/json" });
  downloadBlob(blob, `gundam-u-c-e-roadmap-${new Date().toISOString().slice(0,10)}.json`);
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPng() {
  setStatus("Rendering PNG…");
  try {
    // Re-render once to remove selected outlines from export.
    const previous = selectedId;
    selectedId = null;
    renderAll();
    await new Promise(r => requestAnimationFrame(r));

    const width = LEFT_W + WEEK_COUNT * CELL_W;
    const height = HEADER_H + TIERS.length * TIER_H;
    const clone = els.roadmap.cloneNode(true);
    clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
    clone.style.margin = "0";

    const css = Array.from(document.styleSheets)
      .map(sheet => {
        try { return Array.from(sheet.cssRules).map(rule => rule.cssText).join("\n"); }
        catch { return ""; }
      }).join("\n");

    const html = `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><style>${css}</style></head><body>${clone.outerHTML}</body></html>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${html.replace(/#/g, "%23")}</foreignObject></svg>`;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) throw new Error("PNG render failed");
        downloadBlob(png, `gundam-u-c-e-roadmap-${new Date().toISOString().slice(0,10)}.png`);
        selectedId = previous;
        renderAll();
        setStatus("PNG exported.");
      }, "image/png");
    };
    img.onerror = () => {
      selectedId = previous;
      renderAll();
      URL.revokeObjectURL(url);
      alert("PNG export failed. This usually happens if remote icons block canvas export. Run the GitHub Action scraper so icons are hosted locally, then try again.");
      setStatus("PNG export failed.");
    };
    img.src = url;
  } catch (error) {
    alert(error.message);
    setStatus("PNG export failed.");
  }
}

async function loadCatalog() {
  els.catalogStatus.textContent = "Loading data/catalog.json…";
  try {
    const response = await fetch("data/catalog.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    catalog = Array.isArray(data) ? data : (data.items || []);
    els.catalogStatus.textContent = `Loaded ${catalog.length} catalog item(s).`;
    renderCatalog();
  } catch (error) {
    els.catalogStatus.textContent = `Could not load local catalog: ${error.message}`;
  }
}

function renderCatalog() {
  const template = document.getElementById("catalogItemTemplate");
  const list = catalog.filter(item => {
    const kindOk = filterKind === "all" || item.kind === filterKind || item.type === filterKind;
    const haystack = `${item.name || ""} ${item.kind || item.type || ""} ${item.attribute || ""} ${item.role || ""} ${item.rating || ""}`.toLowerCase();
    return kindOk && (!searchTerm || haystack.includes(searchTerm));
  }).slice(0, 250);
  els.catalogList.innerHTML = "";
  list.forEach(item => {
    const node = template.content.firstElementChild.cloneNode(true);
    const img = node.querySelector("img");
    img.src = item.icon || "";
    img.alt = item.name || "";
    img.onerror = () => { img.src = placeholderDataUrl(item.name); };
    node.querySelector("strong").textContent = item.name || "Unnamed";
    const meta = [item.kind || item.type, item.attribute, item.role, item.rating ? `${item.rating}点` : ""].filter(Boolean).join(" · ");
    node.querySelector("small").textContent = meta;
    node.querySelector("button").addEventListener("click", () => {
      addUnit({
        name: item.name,
        kind: item.kind || item.type || "custom",
        icon: item.icon || "",
        badges: defaultBadges(item),
        note: item.sourceUrl ? `Source: ${item.sourceUrl}` : "",
        color: defaultColorForKind(item.kind || item.type)
      });
    });
    els.catalogList.appendChild(node);
  });
}

function defaultBadges(item) {
  const badges = [];
  if ((item.kind || item.type) === "pilot") badges.push("Pilot");
  if ((item.kind || item.type) === "ms") badges.push("MS");
  if (item.role) badges.push(item.role);
  if (item.attribute) badges.push(item.attribute);
  return badges.slice(0, 4);
}

function placeholderDataUrl(name) {
  const label = initials(name || "?").slice(0, 2);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='%23131b25'/><text x='48' y='54' text-anchor='middle' font-family='Arial' font-size='26' fill='%23d9e4f5' font-weight='700'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

async function liveFetchCatalog() {
  els.catalogStatus.textContent = "Trying live Altema fetch…";
  try {
    const msHtml = await fetchTextMaybeProxy("https://altema.jp/gundamuce/msrea/4");
    const pilotHtml = await fetchTextMaybeProxy("https://altema.jp/gundamuce/chararea/4");
    const ms = parseAltemaList(msHtml, "ms", "https://altema.jp/gundamuce/msrea/4");
    const pilots = parseAltemaList(pilotHtml, "pilot", "https://altema.jp/gundamuce/chararea/4");
    catalog = [...ms, ...pilots];
    els.catalogStatus.textContent = `Live fetched ${catalog.length} item(s). Remote images may not export to PNG; GitHub Action local icons are better.`;
    renderCatalog();
  } catch (error) {
    els.catalogStatus.textContent = `Live fetch failed: ${error.message}`;
    alert("Live fetch failed. This is expected on many browsers because static sites cannot always read third-party pages. Use the included GitHub Action scraper to generate data/catalog.json and local icons.");
  }
}

async function fetchTextMaybeProxy(url) {
  try {
    const direct = await fetch(url, { cache: "no-store" });
    if (direct.ok) return await direct.text();
  } catch {}
  const proxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
  const response = await fetch(proxy, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.text();
}

function parseAltemaList(html, kind, baseUrl) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = Array.from(doc.querySelectorAll("tr"));
  const out = [];
  for (const row of rows) {
    const text = sanitizeText(row.textContent);
    if (!/\d+(?:\.\d+)?\s*点/.test(text)) continue;
    const a = row.querySelector('a[href*="/gundamuce/"]');
    if (!a) continue;
    const name = sanitizeText(a.textContent || a.getAttribute("title") || "");
    if (!name || name.includes("一覧")) continue;
    const href = new URL(a.getAttribute("href"), baseUrl).href;
    const img = row.querySelector("img");
    const icon = img ? absolutize(img.getAttribute("data-src") || img.getAttribute("src") || "", baseUrl) : "";
    const cells = Array.from(row.querySelectorAll("td,th")).map(c => sanitizeText(c.textContent));
    const rating = (text.match(/(\d+(?:\.\d+)?)\s*点/) || [])[1] || "";
    out.push({
      id: `live-${kind}-${out.length + 1}`,
      kind,
      name,
      icon,
      sourceUrl: href,
      attribute: kind === "ms" ? findFirst(cells, ["赤", "青", "緑", "黄", "紫"]) : "",
      role: kind === "ms" ? findFirst(cells, ["強襲", "重装", "汎用", "砲撃", "狙撃", "白兵", "支援"]) : "",
      rating
    });
  }
  return uniqueByName(out);
}
function absolutize(url, base) {
  if (!url) return "";
  try { return new URL(url, base).href; } catch { return url; }
}
function findFirst(cells, values) {
  return values.find(v => cells.some(c => c.includes(v))) || "";
}
function uniqueByName(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.kind}-${item.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function showTooltip(event, unit) {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = "tooltip";
  tooltipEl.innerHTML = `<strong>${escapeHtml(unit.name)}</strong><div>${escapeHtml(TIERS[tierIndex(unit.tier)].label)} · W${unit.week} · lane ${unit.lane}</div><div>Meta: W${unit.metaStart}–W${unit.metaEnd}</div>${unit.badges.length ? `<div>Badges: ${unit.badges.map(escapeHtml).join(", ")}</div>` : ""}${unit.note ? `<p>${escapeHtml(unit.note)}</p>` : ""}`;
  document.body.appendChild(tooltipEl);
  moveTooltip(event);
}
function moveTooltip(event) {
  if (!tooltipEl) return;
  tooltipEl.style.left = `${event.clientX + 14}px`;
  tooltipEl.style.top = `${event.clientY + 14}px`;
}
function hideTooltip() { tooltipEl?.remove(); tooltipEl = null; }
function escapeHtml(text) { return String(text || "").replace(/[&<>'"]/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch])); }

init();
