const MONTHS = ["This Month", "Next Month", "2 Months Later", "3 Months Later", "4 Months Later"];
const TIERS = [
  { id: "human", label: "Human Rights", color: "#ff4b59" },
  { id: "must", label: "Must Pull", color: "#ffa12a" },
  { id: "ideal", label: "Ideally Pull", color: "#47a9ff" },
  { id: "luxury", label: "Luxury Pull", color: "#a66bff" },
  { id: "skip", label: "Skip", color: "#9aa0ab" }
];
const META_STATUSES = [
  { id: "top", label: "Top meta", color: "#37e6ff" },
  { id: "strong", label: "Strong", color: "#67ef87" },
  { id: "niche", label: "Niche", color: "#c18cff" },
  { id: "fading", label: "Fading", color: "#ffcc4d" },
  { id: "custom", label: "Custom", color: "#8aa0ff" }
];
const TAG_OPTIONS = ["PVP", "PVE", "Core", "Tech", "Def"];
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
const BAR_H = 18;
const STORAGE_KEY = "gundam-u-c-e-roadmap-builder-v1";
const ZOOM_STORAGE_KEY = "gundam-u-c-e-roadmap-builder-zoom-v2";

const DEFAULT_ROADMAP = {
  updated: new Date().toISOString(),
  units: []
};

let state = structuredClone(DEFAULT_ROADMAP);
let catalog = [];
let selectedId = null;
let selectedPart = "unit";
let filterKind = "all";
let searchTerm = "";
let tooltipEl = null;
let drag = null;
let suppressRoadmapClick = false;
let zoomScale = Number(localStorage.getItem(ZOOM_STORAGE_KEY) || "1") || 1;

const els = {
  roadmap: document.getElementById("roadmap"),
  roadmapStage: document.getElementById("roadmapStage"),
  chartScroll: document.getElementById("chartScroll"),
  catalogList: document.getElementById("catalogList"),
  catalogStatus: document.getElementById("catalogStatus"),
  saveStatus: document.getElementById("saveStatus"),
  editForm: document.getElementById("editForm"),
  noSelection: document.getElementById("noSelection"),
  catalogSearch: document.getElementById("catalogSearch"),
  importJson: document.getElementById("importJson"),
  zoomRange: document.getElementById("zoomRange"),
  zoomLabel: document.getElementById("zoomLabel"),
  tagDropdown: document.getElementById("tagDropdown"),
  tagPreview: document.getElementById("tagPreview")
};

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function tierIndex(id) { return Math.max(0, TIERS.findIndex(t => t.id === id)); }
function metaStatus(id) { return META_STATUSES.find(s => s.id === id) || META_STATUSES[1]; }
function weekX(week) { return LEFT_W + (week - 1) * CELL_W; }
function tierY(tier) { return HEADER_H + tierIndex(tier) * TIER_H; }
function laneY(unitOrTier, laneMaybe) {
  const tier = typeof unitOrTier === "string" ? unitOrTier : unitOrTier.tier;
  const lane = typeof unitOrTier === "string" ? laneMaybe : unitOrTier.lane;
  return tierY(tier) + BAR_TOP + (lane - 1) * BAR_GAP;
}
function laneCenterY(tier, lane) { return laneY(tier, lane) + BAR_H / 2; }
function iconY(unit) { return tierY(unit.tier) + ICON_TOP; }
function iconX(unit) { return weekX(unit.week) + Math.round((CELL_W - ICON_W) / 2); }
function normalizeWeek(n) { return clamp(Math.round(Number(n) || 1), 1, WEEK_COUNT); }
function normalizeLane(n) { return clamp(Math.round(Number(n) || 1), 1, LANE_COUNT); }
function idOfWeekFromX(x) { return normalizeWeek(Math.round((x - LEFT_W - CELL_W / 2) / CELL_W) + 1); }
function idOfTierFromY(y) { return TIERS[clamp(Math.floor((y - HEADER_H) / TIER_H), 0, TIERS.length - 1)].id; }
function laneFromY(y, tier) {
  const firstCenter = laneCenterY(tier, 1);
  return normalizeLane(Math.round((y - firstCenter) / BAR_GAP) + 1);
}
function chartPoint(event) {
  const rect = els.roadmap.getBoundingClientRect();
  return { x: (event.clientX - rect.left) / zoomScale, y: (event.clientY - rect.top) / zoomScale };
}
function baseChartWidth() { return LEFT_W + WEEK_COUNT * CELL_W; }
function baseChartHeight() { return HEADER_H + TIERS.length * TIER_H; }
function setStatus(message) { els.saveStatus.textContent = message; }
function sanitizeText(text) { return String(text || "").replace(/\s+/g, " ").trim(); }
function cleanTags(tags) {
  const out = [];
  (tags || []).forEach(tag => {
    const clean = sanitizeText(tag);
    if (clean && !out.some(t => t.toLowerCase() === clean.toLowerCase())) out.push(clean);
  });
  return out.slice(0, 8);
}
function statusColor(id) { return metaStatus(id).color; }
function barColor(unit) { return unit.metaStatus === "custom" ? (unit.color || metaStatus("custom").color) : statusColor(unit.metaStatus); }
function defaultMetaStatusForKind(kind) { return kind === "custom" ? "niche" : "strong"; }
function defaultColorForKind(kind) { return statusColor(defaultMetaStatusForKind(kind)); }

