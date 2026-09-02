// ═══════════════════════════════════════════════════════════════
// DASHBOARD-APP: Router + alle Seiten.
// Speichern funktioniert überall ohne Reload (fetch -> Toast).
// ═══════════════════════════════════════════════════════════════
(async () => {
  'use strict';

  // ── Auth-Guard ────────────────────────────────────────────────
  let me;
  try { me = await API.get('/me'); } catch (_) { location.href = 'login.html'; return; }
  const status = await API.get('/setup/status');
  if (!status.complete) { location.href = 'setup.html'; return; }

  // Account-Design anwenden (überschreibt localStorage-Kopie)
  if (me.design) Design.apply(me.design, { speichern: false });

  // ── Globaler Zustand ─────────────────────────────────────────
  let gid = localStorage.getItem('nb_guild') || '';
  let settings = null;
  const charts = []; // Chart.js-Instanzen (Aufräumen bei Seitenwechsel)

  // ── Gilden-Auswahl ───────────────────────────────────────────
  const { gilden } = await API.get('/guilds');
  const guildSel = $('#guildSelect');
  guildSel.innerHTML = gilden.length
    ? gilden.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')
    : '<option value="">Kein Server – Bot einladen!</option>';
  if (!gilden.find((g) => g.id === gid)) gid = gilden[0] ? gilden[0].id : '';
  guildSel.value = gid;
  guildSel.addEventListener('change', () => {
    gid = guildSel.value;
    localStorage.setItem('nb_guild', gid);
    kanalCache = rollenCache = null;
    route(aktuelleSeite);
  });

  // ── Navigation ───────────────────────────────────────────────
  const SEITEN = [
    ['uebersicht', 'Übersicht', '🏠'], ['moderation', 'Moderation', '⚖️'],
    ['modentries', 'Mod-Einträge', '📋'], ['aimod', 'KI-Moderation', '🧠'],
    ['wortfilter', 'Wortfilter', '🧹'], ['wirtschaft', 'Wirtschaft & Steuern', '🏛️'],
    ['level', 'Level', '⭐'], ['tickets', 'Tickets', '🎫'], ['automod', 'Auto-Mod', '🛡️'],
    ['logs', 'Logs', '📜'], ['willkommen', 'Willkommen', '👋'], ['custom', 'Eigene Commands', '🧩'], ['commands', 'Commands An/Aus', '🔀'],
    ['analytics', 'Analytics', '📈'], ['design', 'DESIGN', '🎨'],
    ['einstellungen', 'Einstellungen', '⚙️'], ['update', 'Update', '🎉'],
    ['boerse', 'Börse', '📈'],
    ['embeds', 'Embed-Studio', '🪄'],
    ['studio', 'Command-Studio', '🧩'],
        ['staat', 'Staat & Polizei', '🚔'],
    ['ext', 'Extras 0.8.1', '🧰'],
    ['backup', 'Backup', '💾'],
  ];
  let aktuelleSeite = 'uebersicht';
  const nav = $('#nav');
  for (let _ni = 0; _ni < SEITEN.length; _ni++) {
    const [id, name, ico] = SEITEN[_ni];
    const b = el(`<button class="nav-btn" data-id="${id}"><span class="ico">${ico}</span>${esc(name)}</button>`);
    b.addEventListener('click', () => route(id));
    b.style.setProperty('--i', String(_ni));
    nav.appendChild(b);
  }
  $('#logoutBtn').addEventListener('click', async () => {
    await API.post('/logout'); location.href = 'login.html';
  });
  $('#chipUser').textContent = me.benutzername;

  function route(id) {
    aktuelleSeite = id;
    $$('.nav-btn', nav).forEach((b) => b.classList.toggle('aktiv', b.dataset.id === id));
    const page = $('#page');
    page.innerHTML = '';
    page.style.animation = 'none'; void page.offsetWidth; page.style.animation = '';
    for (const c of charts) { try { c.destroy(); } catch (_) {} }
    charts.length = 0;
    if (seitenTimer) { clearInterval(seitenTimer); seitenTimer = null; }
    const seiten = {
      uebersicht: seiteUebersicht, moderation: seiteModeration, modentries: seiteModEntries,
      aimod: seiteAiMod, ki: seiteKi, wortfilter: seiteWortfilter, wirtschaft: async (p) => { await seiteWirtschaft(p); await seiteSpieler(p); await seiteSteuerklassen(p); },
      level: seiteLevel, tickets: seiteTickets, automod: seiteAutoMod, logs: seiteLogs,
      willkommen: seiteWillkommen, custom: seiteCustom, commands: seiteCommands,
      analytics: seiteAnalytics,
      design: seiteDesign, einstellungen: seiteEinstellungen, update: seiteUpdate,
      embeds: seiteEmbedStudio,
      studio: seiteStudio,
      boerse: seiteBoerse,
            staat: seiteStaat,
      ext: seiteExt,
      backup: seiteBackup,
    };
    (seiten[id] || seiteUebersicht)(page).then(() => motionStarten()).catch((e) => {
      page.appendChild(el(`<div class="fehler">Seite konnte nicht geladen werden: ${esc(e.message)}</div>`));
    });
  }

  // ── Gemeinsame Bausteine ─────────────────────────────────────
  const karte = (titel, inhaltHTML) =>
    el(`<section class="panel card"><h3>${titel}</h3>${inhaltHTML || ''}</section>`);
  const feld = (label, inputHTML) =>
    `<label class="feld"><span>${esc(label)}</span>${inputHTML}</label>`;
  const zahlInput = (id, wert, min = 0, max = 999999999) =>
    `<input class="input" type="number" id="${id}" value="${Number(wert ?? 0)}" min="${min}" max="${max}">`;
  const textInput = (id, wert, platz = '') =>
    `<input class="input" id="${id}" value="${esc(wert ?? '')}" placeholder="${esc(platz)}">`;
  const toggleHTML = (id, wert) =>
    `<label class="toggle"><input type="checkbox" id="${id}" ${wert ? 'checked' : ''}><i></i></label>`;
  const selectHTML = (id, optionen, wert) =>
    `<select class="input" id="${id}">${optionen.map((o) =>
      `<option value="${esc(o[0])}" ${String(o[0]) === String(wert) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
  const saveBar = (formId) =>
    `<div class="row mt"><button class="btn primary" id="${formId}">💾 Speichern</button></div>`;

  let kanalCache = null, rollenCache = null;
  let seitenTimer = null;
  async function ladeKanäle() {
    if (!kanalCache) kanalCache = (await API.get('/channels?guildId=' + gid)).liste;
    return kanalCache;
  }
  async function ladeRollen() {
    if (!rollenCache) rollenCache = (await API.get('/roles?guildId=' + gid)).liste;
    return rollenCache;
  }
  const kanalOptionen = (liste) => [['', '– keiner –'],
    ...liste.map((k) => [k.id, (k.typ === 4 ? '📁 ' : '#') + k.name])];
  const rollenOptionen = (liste) => [['', '– keine –'],
    ...liste.map((r) => [r.id, r.name])];

  async function ladeSettings() {
    settings = await API.get('/settings?guildId=' + gid);
    return settings;
  }
  async function speichere(patch, meldung) {
    try {
      await API.post('/settings?guildId=' + gid, patch);
      settings = await ladeSettings();
      toast(meldung || 'Gespeichert ✔', 'ok');
    } catch (e) { toast('Fehler: ' + e.message, 'err'); }
  }
  const val = (id) => { const n = document.getElementById(id); return n ? n.value : undefined; };
  const chk = (id) => { const n = document.getElementById(id); return n ? n.checked : undefined; };
  const num = (id) => { const n = document.getElementById(id); return n ? Number(n.value) : undefined; };

  // ══════════════════ SEITE: ÜBERSICHT ══════════════════
  async function seiteUebersicht(page) {
    const o = await API.get('/overview?guildId=' + gid);
    const live = (b) => b ? '<span class="dot ok"></span>' : '<span class="dot err"></span>';
    page.appendChild(karte('🏛️ ' + esc(o.serverName), `
      <div class="grid-4">
        <div class="stat"><span class="val">${fmtZahl(o.mitglieder)}</span><span class="lbl">Mitglieder</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.nachrichtenHeute)}</span><span class="lbl">Nachrichten heute</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.aktiveVerwarnungen)}</span><span class="lbl">Verwarnungen</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.aiErkennungen24h)}</span><span class="lbl">KI-Erkennungen (24 h)</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.steuerEinnahmen)}</span><span class="lbl">Steuereinnahmen</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.geldmenge)}</span><span class="lbl">Geldmenge im Umlauf</span></div>
        <div class="stat"><span class="val">${fmtZahl(o.kasse)}</span><span class="lbl">Serverkasse</span></div>
        <div class="stat"><span class="val">${o.geloeschteNachrichten ? fmtZahl(o.geloeschteNachrichten) : 0}</span><span class="lbl">Gelöschte Nachrichten</span></div>
      </div>`));
    page.appendChild(karte('📡 Systemstatus', `
      <div class="grid-4">
        <div class="stat"><span class="val">${o.bot.connected ? '🟢' : '🔴'}</span>
          <span class="lbl">Bot ${o.bot.connected ? 'verbunden · ' + o.bot.ping + ' ms' : 'offline'}</span></div>
        <div class="stat"><span class="val">${o.ollama.online ? '🟢' : '🔴'}</span>
          <span class="lbl">Ollama ${o.ollama.online ? 'online (' + o.ollama.lastLatencyMs + ' ms)' : 'offline'}</span></div>
        <div class="stat"><span class="val" id="statRam">${o.ram} MB</span><span class="lbl">RAM (Prozess)</span></div>
        <div class="stat"><span class="val" id="statUp">${fmtDauer((o.bot.uptimeSec || 0) * 1000)}</span><span class="lbl">Uptime</span></div>
      </div>
      ${o.ollama.online ? '' : `<div class="hinweis-box">Ollama ist offline – die KI-Moderation fällt automatisch auf den Wortfilter zurück.
        Start: <code>ollama serve</code> in Termux.</div>`}`));
    const feed = karte('🔴 Live-Feed: letzte Moderationsereignisse', `<div id="feedBox"></div>`);
    page.appendChild(feed);
    const box = $('#feedBox', feed);
    if (!o.feed.length) box.innerHTML = '<p class="dim">Noch keine Einträge.</p>';
    for (const f of o.feed) {
      box.appendChild(el(`<div class="feed-item">
        <span class="badge info">#${f.nummer}</span>
        <span><b>${esc(f.kategorie)}</b> · <@${esc(f.userId)}> – ${esc(f.grund).slice(0, 120)}</span>
        <span class="feed-zeit">${fmtRelativ(f.zeit)}</span></div>`));
    }
  }

  // ══════════════════ SEITE: MODERATION ══════════════════
  async function seiteModeration(page) {
    const s = await ladeSettings();
    const [kan, rol] = [await ladeKanäle(), await ladeRollen()];
    const m = s.moderation;
    page.appendChild(karte('⚖️ Moderations-Grundeinstellungen', `
      ${feld('Mod-Rolle (wird bei Mod-Ping erwähnt)', selectHTML('mModRole', rollenOptionen(rol), m.modRole))}
      ${feld('Mod-Protokoll-Kanal (alle Einträge landen hier)', selectHTML('mLog', kanalOptionen(kan), m.modLogChannel))}
      ${saveBar('saveMod')}`));
    const esc2 = m.escalation;
    page.appendChild(karte('📈 Automatische Eskalation', `
      <div class="grid-2">
        <div class="feld"><span>Aktiv</span>${toggleHTML('eOn', esc2.enabled)}</div>
        ${feld('Einträge ab X', zahlInput('eCount', esc2.count, 2, 50))}
        ${feld('…innerhalb von (Stunden)', zahlInput('eHours', esc2.withinHours, 1, 8760))}
        ${feld('Aktion', selectHTML('eAction', [['timeout', 'Timeout'], ['kick', 'Kick']], esc2.action))}
        ${feld('Timeout-Dauer (Minuten)', zahlInput('eDur', esc2.durationMinutes, 5, 40320))}
      </div>
      <p class="dim small">Beispiel: „Ab 3 Einträgen in 7 Tagen → 60 Min. Timeout". Gilt über ALLE Kategorien hinweg (KI, Wortfilter, Warns …).</p>
      ${saveBar('saveEsc')}`));
    $('#saveMod').addEventListener('click', () =>
      speichere({ moderation: { ...settings.moderation, modRole: val('mModRole'), modLogChannel: val('mLog') } }));
    $('#saveEsc').addEventListener('click', () => speichere({
      moderation: { ...settings.moderation, escalation: {
        enabled: chk('eOn'), count: num('eCount'), withinHours: num('eHours'),
        action: val('eAction'), durationMinutes: num('eDur') } } }));
  }

  // ══════════════════ SEITE: MOD-EINTRÄGE ══════════════════
  async function seiteModEntries(page) {
    const filterBar = karte('🔍 Protokoll durchsuchen', `
      <div class="grid-3">
        ${feld('Suchtext (Grund/Beweis/Nr.)', textInput('fQ', '', 'z. B. Beleidigung'))}
        ${feld('Kategorie', selectHTML('fKat', ['', 'Alle', 'Verwarnung', 'KI-Erkennung', 'Wortfilter-Treffer', 'Mute', 'Ban', 'Auto-Mod'].map((k, i) => [i ? k : '', k]), ''))}
        ${feld('Status', selectHTML('fStatus', [['', 'Alle'], ['offen', 'Offen'], ['erledigt', 'Erledigt']], ''))}
        ${feld('Schweregrad ab', selectHTML('fSG', [['', 'Alle'], ['5', '5+'], ['7', '7+'], ['9', '9+']], ''))}
        ${feld('Von', `<input class="input" type="date" id="fVon">`)}
        ${feld('Bis', `<input class="input" type="date" id="fBis">`)}
      </div>
      <div class="row">
        <button class="btn primary" id="fGo">Filtern</button>
        <button class="btn" id="fReset">Zurücksetzen</button>
        <span class="dim small" id="fAnzahl"></span>
      </div>`);
    page.appendChild(filterBar);
    const tabelle = karte('📋 Einträge <span class="dim small">(Klick auf User = Profil)</span>', `
      <div class="table-wrap"><table class="table" id="meTable">
        <thead><tr><th>#</th><th>Zeit</th><th>User</th><th>Kategorie</th><th>SG</th><th>Von</th><th>Grund</th><th>Status</th><th></th></tr></thead>
        <tbody></tbody></table></div>`);
    page.appendChild(tabelle);

    async function laden() {
      const p = new URLSearchParams({ guildId: gid });
      for (const [k, id] of [['q', 'fQ'], ['kategorie', 'fKat'], ['status', 'fStatus'],
        ['schwere', 'fSG'], ['von', 'fVon'], ['bis', 'fBis']]) {
        const v = val(id); if (v) p.set(k, v);
      }
      const { liste, gesamt } = await API.get('/modentries?' + p.toString());
      $('#fAnzahl', page).textContent = `${gesamt} Einträge (max. 300 angezeigt)`;
      const tb = $('tbody', tabelle);
      tb.innerHTML = '';
      if (!liste.length) tb.innerHTML = '<tr><td colspan="9" class="dim">Keine Einträge gefunden. 🎉</td></tr>';
      for (const e2 of liste) {
        const tr = el(`<tr>
          <td class="mono">#${e2.nummer}</td>
          <td class="small">${fmtDatum(e2.zeit)}</td>
          <td><a href="#" class="me-user" data-u="${esc(e2.userId)}">${esc(e2.userId).slice(-6)}</a></td>
          <td><span class="badge ${e2.kategorie === 'KI-Erkennung' ? 'ai' : 'info'}">${esc(e2.kategorie)}</span></td>
          <td>${e2.schweregrad}</td>
          <td class="small">${esc(e2.moderator)}</td>
          <td class="small">${esc(e2.grund).slice(0, 80)}</td>
          <td><span class="badge ${e2.status === 'offen' ? 'warn' : 'ok'}">${e2.status}</span></td>
          <td><button class="btn small me-toggle" data-id="${e2.id}" data-s="${e2.status}">${e2.status === 'offen' ? '✔ erledigt' : '↺ offen'}</button></td>
        </tr>`);
        $('.me-user', tr).addEventListener('click', (ev) => { ev.preventDefault(); profil(e2.userId); });
        $('.me-toggle', tr).addEventListener('click', async () => {
          await API.post('/modentries/' + e2.id + '/status',
            { status: e2.status === 'offen' ? 'erledigt' : 'offen' });
          laden();
        });
        tb.appendChild(tr);
      }
    }
    async function profil(userId) {
      const p = await API.get('/userprofile?guildId=' + gid + '&userId=' + userId);
      const body = el(`<div>
        <div class="row mb">
          ${p.user.avatar ? `<img src="${esc(p.user.avatar)}" style="width:48px;height:48px;border-radius:50%">` : ''}
          <div><b>${esc(p.user.name)}</b><div class="dim small mono">${esc(userId)}</div></div>
        </div>
        <div class="grid-3 mb">
          <div class="stat"><span class="val">${p.level.level}</span><span class="lbl">Level (${fmtZahl(p.level.xp)} XP)</span></div>
          <div class="stat"><span class="val">${fmtZahl(p.economie.bargeld + p.economie.bank)}</span><span class="lbl">Vermögen</span></div>
          <div class="stat"><span class="val" style="color:var(--err)">${fmtZahl(p.economie.schulden)}</span><span class="lbl">Schulden</span></div>
        </div>
        <h4 class="mb">Mod-Einträge (${p.eintraege.length})</h4>
        <div class="table-wrap" style="max-height:240px;overflow-y:auto"><table class="table">
          ${p.eintraege.map((e2) => `<tr>
            <td class="mono">#${e2.nummer}</td><td><span class="badge info">${esc(e2.kategorie)}</span></td>
            <td>SG ${e2.schweregrad}</td><td class="small">${esc(e2.grund).slice(0, 90)}</td>
            <td class="small dim">${fmtRelativ(e2.zeit)}</td></tr>`).join('') || '<tr><td class="dim">Keine – sauberes Protokoll ✨</td></tr>'}
        </table></div></div>`);
      openModal('Benutzer-Profil', body, [
        { label: '⬇ Protokoll exportieren', action: (zu) => {
          window.open(`/api/modentries/export?guildId=${gid}&userId=${userId}`, '_blank'); zu(); } },
        { label: 'Schließen', klasse: 'primary', action: (zu) => zu() },
      ]);
    }
    $('#fGo', page).addEventListener('click', laden);
    $('#fReset', page).addEventListener('click', () => {
      for (const id of ['fQ', 'fKat', 'fStatus', 'fSG', 'fVon', 'fBis']) {
        const n = document.getElementById(id); if (n) n.value = '';
      }
      laden();
    });
    await laden();
  }

  // ══════════════════ SEITE: KI-MODERATION (v2 – aufgeräumt & mit Scan) ══════════════════
  async function seiteAiMod(page) {
    const s = await ladeSettings();
    const am = s.aiMod;
    const [kan, rol] = [await ladeKanäle(), await ladeRollen()];
    // Label-Helfer, der HTML im Label erlaubt (für fette Live-Werte)
    const feldHtml = (label, inputHTML) =>
      `<label class="feld"><span>${label}</span>${inputHTML}</label>`;

    // ── Engine ──
    page.appendChild(karte('⚙️ Prüf-Engine', `
      <div class="row">
        <div style="flex:1;min-width:280px">${feld('Prüf-Engine', selectHTML('aEng',
          [['sentinel', 'Sentinel – ohne KI (schnell, offline, Mobbing-Muster)'],
           ['ollama', 'Ollama – echtes Sprachmodell (CPU-lastig)']], am.engine || 'sentinel'))}</div>
        <button class="btn primary" id="saveEng" style="align-self:flex-end">💾 Speichern</button>
      </div>`));
    $('#saveEng', page).addEventListener('click', () =>
      speichere({ aiMod: { ...settings.aiMod, engine: val('aEng') } }));

    // ── Grundeinstellungen ──
    page.appendChild(karte('🧠 KI-Moderation – Grundeinstellungen', `
      <div class="grid-3">
        <div class="feld"><span>Aktiv</span>${toggleHTML('aOn', am.enabled)}</div>
        ${feld('Kontext-Puffer (Minuten, 1–60)', zahlInput('aFenster', am.contextWindowMinutes, 1, 60))}
        ${feld('Temperature (0–2)', `<input class="input" type="number" step="0.1" min="0" max="2" id="aTemp" value="${am.temperature ?? 0.2}">`)}
      </div>
      ${feldHtml('Empfindlichkeit: <b id="sensWert">${am.sensitivity || 5}</b>/10 <span class="dim small">(1 = nur Eindeutiges · 10 = extrem streng)</span>',
        `<input type="range" id="aSens" min="1" max="10" value="${am.sensitivity || 5}">`)}
      <p class="dim small">Verstoß ab Schweregrad ≥ <b id="schwelle">${11 - (am.sensitivity || 5)}</b> · Der Wert fließt auch in den KI-Prompt ein.</p>
      <div class="feld"><span>Kontext-Batch (Rückblick alle X Min. – erkennt Mobbing im Verlauf)</span>
        <div class="row">${toggleHTML('aBatch', am.contextBatch)} ${zahlInput('aBatchMin', am.contextBatchMinutes, 1, 60)} <span class="dim small">Min.</span></div></div>
      ${feld('Systemprompt (Rolle der KI)', `<textarea class="input" id="aSys" rows="2">${esc(am.systemPrompt || 'Du bist ein strenger, aber fairer Content-Moderator für einen deutschsprachigen Chat.')}</textarea>`)}
      ${saveBar('saveAi')}`));
    $('#aSens', page).addEventListener('input', () => {
      $('#sensWert', page).textContent = val('aSens');
      $('#schwelle', page).textContent = String(11 - num('aSens'));
    });
    const speicherGrund = () => speichere({
      aiMod: { ...settings.aiMod,
        enabled: chk('aOn'), sensitivity: num('aSens'),
        contextWindowMinutes: num('aFenster'), contextBatch: chk('aBatch'),
        contextBatchMinutes: num('aBatchMin'),
        temperature: Math.max(0, Math.min(2, Number(val('aTemp')) || 0.2)),
        systemPrompt: val('aSys') },
    });
    $('#saveAi', page).addEventListener('click', speicherGrund);

    // ── Strenge-Feineinstellung ──
    const katCfg = am.kategorien || { beleidigung: true, diskriminierung: true, mobbing: true, bedrohung: true, sexual: true, passiv: true };
    const wieCfg = am.wiederholung || { aktiv: true, fensterMin: 30, maxBonus: 3 };
    page.appendChild(karte('🎚️ Strenge-Feineinstellung', `
      <b class="small">Schnell-Presets</b>
      <div class="row mb">
        <button class="btn small preset-btn" data-s="3">😌 Entspannt (3)</button>
        <button class="btn small preset-btn" data-s="5">🙂 Normal (5)</button>
        <button class="btn small preset-btn" data-s="7">😠 Streng (7)</button>
        <button class="btn small preset-btn" data-s="9">😡 Sehr streng (9)</button>
        <button class="btn small danger preset-btn" data-s="10">🔥 Paranoid (10)</button>
      </div>
      <p class="dim small mb">Schwelle = 11 − Empfindlichkeit. 🔥 <b>Paranoid</b> = Schwelle 1: schon milde negative Aussagen werden erfasst (kann Fehltreffer geben).</p>
      <b class="small">Erkennungs-Kategorien (einzeln abschaltbar)</b>
      <div class="grid-3 mb">
        <div class="feld"><span>Beleidigungen</span>${toggleHTML('k_beleidigung', katCfg.beleidigung)}</div>
        <div class="feld"><span>Diskriminierung / Hetze</span>${toggleHTML('k_diskriminierung', katCfg.diskriminierung)}</div>
        <div class="feld"><span>Mobbing &amp; Ausgrenzung</span>${toggleHTML('k_mobbing', katCfg.mobbing)}</div>
        <div class="feld"><span>Bedrohungen</span>${toggleHTML('k_bedrohung', katCfg.bedrohung)}</div>
        <div class="feld"><span>Sexuelle Belästigung</span>${toggleHTML('k_sexual', katCfg.sexual)}</div>
        <div class="feld"><span>Passiv-Aggressiv / Seitenhiebe (mild)</span>${toggleHTML('k_passiv', katCfg.passiv)}</div>
      </div>
      <b class="small">Wiederholungstäter-Verstärkung</b>
      <div class="row mb">
        ${toggleHTML('w_aktiv', wieCfg.aktiv)}
        <span class="dim small">Fenster</span> ${zahlInput('w_fenster', wieCfg.fensterMin, 5, 720)} <span class="dim small">Min.</span>
        <span class="dim small">max. Bonus-SG</span> ${zahlInput('w_bonus', wieCfg.maxBonus, 1, 5)}
      </div>
      <button class="btn primary" id="saveFine">💾 Feineinstellung speichern</button>
    `));
    $$('.preset-btn', page).forEach((b) => b.addEventListener('click', () => {
      const slider = document.getElementById('aSens');
      if (slider) slider.value = b.dataset.s;
      const w1 = document.getElementById('sensWert'); if (w1) w1.textContent = b.dataset.s;
      const w2 = document.getElementById('schwelle'); if (w2) w2.textContent = String(11 - Number(b.dataset.s));
      speicherGrund();
      toast('Empfindlichkeit: ' + b.dataset.s + '/10 gespeichert', 'ok');
    }));
    $('#saveFine', page).addEventListener('click', () => speichere({
      aiMod: {
        kategorien: {
          beleidigung: chk('k_beleidigung'), diskriminierung: chk('k_diskriminierung'),
          mobbing: chk('k_mobbing'), bedrohung: chk('k_bedrohung'),
          sexual: chk('k_sexual'), passiv: chk('k_passiv'),
        },
        wiederholung: { aktiv: chk('w_aktiv'), fensterMin: num('w_fenster'), maxBonus: num('w_bonus') },
      },
    }, 'Feineinstellung gespeichert ✔'));

    // ── Aktionen pro Schweregrad ──
    const ak = am.actions || [];
    const zeileHtml = (a, i) => `
      <tr>
        <td>${zahlInput('ak_ab' + i, a.abSchweregrad, 1, 10)}</td>
        <td style="text-align:center">${toggleHTML('ak_del' + i, a.loeschen)}</td>
        <td style="text-align:center">${toggleHTML('ak_warn' + i, a.verwarnung)}</td>
        <td>${zahlInput('ak_to' + i, a.timeout || 0, 0, 40320)}</td>
        <td>${selectHTML('ak_role' + i, rollenOptionen(rol), a.rollenEntzug || '')}</td>
        <td style="text-align:center">${toggleHTML('ak_ping' + i, a.modPing)}</td>
        <td><button class="btn small danger ak-del-row">✕</button></td>
      </tr>`;
    const aktKarte = karte('🚨 Aktionen pro Schweregrad', `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Ab SG</th><th>Löschen</th><th>Verwarnung</th><th>Timeout (Min)</th><th>Rollen-Entzug</th><th>Mod-Ping</th><th></th></tr></thead>
        <tbody>${ak.map(zeileHtml).join('')}</tbody></table></div>
      <div class="row mt">
        <button class="btn small" id="akAdd">+ Stufe hinzufügen</button>
        <button class="btn primary" id="saveAk">💾 Aktionen speichern</button>
      </div>`);
    page.appendChild(aktKarte);
    const bindRowDel = () => $$('.ak-del-row', aktKarte).forEach((x) =>
      x.addEventListener('click', () => x.closest('tr').remove()));
    bindRowDel();
    $('#akAdd', aktKarte).addEventListener('click', () => {
      $('tbody', aktKarte).insertAdjacentHTML('beforeend', zeileHtml(
        { abSchweregrad: 5, loeschen: true, verwarnung: false, timeout: 0, rollenEntzug: '', modPing: false },
        $('tbody tr', aktKarte).length));
      bindRowDel();
    });
    $('#saveAk', aktKarte).addEventListener('click', () => speichere({
      aiMod: { ...settings.aiMod, actions: $$('tbody tr', aktKarte).map((tr) => ({
        abSchweregrad: num($('input[type=number]', tr.cells[0]).id),
        loeschen: chk($('input[type=checkbox]', tr.cells[1]).id),
        verwarnung: chk($('input[type=checkbox]', tr.cells[2]).id),
        timeout: num($('input[type=number]', tr.cells[3]).id) || 0,
        rollenEntzug: val($('select', tr.cells[4]).id),
        modPing: chk($('input[type=checkbox]', tr.cells[5]).id),
      })) },
    }, 'Aktionen gespeichert ✔'));

    // ── Whitelists ──
    page.appendChild(karte('🚫 Whitelists (werden ignoriert)', `
      <div class="grid-3">
        ${feld('Kanal-IDs (eine pro Zeile)', `<textarea class="input" id="aWlCh" rows="3">${esc((am.whitelistChannels || []).join('\n'))}</textarea>`)}
        ${feld('Rollen-IDs', `<textarea class="input" id="aWlRo" rows="3">${esc((am.whitelistRoles || []).join('\n'))}</textarea>`)}
        ${feld('User-IDs', `<textarea class="input" id="aWlUs" rows="3">${esc((am.whitelistUsers || []).join('\n'))}</textarea>`)}
      </div>
      <button class="btn primary" id="saveWl">💾 Whitelists speichern</button>`));
    $('#saveWl', page).addEventListener('click', () => speichere({
      aiMod: { ...settings.aiMod,
        whitelistChannels: val('aWlCh').split('\n').map((x) => x.trim()).filter(Boolean),
        whitelistRoles: val('aWlRo').split('\n').map((x) => x.trim()).filter(Boolean),
        whitelistUsers: val('aWlUs').split('\n').map((x) => x.trim()).filter(Boolean) },
    }, 'Whitelists gespeichert ✔'));

    // ── SCAN-BUTTON (Test ohne Wartezeit) ──
    page.appendChild(karte('🧪 Scan jetzt starten (Test ohne Wartezeit)', `
      <p class="dim small mb">Prüft sofort alle Nachrichten im Puffer als zusammenhängenden Verlauf.
      Sentinel: sofort · Ollama: 10–60 s. Treffer erzeugen direkt Mod-Einträge.</p>
      <div class="row">
        <button class="btn primary" id="batchGo">🧠 Scan jetzt starten</button>
        <span class="status-chip" id="batchChip">–</span>
      </div>
      <div id="batchErgebnis" class="mt"></div>`));
    $('#batchGo', page).addEventListener('click', async () => {
      const chip = $('#batchChip', page);
      chip.textContent = 'Scan läuft …'; chip.className = 'status-chip busy';
      $('#batchErgebnis', page).innerHTML = '';
      try {
        const r = await API.post('/aimod/batch?guildId=' + gid, {});
        if (!r.ok) {
          chip.textContent = 'Fehler'; chip.className = 'status-chip err';
          $('#batchErgebnis', page).innerHTML = `<div class="fehler">${esc(r.fehler || 'Unbekannter Fehler')}</div>`;
          return;
        }
        chip.textContent = r.meldungen + ' Treffer';
        chip.className = 'status-chip ' + (r.meldungen ? 'err' : 'ok');
        $('#batchErgebnis', page).innerHTML =
          `<div class="ki-antwort">Geprüfte Nachrichten: <b>${r.geprueft}</b> · Treffer: <b>${r.meldungen}</b>` +
          (r.hinweis ? '<br>' + esc(r.hinweis) : '') + '</div>';
        if (r.meldungen) toast('Mod-Protokoll: ' + r.meldungen + ' neue Einträge!', 'ok');
      } catch (e) {
        chip.textContent = 'Fehler'; chip.className = 'status-chip err';
        $('#batchErgebnis', page).innerHTML = `<div class="fehler">${esc(e.message)}</div>`;
      }
    });

    // ── Test-Konsole (funktioniert mit Sentinel UND Ollama) ──
    page.appendChild(karte('🔬 Test-Konsole: Nachricht simulieren', `
      ${feld('Test-Nachricht', `<textarea class="input" id="tText" rows="2" placeholder="z. B. du bist so dumm"></textarea>`)}
      <div class="row">
        <button class="btn primary" id="tGo">Prüfen</button>
        <span class="status-chip" id="tChip">–</span>
      </div>
      <div id="tErgebnis" class="mt"></div>`));
    $('#tGo', page).addEventListener('click', async () => {
      const text = val('tText');
      if (!text) return toast('Bitte Text eingeben', 'err');
      const chip = $('#tChip', page);
      chip.textContent = 'Prüfe …'; chip.className = 'status-chip busy';
      try {
        const r = await API.post('/aimod/test', {
          text, guildId: gid, sensitivity: num('aSens'),
          temperature: Math.max(0, Math.min(2, Number(val('aTemp')) || 0.2)),
          systemPrompt: val('aSys'),
        });
        if (!r.ok) {
          chip.textContent = 'Fehler'; chip.className = 'status-chip err';
          $('#tErgebnis', page).innerHTML = `<div class="fehler">${esc(r.fehler)}</div>`;
          return;
        }
        const j = r.json || {};
        chip.textContent = r.treffer ? 'TREFFER' : 'Kein Treffer';
        chip.className = 'status-chip ' + (r.treffer ? 'err' : 'ok');
        $('#tErgebnis', page).innerHTML = `
          <div class="ki-antwort">
            <b>Ergebnis:</b> Schweregrad <b>${j.schweregrad ?? 0}</b>/10 · Schwellenwert: ${r.schwellenwert} ·
            Kategorie: <b>${esc(j.kategorie || '—')}</b><br>
            <b>Begründung:</b> ${esc(j.begruendung || '—')}<br>
            <b>Zitat:</b> ${esc(j.zitat || '—')}
          </div>
          <details><summary class="dim small">Rohe Antwort anzeigen</summary>
          <pre class="mono small" style="white-space:pre-wrap">${esc(r.roh || '')}</pre></details>`;
      } catch (e) {
        chip.textContent = 'Fehler'; chip.className = 'status-chip err';
        $('#tErgebnis', page).innerHTML = `<div class="fehler">${esc(e.message)}</div>`;
      }
    });

    // ── Letzte Erkennungen ──
    page.appendChild(karte('🗒️ Letzte Erkennungen', `<div id="detBox"><p class="dim">Lade …</p></div>`));
    const { liste } = await API.get('/aidetections?guildId=' + gid + '&limit=30');
    const box = $('#detBox', page);
    box.innerHTML = liste.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Zeit</th><th>User</th><th>Modus</th><th>Kat.</th><th>SG</th><th>Treffer</th><th>Begründung</th></tr></thead>
      ${liste.map((d) => `<tr>
        <td class="small">${fmtDatum(d.zeit)}</td><td class="small mono">${esc(d.autor)}</td>
        <td class="small">${esc(d.modus)}</td><td class="small">${esc(d.kategorie)}</td><td>${d.schweregrad}</td>
        <td>${d.treffer ? '<span class="badge err">Ja</span>' : '<span class="badge ok">Nein</span>'}</td>
        <td class="small">${esc(d.begruendung).slice(0, 100)}</td></tr>`).join('')}</table></div>`
      : '<p class="dim">Noch keine Erkennungen.</p>';
  }

  // ══════════════════ SEITE: WORTFILTER ══════════════════
  async function seiteWortfilter(page) {
    const data = await API.get('/filterwords?guildId=' + gid);
    page.appendChild(karte('🧹 Wortfilter', `
      <div class="row mb">
        <span class="small">Aktiv:</span> ${toggleHTML('wfOn', data.enabled)}
        ${feld('Platzhalter (Zensur)', textInput('wfPh', data.placeholder, '████'))}
        <button class="btn primary" id="wfSaveTop" style="align-self:flex-end">💾 Speichern</button>
      </div>`));
    const zeile = (w) => `
      <tr>
        <td><input class="input" value="${esc(w.word)}" data-f="word"></td>
        <td style="text-align:center"><input type="checkbox" data-f="regex" ${w.regex ? 'checked' : ''}></td>
        <td><select class="input" data-f="modus">
          <option value="zensieren" ${w.modus !== 'loeschen' ? 'selected' : ''}>Zensieren</option>
          <option value="loeschen" ${w.modus === 'loeschen' ? 'selected' : ''}>Löschen</option></select></td>
        <td style="text-align:center"><input type="checkbox" data-f="eintrag" ${w.eintrag ? 'checked' : ''}></td>
        <td><input class="input" type="number" min="1" max="10" value="${w.schweregrad}" data-f="schweregrad" style="width:70px"></td>
        <td><button class="btn small danger wf-del">✕</button></td>
      </tr>`;
    const tab = karte('📖 Wörterbuch', `
      <div class="table-wrap"><table class="table" id="wfTable">
        <thead><tr><th>Wort / Regex</th><th>Regex?</th><th>Modus</th><th>Mit Eintrag?</th><th>SG</th><th></th></tr></thead>
        <tbody>${(data.words || []).map(zeile).join('')}</tbody></table></div>
      <div class="row mt">
        <button class="btn small" id="wfAdd">+ Wort</button>
        <button class="btn primary" id="wfSave">💾 Alle speichern</button>
      </div>
      <p class="dim small mt">Umgehungsversuche (h*rensohn, h4r3n50hn, Leerzeichen-Spam, Doppelbuchstaben) werden automatisch erkannt.
      „Regex?" = Eintrag als regulärer Ausdruck interpretieren.</p>`);
    page.appendChild(tab);
    function bindDel() {
      $$('.wf-del', tab).forEach((b) => b.addEventListener('click', () => b.closest('tr').remove()));
    }
    bindDel();
    $('#wfAdd', tab).addEventListener('click', () => {
      $('tbody', tab).insertAdjacentHTML('beforeend', zeile(
        { word: '', regex: false, modus: 'zensieren', eintrag: false, schweregrad: 3 }));
      bindDel();
    });
    const sammle = () => $$('tbody tr', tab).map((tr) => ({
      word: $('[data-f=word]', tr).value,
      regex: $('[data-f=regex]', tr).checked,
      modus: $('[data-f=modus]', tr).value,
      eintrag: $('[data-f=eintrag]', tr).checked,
      schweregrad: Number($('[data-f=schweregrad]', tr).value) || 3,
    })).filter((w) => w.word.trim());
    const sp = () => API.post('/filterwords?guildId=' + gid, {
      words: sammle(), extra: { enabled: chk('wfOn'), placeholder: val('wfPh') || '████' },
    }).then(() => toast('Wortfilter gespeichert ✔', 'ok')).catch((e) => toast(e.message, 'err'));
    $('#wfSave', tab).addEventListener('click', sp);
    $('#wfSaveTop', page).addEventListener('click', sp);

    page.appendChild(karte('📊 Treffer-Statistik', `<div id="fhBox"><p class="dim">Lade …</p></div>`));
    const { top, letzte } = await API.get('/filterhits?guildId=' + gid);
    const fh = $('#fhBox', page);
    fh.innerHTML = (top.length ? `
      <b class="small">Top gefilterte Wörter</b>
      <div class="mb">${top.map((t) => `<span class="badge err" style="margin:2px">${esc(t.word)} · ${t.anzahl}×</span>`).join(' ')}</div>
      <b class="small">Letzte Treffer</b>
      ${letzte.map((h) => `<div class="feed-item"><span class="badge err">${esc(h.word)}</span>
        <span class="feed-zeit">${fmtRelativ(h.zeit)}</span></div>`).join('')}`
      : '<p class="dim">Noch keine Treffer.</p>');
  }

  // ══════════════════ SEITE: WIRTSCHAFT & STEUERN ══════════════════
  async function seiteWirtschaft(page) {
    const s = await ladeSettings();
    const e = s.economy;
    const kan = await ladeKanäle();

    const tiersHtml = (id, tiers) => (tiers || []).map((t, i) => `
      <tr><td><input class="input" type="number" min="0" id="${id}_bis${i}" value="${t.bis ?? ''}" placeholder="leer = unbegrenzt"></td>
      <td><input class="input" type="number" min="0" max="100" id="${id}_p${i}" value="${t.percent}"></td>
      <td><button class="btn small danger" data-del="${id}${i}">✕</button></td></tr>`).join('');

    page.appendChild(karte('💰 Währung & Grundeinstellungen', `
      <div class="grid-3">
        ${feld('Währungsname', textInput('eCur', e.currency))}
        ${feld('Symbol/Emoji', textInput('eSym', e.symbol))}
        ${feld('Startguthaben', zahlInput('eStart', e.startBalance))}
        ${feld('Daily-Betrag', zahlInput('eDaily', e.dailyAmount))}
        ${feld('Streak-Bonus pro Tag', zahlInput('eStreakB', e.dailyStreakBonus))}
        ${feld('Streak-Maximum (Tage)', zahlInput('eStreakM', e.dailyStreakMax))}
        ${feld('Work-Cooldown (Min.)', zahlInput('eWorkCd', e.workCooldownMinutes))}
        ${feld('Work-Gehalt min', zahlInput('eWorkMin', e.workMin))}
        ${feld('Work-Gehalt max', zahlInput('eWorkMax', e.workMax))}
        ${feld('Rob-Erfolgschance (%)', zahlInput('eRob', e.robChance, 0, 100))}
        ${feld('Rob-Strafe (%) bei Scheitern', zahlInput('eRobFine', e.robFinePercent, 0, 100))}
        ${feld('Gamble-Hausvorteil (%)', zahlInput('eEdge', e.gambleHouseEdge, 0, 50))}
        ${feld('Bankzinsen (%/Tag)', `<input class="input" type="number" step="0.1" id="eBankI" value="${e.bankInterestPerDay}">`)}
        ${feld('Schuldenzinsen (%/Tag)', `<input class="input" type="number" step="0.1" id="eDebtI" value="${e.debtInterestPerDay}">`)}
        ${feld('Schuldner-Rollenname', textInput('eDebtRole', e.debtRoleName))}
        ${feld('Ankündigungs-Kanal (Steuer-Warnung, Jackpots)', selectHTML('eAnnounce', kanalOptionen(kan), e.announcementChannel))}
      </div>`));

    page.appendChild(karte('🧾 Einkommensteuer (/work, /daily)', `
      <div class="row mb"><span class="small">Flacher Satz % (0 = progressive Staffeln nutzen):</span>
        ${zahlInput('eIncFlat', e.incomeTaxPercent, 0, 90).replace('<input', '<input style="max-width:110px"')}</div>
      <b class="small">Progressive Staffeln</b>
      <div class="table-wrap"><table class="table"><thead>
        <tr><th>Bis (Vermögen/Lohn) – leer = unbegrenzt</th><th>Prozent</th><th></th></tr></thead>
        <tbody id="incTiers">${tiersHtml('inc', e.incomeTaxTiers)}</tbody></table></div>
      <button class="btn small mt" id="incAdd">+ Staffel</button>`));

    const wt = e.wealthTax;
    page.appendChild(karte('🏛️ Vermögenssteuer', `
      <div class="grid-3">
        <div class="feld"><span>Aktiv</span>${toggleHTML('wtOn', wt.enabled)}</div>
        ${feld('Intervall', selectHTML('wtInt', [['täglich', 'Täglich'], ['wöchentlich', 'Wöchentlich'], ['monatlich', 'Monatlich']], wt.intervall))}
        ${feld('Uhrzeit', `<input class="input" type="time" id="wtTime" value="${esc(wt.uhrzeit)}">`)}
        ${feld('Warnung X Stunden vorher', zahlInput('wtWarn', wt.warnHoursBefore, 1, 168))}
      </div>
      <b class="small">Staffeln</b>
      <div class="table-wrap"><table class="table"><thead>
        <tr><th>Bis (Vermögen) – leer = unbegrenzt</th><th>Prozent</th><th></th></tr></thead>
        <tbody id="wtTiers">${tiersHtml('wt', wt.tiers)}</tbody></table></div>
      <button class="btn small mt" id="wtAdd">+ Staffel</button>`));

    page.appendChild(karte('💸 Transaktionssteuer (/pay)', `
      ${feld('Prozent pro Überweisung', zahlInput('eTx', e.transactionTaxPercent, 0, 50))}
      ${saveBar('saveEco')}`));

    // Kasse
    const ov = await API.get('/economy/overview?guildId=' + gid);
    page.appendChild(karte('🏦 Serverkasse (Treasury)', `
      <div class="grid-3 mb">
        <div class="stat"><span class="val">${fmtZahl(ov.kasse)}</span><span class="lbl">Kassenstand</span></div>
        <div class="stat"><span class="val">${fmtZahl(ov.geldmenge)}</span><span class="lbl">Geldmenge im Umlauf</span></div>
        <div class="stat"><span class="val">${fmtZahl(ov.konten)}</span><span class="lbl">Konten</span></div>
      </div>
      <b class="small">Letzte Bewegungen</b>
      ${ov.log.slice(0, 12).map((l) => `<div class="feed-item">
        <span class="badge ${l.betrag >= 0 ? 'ok' : 'err'}">${l.betrag >= 0 ? '+' : ''}${fmtZahl(l.betrag)}</span>
        <span>${esc(l.grund)} <span class="dim small">(${esc(l.quelle)})</span></span>
        <span class="feed-zeit">${fmtRelativ(l.zeit)}</span></div>`).join('') || '<p class="dim">Noch keine Bewegungen.</p>'}`));

    // Staffel-Zeilen hinzufügen
    const addTier = (tbodyId) => {
      const tb = document.getElementById(tbodyId);
      const n = tb.rows.length;
      tb.insertAdjacentHTML('beforeend', `
        <tr><td><input class="input" type="number" min="0" placeholder="leer = unbegrenzt"></td>
        <td><input class="input" type="number" min="0" max="100" value="5"></td>
        <td><button class="btn small danger">✕</button></td></tr>`);
      tb.lastElementChild.querySelector('button').addEventListener('click', (ev) => ev.target.closest('tr').remove());
    };
    $('#incAdd', page).addEventListener('click', () => addTier('incTiers'));
    $('#wtAdd', page).addEventListener('click', () => addTier('wtTiers'));
    $$('#page [data-del]', page).forEach((b) => b.addEventListener('click', () => b.closest('tr').remove()));

    const leseTiers = (prae) => {
      // Zeilen anhand Tabellenposition lesen (robust gegen IDs)
      const tabellen = { inc: '#incTiers', wt: '#wtTiers' };
      return $$(tabellen[prae] + ' tr', page).map((tr) => ({
        bis: tr.cells[0].querySelector('input').value === '' ? null : Number(tr.cells[0].querySelector('input').value),
        percent: Number(tr.cells[1].querySelector('input').value) || 0,
      }));
    };
    $('#saveEco', page).addEventListener('click', () => speichere({
      economy: {
        currency: val('eCur'), symbol: val('eSym'), startBalance: num('eStart'),
        dailyAmount: num('eDaily'), dailyStreakBonus: num('eStreakB'), dailyStreakMax: num('eStreakM'),
        workCooldownMinutes: num('eWorkCd'), workMin: num('eWorkMin'), workMax: num('eWorkMax'),
        robChance: num('eRob'), robFinePercent: num('eRobFine'), gambleHouseEdge: num('eEdge'),
        bankInterestPerDay: Number(val('eBankI')), debtInterestPerDay: Number(val('eDebtI')),
        debtRoleName: val('eDebtRole'), announcementChannel: val('eAnnounce'),
        incomeTaxPercent: num('eIncFlat'), incomeTaxTiers: leseTiers('inc'),
        transactionTaxPercent: num('eTx'),
        wealthTax: {
          enabled: chk('wtOn'), intervall: val('wtInt'), uhrzeit: val('wtTime') || '20:00',
          warnHoursBefore: num('wtWarn'), tiers: leseTiers('wt'),
        },
      },
    }));
  }

  // ══════════════════ SEITE: LEVEL ══════════════════
  async function seiteLevel(page) {
    const s = await ladeSettings();
    const l = s.level;
    const [kan, rol] = [await ladeKanäle(), await ladeRollen()];
    page.appendChild(karte('⭐ Level-Grundeinstellungen', `
      <div class="grid-3">
        <div class="feld"><span>Aktiv</span>${toggleHTML('lvOn', l.enabled)}</div>
        ${feld('XP pro Nachricht', zahlInput('lvXp', l.xpPerMessage, 1, 500))}
        ${feld('Cooldown (Sekunden)', zahlInput('lvCd', l.xpCooldownSeconds, 0, 600))}
        ${feld('Voice-XP pro Minute', zahlInput('lvVoice', l.voiceXpPerMinute, 0, 200))}
        ${feld('Levelup-Kanal (leer = im Chat)', selectHTML('lvCh', kanalOptionen(kan), l.levelupChannel))}
        ${feld('Rollen-Belohnungen', selectHTML('lvMode', [['stack', 'Stapelnd'], ['replace', 'Ersetzend']], l.rewardMode))}
        ${feld('Rank-Card-Stil', selectHTML('lvStyle', [['glass', 'Glass'], ['minimal', 'Minimal'], ['neon', 'Neon']], l.cardStyle))}
      </div>`));
    const rewards = (l.roleRewards || []).map((r, i) => `
      <tr><td>${zahlInput('rr_l' + i, r.level, 1, 500)}</td>
      <td>${selectHTML('rr_r' + i, rollenOptionen(rol), r.roleId || '')}</td>
      <td><button class="btn small danger rr-del">✕</button></td></tr>`).join('');
    const mults = (l.roleMultipliers || []).map((r, i) => `
      <tr><td>${selectHTML('rm_r' + i, rollenOptionen(rol), r.roleId || '')}</td>
      <td><input class="input" type="number" step="0.1" min="0.1" max="10" id="rm_m${i}" value="${r.multi || 1}"></td>
      <td><button class="btn small danger rm-del">✕</button></td></tr>`).join('');
    page.appendChild(karte('🏷️ Level-Rollen (bei Erreichen des Levels)', `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Ab Level</th><th>Rolle</th><th></th></tr></thead>
        <tbody id="rrBody">${rewards}</tbody></table></div>
      <button class="btn small mt" id="rrAdd">+ Belohnung</button>`));
    page.appendChild(karte('✖️ Rollen-Multiplikatoren (XP-Faktor)', `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Rolle</th><th>Multiplikator</th><th></th></tr></thead>
        <tbody id="rmBody">${mults}</tbody></table></div>
      <button class="btn small mt" id="rmAdd">+ Multiplikator</button>
      ${saveBar('saveLv')}`));
    const bindKlasse = (klasse) => $$('.' + klasse, page)
      .forEach((b) => b.addEventListener('click', () => b.closest('tr').remove()));
    bindKlasse('rr-del'); bindKlasse('rm-del');
    $('#rrAdd', page).addEventListener('click', () => {
      const n = $('#rrBody', page).rows.length;
      $('#rrBody', page).insertAdjacentHTML('beforeend', `
        <tr><td>${zahlInput('rr_l' + n + 'x', 5, 1, 500)}</td>
        <td>${selectHTML('rr_r' + n + 'x', rollenOptionen(rol), '')}</td>
        <td><button class="btn small danger rr-del">✕</button></td></tr>`);
      bindKlasse('rr-del');
    });
    $('#rmAdd', page).addEventListener('click', () => {
      const n = $('#rmBody', page).rows.length;
      $('#rmBody', page).insertAdjacentHTML('beforeend', `
        <tr><td>${selectHTML('rm_r' + n + 'x', rollenOptionen(rol), '')}</td>
        <td><input class="input" type="number" step="0.1" value="1.5" id="rm_m${n}x"></td>
        <td><button class="btn small danger rm-del">✕</button></td></tr>`);
      bindKlasse('rm-del');
    });
    $('#saveLv', page).addEventListener('click', () => speichere({
      level: {
        enabled: chk('lvOn'), xpPerMessage: num('lvXp'), xpCooldownSeconds: num('lvCd'),
        voiceXpPerMinute: num('lvVoice'), levelupChannel: val('lvCh'),
        rewardMode: val('lvMode'), cardStyle: val('lvStyle'),
        roleRewards: $$('#rrBody tr', page).map((tr) => ({
          level: Number(tr.cells[0].querySelector('input').value) || 1,
          roleId: tr.cells[1].querySelector('select').value,
          roleName: (rollenCache.find((r) => r.id === tr.cells[1].querySelector('select').value) || {}).name || '',
        })),
        roleMultipliers: $$('#rmBody tr', page).map((tr) => ({
          roleId: tr.cells[0].querySelector('select').value,
          multi: Number(tr.cells[1].querySelector('input').value) || 1,
        })),
      },
    }));
  }

  // ══════════════════ SEITE: TICKETS ══════════════════
  async function seiteTickets(page) {
    const s = await ladeSettings();
    const t = s.tickets;
    const kan = await ladeKanäle();
    const rol = await ladeRollen();
    const kategorien = (t.categories || []).map((k, i) => `
      <tr><td><input class="input" value="${esc(k.name)}" data-kat="name"></td>
      <td><input class="input" value="${esc(k.emoji || '')}" data-kat="emoji" style="width:70px;text-align:center"></td>
      <td><button class="btn small danger kat-del">✕</button></td></tr>`).join('');
    page.appendChild(karte('🎫 Ticket-Einstellungen', `
      <div class="grid-3">
        ${feld('Staff-Rolle (sieht alle Tickets)', selectHTML('tkStaff', rollenOptionen(rol), t.staffRole))}
        ${feld('Discord-Kategorie für Ticket-Kanäle', selectHTML('tkKat', kanalOptionen(kan.filter((k) => k.typ === 4)), t.category))}
        ${feld('Transkript-Kanal', selectHTML('tkTrans', kanalOptionen(kan), t.transcriptChannel))}
      </div>
      <b class="small">Kategorien (fürs Panel-Dropdown)</b>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Emoji</th><th></th></tr></thead>
        <tbody id="katBody">${kategorien}</tbody></table></div>
      <div class="row mt"><button class="btn small" id="katAdd">+ Kategorie</button>${saveBar('saveTk')}</div>`));
    const bind = () => $$('.kat-del', page).forEach((b) =>
      b.addEventListener('click', () => b.closest('tr').remove()));
    bind();
    $('#katAdd', page).addEventListener('click', () => {
      $('#katBody', page).insertAdjacentHTML('beforeend', `
        <tr><td><input class="input" data-kat="name" placeholder="Neue Kategorie"></td>
        <td><input class="input" data-kat="emoji" value="🎫" style="width:70px;text-align:center"></td>
        <td><button class="btn small danger kat-del">✕</button></td></tr>`);
      bind();
    });
    $('#saveTk', page).addEventListener('click', () => speichere({
      tickets: {
        staffRole: val('tkStaff'), category: val('tkKat'), transcriptChannel: val('tkTrans'),
        categories: $$('#katBody tr', page).map((tr) => ({
          name: $('[data-kat=name]', tr).value.trim(), emoji: $('[data-kat=emoji]', tr).value.trim() || '🎫',
        })).filter((k) => k.name),
      },
    }));

    // Transkripte
    const { liste } = await API.get('/transcripts?guildId=' + gid);
    page.appendChild(karte('📄 Transkripte (' + liste.length + ')', liste.length ? `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Kanal</th><th>Kategorie</th><th>User</th><th>Nachrichten</th><th>Zeit</th><th></th></tr></thead>
        ${liste.map((x) => `<tr>
          <td class="small">#${esc(x.kanalName)}</td><td class="small">${esc(x.kategorie)}</td>
          <td class="small mono">${esc(x.userId).slice(-6)}</td><td>${x.nachrichten}</td>
          <td class="small">${fmtDatum(x.zeit)}</td>
          <td><a class="btn small" href="/api/transcripts/${esc(x.id)}" target="_blank">Ansehen</a></td></tr>`).join('')}
      </table></div>` : '<p class="dim">Noch keine Transkripte. Sie entstehen beim Schließen eines Tickets.</p>'));
  }

  // ══════════════════ SEITE: AUTO-MOD (aufgeräumt) ══════════════════
  async function seiteAutoMod(page) {
    const s = await ladeSettings();
    const am = s.automod;
    const A = (id, v) => selectHTML(id,
      [['loeschen', 'Löschen'], ['zensieren', 'Zensieren'], ['timeout', 'Timeout']], v);
    const regel = (titel, togId, togWert, body) => `
      <section class="panel card regel">
        <div class="regel-kopf"><b>${titel}</b> ${toggleHTML(togId, togWert)}</div>
        <div class="regel-body">${body}</div>
      </section>`;

    page.appendChild(karte('🛡️ Auto-Mod', `
      <div class="row mb">
        <span class="small">System global aktiv:</span> ${toggleHTML('amOn', am.enabled)}
        <button class="btn primary" id="saveAm" style="margin-left:auto">💾 Alles speichern</button>
      </div>
      <div class="regel-grid">
        ${regel('🔗 Invite-Filter', 'amInv', am.inviteFilter.enabled, `
          ${feld('Aktion', A('amInvA', am.inviteFilter.aktion))}
          <div class="row small">${toggleHTML('amInvE', am.inviteFilter.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
        ${regel('🌐 Link-Filter', 'amLink', am.linkFilter.enabled, `
          ${feld('Erlaubte Domains (eine pro Zeile)', `<textarea class="input" id="amLinkWl" rows="2">${esc((am.linkFilter.whitelist || []).join('\n'))}</textarea>`)}
          ${feld('Aktion', A('amLinkA', am.linkFilter.aktion))}
          <div class="row small">${toggleHTML('amLinkE', am.linkFilter.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
        ${regel('🔠 CAPS-Limit', 'amCaps', am.capsLimit.enabled, `
          <div class="row small"><span class="dim">Max.</span> ${zahlInput('amCapsP', am.capsLimit.percent, 10, 100).replace('<input', '<input style="width:80px"')} <span class="dim">% Großbuchstaben ab</span> ${zahlInput('amCapsL', am.capsLimit.minLength, 3, 100).replace('<input', '<input style="width:70px"')} <span class="dim">Zeichen</span></div>
          ${feld('Aktion', A('amCapsA', am.capsLimit.aktion))}
          <div class="row small">${toggleHTML('amCapsE', am.capsLimit.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
        ${regel('😎 Emoji-Spam', 'amEmo', am.emojiSpam.enabled, `
          <div class="row small"><span class="dim">Mehr als</span> ${zahlInput('amEmoL', am.emojiSpam.limit, 2, 100).replace('<input', '<input style="width:80px"')} <span class="dim">Emojis</span></div>
          ${feld('Aktion', A('amEmoA', am.emojiSpam.aktion))}
          <div class="row small">${toggleHTML('amEmoE', am.emojiSpam.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
        ${regel('📣 Mention-Spam', 'amMen', am.mentionSpam.enabled, `
          <div class="row small"><span class="dim">Mehr als</span> ${zahlInput('amMenL', am.mentionSpam.limit, 2, 50).replace('<input', '<input style="width:80px"')} <span class="dim">Erwähnungen</span></div>
          ${feld('Aktion', A('amMenA', am.mentionSpam.aktion))}
          <div class="row small">${toggleHTML('amMenE', am.mentionSpam.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
        ${regel('💨 Nachrichten-Spam', 'amMsg', am.messageSpam.enabled, `
          <div class="row small"><span class="dim">Mehr als</span> ${zahlInput('amMsgX', am.messageSpam.messages, 2, 50).replace('<input', '<input style="width:70px"')} <span class="dim">Nachrichten in</span> ${zahlInput('amMsgY', am.messageSpam.withinSeconds, 2, 120).replace('<input', '<input style="width:70px"')} <span class="dim">Sek.</span></div>
          ${feld('Aktion', A('amMsgA', am.messageSpam.aktion))}
          <div class="row small"><span class="dim">Timeout:</span> ${zahlInput('amMsgT', am.messageSpam.timeoutMinutes, 1, 1440).replace('<input', '<input style="width:70px"')} <span class="dim">Min.</span>
          ${toggleHTML('amMsgE', am.messageSpam.eintrag)} <span class="dim">Mit Eintrag</span></div>`)}
      </div>`));

    page.appendChild(karte('🚨 Schutz-Systeme', `
      <div class="regel-grid">
        ${regel('🛡️ Anti-Raid', 'amRaid', am.antiRaid.enabled, `
          <div class="row small"><span class="dim">Mehr als</span> ${zahlInput('amRaidJ', am.antiRaid.joins, 3, 100).replace('<input', '<input style="width:70px"')} <span class="dim">Joins in</span> ${zahlInput('amRaidS', am.antiRaid.withinSeconds, 5, 600).replace('<input', '<input style="width:70px"')} <span class="dim">Sek. → Schutzmodus + Auto-Kick</span></div>`)}
        ${regel('☢️ Anti-Nuke-Wache', 'amNuke', am.antiNuke.enabled, `
          <div class="row small"><span class="dim">Warnung bei</span> ${zahlInput('amNukeC', am.antiNuke.channelDeletes, 1, 50).replace('<input', '<input style="width:60px"')} <span class="dim">Kanal-Löschungen /</span> ${zahlInput('amNukeR', am.antiNuke.roleChanges, 1, 50).replace('<input', '<input style="width:60px"')} <span class="dim">Rollen-Änderungen in</span> ${zahlInput('amNukeM', am.antiNuke.withinMinutes, 1, 120).replace('<input', '<input style="width:60px"')} <span class="dim">Min.</span></div>`)}
      </div>`));

    page.appendChild(karte('✅ Whitelist (werden nie gefiltert)', `
      <div class="grid-2">
        ${feld('Rollen-IDs (eine pro Zeile)', `<textarea class="input" id="amWlR" rows="2">${esc((am.whitelistRoles || []).join('\n'))}</textarea>`)}
        ${feld('User-IDs (eine pro Zeile)', `<textarea class="input" id="amWlU" rows="2">${esc((am.whitelistUsers || []).join('\n'))}</textarea>`)}
      </div>`));

    $('#saveAm', page).addEventListener('click', () => speichere({
      automod: {
        enabled: chk('amOn'),
        whitelistRoles: val('amWlR').split('\n').map((x) => x.trim()).filter(Boolean),
        whitelistUsers: val('amWlU').split('\n').map((x) => x.trim()).filter(Boolean),
        inviteFilter: { enabled: chk('amInv'), aktion: val('amInvA'), eintrag: chk('amInvE') },
        linkFilter: { enabled: chk('amLink'), whitelist: val('amLinkWl').split('\n').map((x) => x.trim()).filter(Boolean), aktion: val('amLinkA'), eintrag: chk('amLinkE') },
        capsLimit: { enabled: chk('amCaps'), percent: num('amCapsP'), minLength: num('amCapsL'), aktion: val('amCapsA'), eintrag: chk('amCapsE') },
        emojiSpam: { enabled: chk('amEmo'), limit: num('amEmoL'), aktion: val('amEmoA'), eintrag: chk('amEmoE') },
        mentionSpam: { enabled: chk('amMen'), limit: num('amMenL'), aktion: val('amMenA'), eintrag: chk('amMenE') },
        messageSpam: { enabled: chk('amMsg'), messages: num('amMsgX'), withinSeconds: num('amMsgY'), aktion: val('amMsgA'), timeoutMinutes: num('amMsgT'), eintrag: chk('amMsgE') },
        antiRaid: { enabled: chk('amRaid'), joins: num('amRaidJ'), withinSeconds: num('amRaidS'), aktion: 'kick' },
        antiNuke: { enabled: chk('amNuke'), channelDeletes: num('amNukeC'), roleChanges: num('amNukeR'), withinMinutes: num('amNukeM') },
      },
    }));
  }

  // ══════════════════ SEITE: COMMANDS AN/AUS ══════════════════
  async function seiteCommands(page) {
    const [cmdData, togData] = await Promise.all([
      API.get('/commandlist'),
      API.get('/commandtoggles?guildId=' + gid),
    ]);
    let disabled = togData.disabled || {};

    page.appendChild(karte('🔀 Commands ein-/ausschalten', `
      <p class="dim small mb">Deaktivierte Commands antworten auf diesem Server mit „ist deaktiviert". Änderungen speichern sofort.</p>
      <div class="row mb">
        <input class="input" id="cmdSearch" placeholder="🔍 Command suchen…" style="max-width:240px">
        <button class="btn small" id="cmdAllOn">✅ Alle an</button>
        <button class="btn small danger" id="cmdAllOff">⛔ Alle aus</button>
        <span class="dim small" id="cmdZaehler"></span>
      </div>
      <div class="regel-grid" id="cmdGrid"></div>`));

    const grid = $('#cmdGrid', page);
    const zaehler = () => {
      const alle = $$('.cmd-toggle', grid);
      const an = alle.filter((t) => t.checked).length;
      $('#cmdZaehler', page).textContent = `${an}/${alle.length} aktiv`;
    };

    async function speichereToggles() {
      const d = {};
      $$('.cmd-toggle', grid).forEach((t) => { if (!t.checked) d[t.dataset.name] = true; });
      try {
        await API.post('/commandtoggles?guildId=' + gid, { disabled: d });
        disabled = d; // lokalen Stand aktualisieren
        toast('Gespeichert ✔', 'ok', 1500);
      } catch (e) { toast(e.message, 'err'); }
      zaehler();
    }

    function bauen(filter) {
      grid.innerHTML = '';
      const liste = cmdData.liste.filter((c) => !filter || c.name.includes(filter));
      if (!liste.length) { grid.innerHTML = '<p class="dim">Keine Treffer.</p>'; return; }
      for (const c of liste) {
        const k = el(`<div class="panel card cmd-karte">
          <div class="regel-kopf">
            <b class="mono">/${esc(c.name)}${c.custom ? ' <span class="badge info">eigen</span>' : ''}</b>
            <label class="toggle"><input type="checkbox" class="cmd-toggle" data-name="${esc(c.name)}" ${disabled[c.name] ? '' : 'checked'}><i></i></label>
          </div>
          <span class="dim small">${esc(c.description || '')}</span>
        </div>`);
        $('.cmd-toggle', k).addEventListener('change', speichereToggles);
        grid.appendChild(k);
      }
      zaehler();
    }
    bauen('');

    $('#cmdSearch', page).addEventListener('input', debounce(() => bauen(val('cmdSearch').toLowerCase().trim()), 250));
    $('#cmdAllOn', page).addEventListener('click', () => {
      $$('.cmd-toggle', grid).forEach((t) => { t.checked = true; });
      speichereToggles();
    });
    $('#cmdAllOff', page).addEventListener('click', () => {
      $$('.cmd-toggle', grid).forEach((t) => { t.checked = false; });
      speichereToggles();
    });
  }
  // ══════════════════ SEITE: LOGS ══════════════════
  async function seiteLogs(page) {
    const s = await ladeSettings();
    const kan = await ladeKanäle();
    const kats = [['nachrichten', 'Nachrichten (bearbeitet/gelöscht)'], ['mitglieder', 'Joins/Leaves'],
      ['rollen', 'Rollen-Änderungen'], ['kanaele', 'Kanal-Änderungen'], ['voice', 'Voice-Aktivität']];
    page.appendChild(karte('📜 Log-Kanäle zuweisen', `
      ${kats.map(([k, label]) => feld(label, selectHTML('log_' + k, kanalOptionen(kan), s.logs.channels[k]))).join('')}
      ${saveBar('saveLogs')}`));
    $('#saveLogs', page).addEventListener('click', () => {
      const channels = {};
      for (const [k] of kats) channels[k] = val('log_' + k);
      speichere({ logs: { channels } });
    });
  }

  // ══════════════════ SEITE: WILLKOMMEN (+ KI-Chat, Vorschläge) ══════════════════
  async function seiteWillkommen(page) {
    const s = await ladeSettings();
    const kan = await ladeKanäle();
    const rol = await ladeRollen();
    page.appendChild(karte('👋 Willkommen', `
      <div class="grid-2">
        ${feld('Willkommens-Kanal', selectHTML('wCh', kanalOptionen(kan), s.welcome.channel))}
        ${feld('Auto-Rolle', selectHTML('wRole', rollenOptionen(rol), s.welcome.autoRole))}
      </div>
      ${feld('Nachricht (Variablen: {user} {username} {server} {count})', `<textarea class="input" id="wMsg" rows="2">${esc(s.welcome.message)}</textarea>`)}
      ${feld('DM an neue Mitglieder (leer = keine DM, gleiche Variablen)', `<textarea class="input" id="wDm" rows="2">${esc(s.welcome.dm)}</textarea>`)}`));
    page.appendChild(karte('🤖 KI-Chat-Kanal (Bot antwortet auf alles – Ollama)', `
      <div class="grid-2">
        <div class="feld"><span>Aktiv</span>${toggleHTML('aiChOn', s.aiChat.enabled)}</div>
        ${feld('Kanal', selectHTML('aiCh', kanalOptionen(kan), s.aiChat.channel))}
      </div>
      ${feld('Persona/Charakter des Bots', `<textarea class="input" id="aiPers" rows="2">${esc(s.aiChat.persona)}</textarea>`)}`));
    page.appendChild(karte('💡 Vorschläge', `
      ${feld('Vorschlags-Kanal (mit Voting-Buttons)', selectHTML('sugCh', kanalOptionen(kan), s.suggestions.channel))}
      ${saveBar('saveW')}`));
    $('#saveW', page).addEventListener('click', () => speichere({
      welcome: { channel: val('wCh'), autoRole: val('wRole'), message: val('wMsg'), dm: val('wDm') },
      aiChat: { enabled: chk('aiChOn'), channel: val('aiCh'), persona: val('aiPers') },
      suggestions: { channel: val('sugCh') },
    }));
  }

  // ══════════════════ SEITE: EIGENE COMMANDS ══════════════════
  async function seiteCustom(page) {
    const { liste } = await API.get('/customcommands');
    page.appendChild(karte('🧩 Eigene Commands (' + liste.length + ')', `
      <button class="btn primary mb" id="ccNew">+ Neuer Command</button>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Name</th><th>Beschreibung</th><th>Typ</th><th>Cooldown</th><th></th></tr></thead>
        <tbody>
        ${liste.map((c) => `<tr>
          <td class="mono">/${esc(c.name)}</td><td class="small">${esc(c.description)}</td>
          <td class="small">${c.embed ? 'Embed' : 'Text'}</td><td>${c.cooldown || 0} s</td>
          <td><button class="btn small danger cc-del" data-id="${esc(c.id)}">Löschen</button></td></tr>`).join('')
          || '<tr><td colspan="5" class="dim">Noch keine eigenen Commands.</td></tr>'}
        </tbody></table></div>
      <p class="dim small mt">Eigene Commands werden live in den Bot geladen – ohne Neustart.</p>`));
    $$('.cc-del', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDlg('Command wirklich löschen?'))) return;
      await API.del('/customcommands/' + b.dataset.id);
      toast('Gelöscht ✔', 'ok'); route('custom');
    }));
    $('#ccNew', page).addEventListener('click', () => {
      const body = el(`<div>
        <div class="grid-2">
          ${feld('Name (ohne /)', `<input class="input" id="ccName" placeholder="hallo">`)}
          ${feld('Beschreibung', `<input class="input" id="ccDesc" placeholder="Sagt hallo">`)}
        </div>
        ${feld('Antwort', `<textarea class="input" id="ccResp" rows="3" placeholder="Hallo {user}!"></textarea>`)}
        <div class="row mb"><span class="small">Als Embed:</span>${toggleHTML('ccEmbed', false)}
          ${feld('Embed-Titel', textInput('ccTitle', ''))}
          ${feld('Farbe', `<input type="color" id="ccColor" value="#5865F2">`)}
          ${feld('Bild-URL', textInput('ccImg', ''))}
          ${feld('Cooldown (Sekunden)', zahlInput('ccCd', 0, 0, 3600))}
        </div>
        ${feld('Nur für Rollen-IDs (eine pro Zeile, leer = alle)', `<textarea class="input" id="ccRoles" rows="2"></textarea>`)}
        <p class="dim small">Tipp: {user} in der Antwort wird nicht ersetzt – der Bot sendet den Text wörtlich. Nutze Embed für schöne Ausgaben.</p>
      </div>`);
      openModal('Eigenen Command erstellen', body, [
        { label: 'Abbrechen', action: (zu) => zu() },
        { label: '💾 Erstellen', klasse: 'primary', action: async (zu) => {
          try {
            await API.post('/customcommands', {
              name: val('ccName'), description: val('ccDesc'), response: val('ccResp'),
              embed: chk('ccEmbed'), title: val('ccTitle'), color: val('ccColor').slice(1),
              image: val('ccImg'), cooldown: num('ccCd'),
              roles: val('ccRoles').split('\n').map((x) => x.trim()).filter(Boolean),
              guildId: gid,
            });
            toast('Command erstellt & live geladen ✔', 'ok');
            zu(); route('custom');
          } catch (e) { toast(e.message, 'err'); }
        } },
      ]);
    });
  }

  // ══════════════════ SEITE: ANALYTICS ══════════════════
  async function seiteAnalytics(page) {
    const d = await API.get('/analytics?guildId=' + gid);
    const mk = (titel) => {
      const k = karte(titel, '<div class="chart-box"><canvas></canvas></div>');
      page.appendChild(k);
      return $('canvas', k);
    };
    const opt = { responsive: true, maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#aab' } } },
      scales: { x: { ticks: { color: '#889' }, grid: { color: 'rgba(127,127,127,.12)' } },
                y: { ticks: { color: '#889' }, grid: { color: 'rgba(127,127,127,.12)' }, beginAtZero: true } } };
    const C = Chart.defaults; C.color = '#aab';
    charts.push(new Chart(mk('💬 Nachrichten pro Tag (30 Tage)'), {
      type: 'line', data: {
        labels: d.nachrichtenProTag.map((x) => x.tag.slice(5)),
        datasets: [{ label: 'Nachrichten', data: d.nachrichtenProTag.map((x) => x.anzahl),
          borderColor: '#6c8cff', backgroundColor: 'rgba(108,140,255,.15)', fill: true, tension: 0.3 }] },
      options: opt }));
    charts.push(new Chart(mk('🏆 Aktivste User (XP)'), {
      type: 'bar', data: {
        labels: d.topUser.map((u) => u.name),
        datasets: [{ label: 'XP', data: d.topUser.map((u) => u.xp), backgroundColor: '#b06cff' }] },
      options: { ...opt, indexAxis: 'y' } }));
    charts.push(new Chart(mk('# Aktivste Kanäle'), {
      type: 'bar', data: {
        labels: d.topKanael.map((k) => k.name),
        datasets: [{ label: 'Nachrichten', data: d.topKanael.map((k) => k.anzahl), backgroundColor: '#6c8cff' }] },
      options: { ...opt, indexAxis: 'y' } }));
    charts.push(new Chart(mk('🧠 KI-Erkennungen nach Kategorie'), {
      type: 'doughnut', data: {
        labels: Object.keys(d.aiKategorien),
        datasets: [{ data: Object.values(d.aiKategorien),
          backgroundColor: ['#e74c3c', '#9b59b6', '#f39c12', '#3498db', '#2ecc71', '#95a5a6'] }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: '#aab' } } } } }));
    charts.push(new Chart(mk('🧹 Wortfilter-Treffer (Top 10)'), {
      type: 'bar', data: {
        labels: d.filterTop.map((f) => f.word),
        datasets: [{ label: 'Treffer', data: d.filterTop.map((f) => f.anzahl), backgroundColor: '#e67e22' }] },
      options: { ...opt, indexAxis: 'y' } }));
    charts.push(new Chart(mk('🏛️ Steuereinnahmen-Verlauf (30 Tage)'), {
      type: 'line', data: {
        labels: Object.keys(d.steuerVerlauf).map((k) => k.slice(5)),
        datasets: [{ label: 'Einnahmen', data: Object.values(d.steuerVerlauf),
          borderColor: '#2ecc71', backgroundColor: 'rgba(46,204,113,.15)', fill: true, tension: 0.3 }] },
      options: opt }));
    charts.push(new Chart(mk('💰 Geldmengen-Verlauf (Approximation, 30 Tage)'), {
      type: 'line', data: {
        labels: d.geldVerlauf.map((x) => x.tag.slice(5)),
        datasets: [{ label: 'Geldmenge', data: d.geldVerlauf.map((x) => x.wert),
          borderColor: '#f1c40f', backgroundColor: 'rgba(241,196,15,.12)', fill: true, tension: 0.3 }] },
      options: opt }));
    charts.push(new Chart(mk('⭐ Level-Verteilung'), {
      type: 'bar', data: {
        labels: d.levelVerteilung.map((l) => 'Lv ' + l.level),
        datasets: [{ label: 'User', data: d.levelVerteilung.map((l) => l.anzahl), backgroundColor: '#5865F2' }] },
      options: opt }));
  }

  // ══════════════════ SEITE: DESIGN ══════════════════
  async function seiteDesign(page) {
    page.appendChild(el('<div class="panel card"><h3>🎨 Design-Editor</h3><p class="dim small">Alle Regler wirken sofort live. Dein Design wird pro Account gespeichert.</p></div>'));
    const host = el('<div style="display:flex;flex-direction:column;gap:16px"></div>');
    page.appendChild(host);
    Design.editor(host);
  }

  // ══════════════════ SEITE: EINSTELLUNGEN ══════════════════
  async function seiteEinstellungen(page) {
    const cfg = await API.get('/config');
    const st = await API.get('/status');

    page.appendChild(karte('🤖 Bot-Status & Token', `
      <div class="row mb">
        ${st.bot.connected ? '<span class="badge ok">Verbunden als ' + esc(st.bot.user) + '</span>'
          : '<span class="badge err">Nicht verbunden' + (st.bot.lastError ? ': ' + esc(st.bot.lastError) : '') + '</span>'}
        <button class="btn small" id="botRestart">↻ Neu verbinden</button>
      </div>
      ${feld('Token (maskiert: ' + esc(cfg.tokenMaske) + ') – neuer Token zum Ändern:', `
        <div class="pw-wrap"><input class="input" type="password" id="setToken" placeholder="nur ausfüllen zum Ändern" autocomplete="off">
        <button type="button" class="pw-eye" id="setTokenEye">👁️</button></div>`)}
      <button class="btn primary" id="setTokenSave">Token speichern &amp; Verbindung testen</button>
      <div class="fehler" id="tokenFehler" hidden></div>`));
    $('#setTokenEye', page).addEventListener('click', () => {
      const f = $('#setToken', page); f.type = f.type === 'password' ? 'text' : 'password';
    });
    $('#setTokenSave', page).addEventListener('click', async () => {
      const t = val('setToken');
      if (!t) return toast('Bitte neuen Token eingeben', 'err');
      const r = await API.post('/config/token', { token: t });
      const f = $('#tokenFehler', page);
      if (r.ok) { f.hidden = true; toast('Verbindung erfolgreich ✔', 'ok'); }
      else { f.textContent = r.fehler; f.hidden = false; }
    });
    $('#botRestart', page).addEventListener('click', async () => {
      const r = await API.post('/bot/restart');
      toast(r.ok ? 'Bot neu verbunden ✔' : 'Fehler: ' + r.fehler, r.ok ? 'ok' : 'err');
      route('einstellungen');
    });

    page.appendChild(karte('🦙 Ollama (lokale KI)', `
      <div class="grid-3">
        ${feld('URL', textInput('ollUrl', cfg.ollama.url))}
        ${feld('Modell', textInput('ollModel', cfg.ollama.model))}
        ${feld('Temperature', `<input class="input" type="number" step="0.1" min="0" max="2" id="ollTemp" value="${cfg.ollama.temperature}">`)}
      </div>
      <div class="row">
        <button class="btn primary" id="ollTest">Verbindung testen</button>
        <button class="btn" id="ollSave">Speichern</button>
        <span class="status-chip" id="ollChip">${st.ollama.online ? '🟢 Online' : '🔴 Offline'}</span>
      </div>
      <div id="ollErgebnis" class="mt"></div>`));
    $('#ollTest', page).addEventListener('click', async () => {
      const chip = $('#ollChip', page); chip.textContent = 'Teste …'; chip.className = 'status-chip busy';
      const r = await API.post('/ollama/test', { url: val('ollUrl'), model: val('ollModel') });
      if (r.ok) {
        chip.textContent = '🟢 Antwortet: „' + (r.antwort || '…') + '“'; chip.className = 'status-chip ok';
        await API.post('/config/ollama', { url: val('ollUrl'), model: val('ollModel'), temperature: Number(val('ollTemp')) });
      } else {
        chip.textContent = '🔴 ' + (r.fehler || 'Fehlgeschlagen'); chip.className = 'status-chip err';
        $('#ollErgebnis', page).innerHTML = r.hinweis ? `<div class="hinweis-box">${esc(r.hinweis)}</div>` : '';
      }
    });
    $('#ollSave', page).addEventListener('click', async () => {
      await API.post('/config/ollama', { url: val('ollUrl'), model: val('ollModel'), temperature: Number(val('ollTemp')) });
      toast('Gespeichert ✔', 'ok');
    });

    page.appendChild(karte('🖥️ Dashboard', `
      <div class="grid-2">
        ${feld('Port (Änderung braucht Prozess-Neustart)', zahlInput('dPort', cfg.dashboard.port, 1, 65535))}
        ${feld('Session-Dauer (Stunden)', zahlInput('dSess', cfg.dashboard.sessionHours, 1, 720))}
      </div>
      <button class="btn primary" id="dSave">Speichern</button>
      <p class="dim small mt">Einladungslink: <a href="${esc(cfg.inviteLink)}" target="_blank">Bot einladen</a> ·
      <a href="setup.html">Setup-Assistent erneut öffnen</a></p>`));
    $('#dSave', page).addEventListener('click', async () => {
      const r = await API.post('/config/dashboard', { port: num('dPort'), sessionHours: num('dSess') });
      toast(r.hinweis || 'Gespeichert ✔', 'ok');
    });

    const { liste } = await API.get('/admins');
    page.appendChild(karte('👑 Admin-Accounts', `
      <div class="table-wrap mb"><table class="table">
        ${liste.map((a) => `<tr><td><b>${esc(a.benutzername)}</b></td>
          <td class="small dim">seit ${fmtDatum(a.erstelltAm)}</td>
          <td>${a.id !== me.benutzername ? `<button class="btn small danger adm-del" data-id="${esc(a.id)}">Löschen</button>` : '<span class="badge info">Du</span>'}</td></tr>`).join('')}
      </table></div>
      <div class="grid-2">
        ${feld('Neuer Admin – Benutzername', textInput('admNew', ''))}
        ${feld('Passwort (min. 6)', `<input class="input" type="password" id="admPass">`)}
      </div>
      <button class="btn" id="admAdd">+ Admin hinzufügen</button>`));
    $$('.adm-del', page).forEach((b) => b.addEventListener('click', async () => {
      if (!(await confirmDlg('Admin löschen?'))) return;
      try { await API.del('/admins/' + b.dataset.id); toast('Gelöscht ✔', 'ok'); route('einstellungen'); }
      catch (e) { toast(e.message, 'err'); }
    }));
    $('#admAdd', page).addEventListener('click', async () => {
      try {
        await API.post('/admins', { benutzername: val('admNew'), passwort: val('admPass') });
        toast('Admin erstellt ✔', 'ok'); route('einstellungen');
      } catch (e) { toast(e.message, 'err'); }
    });

    page.appendChild(karte('🔑 Eigenes Passwort ändern', `
      <div class="grid-2">
        ${feld('Altes Passwort', `<input class="input" type="password" id="pwAlt">`)}
        ${feld('Neues Passwort', `<input class="input" type="password" id="pwNeu">`)}
      </div>
      <button class="btn primary" id="pwSave">Passwort ändern</button>`));
    $('#pwSave', page).addEventListener('click', async () => {
      try {
        await API.post('/admins/password', { alt: val('pwAlt'), neu: val('pwNeu') });
        toast('Passwort geändert ✔', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });
  }

  // ══════════════════ SEITE: EMBED-STUDIO ══════════════════
  async function seiteEmbedStudio(page) {
    const kan = await ladeKanäle();
    const textKanäle = kan.filter((k) => k.typ !== 4);

    page.appendChild(el('<div class="panel card"><h3>🪄 Embed-Studio <span class="dim small">– professionelle Discord-Embeds mit echter Live-Vorschau</span></h3>' +
      '<p class="dim small">Links bauen, rechts siehst du exakt, wie es in Discord aussieht. Limit-Zähler included.</p></div>'));

    const grid = el('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start"></div>');
    page.appendChild(grid);
    const formCol = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    const prevCol = el('<div style="position:sticky;top:80px;display:flex;flex-direction:column;gap:14px"></div>');
    grid.appendChild(formCol);
    grid.appendChild(prevCol);
    const responsiv = () => {
      const einspaltig = innerWidth < 1050;
      grid.style.gridTemplateColumns = einspaltig ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)';
      prevCol.style.position = einspaltig ? 'static' : 'sticky';
    };
    responsiv();
    addEventListener('resize', responsiv);

    const zeichen = (id, max) => {
      const f = document.getElementById(id);
      const c = document.getElementById(id + 'Cnt');
      if (!f || !c) return;
      const n = f.value.length;
      c.textContent = n + ' / ' + max;
      c.style.color = n > max ? 'var(--err)' : 'var(--dim)';
    };
    const eingabe = (id, max, label) =>
      '<input class="input" id="' + id + '" placeholder="' + esc(label) + '" maxlength="' + (max + 50) + '">' +
      '<div class="dim small" id="' + id + 'Cnt" style="text-align:right">0 / ' + max + '</div>';

    formCol.appendChild(karte('🎨 Basis', `
      <div class="grid-2">
        ${feld('Farbe', `<div style="display:flex;gap:10px;align-items:center"><input type="color" id="esColor" value="#5865F2" style="height:38px"><input class="input" id="esColorHex" value="#5865F2" style="max-width:110px" placeholder="5865F2"></div>`)}
        <div></div>
      </div>
      ${feld('Titel', eingabe('esTitle', 256, 'z. B. 🎉 Server-Update 0.8 ist da!'))}
      ${feld('Titel-Link (optional)', `<input class="input" id="esUrl" placeholder="https://…">`)}
      ${feld('Beschreibung', `<textarea class="input" id="esDesc" rows="5" placeholder="Der Haupttext deines Embeds…"></textarea><div class="dim small" id="esDescCnt" style="text-align:right">0 / 4096</div>`)}`));

    formCol.appendChild(karte('👤 Autor', `
      ${feld('Autor-Name', eingabe('esAuthorName', 256, 'z. B. Dein Server'))}
      <div class="grid-2">
        ${feld('Autor-Icon (URL)', `<input class="input" id="esAuthorIcon" placeholder="https://…png">`)}
        ${feld('Autor-Link', `<input class="input" id="esAuthorUrl" placeholder="https://…">`)}
      </div>`));

    formCol.appendChild(karte('🧱 Felder <span class="dim small" id="esFieldCnt">(0 / 25)</span>', `
      <div id="esFelder"></div>
      <button class="btn small mt" id="esFieldAdd">+ Feld hinzufügen</button>
      <p class="dim small mt">Bis zu 25 Felder. „Inline" = bis zu 3 nebeneinander.</p>`));

    formCol.appendChild(karte('🖼️ Medien', `
      <div class="grid-2">
        ${feld('Thumbnail (klein, oben rechts)', `<input class="input" id="esThumb" placeholder="https://…png">`)}
        ${feld('Großes Bild (unten)', `<input class="input" id="esImage" placeholder="https://…png">`)}
      </div>`));

    formCol.appendChild(karte('🦶 Fußzeile', `
      ${feld('Fußzeilen-Text', eingabe('esFooter', 2048, 'z. B. Lumiox · heute'))}
      <div class="grid-2">
        ${feld('Fußzeilen-Icon (URL)', `<input class="input" id="esFooterIcon" placeholder="https://…png">`)}
        <div class="feld"><span>Zeitstempel anhängen</span><label class="toggle"><input type="checkbox" id="esTimestamp"><i></i></label></div>
      </div>`));

    formCol.appendChild(karte('💾 & 📤 Speichern / Senden', `
      ${feld('Entwurfs-Name', `<input class="input" id="esName" placeholder="z. B. Update-Ankündigung">`)}
      <div class="row mb">
        <button class="btn primary" id="esSave">💾 Entwurf speichern</button>
        <button class="btn" id="esExport">⬇ JSON exportieren</button>
        <button class="btn danger" id="esReset">↺ Leeren</button>
      </div>
      <hr class="trenner">
      ${feld('Ziel-Kanal', `<select class="input" id="esKanal"><option value="">– Kanal wählen –</option>` +
        textKanäle.map((k) => `<option value="${esc(k.id)}">#${esc(k.name)}</option>`).join('') + `</select>`)}
      <button class="btn primary full" id="esSend">📤 In Kanal senden</button>
      <p class="dim small mt">Vor dem Senden werden geprüft: Discord-Limits, Bot-Rechte im Ziel-Kanal.</p>`));

    const draftKarte = karte('📚 Gespeicherte Entwürfe', '<div id="esDrafts"><p class="dim">Lade …</p></div>');
    formCol.appendChild(draftKarte);

    prevCol.appendChild(el('<div class="panel card"><h3>👁️ Live-Vorschau</h3>' +
      '<p class="dim small mb">So sieht es in Discord aus.</p>' +
      '<div id="esPrev"></div>' +
      '<div class="row mt" style="justify-content:space-between"><span class="dim small">Gesamt (Max 6000):</span>' +
      '<span class="dim small mono" id="esTotalCnt">0 / 6000</span></div>' +
      '<div class="progress mt"><i id="esTotalBar" style="width:0%"></i></div></div>'));

    function leseFelder() {
      return $$('#esFelder .es-frow').map((row) => ({
        name: $('.es-f-name', row).value,
        value: $('.es-f-value', row).value,
        inline: $('input[type=checkbox]', row).checked,
      })).filter((f) => f.name.trim() || f.value.trim());
    }

    function baueEmbed() {
      const v = (id) => { const n = document.getElementById(id); return n ? n.value.trim() : ''; };
      const emb = {};
      const hex = v('esColor').replace('#', '');
      emb.color = parseInt(hex, 16) || 0x5865F2;
      if (v('esTitle')) emb.title = v('esTitle');
      if (v('esUrl')) emb.url = v('esUrl');
      if (v('esDesc')) emb.description = v('esDesc');
      const felder = leseFelder();
      if (felder.length) emb.fields = felder.map((f) => ({ name: f.name || '\u200b', value: f.value || '\u200b', inline: f.inline }));
      if (v('esAuthorName')) {
        emb.author = { name: v('esAuthorName') };
        if (v('esAuthorIcon')) emb.author.icon_url = v('esAuthorIcon');
        if (v('esAuthorUrl')) emb.author.url = v('esAuthorUrl');
      }
      if (v('esFooter')) {
        emb.footer = { text: v('esFooter') };
        if (v('esFooterIcon')) emb.footer.icon_url = v('esFooterIcon');
      }
      if (v('esThumb')) emb.thumbnail = { url: v('esThumb') };
      if (v('esImage')) emb.image = { url: v('esImage') };
      if (chk('esTimestamp')) emb.timestamp = new Date().toISOString();
      return emb;
    }

    function gesamtLaenge(emb) {
      let n = 0;
      if (emb.title) n += emb.title.length;
      if (emb.description) n += emb.description.length;
      if (emb.author) n += emb.author.name.length;
      if (emb.footer) n += emb.footer.text.length;
      if (emb.fields) for (const f of emb.fields) n += f.name.length + f.value.length;
      return n;
    }

    function renderPreview() {
      const emb = baueEmbed();
      const farbe = '#' + (emb.color || 0x5865F2).toString(16).padStart(6, '0');
      let html = '<div style="display:flex;gap:12px">' +
        '<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#22d3ee,#e879f9)"></div>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<b style="font-size:.95rem">Lumiox</b><span style="font-size:.62rem;background:#5865F2;color:#fff;padding:1px 6px;border-radius:4px;font-weight:700">BOT</span></div>';
      html += '<div style="position:relative;background:rgba(4,6,14,.5);border-radius:8px;padding:14px;display:flex;gap:14px">' +
        '<div style="position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px;background:' + farbe + '"></div>' +
        '<div style="flex:1;min-width:0">';
      if (emb.author) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          (emb.author.icon_url ? '<img src="' + esc(emb.author.icon_url) + '" style="width:22px;height:22px;border-radius:50%" onerror="this.remove()">' : '') +
          '<b style="font-size:.82rem">' + esc(emb.author.name) + '</b></div>';
      }
      if (emb.title) html += '<div style="font-weight:700;font-size:1rem;margin-bottom:6px;word-break:break-word">' +
        (emb.url ? '<a href="' + esc(emb.url) + '" target="_blank" style="color:inherit">' + esc(emb.title) + '</a>' : esc(emb.title)) + '</div>';
      if (emb.description) html += '<div style="font-size:.88rem;color:#c9cfdb;line-height:1.5;word-break:break-word;white-space:pre-wrap">' + esc(emb.description) + '</div>';
      if (emb.fields && emb.fields.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">';
        for (const f of emb.fields) {
          html += '<div style="' + (f.inline ? 'width:calc(33.3% - 7px);min-width:120px' : 'width:100%') + '">' +
            '<b style="display:block;font-size:.8rem">' + esc(f.name) + '</b>' +
            '<span style="font-size:.78rem;color:var(--dim)">' + esc(f.value) + '</span></div>';
        }
        html += '</div>';
      }
      const fuss = [];
      if (emb.footer) {
        fuss.push((emb.footer.icon_url ? '<img src="' + esc(emb.footer.icon_url) + '" style="width:20px;height:20px;border-radius:50%" onerror="this.remove()">' : '') +
          '<span>' + esc(emb.footer.text) + '</span>');
      }
      if (emb.timestamp) fuss.push('<span>· ' + new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + '</span>');
      if (fuss.length) html += '<div style="display:flex;align-items:center;gap:6px;margin-top:12px;color:var(--dim);font-size:.75rem">' + fuss.join(' ') + '</div>';
      html += '</div>';
      if (emb.thumbnail) html += '<img src="' + esc(emb.thumbnail.url) + '" style="width:84px;height:84px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.display=\'none\'">';
      html += '</div></div>';
      if (emb.image) html += '<div style="margin-top:8px"><img src="' + esc(emb.image.url) + '" style="max-width:100%;border-radius:8px" onerror="this.parentElement.remove()"></div>';
      html += '</div>';
      document.getElementById('esPrev').innerHTML = html;
      const total = gesamtLaenge(emb);
      document.getElementById('esTotalCnt').textContent = total + ' / 6000';
      document.getElementById('esTotalCnt').style.color = total > 6000 ? 'var(--err)' : 'var(--dim)';
      document.getElementById('esTotalBar').style.width = Math.min(100, (total / 6000) * 100) + '%';
      document.getElementById('esTotalBar').style.background = total > 6000 ? 'var(--err)' : '';
      document.getElementById('esFieldCnt').textContent = '(' + leseFelder().length + ' / 25)';
    }

    function addFieldRow(name = '', value = '', inline = true) {
      const n = $$('#esFelder .es-frow').length;
      if (n >= 25) return toast('Maximum: 25 Felder', 'err');
      const row = el('<div class="es-frow" style="border:1px solid rgba(127,127,127,.2);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div class="grid-2 mb" style="gap:8px">' +
        '<input class="input es-f-name" placeholder="Feld-Name" value="' + esc(name) + '" maxlength="306">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:.8rem;white-space:nowrap"><input type="checkbox"' + (inline ? ' checked' : '') + '> Inline</label>' +
        '<button class="btn small danger es-f-del" style="margin-left:auto">✕</button></div></div>' +
        '<textarea class="input es-f-value" rows="2" placeholder="Feld-Wert" maxlength="1074">' + esc(value) + '</textarea></div>');
      $('.es-f-del', row).addEventListener('click', () => { row.remove(); renderPreview(); });
      $('input[type=checkbox]', row).addEventListener('change', renderPreview);
      $('.es-f-name', row).addEventListener('input', renderPreview);
      $('.es-f-value', row).addEventListener('input', renderPreview);
      document.getElementById('esFelder').appendChild(row);
    }
    $('#esFieldAdd', formCol).addEventListener('click', () => { addFieldRow(); renderPreview(); });

    formCol.addEventListener('input', (e) => {
      const map = { esTitle: 256, esDesc: 4096, esAuthorName: 256, esFooter: 2048 };
      if (e.target.id && map[e.target.id]) zeichen(e.target.id, map[e.target.id]);
      if (e.target.id === 'esColor') document.getElementById('esColorHex').value = e.target.value.toUpperCase();
      if (e.target.id === 'esColorHex') {
        const hex = e.target.value.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex)) document.getElementById('esColor').value = '#' + hex;
      }
      renderPreview();
    });
    formCol.addEventListener('change', renderPreview);
    document.getElementById('esColor').addEventListener('input', (e) => {
      document.getElementById('esColorHex').value = e.target.value.toUpperCase();
    });

    async function ladeDrafts() {
      const box = document.getElementById('esDrafts');
      try {
        const { liste } = await API.get('/embeds?guildId=' + gid);
        if (!liste.length) { box.innerHTML = '<p class="dim">Noch keine Entwürfe gespeichert.</p>'; return; }
        box.innerHTML = '';
        for (const dr of liste) {
          const row = el('<div class="feed-item"><span style="flex:1"><b class="small">' + esc(dr.name) + '</b>' +
            '<div class="dim small">' + fmtDatum(dr.zeit) + '</div></span>' +
            '<button class="btn small es-load" data-id="' + esc(dr.id) + '">Laden</button>' +
            '<button class="btn small danger es-del" data-id="' + esc(dr.id) + '">✕</button></div>');
          $('.es-load', row).addEventListener('click', async () => {
            const r = await API.get('/embeds/' + dr.id);
            const dt = r.data || {};
            document.getElementById('esColor').value = '#' + (dt.color || 5865).toString(16).padStart(6, '0');
            document.getElementById('esColorHex').value = '#' + (dt.color || 5865).toString(16).padStart(6, '0').toUpperCase();
            document.getElementById('esTitle').value = dt.title || '';
            document.getElementById('esDesc').value = dt.description || '';
            document.getElementById('esUrl').value = dt.url || '';
            document.getElementById('esAuthorName').value = (dt.author && dt.author.name) || '';
            document.getElementById('esAuthorIcon').value = (dt.author && dt.author.icon_url) || '';
            document.getElementById('esAuthorUrl').value = (dt.author && dt.author.url) || '';
            document.getElementById('esFooter').value = (dt.footer && dt.footer.text) || '';
            document.getElementById('esFooterIcon').value = (dt.footer && dt.footer.icon_url) || '';
            document.getElementById('esThumb').value = (dt.thumbnail && dt.thumbnail.url) || '';
            document.getElementById('esImage').value = (dt.image && dt.image.url) || '';
            document.getElementById('esTimestamp').checked = !!dt.timestamp;
            document.getElementById('esFelder').innerHTML = '';
            for (const f of dt.fields || []) addFieldRow(f.name === '\u200b' ? '' : f.name, f.value === '\u200b' ? '' : f.value, f.inline);
            renderPreview();
            toast('Entwurf geladen ✔', 'ok');
          });
          $('.es-del', row).addEventListener('click', async () => {
            if (!(await confirmDlg('Entwurf löschen?'))) return;
            await API.del('/embeds/' + dr.id);
            toast('Gelöscht ✔', 'ok');
            ladeDrafts();
          });
          box.appendChild(row);
        }
      } catch (e) { box.innerHTML = '<p class="dim">' + esc(e.message) + '</p>'; }
    }
    ladeDrafts();

    $('#esSave', formCol).addEventListener('click', async () => {
      const name = val('esName');
      if (!name) return toast('Bitte erst einen Entwurfs-Namen eingeben', 'err');
      try {
        await API.post('/embeds?guildId=' + gid, { name, data: baueEmbed() });
        toast('Entwurf gespeichert ✔', 'ok');
        ladeDrafts();
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#esExport', formCol).addEventListener('click', () => {
      download('lumiox-embed.json', JSON.stringify(baueEmbed(), null, 2));
      toast('JSON exportiert ✔', 'ok');
    });
    $('#esReset', formCol).addEventListener('click', async () => {
      if (!(await confirmDlg('Alle Eingaben leeren?'))) return;
      $$('#page input, #page textarea').forEach((i) => {
        if (i.id && i.id.startsWith('es') && i.type !== 'checkbox' && i.type !== 'color') i.value = '';
        if (i.type === 'checkbox' && i.id && i.id.startsWith('es')) i.checked = false;
      });
      document.getElementById('esColor').value = '#5865F2';
      document.getElementById('esColorHex').value = '#5865F2';
      document.getElementById('esFelder').innerHTML = '';
      renderPreview();
    });
    $('#esSend', formCol).addEventListener('click', async () => {
      const kanalId = val('esKanal');
      if (!kanalId) return toast('Erst einen Ziel-Kanal wählen', 'err');
      const emb = baueEmbed();
      if (gesamtLaenge(emb) > 6000) return toast('Gesamt-Länge über 6000 – bitte kürzen', 'err');
      if (!emb.title && !emb.description && !(emb.fields || []).length && !emb.image && !emb.thumbnail && !emb.author && !emb.footer) {
        return toast('Der Embed ist leer', 'err');
      }
      try {
        await API.post('/embeds/send?guildId=' + gid, { channelId: kanalId, embed: emb });
        toast('📤 Gesendet!', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    document.getElementById('esTitle').value = '🎉 Server-Update 0.8 ist da!';
    document.getElementById('esDesc').value = 'Das Embed-Studio ist live – baue Ankündigungen, Regeln & Infos direkt im Dashboard mit echter Live-Vorschau.';
    document.getElementById('esFooter').value = 'Lumiox';
    addFieldRow('📅 Wann?', 'Heute, 20:00 Uhr', true);
    addFieldRow('🆕 Neu?', 'Embed-Studio', true);
    addFieldRow('🐛 Fixes', '12 Stück', true);
    ['esTitle', 'esDesc', 'esFooter'].forEach((id) => zeichen(id, { esTitle: 256, esDesc: 4096, esFooter: 2048 }[id]));
    renderPreview();
  }

  // ══════════════════ SEITE: UPDATE (Akkordeon + Trailer) ══════════════════
  async function seiteUpdate(page) {
    const TR = { '0.8.7': '/trailer-boerse.html', '0.8.43ev': '/trailer.html', '0.8.43e': '/trailer-staat.html',
      '0.8.2': '/trailer-hangar.html', '0.8.1': '/trailer-lang.html',
      '0.8.0': '/embed-studio.html', '0.7.8f': '/trailer-soon-kurz.html', '0.7.5': '/trailer-soon.html' };
    const gross = [
      { v: '0.9.0-alpha', status: 'JETZT', neu: true, mega: true, trailer: '/trailer-hangar.html', items: [
        '🏅 RANK-KARTEN als Bilder: /rankcard mit Verlaufsbalken & Farben',
        '🕐 AUTO-BACKUPS: Zeitplan, Max-Anzahl, Liste im Dashboard',
        '📊 WOCHENBERICHTE: jeden Sonntag automatisch ins gewählte Kanal',
        '⏰ INFO-AUTO-KANAL: Kanalname zeigt Mitglieder & Online live',
        '🎉 ZUFALLS-EVENTS: Doppel-XP, Geldregen, Geheimnis-Rolle',
        '📋 /updates: Changelog direkt in Discord',
        '🎯 SERVER-ZIELE: Fortschrittsbalken + Auto-Feier-Message',
        '👮 MOD-HINWEISE: Soft-Warns, 3× = automatische Verwarnung',
        '🗳️ UMFRAGEN: mehrstufig, mit Zeitlimit & Auto-Auswertung',
        '🔗 INVITE-TRACKING: Werber-Rangliste + Bonus pro Member',
      ] },
      { v: '0.8.8f-alpha', status: 'stabil', trailer: '/trailer-boerse.html', items: [
        '🧩 VISUAL COMMAND-STUDIO: Vollbild-Editor im Ghost-Bot-Stil (Palette, Leinwand, Verbindungen)',
        '📦 30+ Block-Typen: Conditions (Vergleich/Chance/Rolle/Kanal/User/Perm/Geld)',
        '💬 Message-Blocks: Senden, DM, Publish, React, Pin, Transkript',
        '🧮 Variablen-Blöcke: Setzen, Rechnen, Löschen · 🌐 API-Block (HTTP GET)',
        '🔁 Loop-Blöcke: X-mal ausführen, Stop',
        '🚔 Server-Blöcke: Kick, Ban, Timeout, Nickname, Purge, Invite',
        '🏷️ Rollen/Kanäle/Threads: Erstellen, Bearbeiten, Löschen, An ALLE',
        '🔊 Voice: Join & Leave',
        '🎨 Freihand-Kurve: Diagramm malen → Börse folgt exakt',
      ] },
      { v: '0.8.7-alpha', status: 'stabil', trailer: '/trailer-boerse.html', items: [
        '🎬 Eigenes Börsen-Update-Video (im Kino + hier unten)',
        '📈 Kursverlauf pro Aktie einzeln im Dashboard (eigene Verläufe!)',
        '🖱️ Kurse direkt im Dashboard hoch/runter steuern',
        '📊 Börsen-Statistik: 24h-Hoch/-Tief, Depot-Gesamtwert, aktive Trader',
        '🤫 Intern: Pfad-Editor mit Diagramm (Kurve malen → Markt folgt)',
        '🤫 Intern: Markt-Sprünge & eigenes Timing (1 Min – eigene Sek.)',
      ] },
      { v: '0.8.43e-alpha', status: 'stabil', trailer: TR['0.8.43e'], items: [
        '🏛️ STAAT & FINANZAMT: Staatskasse mit Defizit-System',
        '📋 Steuererklärung als Mini-Spiele (4 Stück, frei wählbar)',
        '🚨 Hinterziehungs-Fahndung mit Fangquote',
        '🚔 Polizeiwache: Förderung senkt die Betrugsrate',
        '📈 Börse: 5 Aktien mit stündlichen Kursen',
        '🏦 Kredite vom Staat mit Tageszinsen',
        '🏠 Immobilien: 4 Stufen mit passivem Einkommen',
        '🥷 Shop-Diebstahl: /klauen',
      ] },
      { v: '0.8.2-alpha', status: 'stabil', trailer: TR['0.8.2'], items: [
        '🏗️ Systemhangar-Trailer & Design-Feinschliff',
      ] },
      { v: '0.8.1-alpha', status: 'stabil', trailer: TR['0.8.1'], items: [
        '🕐 Auto-Backups · 📊 Wochenberichte · 🎯 Server-Ziele',
        '👮 Mod-Hinweise · 🔗 Invite-Tracking · 🗳️ Umfragen',
        '🎁 Giveaway-Anforderungen',
      ] },
      { v: '0.8.0-alpha', status: 'stabil', trailer: TR['0.8.0'], items: [
        '🪄 Embed-Studio mit Live-Vorschau & Direktversand',
        '🧠 Sentinel-Engine · 🎨 Design-Editor · 📱 PWA',
      ] },
      { v: '0.7.8f-alpha', status: 'stabil', trailer: TR['0.7.8f'], items: [
        '🌈 Rainbow-Animation mit Zielen & Mustern',
        '🗂️ Update-Seite GROSS/KLEIN',
      ] },
      { v: '0.7.5-alpha', status: 'stabil', trailer: TR['0.7.5'], items: [
        '🎉 Update-Zentrale · 🎬 Trailer-Kollektion · 🪐 3D-Trailer',
      ] },
    ];
    const klein = [
      { v: '0.8.45-alpha', status: 'stabil', trailer: '/trailer-hangar.html', items: [
        '📈 Börse: Kurse direkt im Dashboard hoch/runter steuern (Klick auf Kurs)',
        '📊 Börsen-Statistik: 24h-Hoch/-Tief, Depot-Gesamtwert, aktive Trader',
        '🔓 Erweiterte Markt-Steuerung (internes Werkzeug)',
      ] },
      { v: '0.8.44-alpha', status: 'stabil', trailer: '/trailer-hangar.html', items: [
        '📈 BÖRSE-KATEGORIE: Kurse, Depot-Wert, Kursverlauf-Chart & Marktereignisse',
        '🌈 Glow-Rainbow verfeinert: eigene Intensität & Dauer einstellbar',
        '⏱️ Börsen-Timing frei: 1/5/15/60 Min oder eigene Sekunden',
        '🔓 Dashboard-Feature für Admins (Details im internen Bereich)',
      ] },
      { v: '0.8.43ev-alpha', status: 'stabil', trailer: '/trailer-hangar.html', items: [
        '🌈 Rainbow v3.1: NEU „Rainbow-Spur" (Gradient-Rahmen um Panels)',
        '💡 NEU „Rainbow-Schatten" (Glow in deinen Farben)',
        '🎛️ Ziele komplett unabhängig: Hintergrund / Leisten / Text / Spur / Schatten',
        '🐞 Fix: Polizei-Förderung speichert jetzt korrekt',
        '🔖 Update-Seite: Akkordeon-Modus mit Trailer pro Version',
      ] },
    ];
    function block(liste, typ) {
      return liste.map((v) => {
        const zeilen = v.items.map((i) =>
          '<div class="feed-item"><span style="margin-right:6px">▸</span><span class="small">' + esc(i) + '</span></div>').join('');
        const typBadge = typ === 'mega' ? '<span class="badge err">SEHR GROSS</span> '
          : typ === 'gross' ? '<span class="badge ai">GROSS</span> ' : '<span class="badge info">KLEIN</span> ';
        const tr = v.trailer || '/trailer.html';
        return '<details class="panel card upd-item">' +
          '<summary><span>' + typBadge + (v.neu ? '<span class="badge err">AKTUELL</span> ' : '') +
          '<b>' + esc(v.v) + '</b>' +
          (v.status ? ' <span class="badge ' + (v.neu ? 'ok' : 'info') + '">' + esc(v.status) + '</span>' : '') +
          '</span><span class="plus">+</span></summary>' +
          '<div style="margin-top:10px">' +
          '<div class="panel" style="padding:0;overflow:hidden;border-radius:12px;margin-bottom:10px">' +
          '<iframe data-src="' + tr + '" style="width:100%;height:300px;border:none;display:block" title="Trailer ' + esc(v.v) + '"></iframe></div>' +
          zeilen + '</div></details>';
      }).join('');
    }
    const roadHtml = [
      ['🏅', 'Level-Karten als Bilder'], ['🎵', 'Musik-Module'], ['🕐', 'Auto-Backups (FERTIG ✔)'],
      ['🌍', 'Mehrsprachigkeit'], ['📊', 'Wochenberichte (FERTIG ✔)'], ['🧩', 'Embed-Studio (FERTIG ✔)'],
    ].map(([ico, name], i) =>
      '<section class="panel card" style="margin-bottom:10px"><div class="regel-kopf"><b>' + ico + ' ' + esc(name) + '</b>' +
      '<span class="badge ' + (name.includes('FERTIG') ? 'ok' : 'warn') + '">' + (name.includes('FERTIG') ? 'FERTIG ✔' : 'Vorschlag #' + (i + 1)) + '</span></div></section>').join('');
    page.appendChild(karte('🎉 Lumiox Update-Zentrale',
      '<div class="row mb"><span class="badge warn">ALPHA-VERSION 0.9.0</span>' +
      '<span class="dim small">Klicke auf ein Update, um Details + Trailer zu sehen. Neuestes immer oben.</span></div>' +
      '<h3 style="margin:8px 0">🔧 Kleine Updates</h3>' + block(klein, 'klein') +
      '<h3 style="margin:14px 0 8px">🚀 Große Updates</h3>' + block(gross, 'gross') +
      '<h3 style="margin:14px 0 8px">🔮 Roadmap</h3>' + roadHtml));
    // Lazy-load: iframes erst laden, wenn details geöffnet wird
    $$('details.upd-item', page).forEach((d) => d.addEventListener('toggle', () => {
      if (d.open) { const f = $('iframe', d); if (f && !f.src) f.src = f.dataset.src; }
    }));
    const erstes = $('details.upd-item', page);
    if (erstes) { erstes.open = true; const f = $('iframe', erstes); if (f) f.src = f.dataset.src; }
  }

  // ══════════════════ SEITE: COMMAND-STUDIO ══════════════════
  async function seiteStudio(page) {
    const { katalog } = await API.get('/studio/bloecke');
    const { liste: befehle } = await API.get('/studio/befehle');
    const rol = await ladeRollen();
    let aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
    let editId = null;

page.appendChild(karte('🧩 Command-Studio', '' +
  '<div class="row mb">' +
  '<button class="btn primary big" id="ansVisBtn">🧩 VISUAL-EDITOR ÖFFNEN (Vollbild)</button>' +
  '<button class="btn" id="ansListBtn">📝 Listen-Ansicht neu laden</button>' +
  '</div>' +
  '<div class="row mb">' +
  '<span class="badge ok">0.8.8f</span>' +
  '<span class="dim small">Visual-Editor: Drag & Drop, Verbindungen, Doppelklick für Felder. Listen-Ansicht: Schnellbearbeitung.</span>' +
  '</div>' +
  '<div class="row mb">' +
  '<input class="input" id="stName" placeholder="command-name" style="max-width:180px">' +
  '<input class="input" id="stDesc" placeholder="Beschreibung" style="max-width:260px">' +
  '<input class="input" type="number" id="stCd" placeholder="Cooldown s" style="max-width:110px" value="0">' +
  '</div>' +
  '<div class="row mb">' +
  '<button class="btn primary" id="stSave">💾 Speichern & Live laden</button>' +
  '<button class="btn" id="stNeu">↺ Neu</button></div>' +
  '<div id="stListe"><p class="dim">Lade Befehle …</p></div>' +
  '<p class="dim small mt">Der Visual-Editor hat die volle Block-Palette (40+ Blöcke in 11 Kategorien).</p>'));

    // Studio-Logik (Save + Liste + Visual-Button):
    (async () => {
      const listK = await API.get('/studio/befehle');
      const listBox = document.createElement('div');
      listBox.className = 'panel card';
      listBox.style.marginTop = '14px';
      listK.liste.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'feed-item';
        row.innerHTML = '<b class="mono">/' + esc(c.name) + '</b> <span class="dim small">' +
          (c.blocks ? (c.blocks.length + ' Blöcke') : 'Text') + '</span>' +
          '<span style="margin-left:auto"></span>';
        const del = document.createElement('button');
        del.className = 'btn small danger'; del.textContent = '✕';
        del.style.marginLeft = '8px';
        del.addEventListener('click', async () => {
          if (!confirm('Löschen?')) return;
          await API.del('/studio/befehle/' + c.id);
          toast('Gelöscht ✔', 'ok'); route('studio');
        });
        row.appendChild(del);
        listBox.appendChild(row);
      });
      if (!listK.liste.length) listBox.innerHTML = '<p class="dim">Noch keine Studio-Befehle.</p>';
      page.appendChild(listBox);

      document.getElementById('stSave').addEventListener('click', async () => {
        const name = document.getElementById('stName').value.toLowerCase().trim();
        if (!name) return toast('Name fehlt', 'err');
        if (!window.__studioBlocks || !window.__studioBlocks.length) {
          return toast('Keine Blöcke – nutze den VISUAL-EDITOR für Block-Ketten!', 'err');
        }
        try {
          await API.post('/studio/befehle?guildId=' + gid, {
            name, description: document.getElementById('stDesc').value,
            cooldown: Number(document.getElementById('stCd').value) || 0,
            roles: [], guildId: gid,
            nodes: window.__studioNodes || [], edges: window.__studioEdges || [],
            blocks: window.__studioBlocks,
          });
          toast('💾 Gespeichert & live!', 'ok');
        } catch (e) { toast(e.message, 'err'); }
      });
      document.getElementById('stNeu').addEventListener('click', () => {
        document.getElementById('stName').value = '';
        document.getElementById('stDesc').value = '';
      });
      document.getElementById('ansVisBtn').addEventListener('click', () => {
        window.open('/studio.html?g=' + gid, '_blank');
      });
    })();;


    // ── Block-Palette ──
    const palKarte = karte('🧱 Block-Palette (Klick = Block hinzufügen)', `
      <div class="grid-3" id="stPal"></div>`);
    page.appendChild(palKarte);
    const pal = $('#stPal', page);
    katalog.forEach((blk) => {
      const b = el(`<button class="btn small" style="text-align:left">${esc(blk.name)}</button>`);
      b.addEventListener('click', () => addBlock(blk, aktuellerBefehl.blocks));
      pal.appendChild(b);
    });

    // ── Kette anzeigen (rekursiv) ──
    const kettenKarte = karte('🔗 Block-Kette (dein Command)', '<div id="stKette"><p class="dim">Noch keine Blöcke. Klicke oben auf die Palette!</p></div>');
    page.appendChild(kettenKarte);

    function renderKette(blöcke, container, pfad) {
      container.innerHTML = '';
      if (!blöcke.length) { container.innerHTML = '<p class="dim">Leer – Klicke oben auf die Palette.</p>'; return; }
      blöcke.forEach((b, i) => {
        const kat = katalog.find((k) => k.typ === b.typ);
        const p2 = pfad.concat(i);
        const div = el(`<div class="panel card" style="margin-bottom:8px;padding:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ai">${i + 1}</span>
            <b class="small">${esc(kat ? kat.name : b.typ)}</b>
            <span class="dim small">${blockZusammenfassung(b)}</span>
            <button class="btn small danger bs-del" style="margin-left:auto">✕</button>
          </div>
          <div class="bs-felder mt"></div>
          <div class="bs-nested"></div>
        </div>`);
        $('.bs-del', div).addEventListener('click', () => {
          blöcke.splice(i, 1);
          renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
        });
        // Felder
        const fBox = $('.bs-felder', div);
        (kat ? kat.felder : []).filter((f) => f.typ !== 'nested').forEach((f) => {
          const cur = b[f.key];
          if (f.typ === 'bool') {
            const l = el(`<label style="display:flex;gap:6px;align-items:center;font-size:.82rem;margin:4px 0"><input type="checkbox" ${cur ? 'checked' : ''}><span>${esc(f.label)}</span></label>`);
            l.querySelector('input').addEventListener('change', (e) => { b[f.key] = e.target.checked; });
            fBox.appendChild(l);
          } else if (f.typ === 'rolle') {
            const sel = el(`<select class="input" style="margin:4px 0"><option value="">– wählen –</option>${rol.map((r) => `<option value="${esc(r.id)}" ${cur === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`);
            sel.addEventListener('change', () => { b[f.key] = sel.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)}</span>`));
            fBox.appendChild(sel);
          } else if (f.typ === 'kanal') {
            const inp = el(`<input class="input" placeholder="Kanal-ID" value="${esc(cur || '')}" style="margin:4px 0">`);
            inp.addEventListener('input', () => { b[f.key] = inp.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)} (Kanal-ID)</span>`));
            fBox.appendChild(inp);
          } else {
            const inp = el(`<input class="input" value="${esc(cur != null ? cur : (f.default != null ? f.default : ''))}" placeholder="${esc(f.label)}" style="margin:4px 0">`);
            inp.addEventListener('input', () => { b[f.key] = inp.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)}</span>`));
            fBox.appendChild(inp);
          }
        });
        // Nested (WENN/DANN-Blöcke)
        const nBox = $('.bs-nested', div);
        (kat ? kat.felder : []).filter((f) => f.typ === 'nested').forEach((f) => {
          if (!Array.isArray(b[f.key])) b[f.key] = [];
          const wrap = el(`<div style="border-left:3px solid var(--accent);padding-left:10px;margin:8px 0">
            <b class="small">${esc(f.label)}:</b>
            <div class="bs-nested-inner"></div>
            <button class="btn small bs-nadd">+ Block hier</button></div>`);
          const inner = $('.bs-nested-inner', wrap);
          renderKette(b[f.key], inner, p2.concat(f.key));
          $('.bs-nadd', wrap).addEventListener('click', () => {
            // Palette-Klick: füge in dieses nested ein
            pendingNested = { list: b[f.key], render: () => renderKette(aktuellerBefehl.blocks, $('#stKette', page), []) };
            palOverlayÖffnen();
          });
          nBox.appendChild(wrap);
        });
        container.appendChild(div);
      });
    }

    function blockZusammenfassung(b) {
      const teile = [];
      if (b.text) teile.push('"' + b.text.slice(0, 40) + '"');
      if (b.menge) teile.push(b.menge);
      if (b.chance) teile.push(b.chance + '%');
      if (b.rolle) teile.push('Rolle');
      if (b.kanal) teile.push('Kanal');
      return teile.join(' · ') || '–';
    }

    // Palette für nested: wir merken uns das Ziel
    let pendingNested = null;
    function palOverlayÖffnen() {
      // Einfach: nächster Palette-Klick geht ins nested
      toast('Klicke jetzt oben in der Palette den Block, der HIERrein soll', 'info');
      pal.dataset.nested = '1';
    }
    pal.addEventListener('click', () => {
      if (pal.dataset.nested) { delete pal.dataset.nested; }
    });

    // addBlock: ins nested oder top-level
    function addBlock(blk, zielListe) {
      const neuer = { typ: blk.typ };
      blk.felder.forEach((f) => {
        if (f.typ === 'nested') neuer[f.key] = [];
        else if (f.default != null) neuer[f.key] = f.default;
        else if (f.typ === 'bool') neuer[f.key] = false;
        else neuer[f.key] = '';
      });
      if (pendingNested) {
        pendingNested.list.push(neuer);
        const r = pendingNested.render; pendingNested = null;
        r();
      } else {
        zielListe.push(neuer);
        renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
      }
    }

    // ── Bestehende Befehle ──
    page.appendChild(karte('📚 Studio-Befehle', `<div id="stListe"></div>`));
    function ladeListe() {
      const box = $('#stListe', page);
      box.innerHTML = befehle.length ? befehle.map((c) => `<div class="feed-item">
        <span style="flex:1"><b class="mono">/${esc(c.name)}</b> <span class="dim small">${esc(c.description || '')}</span>
        <div class="dim small">${(c.blocks || []).length} Blöcke${c.studio ? ' · Studio' : ''}</div></span>
        <button class="btn small st-edit" data-id="${esc(c.id)}">Bearbeiten</button>
        <button class="btn small danger st-del" data-id="${esc(c.id)}">✕</button></div>`).join('')
        : '<p class="dim">Noch keine Studio-Befehle.</p>';
      $$('.st-edit', box).forEach((b) => b.addEventListener('click', async () => {
        const r = await API.get('/studio/befehl/' + b.dataset.id).catch(() => null);
        if (!r || !r.befehl) return toast('Nicht gefunden', 'err');
        editId = r.befehl.id;
        aktuellerBefehl = { name: r.befehl.name, description: r.befehl.description || '',
          cooldown: r.befehl.cooldown || 0, roles: r.befehl.roles || [], blocks: r.befehl.blocks || [] };
        $('#stName', page).value = aktuellerBefehl.name;
        $('#stDesc', page).value = aktuellerBefehl.description;
        $('#stCd', page).value = aktuellerBefehl.cooldown;
        $$('#stRol option', page).forEach((o) => { o.selected = aktuellerBefehl.roles.includes(o.value); });
        renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
        toast('Befehl geladen – bearbeiten & speichern', 'ok');
      }));
      $$('.st-del', box).forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDlg('Befehl löschen?'))) return;
        await API.del('/studio/befehle/' + b.dataset.id);
        toast('Gelöscht ✔', 'ok'); ladeListe();
      }));
    }
    ladeListe();

    $('#stSave', page).addEventListener('click', async () => {
      aktuellerBefehl.name = val('stName');
      aktuellerBefehl.description = val('stDesc');
      aktuellerBefehl.cooldown = num('stCd') || 0;
      aktuellerBefehl.roles = $$('#stRol option', page).filter((o) => o.selected).map((o) => o.value);
      if (!aktuellerBefehl.name) return toast('Name fehlt', 'err');
      if (!aktuellerBefehl.blocks.length) return toast('Mindestens 1 Block', 'err');
      try {
        const payload = { ...aktuellerBefehl, guildId: gid };
        if (editId) payload.id = editId;
        await API.post('/studio/befehle', payload);
        toast('💾 Gespeichert & live geladen! /' + aktuellerBefehl.name + ' ist verfügbar.', 'ok');
        editId = null;
        aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
        $('#stName', page).value = ''; $('#stDesc', page).value = ''; $('#stCd', page).value = '';
        renderKette([], $('#stKette', page), []);
        const r2 = await API.get('/studio/befehle');
        befehle.length = 0; befehle.push(...r2.liste); ladeListe();
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#stNeu', page).addEventListener('click', () => {
      editId = null;
      aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
      $('#stName', page).value = ''; $('#stDesc', page).value = ''; $('#stCd', page).value = '';
      renderKette([], $('#stKette', page), []);
    });
    renderKette([], $('#stKette', page), []);
  }

  // ══════════════════ SEITE: BÖRSE (v3 – eigene Analytics pro Aktie) ══════════════════
  async function seiteBoerse(page) {
    const d = await API.get('/boerse/kurse?guildId=' + gid);
    const stat = await API.get('/boerse/statistik?guildId=' + gid).catch(() => null);
    let auswahl = d.liste[0] ? d.liste[0].sym : '';

    page.appendChild(karte('📈 Lumiox-Börse – Kurs-Karten (klicken = Richtung steuern)', `
      <div class="row mb">
        <span class="badge info">⏱️ Update alle ${fmtDauer(d.intervallSek * 1000)}</span>
        ${d.pfad ? '<span class="badge warn">🎯 PFAD: ' + esc(d.pfad.sym) + '</span>' : ''}
        <button class="btn small" id="bsRefresh" style="margin-left:auto">↻ Aktualisieren</button>
      </div>
      <div class="grid-3" id="bsKarten"></div>`));
    const karten = $('#bsKarten', page);
    function mkKarten() {
      karten.innerHTML = d.liste.map((a) => {
        const k = d.kurse[a.sym], alt = d.alt[a.sym] || k;
        const up = k - alt >= 0;
        const fro = a.autoUpdate === false;
        return `<div class="stat" style="cursor:pointer" data-sym="${esc(a.sym)}">
          <span class="val" style="color:${up ? 'var(--ok)' : 'var(--err)'}">${k.toFixed(2)}</span>
          <span class="lbl"><b>${esc(a.sym)}</b>${a.crypto ? ' 🪙' : ''}${fro ? ' ❄️' : ''} · ${esc(a.name)}</span>
          <span class="small" style="color:${up ? 'var(--ok)' : 'var(--err)'}">${up ? '▲' : '▼'} ${Math.abs(k - alt).toFixed(2)}</span></div>`;
      }).join('');
      $$('[data-sym]', karten).forEach((k) => k.addEventListener('click', () => richtung(k.dataset.sym)));
    }
    mkKarten();
    function richtung(sym) {
      const body = el(`<div>
        <div class="row mb"><b>${esc(sym)}</b><span class="dim small">Kurs: ${(d.kurse[sym] || 0).toFixed(2)}</span></div>
        <div class="row mb" style="gap:8px">
          <button class="btn primary" data-p="10">▲ +10 %</button>
          <button class="btn primary" data-p="25">▲ +25 %</button>
          <button class="btn primary" data-p="100">🚀 +100 %</button></div>
        <div class="row mb" style="gap:8px">
          <button class="btn danger" data-p="-10">▼ −10 %</button>
          <button class="btn danger" data-p="-25">▼ −25 %</button>
          <button class="btn danger" data-p="-50">💥 −50 %</button></div>
        <div class="row"><input class="input" type="number" id="bsEigPz" placeholder="eigene %" style="max-width:110px" value="50">
        <button class="btn" id="bsEigGo">Setzen</button></div></div>`);
      openModal('📈 ' + sym + ' steuern', body, [{ label: 'Schließen', klasse: 'primary', action: (z) => z() }]);
      const setzen = async (p) => {
        try { const r = await API.post('/boerse/richtung?guildId=' + gid, { sym, prozent: p });
          toast(sym + ' → ' + r.neuKurs.toFixed(2), 'ok'); z2(); } catch (e) { toast(e.message, 'err'); }
        function z2() { route('boerse'); }
      };
      $$('[data-p]', body).forEach((b) => b.addEventListener('click', () => setzen(Number(b.dataset.p))));
      $('#bsEigGo', body).addEventListener('click', () => setzen(Number(val('bsEigPz')) || 0));
    }

    // ── EIGENE ANALYTICS pro Aktie ──
    page.appendChild(karte('📊 Analytics – Aktie auswählen', `
      <div class="row mb">
        <select class="input" id="bsSel" style="max-width:220px">
          ${d.liste.map((a) => `<option value="${esc(a.sym)}">${esc(a.sym)} · ${esc(a.name)}</option>`).join('')}
        </select>
        <span class="dim small">Jede Aktie hat ihren eigenen Verlauf.</span>
      </div>
      <div class="grid-4 mb" id="bsKenn"></div>
      <div class="chart-box"><canvas id="bsEinChart"></canvas></div>`));
    const kenn = $('#bsKenn', page);
    let einChart = null;
    async function ladeVerlauf(sym) {
      kenn.innerHTML = '<span class="dim">Lade …</span>';
      const r = await API.get('/boerse/verlauf/' + encodeURIComponent(sym) + '?guildId=' + gid).catch(() => null);
      if (!r) { kenn.innerHTML = '<span class="dim">Fehler beim Laden.</span>'; return; }
      const liste = r.liste || [];
      const kurse = liste.map((x) => x.kurs);
      const hoch = kurse.length ? Math.max(...kurse) : r.kurs;
      const tief = kurse.length ? Math.min(...kurse) : r.kurs;
      const erst = kurse[0] != null ? kurse[0] : r.kurs;
      const delta = r.kurs - erst;
      kenn.innerHTML = `
        <div class="stat"><span class="val">${r.kurs.toFixed(2)}</span><span class="lbl">Aktueller Kurs</span></div>
        <div class="stat"><span class="val" style="color:var(--ok)">${hoch.toFixed(2)}</span><span class="lbl">Hoch (Verlauf)</span></div>
        <div class="stat"><span class="val" style="color:var(--err)">${tief.toFixed(2)}</span><span class="lbl">Tief (Verlauf)</span></div>
        <div class="stat"><span class="val" style="color:${delta >= 0 ? 'var(--ok)' : 'var(--err)'}">${delta >= 0 ? '▲ +' : '▼ '}${delta.toFixed(2)}</span><span class="lbl">Veränderung (${liste.length} Punkte)</span></div>`;
      // Chart
      const cvE = $('#bsEinChart', page);
      if (einChart) { try { einChart.destroy(); } catch (_) {} einChart = null; }
      if (typeof Chart === 'undefined') return;
      const labels = liste.map((x) => fmtDatum(x.zeit));
      einChart = new Chart(cvE, {
        type: 'line',
        data: { labels,
          datasets: [{ label: sym, data: kurse, borderColor: '#22d3ee',
            backgroundColor: 'rgba(34,211,238,.12)', fill: true, tension: 0.3, pointRadius: 3 }] },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#aab' } } },
          scales: { x: { ticks: { color: '#889', maxTicksLimit: 10 } }, y: { ticks: { color: '#889' } } } },
      });
    }
    $('#bsSel', page).addEventListener('change', () => ladeVerlauf(val('bsSel')));
    ladeVerlauf(auswahl || 'LUMX');

    if (stat) {
      page.appendChild(karte('📋 Gesamt-Statistik (24 h)', `
        <div class="grid-3 mb">
          <div class="stat"><span class="val">${fmtZahl(stat.depotGesamt)}</span><span class="lbl">Depot-Wert aller Spieler</span></div>
          <div class="stat"><span class="val">${stat.trader}</span><span class="lbl">Aktive Trader</span></div>
          <div class="stat"><span class="val">${stat.manips}</span><span class="lbl">Marktereignisse (7 Tg.)</span></div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Aktie</th><th>24h Hoch</th><th>24h Tief</th><th>Punkte</th></tr></thead>
          ${Object.entries(stat.proAktie).map(([sym, s2]) => `<tr>
            <td><b>${esc(sym)}</b></td><td style="color:var(--ok)">${s2.hoch.toFixed(2)}</td>
            <td style="color:var(--err)">${s2.tief.toFixed(2)}</td><td>${s2.punkte}</td></tr>`).join('')
            || '<tr><td colspan="4" class="dim">Sammelt ab jetzt – Intervall im Geheimpanel einstellbar.</td></tr>'}
        </table></div>`));
    }

    const topKarte = karte('💰 Dein Depot', '<div id="bsDepots"><p class="dim">Lade …</p></div>');
    page.appendChild(topKarte);
    (async () => {
      const d2 = await API.get('/boerse/depot?guildId=' + gid);
      const eintraege = Object.entries(d2.anteile || {}).filter(([, v]) => v > 0.001);
      const box = $('#bsDepots', page);
      box.innerHTML = eintraege.length ? eintraege.map(([sym, anz]) => {
        const kurs = d.kurse[sym] || 0;
        return '<div class="feed-item"><b class="small">' + esc(sym) + '</b><span class="small">' + anz.toFixed(2) + ' × ' + kurs.toFixed(2) + ' = <b>' + (anz * kurs).toFixed(2) + ' 🪙</b></span></div>';
      }).join('') : '<p class="dim">Noch keine Aktien – Kaufe über <code>/boerse kaufen</code> in Discord!</p>';
    })();

    page.appendChild(karte('🕵️ Marktereignisse', d.von
      ? '<div class="feed-item"><span class="badge ai">ÄNDERUNG</span><span>' + esc(d.von) + '</span><span class="feed-zeit">' + fmtRelativ(d.letzteAenderung) + '</span></div>'
      : '<p class="dim">Keine Marktereignisse.</p>'));

    $('#bsRefresh', page).addEventListener('click', () => route('boerse'));
  }

  // ══════════════════ SEITE: BACKUP ══════════════════
  async function seiteBackup(page) {
    page.appendChild(karte('💾 Backup', `
      <p class="mb">Exportiert ALLE Einstellungen und Daten (Servereinstellungen, Mod-Einträge, Wirtschaft, Level,
      Tickets, Transkripte, eigene Commands, Design …) als eine JSON-Datei.
      <b class="small dim">Achtung: Der Export enthält den Bot-Token – Datei sicher aufbewahren!</b></p>
      <div class="row mb">
        <button class="btn primary" id="bkExport">⬇ Backup exportieren</button>
      </div>
      <hr class="trenner">
      ${feld('Backup-Datei auswählen (JSON)', `<input class="input" type="file" id="bkFile" accept=".json">`)}
      <button class="btn danger" id="bkImport">⬆ Backup wiederherstellen (überschreibt alles!)</button>`));
    $('#bkExport', page).addEventListener('click', async () => {
      toast('Erstelle Backup …', 'info');
      const res = await fetch('/api/backup/export');
      const text = await res.text();
      download('lumiox-backup-' + new Date().toISOString().slice(0, 10) + '.json', text);
      toast('Backup heruntergeladen ✔', 'ok');
    });
    $('#bkImport', page).addEventListener('click', async () => {
      const f = $('#bkFile', page).files[0];
      if (!f) return toast('Bitte Datei wählen', 'err');
      if (!(await confirmDlg('Wirklich ALLE Daten mit dem Backup überschreiben? Das kann nicht rückgängig gemacht werden.'))) return;
      const r = new FileReader();
      r.onload = async () => {
        try {
          const data = JSON.parse(r.result);
          const res = await API.post('/backup/import', { data });
          toast(res.hinweis || 'Wiederhergestellt ✔', 'ok');
          setTimeout(() => location.reload(), 1200);
        } catch (e) { toast('Import fehlgeschlagen: ' + e.message, 'err'); }
      };
      r.readAsText(f);
    });
  }

  // ── Motion: gestaffeltes Einblenden + Zahlen hochzählen ───────
  function motionStarten() {
    $$('.page > .panel', document).forEach((p, i) =>
      p.style.setProperty('--d', Math.min(i * 0.07, 0.7).toFixed(2) + 's'));
    if (aktuelleSeite === 'uebersicht' && window.__countUpAn !== false) {
      $$('#page .stat .val').forEach((v) => countUp(v));
    }
  }
  function countUp(elm) {
    const roh = (elm.textContent || '').trim();
    const zielStr = roh.replace(/[.\s]/g, '');
    const ziel = parseInt(zielStr, 10);
    if (isNaN(ziel) || ziel <= 0 || String(ziel) !== zielStr || ziel > 1e12) return;
    const start = performance.now(), dauer = 900;
    const schritt = (jetzt) => {
      const t = Math.min(1, (jetzt - start) / dauer);
      const ease = 1 - Math.pow(1 - t, 3);
      elm.textContent = Math.round(ziel * ease).toLocaleString('de-DE');
      if (t < 1) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }

  // ── Status-Poller (Punkte oben links + Chips) ─────────────────
  async function pollStatus() {
    try {
      const st = await API.get('/status');
      $('#dotBot').className = 'dot ' + (st.bot.connected ? 'ok' : 'err');
      $('#dotAI').className = 'dot ' + (st.ollama.online ? 'ok' : 'err');
      $('#dotAI').title = 'Ollama: ' + (st.ollama.online ? 'online' : st.ollama.lastError || 'offline');
      $('#ramZeile').textContent = 'RAM: ' + st.ram + ' MB · KI-Puffer: ' + st.kiPuffer.nachrichtenImPuffer;
      $('#chipPing').textContent = 'Ping ' + (st.bot.ping ?? '–') + ' ms';
      $('#chipUptime').textContent = 'Uptime ' + fmtDauer((st.bot.uptimeSec || 0) * 1000);
    } catch (_) { /* still */ }
  }
  pollStatus();
  setInterval(pollStatus, 15000);

  // Start
  route('uebersicht');

  // PWA: Service Worker (Installierbarkeit als App)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ══════════════════ SEITE-TEIL: SPIELER-VERWALTUNG ══════════════════
  async function seiteSpieler(page) {
    const sym = (settings.economy && settings.economy.symbol) || '🪙';
    const { liste } = await API.get('/users?guildId=' + gid);
    const klassen = (settings.steuerklassen && settings.steuerklassen.klassen) || [];
    page.appendChild(karte('👥 Spieler-Verwaltung (' + liste.length + ')', `
      <input class="input mb" id="uspSuch" placeholder="🔍 Spieler suchen…" style="max-width:260px">
      <div class="table-wrap"><table class="table" id="uspTable">
        <thead><tr><th>Spieler</th><th>${esc(sym)} Bargeld</th><th>${esc(sym)} Bank</th>
        <th>Schulden</th><th>Level/XP</th><th>Streak</th><th>Klasse</th><th>Boost</th><th></th></tr></thead>
        <tbody></tbody></table></div>
      <p class="dim small mt">„Bearbeiten" ändert Werte direkt – jede Änderung wird unten im Verwaltungs-Log protokolliert.</p>`));
    page.appendChild(karte('📜 Verwaltungs-Log (letzte 50)', '<div id="admLog"><p class="dim">Lade…</p></div>'));

    async function logLaden() {
      const { liste: log } = await API.get('/adminlog?guildId=' + gid);
      const box = $('#admLog', page);
      box.innerHTML = log.length ? log.map((l) => `
        <div class="feed-item">
          <span class="badge info">${esc(l.admin)}</span>
          <span class="small"><b class="mono">${esc(String(l.zielUser)).slice(-6)}</b>: ${l.felder.map((f) =>
            `${esc(f.feld)}: ${esc(String(f.alt))} → <b>${esc(String(f.neu))}</b>`).join(' · ')}</span>
          <span class="feed-zeit">${fmtRelativ(l.zeit)}</span>
        </div>`).join('') : '<p class="dim">Noch keine Änderungen.</p>';
    }

    function zeile(u) {
      const b = u.adminBoosts || {};
      const aktiv = (b.xpMulti > 1 || b.geldMulti > 1) && (!b.bis || b.bis > Date.now());
      const tr = el(`<tr>
        <td><b>${esc(u.name)}</b><div class="dim small mono">${esc(u.userId)}</div></td>
        <td>${fmtZahl(u.bargeld)}</td><td>${fmtZahl(u.bank)}</td>
        <td>${u.schulden > 0 ? '<span class="badge err">' + fmtZahl(u.schulden) + '</span>' : '<span class="dim">–</span>'}</td>
        <td>Lv ${u.level} <span class="dim small">(${fmtZahl(u.xp)} XP)</span></td>
        <td>${u.streak || 0} 🔥</td>
        <td>${u.steuerklasse ? '<span class="badge info">' + esc(u.steuerklasse) + '</span>' : '<span class="dim">Standard</span>'}</td>
        <td>${aktiv ? '<span class="badge ok">XP×' + b.xpMulti + ' · Geld×' + b.geldMulti + '</span>' : '<span class="dim">–</span>'}</td>
        <td><button class="btn small usp-edit">Bearbeiten</button></td>
      </tr>`);
      $('.usp-edit', tr).addEventListener('click', () => bearbeiten(u));
      return tr;
    }

    function fuellen(filter) {
      const tb = $('#uspTable tbody', page);
      tb.innerHTML = '';
      const gefiltert = liste.filter((u) => !filter ||
        u.name.toLowerCase().includes(filter) || u.userId.includes(filter));
      if (!gefiltert.length) {
        tb.innerHTML = '<tr><td colspan="9" class="dim">Keine Spieler gefunden – es erscheinen hier erst Leute, die die Wirtschaft schon genutzt haben.</td></tr>';
        return;
      }
      for (const u of gefiltert) tb.appendChild(zeile(u));
    }

    function bearbeiten(u) {
      const b = u.adminBoosts || {};
      const restMin = b.bis && b.bis > Date.now() ? Math.ceil((b.bis - Date.now()) / 60000) : 0;
      const body = el(`<div>
        <div class="row mb">
          ${u.avatar ? '<img src="' + esc(u.avatar) + '" style="width:40px;height:40px;border-radius:50%">' : ''}
          <div><b>${esc(u.name)}</b><div class="dim small mono">${esc(u.userId)}</div></div>
        </div>
        <div class="grid-3">
          ${feld('Bargeld', zahlInput('ub_bargeld', u.bargeld))}
          ${feld('Bank', zahlInput('ub_bank', u.bank))}
          ${feld('Schulden', zahlInput('ub_schulden', u.schulden))}
          ${feld('Level', zahlInput('ub_level', u.level, 0, 10000))}
          ${feld('XP', zahlInput('ub_xp', u.xp, 0, 1000000000000))}
          ${feld('Daily-Streak', zahlInput('ub_streak', u.streak, 0, 9999))}
        </div>
        ${feld('Steuerklasse', selectHTML('ub_klasse',
          [['', 'Standard (globale Staffeln)'], ...klassen.map((k) => [k.name, k.name])], u.steuerklasse))}
        <hr class="trenner">
        <b class="small">⚡ Individueller Boost</b>
        <div class="grid-3 mt">
          ${feld('XP-Multiplikator (1 = aus)', '<input class="input" type="number" step="0.1" min="1" max="100" id="ub_xpMulti" value="' + (b.xpMulti || 1) + '">')}
          ${feld('Geld-Multiplikator (1 = aus)', '<input class="input" type="number" step="0.1" min="1" max="100" id="ub_geldMulti" value="' + (b.geldMulti || 1) + '">')}
          ${feld('Boost-Dauer (Min., 0 = dauerhaft)', zahlInput('ub_boostMin', restMin, 0, 525600))}
        </div>
        <p class="dim small">Geld-Boost wirkt auf /work & /daily (im Brutto sichtbar), XP-Boost auf das Levelsystem – beides erscheint auch auf der /rank-Karte des Spielers.</p>
      </div>`);
      openModal('Spieler bearbeiten', body, [
        { label: 'Abbrechen', action: (zu) => zu() },
        { label: '💾 Speichern', klasse: 'primary', action: async (zu) => {
          try {
            await API.post('/users/edit?guildId=' + gid, {
              userId: u.userId,
              bargeld: num('ub_bargeld'), bank: num('ub_bank'), schulden: num('ub_schulden'),
              level: num('ub_level'), xp: num('ub_xp'), streak: num('ub_streak'),
              steuerklasse: val('ub_klasse'),
              xpMulti: Number(val('ub_xpMulti')) || 1,
              geldMulti: Number(val('ub_geldMulti')) || 1,
              boostMinuten: num('ub_boostMin'),
            });
            toast('Spieler gespeichert ✔ (im Log protokolliert)', 'ok');
            zu();
            const neu = await API.get('/users?guildId=' + gid);
            liste.length = 0; liste.push(...neu.liste);
            fuellen(val('uspSuch').toLowerCase().trim());
            await logLaden();
          } catch (e) { toast(e.message, 'err'); }
        } },
      ]);
    }

    fuellen('');
    await logLaden();
    $('#uspSuch', page).addEventListener('input',
      debounce(() => fuellen(val('uspSuch').toLowerCase().trim()), 200));
  }

  // ══════════════════ SEITE-TEIL: EIGENE STEUERKLASSEN ══════════════════
  async function seiteSteuerklassen(page) {
    const sk = settings.steuerklassen || { enabled: false, klassen: [] };
    const zeileHtml = (k) => `
      <tr>
        <td><input class="input" value="${esc(k.name || '')}" data-sk="name" placeholder="z. B. Klasse A"></td>
        <td><input class="input" type="number" step="0.5" value="${k.incomePercent ?? -1}" data-sk="incomePercent"></td>
        <td><input class="input" type="number" step="0.5" value="${k.txPercent ?? -1}" data-sk="txPercent"></td>
        <td><input class="input" type="number" step="0.1" min="0" value="${k.wealthMultiplier ?? 1}" data-sk="wealthMultiplier"></td>
        <td><button class="btn small danger sk-del">✕</button></td>
      </tr>`;
    page.appendChild(karte('🏷️ Eigene Steuerklassen', `
      <div class="row mb">
        <span class="small">Aktiv:</span> ${toggleHTML('skOn', sk.enabled)}
        <button class="btn primary" id="skSave" style="margin-left:auto">💾 Speichern</button>
      </div>
      <div class="table-wrap"><table class="table" id="skTable">
        <thead><tr><th>Name</th><th>Einkommensteuer %</th><th>Transaktionssteuer %</th><th>Vermögenssteuer ×</th><th></th></tr></thead>
        <tbody>${(sk.klassen || []).map(zeileHtml).join('')}</tbody></table></div>
      <button class="btn small mt" id="skAdd">+ Klasse hinzufügen</button>
      <p class="dim small mt">
        <b>−1</b> = globale Einstellung von oben verwenden (Staffeln bzw. Transaktionssteuer).<br>
        <b>Beispiele:</b> „VIP": Einkommen 0 %, Transaktion 0 %, Vermögen ×0 — „Reich": Einkommen 25 % —
        „Arm": Einkommen −1 (global), Vermögen ×0,5 (halbe Vermögenssteuer).<br>
        Zuweisung pro Spieler in der <b>Spieler-Verwaltung</b> (Bearbeiten → Steuerklasse).
        Wirkt sofort auf /work, /daily, /pay und die nächste Vermögenssteuer-Ziehung.
      </p>`));
    const bind = () => $$('.sk-del', page).forEach((x) =>
      x.addEventListener('click', () => x.closest('tr').remove()));
    bind();
    $('#skAdd', page).addEventListener('click', () => {
      $('#skTable tbody', page).insertAdjacentHTML('beforeend', zeileHtml({}));
      bind();
    });
    $('#skSave', page).addEventListener('click', () => {
      const klassen = $$('#skTable tbody tr', page).map((tr) => ({
        name: $('[data-sk=name]', tr).value.trim(),
        incomePercent: Number($('[data-sk=incomePercent]', tr).value),
        txPercent: Number($('[data-sk=txPercent]', tr).value),
        wealthMultiplier: Number($('[data-sk=wealthMultiplier]', tr).value) || 1,
      })).filter((k) => k.name);
      speichere({ steuerklassen: { enabled: chk('skOn'), klassen } }, 'Steuerklassen gespeichert ✔');
    });
  }

  // ══════════════════ SEITE: KI-PROZESSE (Live-Fenster) ══════════════════
  async function seiteKi(page) {
    page.appendChild(el('<div class="panel card"><h3>🔬 KI-Prozesse – Live-Fenster in die Moderations-Engine</h3><p class="dim small">Diese Seite zeigt JEDE Phase: Nachricht empfangen → gepuffert → analysiert → Ergebnis/Skip/Fehler. Aktualisiert alle 5 Sekunden automatisch. Perfekt zum Verstehen und Fehlersuchen.</p></div>'));

    const kDiag = karte('🩺 Live-Diagnose', '<div class="grid-4" id="kiDiag"></div><div id="kiHint" class="mt"></div>');
    const kEinst = karte('⚙️ Konfiguration & Engine-Wahl', `
      <div class="row mb">
        ${feld('Prüf-Engine', `<select class="input" id="kiEng" style="max-width:430px">
          <option value="sentinel">Sentinel – ohne KI (schnell, offline, Mobbing-Muster)</option>
          <option value="ollama">Ollama – echtes Sprachmodell (CPU-lastig)</option>
        </select>`)}
        <button class="btn primary" id="kiEngSave">💾 Engine speichern</button>
      </div>
      <div id="kiSpiegel"></div>`);
    const kPuf = karte('📦 Live-Nachrichten-Puffer (was die Engine gerade sieht)', '<div id="kiPuffer"></div>');
    const kLog = karte('🧾 Prozess-Log – jede Phase einzeln', '<div id="kiLogF"></div>');
    const kDet = karte('🧠 Letzte Analyse-Ergebnisse', '<div id="kiDet"></div>');
    [kDiag, kEinst, kPuf, kLog, kDet].forEach((k) => page.appendChild(k));

    const TYP = {
      msg: ['info', '📩 empfangen'], puffer: ['ok', '📦 gepuffert'],
      analyse: ['ai', '🧠 Analyse'], treffer: ['err', '🚨 TREFFER'],
      skip: ['warn', '⏭ übersprungen'], fehler: ['err', '❌ Fehler'],
      batch: ['ai', '⏱ Kontext-Batch'], ok: ['ok', '✔ unter Schwelle'],
    };

    async function lade() {
      let st;
      try { st = await API.get('/ki/status?guildId=' + gid); } catch (_) { return; }
      const z = st.kiLog.zaehler;

      $('#kiDiag', kDiag).innerHTML = [
        ['Nachrichten empfangen', z.nachrichten], ['Im Puffer (jetzt)', st.puffer.length],
        ['Analysen', z.analysen], ['Treffer', z.treffer], ['Fehler', z.fehler],
      ].map(([l, v]) => `<div class="stat"><span class="val">${fmtZahl(v)}</span><span class="lbl">${l}</span></div>`).join('');

      let hinweis = '';
      if (!st.settings.enabled) {
        hinweis = `<div class="fehler">⛔ <b>KI-Moderation ist ausgeschaltet!</b> Deshalb bleibt der Puffer leer.
          <button class="btn primary small" id="kiEnable" style="margin-left:10px">Jetzt aktivieren</button></div>`;
      } else if (z.nachrichten === 0) {
        hinweis = `<div class="hinweis-box">🔴 Der Bot empfängt <b>gar keine</b> Nachrichten. Schreibe etwas in einen Kanal – bleibt dieser Zähler bei 0: <br>
          1) Bot kann den Kanal nicht sehen (Kanal-Rechte!) · 2) Du schreibst per DM (wird ignoriert) · 3) Bot nicht verbunden (Status oben links).</div>`;
      } else if (z.gepuffert === 0) {
        hinweis = `<div class="hinweis-box">🟠 Nachrichten kommen an, werden aber nicht gepuffert → <b>Grund steht unten im Prozess-Log</b> (Typ „übersprungen").</div>`;
      } else if (st.puffer.length && st.puffer.every((p) => !p.inhalt)) {
        hinweis = `<div class="hinweis-box">🟡 Nachrichten kommen an, haben aber <b>LEEREN INHALT</b>! → Im Discord-Entwicklerportal <b>MESSAGE CONTENT INTENT</b> aktivieren, dann unter Einstellungen „Neu verbinden".</div>`;
      } else {
        hinweis = `<div class="ki-antwort">🟢 Die Pipeline läuft! Nachrichten werden gepuffert und analysiert – Ergebnisse siehe Prozess-Log und letzte Analysen.</div>`;
      }
      $('#kiHint', kDiag).innerHTML = hinweis;
      const en = $('#kiEnable', kDiag);
      if (en) en.addEventListener('click', async () => {
        await API.post('/ki/enable?guildId=' + gid, {});
        toast('KI-Moderation aktiviert ✔', 'ok');
        lade();
      });

      $('#kiEng', kEinst).value = st.settings.engine;
      const s2 = st.settings;
      $('#kiSpiegel', kEinst).innerHTML = `<div class="grid-2">
        <div class="feld"><span>Moderation aktiv</span><span class="badge ${s2.enabled ? 'ok' : 'err'}">${s2.enabled ? 'AN' : 'AUS'}</span></div>
        <div class="feld"><span>Empfindlichkeit</span><div>${s2.sensitivity}/10 → Verstoß ab SG ≥ <b>${s2.schwellenwert}</b></div></div>
        <div class="feld"><span>Kontext-Batch</span><div>${s2.contextBatch ? 'AN – alle ' + s2.contextBatchMinutes + ' Min.' : 'AUS (Einzelprüfung)'} · Puffer-Fenster: ${s2.contextWindowMinutes} Min.</div></div>
        <div class="feld"><span>Letzter Batch</span><div>${st.letzteBatch ? fmtRelativ(st.letzteBatch) : 'noch nie'}</div></div>
        <div class="feld"><span>Whitelist</span><div>${s2.whitelist.user} User · ${s2.whitelist.kanal} Kanäle · ${s2.whitelist.rollen} Rollen</div></div>
        <div class="feld"><span>Ollama</span><div><span class="badge ${st.ollama.online ? 'ok' : 'err'}">${st.ollama.online ? 'Online (' + st.ollama.lastLatencyMs + ' ms)' : 'Offline'}</span> <span class="dim small">${st.ollama.lastError ? esc(st.ollama.lastError) : ''}</span></div></div>
      </div>`;

      const p = st.puffer;
      $('#kiPuffer', kPuf).innerHTML = p.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Zeit</th><th>Autor</th><th>Kanal</th><th>Inhalt</th></tr></thead>
        ${p.map((m) => `<tr><td class="small dim">${fmtRelativ(m.zeit)}</td><td class="small">${esc(m.autor)}</td><td class="small">#${esc(m.kanalName || '?')}</td><td class="small">${m.inhalt ? esc(m.inhalt).slice(0, 120) : '<span class="badge err">LEER – Intent fehlt?</span>'}</td></tr>`).join('')}
      </table></div>` : '<p class="dim">Puffer leer. Schreibe etwas in den Chat – es erscheint hier innerhalb von Sekunden.</p>';

      const evs = st.kiLog.ereignisse;
      $('#kiLogF', kLog).innerHTML = evs.length ? evs.map((e) => {
        const t = TYP[e.typ] || ['info', e.typ];
        return `<div class="feed-item"><span class="badge ${t[0]}">${t[1]}</span><span class="small">${esc(e.text)}</span><span class="feed-zeit">${fmtRelativ(e.zeit)}</span></div>`;
      }).join('') : '<p class="dim">Noch keine Ereignisse seit dem letzten Neustart.</p>';

      $('#kiDet', kDet).innerHTML = st.detectionen.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Zeit</th><th>Autor</th><th>Modus</th><th>Kat.</th><th>SG</th><th>Treffer</th><th>Begründung</th></tr></thead>
        ${st.detectionen.map((d) => `<tr><td class="small">${fmtRelativ(d.zeit)}</td><td class="small">${esc(d.autor)}</td><td class="small">${esc(d.modus)}</td><td class="small">${esc(d.kategorie)}</td><td>${d.schweregrad}</td><td>${d.treffer ? '<span class="badge err">Ja</span>' : '<span class="badge ok">Nein</span>'}</td><td class="small">${esc(d.begruendung).slice(0, 90)}</td></tr>`).join('')}
      </table></div>` : '<p class="dim">Noch keine Analysen gespeichert.</p>';
    }

    $('#kiEngSave', kEinst).addEventListener('click', () =>
      speichere({ aiMod: { engine: val('kiEng') } }, 'Engine gespeichert ✔'));

    await lade();
    seitenTimer = setInterval(lade, 5000);
  }

  // ══════════════════ SEITE: STAAT & POLIZEI ══════════════════
  async function seiteStaat(page) {
    const info = await API.get('/staat/info?guildId=' + gid);
    const st = info.settings;
    const kan = await ladeKanäle();
    const rol = await ladeRollen();

    page.appendChild(karte('🏛️ Staatskasse & Finanzamt', `
      <div class="grid-3 mb">
        <div class="stat"><span class="val" style="color:${info.kasse < 0 ? 'var(--err)' : ''}">${fmtZahl(info.kasse)}</span><span class="lbl">Staatskasse${info.kasse < 0 ? ' ⚠️ DEFIZIT' : ''}</span></div>
        <div class="stat"><span class="val">${fmtZahl(info.wacheKasse)}</span><span class="lbl">Polizeiwache-Kasse</span></div>
        <div class="stat"><span class="val">${info.fangChance} %</span><span class="lbl">Fangquote Betrug</span></div>
      </div>
      <div class="grid-2">
        <div class="feld"><span>Staat-System aktiv</span>${toggleHTML('staOn', st.staat.enabled)}</div>
        ${feld('Steuer-Umlage an den Staat (%)', zahlInput('staAnteil', st.staat.anteil, 0, 100))}
      </div>
      <b class="small">Der Staat zahlt folgende Ausgaben (Buchhaltung – bei Defizit läuft es ins Minus):</b>
      <div class="grid-3 mt mb">
        <div class="feld"><span>Startguthaben (bei Join)</span>${toggleHTML('zStart', st.staat.zahlt.start)}</div>
        <div class="feld"><span>Daily-Auszahlung</span>${toggleHTML('zDaily', st.staat.zahlt.daily)}</div>
        <div class="feld"><span>Work-Löhne</span>${toggleHTML('zWork', st.staat.zahlt.work)}</div>
        <div class="feld"><span>Lotterie-Jackpots</span>${toggleHTML('zLot', st.staat.zahlt.lotterie)}</div>
        <div class="feld"><span>Immobilien-Mieten</span>${toggleHTML('zImmo', st.staat.zahlt.immobilien)}</div>
      </div>
      <button class="btn primary" id="staSave">💾 Staat speichern</button>`));
    $('#staSave', page).addEventListener('click', async () => {
      await API.post('/staat/settings?guildId=' + gid, { staat: {
        enabled: chk('staOn'), anteil: num('staAnteil'),
        zahlt: { start: chk('zStart'), daily: chk('zDaily'), work: chk('zWork'), lotterie: chk('zLot'), immobilien: chk('zImmo') },
      } });
      toast('Staat gespeichert ✔', 'ok'); route('staat');
    });

    const spiele = st.steuererklaerung.spiele || ['mathe', 'blitz', 'roulette', 'memory'];
    page.appendChild(karte('📋 Steuererklärung (Mini-Spiele)', `
      <div class="grid-3">
        ${feld('Intervall (Tage)', zahlInput('skTage', st.steuererklaerung.intervallTage, 7, 90))}
        ${feld('Mindest-Vermögen (wer muss)', zahlInput('skMin', st.steuererklaerung.mindestVermoegen, 0))}
        ${feld('Strafe bei Hinterziehung (%)', zahlInput('skStrafe', st.steuererklaerung.strafeProzent, 1, 50))}
      </div>
      <b class="small">Aktive Mini-Spiele (Spieler wählen eines aus):</b>
      <div class="row mb">
        ${[['mathe', '🧮 Steuer-Mathe'], ['blitz', '⏱️ Blitz-Rechnen'], ['roulette', '🍀 Ehrlichkeits-Wurf'], ['memory', '🧠 Memory-Zahl']].map(([v, l]) =>
          '<label style="display:flex;gap:6px;align-items:center;font-size:.85rem;margin-right:14px"><input type="checkbox" class="skSp" value="' + v + '" ' + (spiele.includes(v) ? 'checked' : '') + '><span>' + l + '</span></label>').join('')}
      </div>
      <button class="btn primary" id="skSave">💾 Steuererklärung speichern</button>
      <p class="dim small mt">Nächste Periode endet: ${info.periode ? fmtDatum(info.periode.ende) : '–'} · Discord-Befehl: <code>/steuererklaerung</code> · Verpassen = Fangquote ${info.fangChance} %!</p>`));
    $('#skSave', page).addEventListener('click', async () => {
      await API.post('/staat/settings?guildId=' + gid, { steuererklaerung: {
        intervallTage: num('skTage'), mindestVermoegen: num('skMin'), strafeProzent: num('skStrafe'),
        spiele: $$('.skSp', page).filter((c) => c.checked).map((c) => c.value),
      } });
      toast('Steuererklärung gespeichert ✔', 'ok');
    });

    page.appendChild(karte('🚔 Polizeiwache', `
      <div class="grid-2">
        ${feld('Polizei-Rolle (Offiziere mit Gehalt + Fahndung)', selectHTML('poRolle', rollenOptionen(rol), st.polizei.rolle))}
        ${feld('Tägliches Gehalt pro Offizier', zahlInput('poGehalt', st.polizei.gehalt, 0))}
      </div>
      <p class="dim small">Förderung läuft in Discord: <code>/polizei foerndern</code> (Spieler spenden der Wache) – 10.000 🪙 Kasse = maximale Fangquote +50 %!</p>
      <button class="btn primary" id="poSave">💾 Polizei speichern</button>`));
    $('#poSave', page).addEventListener('click', async () => {
      await API.post('/staat/settings?guildId=' + gid, { polizei: { rolle: val('poRolle'), gehalt: num('poGehalt') } });
      toast('Polizei gespeichert ✔', 'ok');
    });

    page.appendChild(karte('🏦 Kredit & 🥷 Shop-Diebstahl', `
      <div class="grid-3">
        ${feld('Max. Kreditbetrag', zahlInput('krMax', st.kredit.maxBetrag, 100))}
        ${feld('Zinsen (%/Tag)', zahlInput('krZins', st.kredit.zinsProTag, 0, 25))}
        <div class="feld"><span>Shop-Diebstahl (/klauen) aktiv</span>${toggleHTML('klOn', st.klauen.enabled !== false)}</div>
      </div>
      <button class="btn primary" id="krSave">💾 Speichern</button>
      <p class="dim small mt">Neue Discord-Befehle: <code>/boerse</code> · <code>/kredit</code> · <code>/immobilie</code> · <code>/steuererklaerung</code> · <code>/polizei</code> · <code>/steuerfahndung</code> · <code>/klauen</code></p>`));
    $('#krSave', page).addEventListener('click', async () => {
      await API.post('/staat/settings?guildId=' + gid, { kredit: { maxBetrag: num('krMax'), zinsProTag: num('krZins') }, klauen: { enabled: chk('klOn') } });
      toast('Gespeichert ✔', 'ok');
    });
  }

  // ══════════════════ SEITE: EXTRAS 0.8.1 ══════════════════
  async function seiteExt(page) {
    const st = await API.get('/ext/settings?guildId=' + gid);
    const kan = await ladeKanäle();

    page.appendChild(karte('🧰 Lumiox 0.8.1 – Neue Werkzeuge',
      '<p class="dim small">10 neue Funktionen – hier die wichtigsten Einstellungen & Ansichten.</p>'));

    // ── 1) Auto-Backups ──
    page.appendChild(karte('🕐 Auto-Backups',
      '<div class="grid-3">' +
      '<div class="feld"><span>Aktiv</span>' + toggleHTML('abOn', st.backups.enabled) + '</div>' +
      feld('Intervall', selectHTML('abInt', [['täglich', 'Täglich'], ['wöchentlich', 'Wöchentlich (Sonntag)']], st.backups.intervall)) +
      feld('Uhrzeit', '<input class="input" type="time" id="abTime" value="' + esc(st.backups.uhrzeit || '04:00') + '">') +
      feld('Max. behalten', zahlInput('abMax', st.backups.maxAnzahl || 10, 1, 50)) +
      '</div>' +
      '<div class="row">' +
      '<button class="btn primary" id="abSave">💾 Speichern</button>' +
      '<button class="btn" id="abNow">📦 Jetzt sichern</button>' +
      '<span class="dim small" id="abNext"></span></div>' +
      '<div id="abListe" class="mt"></div>'));
    (async () => {
      const { liste } = await API.get('/ext/backups/liste');
      const box = $('#abListe', page);
      box.innerHTML = liste.length ? '<b class="small">Vorhandene Backups:</b>' + liste.map((b) =>
        '<div class="feed-item"><span>📦 ' + esc(b.name) + '</span><span class="dim small">' + b.groesse + ' KB · ' + fmtDatum(b.zeit) + '</span></div>').join('')
        : '<p class="dim small">Noch keine Backups.</p>';
    })();
    $('#abSave', page).addEventListener('click', async () => {
      const r = await API.post('/ext/backups', { enabled: chk('abOn'), intervall: val('abInt'), uhrzeit: val('abTime'), maxAnzahl: num('abMax') });
      toast('Auto-Backups gespeichert ✔', 'ok');
      if (r.next) $('#abNext', page).textContent = 'Nächster Lauf: ' + fmtDatum(r.next);
    });
    $('#abNow', page).addEventListener('click', async () => {
      const r = await API.post('/ext/backups/jetzt', {});
      toast('Backup erstellt: ' + r.datei, 'ok');
      route('ext');
    });

    // ── 2) Wochenbericht ──
    page.appendChild(karte('📊 Wochenbericht',
      feld('Kanal für den Sonntags-Bericht (19:00+)', selectHTML('wbKanal', kanalOptionen(kan), st.wochenbericht ? st.wochenbericht.kanal : '')) +
      '<button class="btn primary" id="wbSave">💾 Speichern</button>'));
    $('#wbSave', page).addEventListener('click', async () => {
      await speichere({ wochenbericht: { kanal: val('wbKanal') } }, 'Wochenbericht gespeichert ✔');
    });

    // ── 3) Ziele ──
    page.appendChild(karte('🎯 Server-Ziele',
      '<div class="grid-3 mb">' +
      feld('Ziel-Name', '<input class="input" id="zName" placeholder="z. B. 500 Mitglieder">') +
      feld('Typ', selectHTML('zTyp', [['mitglieder', 'Mitglieder'], ['nachrichten', 'Nachrichten (gesamt)'], ['verstossen_beseitigt', 'Erledigte Mod-Cases']])) +
      feld('Zielwert', zahlInput('zWert', 500, 1)) +
      '</div>' +
      '<button class="btn primary mb" id="zAdd">+ Ziel setzen</button>' +
      '<div id="zListe"></div>'));
    async function ladeZiele() {
      const { liste } = await API.get('/ext/ziele?guildId=' + gid);
      const box = $('#zListe', page);
      box.innerHTML = liste.length ? liste.map((z) => {
        const p = Math.min(100, Math.round((z.stand / z.zielWert) * 100));
        return '<div class="panel card" style="margin-bottom:8px">' +
          '<div class="regel-kopf"><b>' + (z.erreicht ? '🏆' : '🎯') + ' ' + esc(z.name) + '</b>' +
          '<span class="badge ' + (z.erreicht ? 'ok' : 'warn') + '">' + fmtZahl(z.stand) + ' / ' + fmtZahl(z.zielWert) + ' (' + p + '%)</span></div>' +
          '<div class="progress"><i style="width:' + p + '%"></i></div>' +
          (z.erreicht ? '' : '<button class="btn small danger mt z-del" data-id="' + esc(z.id) + '">Löschen</button>') +
          '</div>';
      }).join('') : '<p class="dim small">Noch keine Ziele gesetzt.</p>';
      $$('.z-del', box).forEach((b) => b.addEventListener('click', async () => {
        await API.del('/ext/ziele/' + b.dataset.id);
        toast('Gelöscht ✔', 'ok');
        ladeZiele();
      }));
    }
    ladeZiele();
    $('#zAdd', page).addEventListener('click', async () => {
      if (!val('zName')) return toast('Bitte Namen eingeben', 'err');
      await API.post('/ext/ziele?guildId=' + gid, { name: val('zName'), typ: val('zTyp'), zielWert: num('zWert') });
      toast('Ziel gesetzt ✔', 'ok');
      ladeZiele();
    });

    // ── 4) Mod-Hinweise ──
    page.appendChild(karte('👮 Mod-Hinweise (Soft-Warns)',
      '<div class="grid-2">' +
      feld('Benutzer-ID', '<input class="input" id="mhUser" placeholder="123456789012345678">') +
      feld('Grund', '<input class="input" id="mhGrund" placeholder="z. B. Bitte Werbung im richtigen Kanal posten">') +
      '</div>' +
      '<button class="btn primary" id="mhAdd">📌 Hinweis erteilen</button>' +
      '<p class="dim small mt">Hinweise verfallen nach 7 Tagen. ' + (st.modHinweise ? st.modHinweise.bisVerwarnung : 3) + ' aktive = automatische echte Verwarnung.</p>'));
    $('#mhAdd', page).addEventListener('click', async () => {
      try {
        const r = await API.post('/ext/hinweis?guildId=' + gid, { userId: val('mhUser'), grund: val('mhGrund') });
        toast(r.eskaliert ? '⚠️ Schwelle erreicht → echte Verwarnung erteilt!' : 'Hinweis erteilt (' + r.hinweise + ' aktiv)', r.eskaliert ? 'err' : 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    // ── 5) Invite-Tracking ──
    page.appendChild(karte('🔗 Invite-Tracking',
      '<p class="dim small mb">Ab jetzt werden Invites gezählt. Belohnung pro geworbenem Mitglied:</p>' +
      '<div class="row">' +
      feld('Bonus-Geld', zahlInput('ivBonus', st.inviteTracking ? st.inviteTracking.bonus : 100, 0)) +
      '<button class="btn primary" id="ivSave" style="align-self:flex-end">💾 Speichern</button></div>' +
      '<p class="dim small">Rangliste in Discord: <code>/werber</code></p>'));
    $('#ivSave', page).addEventListener('click', async () => {
      await speichere({ inviteTracking: { bonus: num('ivBonus') } }, 'Invite-Bonus gespeichert ✔');
    });
  }

})();

// ═══ Command-Studio: Ansicht-Umschalter + Visual-Button (Event-Delegation, unabhängig von Render) ═══
document.addEventListener('click', (e) => {
  if (e.target.id === 'ansVis' || e.target.id === 'stVisual') {
    window.open('/studio.html?g=' + (document.getElementById('guildSelect') || {}).value, '_blank');
  }
  if (e.target.id === 'ansList') {
    toast('📝 Du bist in der Listen-Ansicht – Blöcke über die Palette hinzufügen!', 'ok');
  }
});
