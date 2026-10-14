const STORAGE_KEY = "rebost-v1";
const PHOTO_SIZE = 240; // px, costat llarg de la miniatura (les fotos es guarden al navegador)

// ── Estat: { items: [{ id, name, qty, photo }] }
let state = load();
let editingId = null;
let photoTarget = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.items)) return s;
  } catch (e) {}
  return { items: [] };
}
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    msg("No hi cap res més al navegador: treu alguna foto o esborra productes.");
  }
  render();
}

const $ = (id) => document.getElementById(id);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Clau per comparar noms: sense majúscules, accents ni espais de més
const norm = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const byId = (id) => state.items.find((i) => i.id === id);
const byName = (name) => state.items.find((i) => norm(i.name) === norm(name));
// Quantitats amb decimals ("0,5" o "0.5"), arrodonides a centèsimes i mai negatives
const toNum = (v) => Number(String(v).trim().replace(",", ".")) || 0;
const clampQty = (n) => Math.max(0, Math.round(toNum(n) * 100) / 100);
const fmt = (n) => n.toLocaleString("ca-ES", { maximumFractionDigits: 2 });

function addOrUpdate(name, delta) {
  const found = byName(name);
  if (found) {
    const before = found.qty;
    found.qty = clampQty(found.qty + delta);
    return { kind: delta >= 0 ? "up" : "down", item: found, before };
  }
  const item = { id: uid(), name: name.trim(), qty: clampQty(delta), photo: null };
  state.items.push(item);
  return { kind: "new", item, before: 0 };
}

// ── Pintar
function render() {
  const q = norm($("search").value);
  const items = [...state.items]
    .filter((i) => !q || norm(i.name).includes(q))
    .sort((a, b) => a.name.localeCompare(b.name, "ca"));

  $("list").innerHTML = items.length
    ? items.map((i) => `
      <li class="item${i.qty === 0 ? " zero" : ""}" data-id="${i.id}">
        <button class="thumb${i.photo ? " has" : ""}" data-act="photo" aria-label="Foto de ${esc(i.name)}"
          ${i.photo ? `style="background-image:url(${i.photo})"` : ""}>${i.photo ? "" : "+"}</button>
        <button class="name" data-act="edit">${esc(i.name)}</button>
        <div class="qty">
          <button data-act="minus" aria-label="Treure un">−</button>
          <output>${fmt(i.qty)}</output>
          <button data-act="plus" aria-label="Afegir un">+</button>
        </div>
      </li>`).join("")
    : `<li class="empty-msg">${state.items.length ? "Cap producte coincideix amb la cerca." : "Encara no hi ha productes. Afegeix-ne un a sota o enganxa una llista."}</li>`;

  const total = state.items.reduce((s, i) => s + i.qty, 0);
  const out = state.items.filter((i) => i.qty === 0).length;
  $("global").innerHTML = `<strong>${state.items.length}</strong>productes · ${fmt(total)} unitats${out ? ` · ${out} esgotats` : ""}`;
}

// ── Fotos: es redueixen a miniatura JPEG perquè hi càpiguen moltes al navegador
function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, PHOTO_SIZE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}
function pickPhoto(id) {
  photoTarget = id;
  $("file").value = "";
  $("file").click();
}
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  const item = byId(photoTarget);
  if (!file || !item) return;
  try {
    item.photo = await readPhoto(file);
    save();
  } catch (e) {
    msg("No s'ha pogut llegir la foto.");
  }
});

// ── Llista: foto, editar, +/−
$("list").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const item = byId(btn.closest(".item").dataset.id);
  if (!item) return;
  const act = btn.dataset.act;
  if (act === "photo") return pickPhoto(item.id);
  if (act === "edit") return openEdit(item);
  item.qty = clampQty(item.qty + (act === "plus" ? 1 : -1));
  save();
});
$("search").addEventListener("input", render);

// ── Afegir ràpid
$("quick").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("quick-name").value.trim();
  if (!name) return;
  const r = addOrUpdate(name, clampQty($("quick-qty").value || 1));
  $("quick-name").value = "";
  $("quick-qty").value = 1;
  $("search").value = "";
  save();
  if (r.kind !== "new") msg(`"${r.item.name}" ja hi era: ara n'hi ha ${fmt(r.item.qty)}.`);
});