function init() {
  const loadedFromHash = loadFromShareHash();
  if (!loadedFromHash) loadLocal();
  buildStaticGrid();
  buildTierSelect();
  buildMetaStatusSelect();
  bindUI();
  renderAll();
  setZoom(zoomScale, false);
  maybeLoadPublishedRoadmap();
}

function buildStaticGrid() {
  els.roadmap.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "month-head corner";
  corner.style.left = "0px";
  corner.style.width = `${LEFT_W}px`;
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
      const track = document.createElement("div");
      track.className = "lane-track";
      track.style.top = `${laneY(tier.id, lane)}px`;
      els.roadmap.appendChild(track);
    }
  });
}

function buildTierSelect() {
  const select = els.editForm.elements.tier;
  select.innerHTML = TIERS.map(t => `<option value="${t.id}">${t.label}</option>`).join("");
}

function buildMetaStatusSelect() {
  const select = els.editForm.elements.metaStatus;
  select.innerHTML = META_STATUSES.map(s => `<option value="${s.id}">${s.label}</option>`).join("");
}

function bindUI() {
  document.getElementById("btnAddBlank").addEventListener("click", () => addUnit({ name: "New Unit", kind: "custom" }));
  document.getElementById("btnExportJson").addEventListener("click", exportJson);
  document.getElementById("btnCopyShareLink").addEventListener("click", copyShareLink);
  document.getElementById("btnSaveLocal").addEventListener("click", saveLocal);
  document.getElementById("btnClearLocal").addEventListener("click", clearLocal);
  document.getElementById("btnExportPng").addEventListener("click", exportPng);
  document.getElementById("btnLoadCatalog").addEventListener("click", loadCatalog);
  document.getElementById("btnDelete").addEventListener("click", deleteSelected);
  document.getElementById("btnZoomOut").addEventListener("click", () => setZoom(zoomScale - 0.1));
  document.getElementById("btnZoomIn").addEventListener("click", () => setZoom(zoomScale + 0.1));
  document.getElementById("btnZoomReset").addEventListener("click", () => setZoom(1));
  els.zoomRange.addEventListener("input", () => setZoom(Number(els.zoomRange.value) / 100));
  document.getElementById("btnAddTag").addEventListener("click", addTagFromDropdown);
  document.getElementById("btnClearTags").addEventListener("click", clearTagsForSelected);
  els.editForm.elements.tags.addEventListener("input", renderTagPreview);
  els.editForm.elements.metaStatus.addEventListener("change", () => {
    const f = els.editForm.elements;
    if (f.metaStatus.value !== "custom") f.color.value = statusColor(f.metaStatus.value);
  });
  els.editForm.elements.color.addEventListener("input", () => {
    els.editForm.elements.metaStatus.value = "custom";
  });

  els.roadmap.addEventListener("click", (event) => {
    if (suppressRoadmapClick) {
      suppressRoadmapClick = false;
      return;
    }
    if (!event.target.closest(".unit-card,.meta-bar")) select(null);
  });

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
      autoSave();
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
      const active = document.activeElement?.tagName;
      if (selectedId && active !== "INPUT" && active !== "TEXTAREA" && active !== "SELECT") deleteSelected();
    }
  });
}

