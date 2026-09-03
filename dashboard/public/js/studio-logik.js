'use strict';
let nodes = [], edges = [], nid = 1, selId = null, connect = null;
let panX = 0, panY = 0, panAktiv = false, panStart = null, panning = false;
let zoom = 1, palTab = 'message', palFilter = '', editId = null;
let undoStack = [], redoStack = [];
const WRAP = document.getElementById('wrap');
const SVG = document.getElementById('linien');
const WELT = document.getElementById('welt');

const gid = () => new URLSearchParams(location.search).get('g') || '';
const esc = (t) => String(t ?? '').replace(/[<>&"']/g, (c) => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg, typ) {
  const t = document.createElement('div');
  t.className = 'toast ' + (typ || ''); t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}
function katVon(typ) { return KAT.find((k) => k.typ === typ) || { typ:'start', c:'#34d399', ico:'▶️', name:'START' }; }
function markDirty() { document.getElementById('saveAnz').textContent = '⚠ Ungespeichert'; }
function snapshot() { undoStack.push(JSON.stringify({ nodes, edges })); if (undoStack.length > 50) undoStack.shift(); redoStack = []; markDirty(); }

function doUndo() { if (!undoStack.length) return toast('Nichts zum Undo', 'err');
  redoStack.push(JSON.stringify({ nodes, edges }));
  const st = JSON.parse(undoStack.pop()); nodes = st.nodes; edges = st.edges; render(); }
function doRedo() { if (!redoStack.length) return toast('Nichts zum Redo', 'err');
  undoStack.push(JSON.stringify({ nodes, edges }));
  const st = JSON.parse(redoStack.pop()); nodes = st.nodes; edges = st.edges; render(); }
document.getElementById('undoB').addEventListener('click', doUndo);
document.getElementById('redoB').addEventListener('click', doRedo);

let aktPalKat = 'message';
function palette() {
  const tabs = document.getElementById('palTabs');
  const reihen = ['start','message','conditions','roles','channels','server','wirtschaft','variables','api','loops','voice','other'];
  tabs.innerHTML = reihen.map((k) => '<button data-k="' + k + '" class="' + (aktPalKat === k ? 'akt' : '') + '">' +
    (KAT_NAMEN[k] || k) + '</button>').join('');
  tabs.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { aktPalKat = b.dataset.k; palette(); }));
  const box = document.getElementById('palListe');
  box.innerHTML = '';
  const titel = document.createElement('div');
  titel.className = 'katT'; titel.textContent = KAT_NAMEN[aktPalKat] || aktPalKat;
  box.appendChild(titel);
  KAT.filter((k) => k.kat === aktPalKat)
     .filter((k) => !palFilter || k.name.toLowerCase().includes(palFilter) || k.desc.toLowerCase().includes(palFilter))
     .forEach((k) => {
    const d = document.createElement('div');
    d.className = 'blk'; d.style.setProperty('--c', k.c);
    d.innerHTML = '<div class="ico">' + k.ico + '</div><div><b>' + esc(k.name) + '</b><small>' + esc(k.desc) + '</small></div>';
    d.addEventListener('click', () => { snapshot(); addNode(k); });
    box.appendChild(d);
  });
}
document.getElementById('suche').addEventListener('input', (e) => { palFilter = e.target.value.toLowerCase(); palette(); });

function addNode(kat) {
  const n = { id: 'n' + (nid++), typ: kat.typ, x: 150 - panX + (nodes.length % 5) * 40,
    y: 120 - panY + Math.floor(nodes.length / 5) * 40, felder: {} };
  kat.felder.forEach((f) => { n.felder[f.k] = f.t === 'nested' ? [] : (f.d != null ? f.d : (f.t === 'bool' ? false : '')); });
  nodes.push(n); render();
}
function delNode(id) { snapshot(); nodes = nodes.filter((n) => n.id !== id);
  edges = edges.filter((e) => e.from !== id && e.to !== id); render(); }