// ── Diàleg d'edició
function openEdit(item) {
  editingId = item.id;
  $("edit-name").value = item.name;
  $("edit-qty").value = fmt(item.qty);
  $("edit-nophoto").hidden = !item.photo;
  $("edit").showModal();
}
$("edit-save").addEventListener("click", () => {
  const item = byId(editingId);
  const name = $("edit-name").value.trim();
  if (!item || !name) return;
  const other = byName(name);
  if (other && other.id !== item.id) {
    // Mateix nom que un altre producte: s'ajunten
    other.qty = clampQty(other.qty + clampQty($("edit-qty").value));
    other.photo = other.photo || item.photo;
    state.items = state.items.filter((i) => i.id !== item.id);
  } else {
    item.name = name;
    item.qty = clampQty($("edit-qty").value);
  }
  $("edit").close();
  save();
});
$("edit-photo").addEventListener("click", () => { $("edit").close(); pickPhoto(editingId); });
$("edit-nophoto").addEventListener("click", () => {
  const item = byId(editingId);
  if (item) { item.photo = null; save(); }
  $("edit").close();
});
$("edit-delete").addEventListener("click", () => {
  const item = byId(editingId);
  if (!item || !confirm(`Eliminar "${item.name}"?`)) return;
  state.items = state.items.filter((i) => i.id !== item.id);
  $("edit").close();
  save();
});

// ── Llista massiva: "(nom del producte) (unitats)u" → "pasta llaços 1u", "llet 0,5u", "iogurts -2u"
// Si falta la "u" també s'entén ("llet 3", "3 llet"), i sense número compta com 1 ("pa").
const NUM = "[+-]?\\d+(?:[.,]\\d+)?";
const WITH_U = new RegExp(`^(.+?)\\s*(${NUM})\\s*(?:u|uds?|unitats?)\\.?$`, "i");
const NUM_END = new RegExp(`^(.+?)\\s+(${NUM})$`);
const NUM_START = new RegExp(`^(${NUM})\\s*(?:u|uds?|unitats?)?\\s+(.+)$`, "i");
function parseLine(line) {
  const t = line.replace(/^[\s\-–•*·]+(?=\D)/, "").trim(); // treu vinyetes, però no el "-" d'un número
  if (!t) return null;
  let m = t.match(WITH_U) || t.match(NUM_END);
  if (m && m[1].trim()) return { name: m[1].replace(/[:\s]+$/, ""), delta: toNum(m[2]) };
  m = t.match(NUM_START);
  if (m) return { name: m[2], delta: toNum(m[1]) };
  return { name: t, delta: 1 };
}
$("bulk-apply").addEventListener("click", () => {
  const lines = $("bulk").value.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const p = parseLine(line);
    if (!p) continue;
    const r = addOrUpdate(p.name, p.delta);
    const sign = p.delta >= 0 ? `+${fmt(p.delta)}` : fmt(p.delta);
    const label = { new: "Nou", up: "Sumat", down: "Restat" }[r.kind];
    out.push(`<li><span class="tag ${r.kind}">${label}</span><b>${esc(r.item.name)}</b> ${r.kind === "new" ? "" : `${sign} · ${fmt(r.before)} → `}${fmt(r.item.qty)} u</li>`);
  }
  if (!out.length) {
    $("bulk-result").innerHTML = `<li><span class="tag err">Buit</span>Escriu un producte per línia.</li>`;
    return;
  }
  $("bulk").value = "";
  $("search").value = "";
  save();
  $("bulk-result").innerHTML = out.join("");
});

// ── Còpia de seguretat
function msg(t) {
  $("msg").textContent = t;
  clearTimeout(msg.t);
  msg.t = setTimeout(() => ($("msg").textContent = ""), 5000);
}
$("export").addEventListener("click", async () => {
  const text = JSON.stringify(state);
  $("backup").value = text;
  try { await navigator.clipboard.writeText(text); msg("Còpia copiada al porta-retalls."); }
  catch (e) { $("backup").select(); msg("Selecciona el text i copia'l."); }
});
$("import").addEventListener("click", () => {
  try {
    const s = JSON.parse($("backup").value);
    if (!s || !Array.isArray(s.items)) throw 0;
    state = { items: s.items.map((i) => ({ id: i.id || uid(), name: String(i.name), qty: clampQty(i.qty), photo: i.photo || null })) };
    save();
    msg("Còpia restaurada.");
  } catch (e) {
    msg("El text no és una còpia vàlida.");
  }
});
$("reset").addEventListener("click", () => {
  if (!confirm("Segur que vols esborrar tots els productes?")) return;
  state = { items: [] };
  save();
  msg("Tot esborrat.");
});

render();