function normalizeState() {
  state.units = (state.units || []).map((u) => {
    const metaId = META_STATUSES.some(s => s.id === u.metaStatus) ? u.metaStatus : defaultMetaStatusForKind(u.kind || "custom");
    const color = /^#[0-9a-f]{6}$/i.test(u.color || "") ? u.color : statusColor(metaId);
    const rawTags = Array.isArray(u.tags) ? u.tags : (Array.isArray(u.badges) ? u.badges : []);
    const metaStart = normalizeWeek(u.metaStart || u.week || 1);
    const metaEnd = normalizeWeek(u.metaEnd || u.metaStart || u.week || 1);
    return {
      id: u.id || crypto.randomUUID(),
      name: sanitizeText(u.name || "Unnamed Unit"),
      kind: u.kind || "custom",
      tier: TIERS.some(t => t.id === u.tier) ? u.tier : "must",
      week: normalizeWeek(u.week || 1),
      lane: normalizeLane(u.lane || 1),
      icon: u.icon || "",
      tags: cleanTags(rawTags),
      note: u.note || "",
      metaStart: Math.min(metaStart, metaEnd),
      metaEnd: Math.max(metaStart, metaEnd),
      metaStatus: metaId,
      color
    };
  });
}

function renderAll() {
  normalizeState();
  buildStaticGrid();
  renderUnits();
  renderForm();
  applyZoom();
}