function summarize(n) {
  const f = n.felder || {};
  if (f.text) return '"' + String(f.text).slice(0, 50) + '"';
  if (f.menge) return 'Menge: ' + f.menge;
  if (f.chance) return 'Chance: ' + f.chance + '%';
  if (f.equation) return '= ' + f.equation;
  if (f.rolle) return 'Rolle';
  return 'Doppelklick für Details';
}
function nodeBreite() { return 240 * zoom; }
function nodeHoehe(n) {
  const el = document.querySelector('.node[data-id="' + n.id + '"]');
  return el ? el.offsetHeight : 70;
}
function portPos(n, port) {
  let x = (n.x + 120) - panX;
  let y = (n.y + 60) - panY;
  if (port === 'dann') x = (n.x + 70) - panX;
  if (port === 'sonst') x = (n.x + 160) - panX;
  return { x, y };
}
function minimap() {
  const mm = document.getElementById('minimap');
  mm.querySelectorAll('.mn').forEach((x) => x.remove());
  if (!nodes.length) return;
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const n of nodes) { minX = Math.min(minX, n.x); minY = Math.min(minY, n.y); maxX = Math.max(maxX, n.x + 240); maxY = Math.max(maxY, n.y + 70); }
  const spX = Math.max(1, maxX - minX), spY = Math.max(1, maxY - minY);
  for (const n of nodes) {
    const m = document.createElement('div'); m.className = 'mn';
    m.style.left = ((n.x - minX) / spX * 138 + 4) + 'px';
    m.style.top = ((n.y - minY) / spY * 85 + 4) + 'px';
    mm.appendChild(m);
  }
}

function render() {
  WRAP.querySelectorAll('.node').forEach((n) => n.remove());
  SVG.innerHTML = '';
  const tx = (x) => x - panX;
  const ty = (y) => y - panY;
  for (const e of edges) {
    const von = nodes.find((n) => n.id === e.from), zu = nodes.find((n) => n.id === e.to);
    if (!von || !zu) continue;
    const p1 = { x: tx(von.x) + 120, y: ty(von.y) + 55 };
    const p2 = { x: tx(zu.x), y: ty(zu.y) + 14 };
    const mx = (p1.x + p2.x) / 2;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M' + p1.x + ',' + p1.y + ' C' + mx + ',' + p1.y + ' ' + mx + ',' + p2.y + ' ' + p2.x + ',' + p2.y);
    path.setAttribute('stroke', e.fromPort === 'dann' ? '#34d399' : e.fromPort === 'sonst' ? '#f43f5e' : '#4aa3ff');
    path.setAttribute('stroke-width', '2.5'); path.setAttribute('fill', 'none');
    SVG.appendChild(path);
  }
  for (const n of nodes) {
    const k = katVon(n.typ);
    const d = document.createElement('div');
    d.className = 'node' + (selId === n.id ? ' sel' : '');
    d.style.left = tx(n.x) + 'px'; d.style.top = ty(n.y) + 'px';
    d.style.setProperty('--c', k.c); d.dataset.id = n.id;
    const condPorts = ['if_role','if_money','comparison','random','permission','channel_cond','user_cond','var_vergleich'].includes(n.typ);
    const ports = condPorts
      ? '<span class="port dann" data-port="dann"></span><span class="plab">DANN</span>' +
        '<span class="port sonst" data-port="sonst"></span><span class="plab2">SONST</span>'
      : '<span class="port out" data-port="out"></span>';
    d.innerHTML = '<div class="kopf"><div class="ico">' + k.ico + '</div><b>' + esc(k.name) + '</b>' +
      (n.typ !== 'start' ? '<button class="del">✕</button>' : '') + '</div>' +
      '<div class="txt"><b>' + esc(summarize(n)) + '</b></div>' + ports;
    d.querySelector('.kopf').addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; e.preventDefault();
      const weltMausX = e.clientX + panX;
      const weltMausY = e.clientY + panY;
      const offX = n.x - weltMausX;
      const offY = n.y - weltMausY;
      const mv = (ev) => {
        n.x = (ev.clientX + panX) + offX;
        n.y = (ev.clientY + panY) + offY;
        render();
      };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    d.querySelector('.del')?.addEventListener('click', (e) => { e.stopPropagation(); delNode(n.id); });
    d.addEventListener('dblclick', () => editNode(n));
    d.addEventListener('click', (e) => { e.stopPropagation(); selId = n.id; render(); });
    d.addEventListener('contextmenu', (e) => { e.preventDefault(); selId = n.id; kontext(e.clientX, e.clientY, n.id); });
    d.querySelectorAll('.port').forEach((port) => {
      port.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        connect = { node: n.id, port: port.dataset.port };
      });
    });
    WELT.appendChild(d);
  }
  minimap();
}

addEventListener('mousemove', (e) => {
  if (connect) {
    const r = WRAP.getBoundingClientRect();
    const tmp = document.getElementById('tmpL');
    if (tmp) { tmp.setAttribute('x2', e.clientX - r.left); tmp.setAttribute('y2', e.clientY - r.top); }
  }
  if (panAktiv && !connect) {
    panX += e.clientX - panStart.x; panY += e.clientY - panStart.y;
    panStart = { x: e.clientX, y: e.clientY }; render();
  }
});
addEventListener('mouseup', (e) => {
  if (connect) {
    const ziel = e.target.closest('.node');
    if (ziel && ziel.dataset.id !== connect.node) {
      snapshot();
      edges = edges.filter((ed) => !(ed.from === connect.node && ed.fromPort === connect.port));
      edges.push({ from: connect.node, fromPort: connect.port, to: ziel.dataset.id });
      toast('Verbunden ✔', 'ok');
    }
    connect = null; render();
  }
  panAktiv = false;
  panning = false;
});
WRAP.addEventListener('mousedown', (e) => {
  // Pan nur auf leerer Fläche ODER wenn target das SVG ist
  if ((e.target.id === 'wrap' || e.target.id === 'linien' || e.target.id === 'welt') && e.button === 0) {
    panAktiv = true; panStart = { x: e.clientX, y: e.clientY };
    WRAP.style.cursor = 'grabbing';
  }
});
document.addEventListener('click', () => { document.getElementById('ctx').style.display = 'none'; });
function setZoom(f) {
  zoom = Math.max(0.25, Math.min(2.5, zoom * f));
  document.getElementById('zoomAnz').textContent = Math.round(zoom * 100) + ' %';
  render();
}
document.getElementById('zIn').addEventListener('click', () => setZoom(1.15));
document.getElementById('zOut').addEventListener('click', () => setZoom(1 / 1.15));
document.getElementById('zFit').addEventListener('click', () => { panX = 0; panY = 0; zoom = 1;
  document.getElementById('zoomAnz').textContent = '100 %'; render(); });
WRAP.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(e.deltaY > 0 ? 1/1.15 : 1.15); }, { passive: false });

function kontext(x, y, id) {
  const c = document.getElementById('ctx');
  c.innerHTML = '';
  [['✏️ Bearbeiten', () => editNode(nodes.find((n) => n.id === id))],
   ['📄 Duplizieren', () => { snapshot();
     const n = nodes.find((x2) => x2.id === id);
     const kopie = JSON.parse(JSON.stringify(n));
     kopie.id = 'n' + (nid++); kopie.x += 40; kopie.y += 40;
     nodes.push(kopie); render(); }],
   '-', ['🗑️ Löschen', () => delNode(id)],
  ].forEach(([label, fn]) => {
    if (label === '-') { c.appendChild(document.createElement('hr')); return; }
    const b = document.createElement('button'); b.textContent = label;
    b.addEventListener('click', () => { c.style.display = 'none'; fn(); });
    c.appendChild(b);
  });
  c.style.display = 'block';
  c.style.left = Math.min(x, innerWidth - 190) + 'px';
  c.style.top = Math.min(y, innerHeight - 160) + 'px';
}