function renderUnits() {
  state.units.forEach(unit => {
    const card = document.createElement("article");
    const isDraggingUnit = drag?.type === "unit" && drag.id === unit.id && Number.isFinite(drag.previewLeft);
    card.className = `unit-card${selectedId === unit.id && selectedPart === "unit" ? " selected" : ""}${isDraggingUnit ? " dragging" : ""}`;
    card.dataset.id = unit.id;
    card.style.left = `${isDraggingUnit ? drag.previewLeft : iconX(unit)}px`;
    card.style.top = `${isDraggingUnit ? drag.previewTop : iconY(unit)}px`;
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

    const tags = document.createElement("div");
    tags.className = "tags";
    unit.tags.slice(0, 6).forEach(t => {
      const span = document.createElement("span");
      span.className = `tag ${tagClass(t)}`;
      span.textContent = t;
      tags.appendChild(span);
    });
    card.appendChild(tags);

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
    bar.className = `meta-bar status-${unit.metaStatus}${selectedId === unit.id && selectedPart === "bar" ? " selected" : ""}`;
    bar.dataset.id = unit.id;
    bar.style.left = `${weekX(unit.metaStart) + 12}px`;
    bar.style.top = `${laneY(unit)}px`;
    bar.style.width = `${(unit.metaEnd - unit.metaStart + 1) * CELL_W - 24}px`;
    bar.style.setProperty("--bar", barColor(unit));
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = `${metaStatus(unit.metaStatus).label}: ${unit.name}`;
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
}

function tagClass(tag) {
  const t = String(tag || "").toLowerCase();
  if (t === "pvp") return "pvp";
  if (t === "pve") return "pve";
  if (t === "core") return "core";
  if (t === "tech") return "tech";
  if (t === "def") return "def";
  return "custom";
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

function select(id, part = "unit") {
  selectedId = id;
  selectedPart = part;
  refreshSelectionUi();
  renderForm();
}

function refreshSelectionUi() {
  document.querySelectorAll(".unit-card").forEach(card => {
    card.classList.toggle("selected", card.dataset.id === selectedId && selectedPart === "unit");
  });
  document.querySelectorAll(".meta-bar").forEach(bar => {
    bar.classList.toggle("selected", bar.dataset.id === selectedId && selectedPart === "bar");
  });
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
  f.tags.value = unit.tags.join(", ");
  f.metaStatus.value = unit.metaStatus;
  f.color.value = unit.color || statusColor(unit.metaStatus);
  f.note.value = unit.note;
  document.querySelector(".custom-color-field")?.classList.toggle("is-muted", unit.metaStatus !== "custom");
  renderTagPreview();
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
  unit.tags = cleanTags(f.tags.value.split(","));
  unit.metaStatus = f.metaStatus.value;
  unit.color = unit.metaStatus === "custom" ? f.color.value : statusColor(unit.metaStatus);
  unit.note = f.note.value.trim();
  state.updated = new Date().toISOString();
  renderAll();
  autoSave();
}

function addUnit(partial = {}) {
  const metaStatusId = partial.metaStatus || defaultMetaStatusForKind(partial.kind || "custom");
  const newUnit = {
    id: crypto.randomUUID(),
    name: partial.name || "New Unit",
    kind: partial.kind || "custom",
    tier: partial.tier || "must",
    week: partial.week || 1,
    lane: partial.lane || 1,
    icon: partial.icon || "",
    tags: cleanTags(partial.tags || partial.badges || []),
    note: partial.note || "",
    metaStart: partial.metaStart || partial.week || 1,
    metaEnd: partial.metaEnd || Math.min(WEEK_COUNT, (partial.week || 1) + 5),
    metaStatus: metaStatusId,
    color: partial.color || statusColor(metaStatusId)
  };
  state.units.push(newUnit);
  state.updated = new Date().toISOString();
  selectedId = newUnit.id;
  selectedPart = "unit";
  renderAll();
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
  event.stopPropagation();
  select(id, "unit");
  const point = chartPoint(event);
  const originLeft = iconX(unit);
  const originTop = iconY(unit);
  drag = {
    type: "unit",
    id,
    startX: point.x,
    startY: point.y,
    originLeft,
    originTop,
    offsetX: point.x - originLeft,
    offsetY: point.y - originTop,
    previewLeft: originLeft,
    previewTop: originTop,
    didMove: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function beginDragBar(event, id) {
  if (event.button !== 0) return;
  const unit = state.units.find(u => u.id === id);
  if (!unit) return;
  event.stopPropagation();
  select(id, "bar");
  const handle = event.target.dataset.handle || "move";
  const point = chartPoint(event);
  drag = {
    type: "bar",
    handle,
    id,
    startX: point.x,
    startY: point.y,
    originStart: unit.metaStart,
    originEnd: unit.metaEnd,
    originLane: unit.lane,
    originTier: unit.tier,
    didMove: false
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event) {
  if (!drag) return;
  const unit = state.units.find(u => u.id === drag.id);
  if (!unit) return;
  const point = chartPoint(event);
  if (Math.abs(point.x - drag.startX) > 3 || Math.abs(point.y - drag.startY) > 3) drag.didMove = true;

  if (drag.type === "unit") {
    const rawX = clamp(point.x - drag.offsetX, LEFT_W, baseChartWidth() - ICON_W);
    const rawY = clamp(point.y - drag.offsetY, HEADER_H, baseChartHeight() - ICON_W);
    drag.previewLeft = rawX;
    drag.previewTop = rawY;
    unit.week = idOfWeekFromX(rawX + ICON_W / 2);
    unit.tier = idOfTierFromY(rawY + ICON_W / 2);
    unit.metaStart = clamp(unit.metaStart, 1, WEEK_COUNT);
    unit.metaEnd = clamp(unit.metaEnd, unit.metaStart, WEEK_COUNT);
    renderAll();
  }

  if (drag.type === "bar") {
    const dxWeeks = Math.round((point.x - drag.startX) / CELL_W);
    const dy = point.y - drag.startY;
    if (drag.handle === "left") {
      unit.metaStart = clamp(drag.originStart + dxWeeks, 1, unit.metaEnd);
    } else if (drag.handle === "right") {
      unit.metaEnd = clamp(drag.originEnd + dxWeeks, unit.metaStart, WEEK_COUNT);
    } else {
      const span = drag.originEnd - drag.originStart;
      const newStart = clamp(drag.originStart + dxWeeks, 1, WEEK_COUNT - span);
      unit.metaStart = newStart;
      unit.metaEnd = newStart + span;
      const centerY = laneCenterY(drag.originTier, drag.originLane) + dy;
      const tier = idOfTierFromY(centerY);
      unit.tier = tier;
      unit.lane = laneFromY(centerY, tier);
    }
    renderAll();
  }
}

function onPointerUp() {
  if (!drag) return;
  suppressRoadmapClick = true;
  const hadDrag = drag;
  drag = null;
  state.updated = new Date().toISOString();
  renderAll();
  autoSave();
  setTimeout(() => { if (suppressRoadmapClick) suppressRoadmapClick = false; }, 0);
  return hadDrag;
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setStatus(`Saved locally at ${new Date().toLocaleTimeString()}.`);
}
function autoSave() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setStatus("Auto-saved locally. Export JSON or copy a share link when ready.");
}
function loadLocal() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (isLegacyExampleState(parsed)) {
      state = structuredClone(DEFAULT_ROADMAP);
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    state = parsed;
    normalizeState();
  } catch { state = structuredClone(DEFAULT_ROADMAP); }
}
function isLegacyExampleState(parsed) {
  const units = parsed?.units || [];
  return units.length > 0 && units.length <= 2 && units.every(u => /^Example (MS|Pilot)$/i.test(String(u.name || "")));
}
function clearLocal() {
  if (!confirm("Clear local saved roadmap and reset to a blank template?")) return;
  localStorage.removeItem(STORAGE_KEY);
  state = structuredClone(DEFAULT_ROADMAP);
  selectedId = null;
  renderAll();
  setStatus("Local data cleared. Blank template ready.");
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

function applyZoom() {
  if (!els.roadmap || !els.roadmapStage) return;
  els.roadmap.style.transform = `scale(${zoomScale})`;
  els.roadmapStage.style.width = `${baseChartWidth() * zoomScale}px`;
  els.roadmapStage.style.height = `${baseChartHeight() * zoomScale}px`;
  if (els.zoomRange) els.zoomRange.value = String(Math.round(zoomScale * 100));
  if (els.zoomLabel) els.zoomLabel.textContent = `${Math.round(zoomScale * 100)}%`;
}
function setZoom(value, persist = true) {
  zoomScale = clamp(Math.round(Number(value || 1) * 100) / 100, 0.5, 1.6);
  applyZoom();
  if (persist) localStorage.setItem(ZOOM_STORAGE_KEY, String(zoomScale));
}

function tagListFromInput() {
  return cleanTags(els.editForm.elements.tags.value.split(","));
}
function setTagList(tags, apply = false) {
  els.editForm.elements.tags.value = cleanTags(tags).join(", ");
  renderTagPreview();
  if (apply && getSelected()) applyForm();
}
function addTagFromDropdown() {
  if (!getSelected()) return;
  const tag = els.tagDropdown.value;
  setTagList([...tagListFromInput(), tag], true);
}
function clearTagsForSelected() {
  if (!getSelected()) return;
  setTagList([], true);
}
function renderTagPreview() {
  if (!els.tagPreview) return;
  els.tagPreview.innerHTML = "";
  if (els.editForm.classList.contains("hidden")) return;
  tagListFromInput().forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = `tag ${tagClass(tag)}`;
    chip.textContent = tag;
    chip.title = `Remove ${tag}`;
    chip.addEventListener("click", () => {
      setTagList(tagListFromInput().filter(t => t.toLowerCase() !== tag.toLowerCase()), true);
    });
    els.tagPreview.appendChild(chip);
  });
}

function base64urlEncode(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function base64urlDecode(text) {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
async function copyShareLink() {
  const payload = { v: 1, updated: new Date().toISOString(), units: state.units };
  const encoded = base64urlEncode(JSON.stringify(payload));
  const url = `${location.origin}${location.pathname}#roadmap=${encoded}`;
  try {
    await navigator.clipboard.writeText(url);
    setStatus(url.length > 12000 ? `Share link copied, but it is long (${url.length.toLocaleString()} characters). Published JSON is better for large roadmaps.` : "Share link copied.");
  } catch {
    prompt("Copy this share link:", url);
  }
}
function loadFromShareHash() {
  const match = location.hash.match(/roadmap=([^&]+)/);
  if (!match) return false;
  try {
    const json = JSON.parse(base64urlDecode(match[1]));
    state = { updated: new Date().toISOString(), units: Array.isArray(json) ? json : (json.units || []) };
    normalizeState();
    selectedId = null;
    return true;
  } catch (error) {
    alert(`Could not load roadmap from share link: ${error.message}`);
    return false;
  }
}
async function maybeLoadPublishedRoadmap() {
  const params = new URLSearchParams(location.search);
  if (params.get("view") !== "published") return;
  try {
    const response = await fetch("data/roadmap.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    state = { updated: new Date().toISOString(), units: Array.isArray(data) ? data : (data.units || []) };
    normalizeState();
    selectedId = null;
    renderAll();
    setStatus(`Loaded published roadmap with ${state.units.length} unit(s).`);
  } catch (error) {
    setStatus(`Could not load data/roadmap.json: ${error.message}`);
  }
}

async function exportPng() {
  setStatus("Rendering PNG…");
  const exportScale = 2;
  const width = baseChartWidth();
  const height = baseChartHeight();
  const canvas = document.createElement("canvas");
  canvas.width = width * exportScale;
  canvas.height = height * exportScale;
  const ctx = canvas.getContext("2d");
  ctx.scale(exportScale, exportScale);
  drawTemplateToCanvas(ctx, width, height);
  for (const unit of state.units) {
    await drawUnitToCanvas(ctx, unit);
  }
  for (const unit of state.units) {
    drawBarToCanvas(ctx, unit);
  }
  canvas.toBlob((png) => {
    if (!png) {
      setStatus("PNG export failed.");
      alert("PNG export failed. Try reloading the page and exporting again.");
      return;
    }
    downloadBlob(png, `gundam-u-c-e-roadmap-${new Date().toISOString().slice(0,10)}.png`);
    setStatus("PNG exported.");
  }, "image/png");
}

function drawTemplateToCanvas(ctx, width, height) {
  ctx.fillStyle = "#050609";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.2)";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, width - 1, height - 1);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,.025)";
  ctx.fillRect(0, 0, width, MONTH_H);
  ctx.fillRect(0, MONTH_H, width, WEEK_H);

  ctx.font = "900 18px Arial, sans-serif";
  ctx.fillStyle = "#eef3fb";
  MONTHS.forEach((month, i) => {
    const x = LEFT_W + i * 4 * CELL_W;
    ctx.fillText(month.toUpperCase(), x + 2 * CELL_W, MONTH_H / 2);
  });
  ctx.font = "900 14px Arial, sans-serif";
  ctx.fillStyle = "#dce4f0";
  for (let w = 1; w <= WEEK_COUNT; w++) {
    ctx.fillText(`W${((w - 1) % 4) + 1}`, weekX(w) + CELL_W / 2, MONTH_H + WEEK_H / 2);
  }

  ctx.textAlign = "left";
  ctx.font = "900 16px Arial, sans-serif";
  TIERS.forEach((tier, i) => {
    ctx.fillStyle = tier.color;
    ctx.fillText(tier.label.toUpperCase(), 22, HEADER_H + i * TIER_H + TIER_H / 2);
  });

  for (let w = 0; w <= WEEK_COUNT; w++) {
    const x = LEFT_W + w * CELL_W;
    ctx.beginPath();
    ctx.moveTo(x + 0.5, w % 4 === 0 ? 0 : HEADER_H);
    ctx.lineTo(x + 0.5, height);
    ctx.strokeStyle = w % 4 === 0 ? "rgba(255,255,255,.22)" : "rgba(255,255,255,.14)";
    ctx.lineWidth = w % 4 === 0 ? 2 : 1;
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  for (let r = 0; r <= TIERS.length; r++) {
    const y = HEADER_H + r * TIER_H;
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.strokeStyle = "rgba(255,255,255,.14)";
    ctx.stroke();
  }

  TIERS.forEach(tier => {
    for (let lane = 1; lane <= LANE_COUNT; lane++) {
      const y = laneY(tier.id, lane);
      roundedRect(ctx, LEFT_W + 10, y, WEEK_COUNT * CELL_W - 20, BAR_H, 9);
      ctx.fillStyle = "rgba(255,255,255,.035)";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.stroke();
    }
  });
}

async function drawUnitToCanvas(ctx, unit) {
  const x = iconX(unit), y = iconY(unit);
  ctx.save();
  roundedRect(ctx, x, y, ICON_W, ICON_W, 12);
  ctx.clip();
  const img = await loadImageForCanvas(unit.icon);
  if (img) {
    coverImage(ctx, img, x, y, ICON_W, ICON_W);
  } else {
    drawPlaceholder(ctx, unit.name, x, y, ICON_W, ICON_W);
  }
  const grad = ctx.createLinearGradient(0, y + ICON_W - 58, 0, y + ICON_W);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.35, "rgba(0,0,0,.78)");
  grad.addColorStop(1, "rgba(0,0,0,.92)");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y + ICON_W - 58, ICON_W, 58);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 12px Arial, sans-serif";
  ctx.textBaseline = "bottom";
  ctx.textAlign = "left";
  wrapText(ctx, unit.name, x + 8, y + ICON_W - 7, ICON_W - 16, 14, 2);
  ctx.restore();

  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 1;
  roundedRect(ctx, x + 0.5, y + 0.5, ICON_W - 1, ICON_W - 1, 12);
  ctx.stroke();

  drawTagsToCanvas(ctx, unit.tags, x, y);
}

function drawTagsToCanvas(ctx, tags, x, y) {
  let cy = y + 7;
  const right = x + ICON_W - 7;
  ctx.font = "900 10px Arial, sans-serif";
  tags.slice(0, 6).forEach(tag => {
    const text = String(tag);
    const w = Math.ceil(ctx.measureText(text).width) + 12;
    const h = 17;
    const bx = right - w;
    roundedRect(ctx, bx, cy, w, h, 8);
    ctx.fillStyle = tagBg(tag);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,.52)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, bx + w / 2, cy + h / 2 + 0.5);
    cy += h + 4;
  });
}

function drawBarToCanvas(ctx, unit) {
  const x = weekX(unit.metaStart) + 12;
  const y = laneY(unit);
  const w = (unit.metaEnd - unit.metaStart + 1) * CELL_W - 24;
  roundedRect(ctx, x, y, w, BAR_H, BAR_H / 2);
  ctx.fillStyle = barColor(unit);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.28)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "rgba(0,0,0,.72)";
  ctx.font = "900 11px Arial, sans-serif";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  const label = `${metaStatus(unit.metaStatus).label}: ${unit.name}`;
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, x + 8, y, Math.max(0, w - 16), BAR_H, 6);
  ctx.clip();
  ctx.fillText(label, x + 10, y + BAR_H / 2 + 0.5);
  ctx.restore();
}