function editNode(n) {
  const k = katVon(n.typ);
  document.getElementById('mTitel').textContent = k.ico + ' ' + k.name;
  document.getElementById('mUnter').textContent = k.desc;
  const body = document.getElementById('mBody');
  body.innerHTML = '';
  k.felder.forEach((f) => {
    const cur = (n.felder || {})[f.k];
    if (f.t === 'nested') return;
    const l = document.createElement('label'); l.textContent = f.l; body.appendChild(l);
    if (f.t === 'bool') {
      const w = document.createElement('div'); w.className = 'chk';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!cur;
      c.addEventListener('change', () => { n.felder[f.k] = c.checked; });
      w.appendChild(c); const sp = document.createElement('span'); sp.textContent = 'Aktiv'; w.appendChild(sp);
      body.appendChild(w);
    } else if (f.t === 'select') {
      const sel = document.createElement('select');
      (f.opts || []).forEach((o) => { const op = document.createElement('option');
        op.value = o; op.textContent = o; if (cur === o) op.selected = true; sel.appendChild(op); });
      sel.addEventListener('change', () => { n.felder[f.k] = sel.value; });
      body.appendChild(sel);
    } else if (f.t === 'rolle') {
      const sel = document.createElement('select');
      sel.innerHTML = '<option value="">– laden …</option>';
      fetch('/api/roles').then((r) => r.json()).then((r2) => {
        sel.innerHTML = '<option value="">– wählen –</option>' + r2.liste.map((x) =>
          '<option value="' + esc(x.id) + '"' + (cur === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('');
      }).catch(() => {});
      sel.addEventListener('change', () => { n.felder[f.k] = sel.value; });
      body.appendChild(sel);
    } else {
      const i = document.createElement(f.t === 'textarea' ? 'textarea' : 'input');
      if (i.tagName === 'INPUT') i.type = f.t === 'number' ? 'number' : 'text';
      i.value = cur ?? f.d ?? '';
      i.addEventListener('input', () => { n.felder[f.k] = i.value; });
      body.appendChild(i);
    }
  });
  const m = document.getElementById('modal'); m.style.display = 'flex';
  document.getElementById('mOk').onclick = () => { m.style.display = 'none'; render(); markDirty(); };
  document.getElementById('mZu').onclick = () => { m.style.display = 'none'; };
}

async function speichern() {
  const name = document.getElementById('cName').value.toLowerCase().trim();
  if (!name) return toast('Bitte command-name eingeben!', 'err');
  if (!nodes.length) return toast('Mindestens ein Block auf der Leinwand!', 'err');
  try {
    const payload = { name, description: document.getElementById('cDesc').value,
      cooldown: Number(document.getElementById('cCd').value) || 0,
      roles: [...document.getElementById('cRoles').selectedOptions].map((o) => o.value),
      guildId: gid(), nodes, edges };
    if (editId) payload.id = editId;
    await APIPOST('/studio/befehle', payload);
    editId = null;
    document.getElementById('saveAnz').textContent = '✓ Gespeichert: ' + new Date().toLocaleTimeString('de-DE');
    toast('💾 Gespeichert & live geladen! /' + name, 'ok');
  } catch (e) { toast('Fehler: ' + e.message, 'err'); }
}
async function APIPOST(u, b) {
  const r = await fetch('/api' + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
  return d;
}
document.getElementById('saveB').addEventListener('click', speichern);
addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); speichern(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); doUndo(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); doRedo(); }
  if (e.key === 'Delete' && selId && document.activeElement.tagName !== 'INPUT') { delNode(selId); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'd' && selId) {
    e.preventDefault();
    const n = nodes.find((x) => x.id === selId);
    if (n) { const kopie = JSON.parse(JSON.stringify(n));
      kopie.id = 'n' + (nid++); kopie.x += 50; kopie.y += 50;
      nodes.push(kopie); render(); toast('Dupliziert ✔', 'ok'); }
  }
});

document.getElementById('topbar').insertAdjacentHTML('beforeend',
  '<button class="tb" id="expB">📤 Export</button><button class="tb" id="impB">📥 Import</button>');
document.getElementById('expB').addEventListener('click', () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ name: document.getElementById('cName').value, nodes, edges }, null, 2)], { type: 'application/json' }));
  a.download = 'lumiox-command.json'; a.click();
});
document.getElementById('impB').addEventListener('click', () => {
  const i = document.createElement('input'); i.type = 'file'; i.accept = '.json';
  i.addEventListener('change', () => { const f = i.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { try {
      const d = JSON.parse(r.result); snapshot();
      nodes = d.nodes || []; edges = d.edges || [];
      if (d.name) document.getElementById('cName').value = d.name;
      render(); toast('Importiert ✔', 'ok');
    } catch (_) { toast('Ungültige Datei', 'err'); } };
    r.readAsText(f);
  });
  i.click();
});

fetch('/api/roles').then((r) => r.json()).then((r) => {
  document.getElementById('cRoles').innerHTML = r.liste.map((x) =>
    '<option value="' + esc(x.id) + '">' + esc(x.name) + '</option>').join('');
}).catch(() => {});

(async () => {
  const id = new URLSearchParams(location.search).get('id');
  if (id) {
    try {
      const r = await fetch('/api/studio/befehl/' + id).then((x) => x.json());
      const c = r.befehl;
      editId = c.id;
      document.getElementById('cName').value = c.name;
      document.getElementById('cDesc').value = c.description || '';
      document.getElementById('cCd').value = c.cooldown || 0;
      nodes = (c.nodes && c.nodes.length) ? JSON.parse(JSON.stringify(c.nodes)) : [];
      edges = c.edges || [];
      nid = nodes.length + 1;
      render(); toast('Befehl geladen ✔', 'ok');
      return;
    } catch (_) {}
  }
  nodes.push({ id: 'n0', typ: 'start', x: 80, y: 150, felder: {} });
  nid = 1;
  render();
})();
palette();