function isCanvasSafeUrl(src) {
  if (!src) return false;
  if (/^data:/i.test(src)) return true;
  try {
    const url = new URL(src, location.href);
    return url.origin === location.origin;
  } catch { return false; }
}
async function loadImageForCanvas(src) {
  if (!isCanvasSafeUrl(src)) return null;
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
function coverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function drawPlaceholder(ctx, name, x, y, w, h) {
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, "#111827");
  grad.addColorStop(1, "#0a0d14");
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#d9e4f5";
  ctx.font = "900 36px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials(name), x + w / 2, y + h / 2);
}
function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function wrapText(ctx, text, x, bottomY, maxWidth, lineHeight, maxLines) {
  const words = sanitizeText(text).split(" ");
  const lines = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = word; }
    if (lines.length === maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  const startY = bottomY - (lines.length - 1) * lineHeight;
  lines.forEach((l, i) => ctx.fillText(l, x, startY + i * lineHeight));
}
function tagBg(tag) {
  const t = String(tag || "").toLowerCase();
  if (t === "pvp") return "rgba(230,64,91,.88)";
  if (t === "pve") return "rgba(63,143,245,.88)";
  if (t === "core") return "rgba(247,180,53,.9)";
  if (t === "tech") return "rgba(171,108,255,.88)";
  if (t === "def") return "rgba(86,218,150,.88)";
  return "rgba(0,0,0,.72)";
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
        tags: [],
        note: item.sourceUrl ? `Source: ${item.sourceUrl}` : "",
        metaStatus: defaultMetaStatusForKind(item.kind || item.type),
        color: defaultColorForKind(item.kind || item.type)
      });
    });
    els.catalogList.appendChild(node);
  });
}

function placeholderDataUrl(name) {
  const label = initials(name || "?").slice(0, 2);
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'><rect width='96' height='96' fill='%23131b25'/><text x='48' y='54' text-anchor='middle' font-family='Arial' font-size='26' fill='%23d9e4f5' font-weight='700'>${label}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

function showTooltip(event, unit) {
  hideTooltip();
  tooltipEl = document.createElement("div");
  tooltipEl.className = "tooltip";
  tooltipEl.innerHTML = `<strong>${escapeHtml(unit.name)}</strong><div>${escapeHtml(TIERS[tierIndex(unit.tier)].label)} · W${unit.week} · lane ${unit.lane}</div><div>Meta: W${unit.metaStart}–W${unit.metaEnd} · ${escapeHtml(metaStatus(unit.metaStatus).label)}</div>${unit.tags.length ? `<div>Tags: ${unit.tags.map(escapeHtml).join(", ")}</div>` : ""}${unit.note ? `<p>${escapeHtml(unit.note)}</p>` : ""}`;
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
