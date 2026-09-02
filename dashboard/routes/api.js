// ═══════════════════════════════════════════════════════════════
// KOMPLETTE DASHBOARD-API
//  - Setup-Assistent (Token + Sofort-Reconnect, IDs + Einladungs-
//    link, Ollama-Test, Admin-Login erstellen)
//  - Auth (Login/Logout/Rate-Limit), Status & Übersicht
//  - Einstellungen (Gilde + global), KI-Test-Konsole
//  - Mod-Einträge (Suche/Filter/Export), KI-Erkennungen, Wortfilter
//  - Wirtschaft/Kasse, Level, Tickets/Transkripte, Analytics
//  - Eigene Commands (live reload), Design pro Account + Presets
//  - Backup Export/Import, Admin-Verwaltung
// Sicherheit: Guard vor allen Routen – vor Setup-Abschluss nur
// Setup-Endpunkte; danach alles nur mit Session. Token wird NIE
// im Klartext an den Browser geschickt (nur maskiert).
// ═══════════════════════════════════════════════════════════════
'use strict';

const path = require('path');

const fs = require('fs');

const express = require('express');
const { PermissionsBitField } = require('discord.js');
const config = require('../../core/config');
const db = require('../../core/db');
const logger = require('../../core/logger');
const ollama = require('../../core/ollama');
const bot = require('../../bot/client');
const registry = require('../../bot/registry');
const auth = require('../auth');
const aiModeration = require('../../bot/systems/aiModeration');
const kiLog = require('../../bot/systems/kiLog');
const sentinel = require('../../bot/systems/sentinel');
const economy = require('../../bot/systems/economy');
const levelSystem = require('../../bot/systems/levelSystem');
const modLog = require('../../bot/systems/modLog');

// ── Helfer ──────────────────────────────────────────────────────
function aktuellerUser(req) {
  return db.get('dashboard_users', req.session.userId);
}

function inviteLink(clientId, guildId) {
  if (!clientId) return '';
  const perms = new PermissionsBitField([
    'ViewChannel', 'SendMessages', 'ManageMessages', 'ManageChannels',
    'KickMembers', 'BanMembers', 'ModerateMembers', 'ManageRoles',
    'AttachFiles', 'EmbedLinks', 'ReadMessageHistory', 'AddReactions', 'ManageGuild',
  ]).bitfield.toString();
  return `https://discord.com/oauth2/authorize?client_id=${clientId}` +
         `&scope=bot%20applications.commands&permissions=${perms}` +
         (guildId ? `&guild_id=${guildId}` : '');
}

function tokenMaske(token) {
  return token ? '••••••••' + token.slice(-4) : '';
}

const OLLAMA_HINWEIS =
  'Termux-Installation:  pkg install ollama   →   ollama serve   →   ollama pull gemma2:2b ' +
  '(in einer eigenen Session; prüfe mit curl http://127.0.0.1:11434/api/tags)';

module.exports = function registriereApi(app) {
  const r = express.Router();

  // ═══════════════════════════════════════════════════════════
  // GUARD: Zugriffsschutz für ALLE /api-Routen
  // ═══════════════════════════════════════════════════════════
  app.use('/api', (req, res, next) => {
    const cfg = config.get();
    if (!cfg.setupComplete) {
      const erlaubt = ['/setup/status', '/setup/token', '/setup/ids', '/setup/admin',
                       '/setup/finish', '/ollama/test', '/login'];
      if (erlaubt.some((p) => req.path === p || req.path.startsWith(p + '/'))) return next();
      return res.status(401).json({ error: 'Setup nicht abgeschlossen', setup: true });
    }
    if (req.path === '/login' || req.path === '/setup/status') return next();
    if (!req.session || !req.session.userId) {
      return res.status(401).json({ error: 'Nicht eingeloggt' });
    }
    next();
  });

  // ═══════════════════════════════════════════════════════════
  // SETUP-ASSISTENT
  // ═══════════════════════════════════════════════════════════
  r.get('/setup/status', async (_req, res) => {
    const cfg = config.get();
    res.json({
      complete: cfg.setupComplete,
      tokenGesetzt: !!cfg.token,
      tokenMaske: tokenMaske(cfg.token),
      clientId: cfg.clientId || '',
      guildId: cfg.guildId || '',
      adminErstellt: !!cfg.dashboard.adminCreated,
      inviteLink: inviteLink(cfg.clientId, cfg.guildId),
      ollamaOnline: await ollama.checkOnline(),
      bot: bot.getStatus(),
    });
  });

  // Schritt 1: Token speichern + SOFORT verbinden (ohne Neustart)
  r.post('/setup/token', async (req, res) => {
    const token = String(req.body.token || '').trim();
    if (token.length < 40) {
      return res.status(400).json({ ok: false, fehler: 'Das sieht nicht nach einem gültigen Bot-Token aus (zu kurz).' });
    }
    config.set({ token });
    logger.info('Token gespeichert – Bot verbindet sich neu …');
    try {
      await bot.restartBot();
      res.json({ ok: true, verbunden: bot.getStatus().connected });
    } catch (e) {
      res.json({ ok: false, fehler: 'Verbindung fehlgeschlagen: ' + e.message +
        ' – prüfe den Token und die Intents (MESSAGE CONTENT + SERVER MEMBERS) im Developer-Portal.' });
    }
  });

  // Schritt 2: IDs + Einladungslink
  r.post('/setup/ids', (req, res) => {
    const clientId = String(req.body.clientId || '').trim();
    const guildId = String(req.body.guildId || '').trim();
    if (clientId && !/^\d{17,20}$/.test(clientId)) {
      return res.status(400).json({ error: 'Client/Application-ID sieht ungültig aus (nur Ziffern, 17–20 Stellen).' });
    }
    if (guildId && !/^\d{17,20}$/.test(guildId)) {
      return res.status(400).json({ error: 'Guild-ID sieht ungültig aus.' });
    }
    config.set({ clientId, guildId });
    res.json({ ok: true, inviteLink: inviteLink(config.get().clientId, config.get().guildId) });
  });

  // Schritt 4: Admin-Konto erstellen
  r.post('/setup/admin', (req, res) => {
    const cfg = config.get();
    if (cfg.dashboard.adminCreated && req.session && !req.session.userId) {
      return res.status(403).json({ error: 'Es existiert bereits ein Admin-Konto. Bitte einloggen.' });
    }
    const id = auth.erstelleBenutzer(String(req.body.benutzername || '').trim(), req.body.passwort);
    if (!id) {
      return res.status(400).json({ error: 'Benutzername nötig und Passwort mindestens 6 Zeichen.' });
    }
    config.set({ dashboard: { adminCreated: true } });
    req.session.userId = id;
    res.json({ ok: true });
  });

  r.post('/setup/finish', (_req, res) => {
    config.set({}); // triggert setupComplete-Prüfung
    res.json({ ok: true, complete: config.get().setupComplete });
  });

  // ═══════════════════════════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════════════════════════
  r.post('/login', (req, res) => {
    const ergebnis = auth.login(String(req.body.benutzername || '').trim(), String(req.body.passwort || ''));
    if (!ergebnis.ok) return res.status(401).json({ error: ergebnis.fehler });
    req.session.userId = ergebnis.user.id;
    res.json({ ok: true, benutzername: ergebnis.user.benutzername });
  });

  r.post('/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  r.get('/me', (req, res) => {
    const u = aktuellerUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
    res.json({ benutzername: u.benutzername, rolle: u.rolle, design: u.design || null });
  });

  // ═══════════════════════════════════════════════════════════
  // OLLAMA-TEST (Setup + Einstellungen)
  // ═══════════════════════════════════════════════════════════
  r.post('/ollama/test', async (req, res) => {
    const url = String(req.body.url || config.get().ollama.url || 'http://127.0.0.1:11434').replace(/\/+$/, '');
    const model = String(req.body.model || config.get().ollama.model || 'gemma2:2b').trim();
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 45000);
      const tagsRes = await fetch(url + '/api/tags', { signal: ctrl.signal });
      if (!tagsRes.ok) throw new Error(`Ollama antwortete mit HTTP ${tagsRes.status}`);
      const tags = await tagsRes.json();
      const modelle = (tags.models || []).map((m) => m.name);
      if (modelle.length && !modelle.some((m) => m === model || m.startsWith(model + ':'))) {
        clearTimeout(t);
        return res.json({ ok: false, modelle, fehler: `Modell "${model}" ist nicht installiert. Verfügbar: ${modelle.join(', ')}. Laden mit: ollama pull ${model}` });
      }
      const genRes = await fetch(url + '/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: 'Antworte mit genau einem Wort: Hallo', stream: false, options: { temperature: 0 } }),
        signal: ctrl.signal,
      });
      clearTimeout(t);
      if (!genRes.ok) throw new Error(`Modellanfrage: HTTP ${genRes.status}`);
      const data = await genRes.json();
      res.json({ ok: true, antwort: (data.response || '').trim().slice(0, 200), modelle });
    } catch (e) {
      res.json({ ok: false, fehler: e.name === 'AbortError'
        ? 'Zeitüberschreitung – läuft Ollama gerade? (ollama serve)'
        : e.message, hinweis: OLLAMA_HINWEIS });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // STATUS & ÜBERSICHT
  // ═══════════════════════════════════════════════════════════
  r.get('/guilds', (_req, res) => {
    const client = bot.getClient();
    const gilden = client
      ? [...client.guilds.cache.values()].map((g) => ({ id: g.id, name: g.name, mitglieder: g.memberCount }))
      : [];
    res.json({ gilden });
  });

  r.get('/status', async (_req, res) => {
    const client = bot.getClient();
    res.json({
      bot: bot.getStatus(),
      ollama: ollama.getStatus(),
      ram: Math.round(process.memoryUsage().rss / 1024 / 1024),
      ramHeap: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      kiPuffer: aiModeration.bufferInfo(),
    });
  });

  r.get('/overview', async (req, res) => {
    const gid = String(req.query.guildId || '');
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(gid) : null;
    const dok = db.get('guilds', gid) || {};
    const jetzt = Date.now();
    const warns = db.values('mod_entries')
      .filter((e) => e.guildId === gid && e.kategorie === 'Verwarnung').length;
    const ai24h = db.values('ai_detections')
      .filter((d) => d.guildId === gid && d.treffer && jetzt - d.zeit <= 86400000).length;
    const steuer = db.values('treasury_log')
      .filter((t) => t.guildId === gid && t.quelle === 'Steuersystem' && t.betrag > 0)
      .reduce((s, t) => s + t.betrag, 0);
    const feed = db.values('mod_entries')
      .filter((e) => e.guildId === gid)
      .sort((a, b) => b.zeit - a.zeit).slice(0, 15);

    res.json({
      bot: bot.getStatus(),
      ollama: ollama.getStatus(),
      ram: Math.round(process.memoryUsage().rss / 1024 / 1024),
      mitglieder: g ? g.memberCount : (dok.mitglieder || 0),
      serverName: g ? g.name : (dok.name || 'Unbekannt'),
      nachrichtenHeute: (dok.stats && dok.stats.nachrichtenHeute) || 0,
      geloeschteNachrichten: (dok.stats && dok.stats.geloeschteNachrichten) || 0,
      aktiveVerwarnungen: warns,
      aiErkennungen24h: ai24h,
      steuerEinnahmen: steuer,
      geldmenge: economy.geldmenge(gid),
      staatsKasse: Math.floor(staatSys.doc(gid).kasse || 0),
      wacheKasse: Math.floor(staatSys.doc(gid).wacheKasse || 0),
      fangChance: staatSys.fangChance(gid),
      kasse: economy.kasseGet(gid),
      feed,
    });
  });

  // ═══════════════════════════════════════════════════════════
  // GILDEN-EINSTELLUNGEN (alle Dashboard-Regler)
  // ═══════════════════════════════════════════════════════════
  r.get('/settings', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json(config.getGuildSettings(gid));
  });

  r.post('/settings', (req, res) => {
    const gid = String(req.query.guildId || '');
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ error: 'Ungültige Daten' });
    }
    try {
      const neu = config.setGuildSettings(gid, req.body);
      res.json({ ok: true, settings: neu });
    } catch (e) {
      res.status(400).json({ error: 'Speichern fehlgeschlagen: ' + e.message });
    }
  });

  // ═══════════════════════════════════════════════════════════
  // GLOBALE KONFIG (Token maskiert!, Ollama, Dashboard)
  // ═══════════════════════════════════════════════════════════
  r.get('/config', (_req, res) => {
    const cfg = config.get();
    res.json({
      tokenMaske: tokenMaske(cfg.token),
      clientId: cfg.clientId,
      guildId: cfg.guildId,
      inviteLink: inviteLink(cfg.clientId, cfg.guildId),
      ollama: cfg.ollama,
      dashboard: { port: cfg.dashboard.port, sessionHours: cfg.dashboard.sessionHours },
      setupComplete: cfg.setupComplete,
    });
  });

  // Token ändern (maskiert bestätigen lassen) + Live-Reconnect
  r.post('/config/token', async (req, res) => {
    const token = String(req.body.token || '');
    if (token.includes('•') || !token.trim()) {
      return res.json({ ok: false, fehler: 'Bitte einen neuen vollständigen Token eingeben (der maskierte ist nur zur Anzeige).' });
    }
    config.set({ token: token.trim() });
    try {
      await bot.restartBot();
      res.json({ ok: true, verbunden: bot.getStatus().connected });
    } catch (e) {
      res.json({ ok: false, fehler: 'Gespeichert, aber Verbindung fehlgeschlagen: ' + e.message });
    }
  });

  r.post('/bot/restart', async (_req, res) => {
    try {
      await bot.restartBot();
      res.json({ ok: true, status: bot.getStatus() });
    } catch (e) {
      res.json({ ok: false, fehler: e.message });
    }
  });

  // Ollama-URL/Modell/Temperatur speichern
  r.post('/config/ollama', (req, res) => {
    const o = config.get().ollama;
    config.set({
      ollama: {
        url: String(req.body.url || o.url).replace(/\/+$/, ''),
        model: String(req.body.model || o.model).trim(),
        temperature: Math.max(0, Math.min(2, Number(req.body.temperature ?? o.temperature))),
      },
    });
    res.json({ ok: true, ollama: config.get().ollama });
  });

  // Dashboard-Port/Session-Dauer (Neustart für Port nötig)
  r.post('/config/dashboard', (req, res) => {
    const d = config.get().dashboard;
    const port = parseInt(req.body.port, 10) || d.port;
    const sessionHours = parseInt(req.body.sessionHours, 10) || d.sessionHours;
    if (port < 1 || port > 65535) return res.status(400).json({ error: 'Port muss 1–65535 sein.' });
    config.set({ dashboard: { port, sessionHours } });
    res.json({ ok: true, hinweis: port !== d.port
      ? `Port auf ${port} geändert – starte den Prozess neu (Strg+C, dann node index.js).`
      : 'Gespeichert.' });
  });

  // ═══════════════════════════════════════════════════════════
  // KI-MODERATION: Test-Konsole + Erkennungen
  // ═══════════════════════════════════════════════════════════
  r.post('/aimod/test', async (req, res) => {
    const testSettings = config.getGuildSettings(String(req.body.guildId || config.get().guildId || ''));
    if (((testSettings.aiMod || {}).engine || 'sentinel') === 'sentinel') {
      const pseudo = { content: String(req.body.text || ''), author: { id: 'test', username: 'TestUser' }, mentions: { users: { first: () => null } }, guild: { id: 'test' } };
      const r = sentinel.pruefe(pseudo, testSettings);
      const schwelle = 11 - ((testSettings.aiMod || {}).sensitivity || 5);
      const sg = r ? r.schweregrad : 0;
      return res.json({ ok: true, engine: 'sentinel',
        json: r || { beleidigung: false, diskriminierung: false, schweregrad: 0, kategorie: '-', begruendung: 'Keine Auffälligkeit erkannt', zitat: '' },
        schwellenwert: schwelle,
        treffer: !!(r && r.beleidigung && sg >= schwelle),
        roh: JSON.stringify(r, null, 2) });
    }
    if (!(await ollama.checkOnline(true))) {
      return res.json({ ok: false, fehler: 'Ollama ist offline. ' + OLLAMA_HINWEIS });
    }
    try {
      const ergebnis = await aiModeration.testText(String(req.body.text || '').slice(0, 1000), {
        sensitivity: Math.max(1, Math.min(10, parseInt(req.body.sensitivity, 10) || 5)),
        temperature: req.body.temperature != null ? Number(req.body.temperature) : undefined,
        systemPrompt: String(req.body.systemPrompt || '').slice(0, 2000),
      });
      res.json({ ok: true, ...ergebnis });
    } catch (e) {
      res.json({ ok: false, fehler: e.message });
    }
  });

  r.get('/aidetections', (req, res) => {
    const gid = String(req.query.guildId || '');
    const limit = Math.min(200, parseInt(req.query.limit, 10) || 50);
    const liste = db.values('ai_detections')
      .filter((d) => d.guildId === gid)
      .sort((a, b) => b.zeit - a.zeit).slice(0, limit);
    res.json({ liste });
  });

  // ═══════════════════════════════════════════════════════════
  // MOD-EINTRÄGE: Liste/Filter/Detail/Status/Export/User-Profil
  // ═══════════════════════════════════════════════════════════
  r.get('/modentries', (req, res) => {
    const gid = String(req.query.guildId || '');
    const { user, q, kategorie, status } = req.query;
    const von = req.query.von ? new Date(String(req.query.von)).getTime() : 0;
    const bis = req.query.bis ? new Date(String(req.query.bis) + 'T23:59:59').getTime() : Infinity;
    const schwere = parseInt(req.query.schwere, 10) || 0;

    let liste = db.values('mod_entries').filter((e) => e.guildId === gid);
    if (user) liste = liste.filter((e) => e.userId === user);
    if (kategorie) liste = liste.filter((e) => e.kategorie === kategorie);
    if (status) liste = liste.filter((e) => e.status === status);
    if (schwere) liste = liste.filter((e) => e.schweregrad >= schwere);
    if (von) liste = liste.filter((e) => e.zeit >= von);
    if (bis !== Infinity) liste = liste.filter((e) => e.zeit <= bis);
    if (q) {
      const nadel = String(q).toLowerCase();
      liste = liste.filter((e) =>
        e.grund.toLowerCase().includes(nadel) ||
        e.beweis.toLowerCase().includes(nadel) ||
        String(e.nummer) === nadel);
    }
    liste.sort((a, b) => b.zeit - a.zeit);
    res.json({ liste: liste.slice(0, 300), gesamt: liste.length });
  });

  r.post('/modentries/:id/status', (req, res) => {
    const ok = modLog.setStatus(req.params.id, req.body.status);
    res.json({ ok });
  });

  // Export als Textdatei (Dashboard-Download)
  r.get('/modentries/export', (req, res) => {
    const gid = String(req.query.guildId || '');
    const userId = String(req.query.userId || '');
    const eintraege = (userId ? modLog.getUserEntries(gid, userId)
      : db.values('mod_entries').filter((e) => e.guildId === gid))
      .sort((a, b) => a.zeit - b.zeit);
    const zeilen = eintraege.map((e) =>
      `#${e.nummer} | ${new Date(e.zeit).toLocaleString('de-DE')} | ${e.kategorie} | SG ${e.schweregrad}/10 | ` +
      `User: ${e.userId} | Von: ${e.moderator} | Status: ${e.status}\n` +
      `  Grund: ${e.grund}\n` +
      (e.beweis ? `  Beweis: ${e.beweis}\n` : '') + ''
    ).join('\n');
    const kopf = `LUMIOX Mod-Protokoll${userId ? ' – Benutzer ' + userId : ''}\n` +
      `Server: ${gid} · Export: ${new Date().toLocaleString('de-DE')} · ${eintraege.length} Einträge\n` +
      '═'.repeat(60) + '\n\n';
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mod-protokoll-${gid}.txt"`);
    res.send(kopf + (zeilen || 'Keine Einträge.'));
  });

  r.get('/userprofile', (req, res) => {
    const gid = String(req.query.guildId || '');
    const userId = String(req.query.userId || '');
    const eintraege = modLog.getUserEntries(gid, userId).sort((a, b) => b.zeit - a.zeit);
    const level = levelSystem.getLevelDoc(gid, userId);
    const eco = economy.getEco(gid, userId);
    const client = bot.getClient();
    const u = client ? client.users.cache.get(userId) : null;
    res.json({
      user: { id: userId, name: u ? u.tag : 'Unbekannt', avatar: u ? u.displayAvatarURL({ size: 128 }) : null },
      eintraege,
      level: { level: level.level, xp: level.xp },
      economie: { bargeld: eco.bargeld, bank: eco.bank, schulden: eco.schulden, streak: eco.streak },
    });
  });

  // ═══════════════════════════════════════════════════════════
  // WORTFILTER: Wörter + Treffer-Statistik
  // ═══════════════════════════════════════════════════════════
  r.get('/filterwords', (req, res) => {
    const s = config.getGuildSettings(String(req.query.guildId || ''));
    res.json({ enabled: s.wordFilter.enabled, placeholder: s.wordFilter.placeholder, words: s.wordFilter.words });
  });

  r.post('/filterwords', (req, res) => {
    const gid = String(req.query.guildId || '');
    const words = Array.isArray(req.body.words) ? req.body.words : null;
    if (!words) return res.status(400).json({ error: 'words-Array fehlt.' });
    // Validierung: jedes Wort braucht wenigstens einen Namen + Modus
    const sauber = words
      .filter((w) => w && String(w.word || '').trim())
      .map((w) => ({
        word: String(w.word).trim().slice(0, 60),
        regex: !!w.regex,
        modus: w.modus === 'loeschen' ? 'loeschen' : 'zensieren',
        eintrag: !!w.eintrag,
        schweregrad: Math.max(1, Math.min(10, parseInt(w.schweregrad, 10) || 3)),
      }));
    config.setGuildSettings(gid, {
      wordFilter: { ...config.getGuildSettings(gid).wordFilter, words: sauber, ...req.body.extra },
    });
    res.json({ ok: true, words: sauber });
  });

  r.post('/filterwords/toggle', (req, res) => {
    const gid = String(req.query.guildId || '');
    const s = config.getGuildSettings(gid);
    config.setGuildSettings(gid, { wordFilter: { ...s.wordFilter, enabled: !!req.body.enabled } });
    res.json({ ok: true });
  });

  r.get('/filterhits', (req, res) => {
    const gid = String(req.query.guildId || '');
    const zaehler = {};
    for (const h of db.values('filter_hits')) {
      if (h.guildId !== gid) continue;
      zaehler[h.word] = (zaehler[h.word] || 0) + 1;
    }
    const top = Object.entries(zaehler).map(([word, anzahl]) => ({ word, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl).slice(0, 15);
    const letzte = db.values('filter_hits')
      .filter((h) => h.guildId === gid).sort((a, b) => b.zeit - a.zeit).slice(0, 30);
    res.json({ top, letzte });
  });

  // ═══════════════════════════════════════════════════════════
  // WIRTSCHAFT & KASSE
  // ═══════════════════════════════════════════════════════════
  r.get('/economy/overview', (req, res) => {
    const gid = String(req.query.guildId || '');
    const log = db.values('treasury_log')
      .filter((t) => t.guildId === gid).sort((a, b) => b.zeit - a.zeit).slice(0, 100);
    res.json({
      kasse: economy.kasseGet(gid),
      geldmenge: economy.geldmenge(gid),
      konten: db.values('economy').filter((e) => e.guildId === gid).length,
      log,
    });
  });

  // ═══════════════════════════════════════════════════════════
  // TICKETS & TRANSKRIPTE
  // ═══════════════════════════════════════════════════════════
  r.get('/tickets', (req, res) => {
    const gid = String(req.query.guildId || '');
    const liste = db.values('tickets')
      .filter((t) => t.guildId === gid)
      .sort((a, b) => b.erstelltAm - a.erstelltAm).slice(0, 100)
      .map((t) => ({ ...t, html: undefined })); // Transkript-HTML nicht mitschicken
    res.json({ liste });
  });

  r.get('/transcripts', (req, res) => {
    const gid = String(req.query.guildId || '');
    const liste = db.values('transcripts')
      .filter((t) => t.guildId === gid)
      .sort((a, b) => b.zeit - a.zeit).slice(0, 100)
      .map((t) => ({ id: t.id, kanalName: t.kanalName, kategorie: t.kategorie,
                     userId: t.userId, nachrichten: t.nachrichten, zeit: t.zeit }));
    res.json({ liste });
  });

  r.get('/transcripts/:id', (req, res) => {
    const t = db.get('transcripts', req.params.id);
    if (!t) return res.status(404).json({ error: 'Transkript nicht gefunden' });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(t.html);
  });

  // ═══════════════════════════════════════════════════════════
  // ANALYTICS (Chart.js-Daten)
  // ═══════════════════════════════════════════════════════════
  r.get('/analytics', (req, res) => {
    const gid = String(req.query.guildId || '');
    const g = db.get('guilds', gid) || {};
    const client = bot.getClient();
    const tagKey = (offset) => new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

    // Nachrichten pro Tag (letzte 30)
    const nachrichtenProTag = [];
    for (let i = 29; i >= 0; i--) {
      const d = tagKey(i);
      nachrichtenProTag.push({ tag: d, anzahl: (g.tage && g.tage[d] && g.tage[d].nachrichtenHeute) || 0 });
    }
    // Top-User (nach XP)
    const topUser = db.values('levels')
      .filter((l) => l.guildId === gid).sort((a, b) => b.xp - a.xp).slice(0, 10)
      .map((l) => ({
        userId: l.userId,
        name: (client && client.users.cache.get(l.userId) ? client.users.cache.get(l.userId).username : 'Unbekannt'),
        level: l.level, xp: l.xp,
      }));
    // Top-Kanäle
    const topKanael = Object.entries(g.kanalStat || {})
      .map(([id, v]) => ({ id, name: v.name, anzahl: v.anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl).slice(0, 10);
    // KI-Erkennungen nach Kategorie (nur Treffer)
    const aiKategorien = {};
    for (const d of db.values('ai_detections')) {
      if (d.guildId === gid && d.treffer) aiKategorien[d.kategorie] = (aiKategorien[d.kategorie] || 0) + 1;
    }
    // Wortfilter-Topliste
    const fh = {};
    for (const h of db.values('filter_hits')) {
      if (h.guildId === gid) fh[h.word] = (fh[h.word] || 0) + 1;
    }
    const filterTop = Object.entries(fh).map(([word, anzahl]) => ({ word, anzahl }))
      .sort((a, b) => b.anzahl - a.anzahl).slice(0, 10);
    // Steuereinnahmen-Verlauf (letzte 30 Tage)
    const steuer = {};
    for (const t of db.values('treasury_log')) {
      if (t.guildId !== gid || t.betrag <= 0) continue;
      const d = new Date(t.zeit).toISOString().slice(0, 10);
      steuer[d] = (steuer[d] || 0) + t.betrag;
    }
    // Geldmengen-Verlauf: kumulierte Netto-Transaktionen (Approximation)
    const flux = {};
    for (const tr of db.values('transactions')) {
      if (tr.guildId !== gid) continue;
      const d = new Date(tr.zeit).toISOString().slice(0, 10);
      flux[d] = (flux[d] || 0) + tr.betrag;
    }
    let kum = 0;
    const geldVerlauf = [];
    for (let i = 29; i >= 0; i--) {
      const d = tagKey(i);
      kum += flux[d] || 0;
      geldVerlauf.push({ tag: d, wert: Math.max(0, kum) });
    }
    // Level-Verteilung
    const lv = {};
    for (const l of db.values('levels')) {
      if (l.guildId === gid) lv[l.level] = (lv[l.level] || 0) + 1;
    }
    const levelVerteilung = Object.entries(lv)
      .map(([level, anzahl]) => ({ level: Number(level), anzahl }))
      .sort((a, b) => a.level - b.level);

    res.json({
      nachrichtenProTag, topUser, topKanael, aiKategorien, filterTop,
      steuerVerlauf: steuer, geldVerlauf, levelVerteilung,
    });
  });

  // ═══════════════════════════════════════════════════════════
  // EIGENE COMMANDS (ohne Neustart live)
  // ═══════════════════════════════════════════════════════════
  r.get('/customcommands', (_req, res) => {
    res.json({ liste: db.values('custom_commands') });
  });

  r.post('/customcommands', async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) {
      return res.status(400).json({ error: 'Name: nur Kleinbuchstaben, Zahlen, _ und - (max. 32).' });
    }
    if (!b.response || !String(b.response).trim()) {
      return res.status(400).json({ error: 'Bitte eine Antwort angeben.' });
    }
    const id = b.id || db.newId('cc_');
    db.set('custom_commands', id, {
      id, name,
      description: String(b.description || 'Eigener Befehl').slice(0, 100),
      response: String(b.response).slice(0, 2000),
      embed: !!b.embed,
      title: String(b.title || '').slice(0, 250),
      color: parseInt(b.color, 10) || 0x5865F2,
      image: String(b.image || '').slice(0, 400),
      fields: Array.isArray(b.fields) ? b.fields.slice(0, 10)
        .map((f) => ({ name: String(f.name || '').slice(0, 250), value: String(f.value || '').slice(0, 1000), inline: !!f.inline })) : [],
      roles: Array.isArray(b.roles) ? b.roles.slice(0, 20) : [],
      cooldown: Math.max(0, Math.min(3600, parseInt(b.cooldown, 10) || 0)),
      guildId: String(b.guildId || config.get().guildId || ''),
      erstelltAm: Date.now(),
    });
    const client = bot.getClient();
    if (client) {
      registry.reloadCustom(client);
      await registry.refreshSlash(client);
    }
    res.json({ ok: true, id });
  });

  r.delete('/customcommands/:id', async (req, res) => {
    const ok = db.del('custom_commands', req.params.id);
    const client = bot.getClient();
    if (ok && client) {
      registry.reloadCustom(client);
      await registry.refreshSlash(client);
    }
    res.json({ ok });
  });

  // ═══════════════════════════════════════════════════════════
  // DESIGN (pro Account) + PRESETS
  // ═══════════════════════════════════════════════════════════
  r.post('/design', (req, res) => {
    const u = aktuellerUser(req);
    if (!u) return res.status(401).json({ error: 'Nicht eingeloggt' });
    u.design = req.body.design && typeof req.body.design === 'object' ? req.body.design : null;
    db.set('dashboard_users', u.id, u);
    res.json({ ok: true });
  });

  r.get('/designpresets', (req, res) => {
    const u = aktuellerUser(req);
    const liste = db.values('design_presets').filter((p) => p.userId === u.id);
    res.json({ liste });
  });

  r.post('/designpresets', (req, res) => {
    const u = aktuellerUser(req);
    const id = db.push('design_presets', {
      userId: u.id,
      name: String(req.body.name || 'Preset').slice(0, 50),
      design: req.body.design || {},
      zeit: Date.now(),
    });
    res.json({ ok: true, id });
  });

  r.delete('/designpresets/:id', (req, res) => {
    const p = db.get('design_presets', req.params.id);
    const u = aktuellerUser(req);
    if (!p || p.userId !== u.id) return res.status(404).json({ error: 'Preset nicht gefunden' });
    db.del('design_presets', req.params.id);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════
  // ADMIN-VERWALTUNG & PASSWORT
  // ═══════════════════════════════════════════════════════════
  r.get('/admins', (_req, res) => {
    res.json({
      liste: db.values('dashboard_users').map((u) => ({
        id: u.id, benutzername: u.benutzername, erstelltAm: u.erstelltAm,
      })),
    });
  });

  r.post('/admins', (req, res) => {
    const id = auth.erstelleBenutzer(String(req.body.benutzername || '').trim(), req.body.passwort);
    if (!id) return res.status(400).json({ error: 'Benutzername nötig, Passwort min. 6 Zeichen.' });
    res.json({ ok: true, id });
  });

  r.delete('/admins/:id', (req, res) => {
    if (req.params.id === req.session.userId) {
      return res.status(400).json({ error: 'Du kannst dich nicht selbst löschen.' });
    }
    if (db.values('dashboard_users').length <= 1) {
      return res.status(400).json({ error: 'Mindestens ein Admin muss bleiben.' });
    }
    res.json({ ok: db.del('dashboard_users', req.params.id) });
  });

  r.post('/admins/password', (req, res) => {
    const u = aktuellerUser(req);
    if (!auth.pruefePasswort(String(req.body.alt || ''), u.hash)) {
      return res.status(400).json({ error: 'Altes Passwort ist falsch.' });
    }
    if (!req.body.neu || String(req.body.neu).length < 6) {
      return res.status(400).json({ error: 'Neues Passwort: min. 6 Zeichen.' });
    }
    u.hash = auth.hashPasswort(String(req.body.neu));
    db.set('dashboard_users', u.id, u);
    res.json({ ok: true });
  });

  // ═══════════════════════════════════════════════════════════
  // BACKUP: Vollständiger Export/Import
  // ═══════════════════════════════════════════════════════════
  r.get('/backup/export', (_req, res) => {
    const backup = {
      _meta: { typ: 'lumiox-backup', version: 2, exportiertAm: Date.now() },
      config: config.get(), // ACHTUNG: enthält Token – Datei sicher aufbewahren!
      db: db.exportAll(),
    };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="neonbot-backup-${new Date().toISOString().slice(0, 10)}.json"`);
    res.send(JSON.stringify(backup, null, 2));
  });

  r.post('/backup/import', async (req, res) => {
    const data = req.body && req.body.data ? req.body.data : req.body;
    if (!data || !data._meta || (data._meta.typ !== 'lumiox-backup' && data._meta.typ !== 'neonbot-backup') || !data.db) {
      return res.status(400).json({ error: 'Das ist keine gültige NeonBot-Backup-Datei.' });
    }
    try {
      db.importAll(data.db);
      if (data.config && typeof data.config === 'object') {
        const aktuellerSecret = config.get().dashboard.sessionSecret; // Sessions behalten
        config.set(data.config);
        config.set({ dashboard: { sessionSecret: aktuellerSecret } });
      }
      // Bot neu verbinden, falls der Token sich geändert hat
      let botHinweis = '';
      try {
        await bot.restartBot();
      } catch (e) {
        botHinweis = ' Bot konnte nicht verbunden werden: ' + e.message;
      }
      const client = bot.getClient();
      if (client && client.isReady()) {
        registry.build(client);
        await registry.refreshSlash(client);
      }
      res.json({ ok: true, hinweis: 'Backup wiederhergestellt.' + botHinweis });
    } catch (e) {
      res.status(500).json({ error: 'Import fehlgeschlagen: ' + e.message });
    }
  });
  // Kanäle & Rollen für Dropdowns in den Einstellungsseiten
  r.get('/channels', (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.json({ liste: [] });
    res.json({
      liste: g.channels.cache
        .filter((c) => c.type === 0 || c.type === 4 || c.type === 5) // Text, Kategorie, Ankündigung
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, name: c.name, typ: c.type })),
    });
  });

  r.get('/roles', (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.json({ liste: [] });
    res.json({
      liste: g.roles.cache
        .filter((role) => !role.managed && role.id !== g.id && role.position < g.members.me.roles.highest.position)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, farbe: role.hexColor })),
    });
  });
  // Kanäle & Rollen für Dropdowns in den Einstellungsseiten
  r.get('/channels', (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.json({ liste: [] });
    res.json({
      liste: g.channels.cache
        .filter((c) => c.type === 0 || c.type === 4 || c.type === 5) // Text, Kategorie, Ankündigung
        .sort((a, b) => a.rawPosition - b.rawPosition)
        .map((c) => ({ id: c.id, name: c.name, typ: c.type })),
    });
  });

  r.get('/roles', (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.json({ liste: [] });
    res.json({
      liste: g.roles.cache
        .filter((role) => !role.managed && role.id !== g.id && role.position < g.members.me.roles.highest.position)
        .sort((a, b) => b.position - a.position)
        .map((role) => ({ id: role.id, name: role.name, farbe: role.hexColor })),
    });
  });
  // ═══ COMMANDS AN/AUS ══════════════════════════════════════
  r.get('/commandlist', (_req, res) => {
    const client = bot.getClient();
    const liste = client
      ? [...client.commands.values()]
          .map((c) => ({ name: c.data.name, description: c.data.description, custom: !!c.custom }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];
    res.json({ liste });
  });

  r.get('/commandtoggles', (req, res) => {
    const s = config.getGuildSettings(String(req.query.guildId || ''));
    res.json({ disabled: (s.commandToggles && s.commandToggles.disabled) || {} });
  });

  r.post('/commandtoggles', (req, res) => {
    const gid = String(req.query.guildId || '');
    const d = req.body.disabled;
    if (!d || typeof d !== 'object') return res.status(400).json({ error: 'disabled-Objekt fehlt.' });
    // FIX: alte Toggles entfernen, damit 'wieder anschalten' greift
    const basis = config.getGuildSettings(gid);
    delete basis.commandToggles;
    db.set('guild_settings', gid, basis);
    config.setGuildSettings(gid, { commandToggles: { disabled: d } });
    res.json({ ok: true });
  });

  // ═══ SPIELER-VERWALTUNG (Geld/XP editieren + Boosts, geloggt) ═══
  r.get('/users', (req, res) => {
    const gid = String(req.query.guildId || '');
    const client = bot.getClient();
    const ecos = db.values('economy').filter((e) => e.guildId === gid);
    const lvlMap = new Map(db.values('levels')
      .filter((l) => l.guildId === gid).map((l) => [l.userId, l]));
    const liste = ecos.map((e) => {
      const u = client ? client.users.cache.get(e.userId) : null;
      const l = lvlMap.get(e.userId);
      return {
        userId: e.userId,
        name: u ? u.username : 'Unbekannt',
        avatar: u ? u.displayAvatarURL({ size: 64 }) : null,
        bargeld: e.bargeld || 0, bank: e.bank || 0, schulden: e.schulden || 0,
        streak: e.streak || 0,
        level: l ? l.level : 0, xp: l ? l.xp : 0,
        steuerklasse: e.steuerklasse || '',
        adminBoosts: e.adminBoosts || { xpMulti: 1, geldMulti: 1, bis: 0 },
      };
    }).sort((a, b) => (b.bargeld + b.bank) - (a.bargeld + a.bank));
    res.json({ liste });
  });

  r.post('/users/edit', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    if (!b.userId || !/^\d{5,25}$/.test(String(b.userId))) {
      return res.status(400).json({ error: 'userId fehlt/ungültig.' });
    }
    const eco = economy.getEco(gid, String(b.userId));
    const logFelder = [];
    const sichereZahl = (wert, min, max) => {
      const n = Number(wert);
      if (isNaN(n)) return null;
      return Math.max(min, Math.min(max, Math.round(n)));
    };
    for (const f of ['bargeld', 'bank', 'schulen_dummy', 'schulden', 'streak']) {
      if (f === 'schulen_dummy' || b[f] === undefined) continue;
      const n = sichereZahl(b[f], 0, 1e15);
      if (n !== null && n !== (eco[f] || 0)) {
        logFelder.push({ feld: f, alt: eco[f] || 0, neu: n });
        eco[f] = n;
      }
    }
    const lvl = levelSystem.getLevelDoc(gid, String(b.userId));
    for (const f of ['xp', 'level']) {
      if (b[f] === undefined) continue;
      const n = sichereZahl(b[f], 0, 1e12);
      if (n !== null && n !== (lvl[f] || 0)) {
        logFelder.push({ feld: f, alt: lvl[f] || 0, neu: n });
        lvl[f] = n;
      }
    }
    db.set('levels', gid + '_' + b.userId, lvl);
    if (b.steuerklasse !== undefined) {
      const k = String(b.steuerklasse || '').slice(0, 40);
      if (k !== (eco.steuerklasse || '')) {
        logFelder.push({ feld: 'steuerklasse', alt: eco.steuerklasse || 'Standard', neu: k || 'Standard' });
        eco.steuerklasse = k;
      }
    }
    const neuBoost = {
      xpMulti: Math.max(1, Math.min(100, Number(b.xpMulti) || 1)),
      geldMulti: Math.max(1, Math.min(100, Number(b.geldMulti) || 1)),
      bis: (Number(b.boostMinuten) || 0) > 0 ? Date.now() + Math.min(525600, Number(b.boostMinuten)) * 60000 : 0,
    };
    const altB = eco.adminBoosts || { xpMulti: 1, geldMulti: 1, bis: 0 };
    if (neuBoost.xpMulti !== altB.xpMulti || neuBoost.geldMulti !== altB.geldMulti ||
        (neuBoost.bis || 0) !== (altB.bis || 0)) {
      logFelder.push({
        feld: 'boost',
        alt: `XP×${altB.xpMulti} Geld×${altB.geldMulti}`,
        neu: `XP×${neuBoost.xpMulti} Geld×${neuBoost.geldMulti}` +
             (neuBoost.bis ? ` (${Math.round((neuBoost.bis - Date.now()) / 60000)} Min.)` : ' (dauerhaft)'),
      });
      eco.adminBoosts = neuBoost;
    }
    economy.saveEco(eco);
    if (logFelder.length) {
      const admin = db.get('dashboard_users', req.session.userId);
      db.push('admin_log', {
        guildId: gid, admin: admin ? admin.benutzername : '?',
        zielUser: String(b.userId), felder: logFelder, zeit: Date.now(),
      });
    }
    res.json({ ok: true, geaendert: logFelder.length });
  });

  r.get('/adminlog', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json({
      liste: db.values('admin_log')
        .filter((l) => l.guildId === gid)
        .sort((a, b) => b.zeit - a.zeit).slice(0, 50),
    });
  });

  // Kontext-Batch sofort ausführen (Test-Button auf der KI-Seite)
  r.post('/aimod/batch', async (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.status(400).json({ error: 'Server nicht gefunden - ist der Bot verbunden?' });
    const SCAN_COOLDOWN_MS = 60000;
    const seitScan = Date.now() - aiModeration.letzteBatchFuer(String(req.query.guildId || ''));
    if (seitScan < SCAN_COOLDOWN_MS) {
      return res.json({ ok: false, cooldown: Math.ceil((SCAN_COOLDOWN_MS - seitScan) / 1000),
        fehler: 'Cooldown: letzter Scan vor ' + Math.round(seitScan / 1000) + ' s – die 60-s-Sperre schont die CPU.' });
    }
    try {
      const ergebnis = await aiModeration.runContextBatchJetzt(g);
      res.json(ergebnis);
    } catch (e) {
      res.json({ ok: false, fehler: e.message });
    }
  });
  // ═══ KI-PROZESSE: Live-Status & Diagnose ═══
  r.get('/ki/status', (req, res) => {
    const gid = String(req.query.guildId || '');
    const s = config.getGuildSettings(gid);
    const am = s.aiMod;
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(gid) : null;
    let detectionen = [];
    try {
      detectionen = db.values('ai_detections')
        .filter((d) => d.guildId === gid)
        .sort((a, b) => b.zeit - a.zeit).slice(0, 10);
    } catch (_) {}
    res.json({
      serverName: g ? g.name : '?',
      settings: {
        engine: am.engine || 'sentinel',
        enabled: !!am.enabled,
        sensitivity: am.sensitivity,
        schwellenwert: 11 - (am.sensitivity || 5),
        contextBatch: !!am.contextBatch,
        contextBatchMinutes: am.contextBatchMinutes,
        contextWindowMinutes: am.contextWindowMinutes,
        temperature: am.temperature,
        whitelist: {
          user: (am.whitelistUsers || []).length,
          kanal: (am.whitelistChannels || []).length,
          rollen: (am.whitelistRoles || []).length,
        },
      },
      ollama: ollama.getStatus(),
      kiLog: kiLog.snapshot(),
      puffer: aiModeration.pufferFuer(gid),
      letzteBatch: aiModeration.letzteBatchFuer(gid),
      detectionen,
    });
  });
  r.post('/ki/enable', (req, res) => {
    const gid = String(req.query.guildId || '');
    const s = config.getGuildSettings(gid);
    config.setGuildSettings(gid, { aiMod: { ...s.aiMod, enabled: true } });
    res.json({ ok: true });
  });

  // ═══ GEHEIMES PANEL (Konami) – nur mit Admin-Session erreichbar ═══
  r.get('/secret/state', (req, res) => {
    const gid = String(req.query.guildId || '');
    const s = config.getGuildSettings(gid);
    res.json({
      panik: !s.automod.enabled && !s.wordFilter.enabled && !s.aiMod.enabled,
      kasse: economy.kasseGet(gid),
    });
  });

  r.post('/secret/panic', (req, res) => {
    const gid = String(req.query.guildId || '');
    const an = !!req.body.an;
    const s = config.getGuildSettings(gid);
    config.setGuildSettings(gid, {
      automod: { ...s.automod, enabled: !an },
      wordFilter: { ...s.wordFilter, enabled: !an },
      aiMod: { ...s.aiMod, enabled: !an },
    });
    kiLog.log('warn', an
      ? 'PANIK-MODUS AKTIVIERT (Geheimpanel) - Wortfilter, Auto-Mod & KI-Moderation AUS'
      : 'PANIK-MODUS beendet (Geheimpanel) - Moderation wieder AN');
    res.json({ ok: true, panik: an });
  });

  r.post('/secret/treasury', (req, res) => {
    const gid = String(req.query.guildId || '');
    const betrag = Math.max(-1e12, Math.min(1e12, Math.round(Number(req.body.betrag) || 0)));
    if (!betrag) return res.status(400).json({ error: 'Betrag ungültig.' });
    const stand = economy.kasseAdd(gid, betrag, 'Kassen-Spritze (Geheimpanel)', 'Geheimpanel');
    res.json({ ok: true, stand });
  });

  r.post('/secret/purge', (req, res) => {
    const gid = String(req.query.guildId || '');
    const userId = String(req.body.userId || '').trim();
    if (!/^[0-9]{5,25}$/.test(userId)) return res.status(400).json({ error: 'userId ungültig.' });
    let geloescht = 0;
    for (const [id, e] of db.all('mod_entries')) {
      if (e.guildId === gid && e.userId === userId) { db.del('mod_entries', id); geloescht++; }
    }
    let det = 0;
    if (req.body.auchErkennungen) {
      for (const [id, d] of db.all('ai_detections')) {
        if (d.guildId === gid && d.userId === userId) { db.del('ai_detections', id); det++; }
      }
    }
    // Protokollpflicht: Auch geheime Löschungen werden dokumentiert
    const admin = db.get('dashboard_users', req.session.userId);
    db.push('admin_log', {
      guildId: gid, admin: admin ? admin.benutzername : '?', zielUser: userId,
      felder: [{ feld: 'Geheimpanel-Löschung', alt: geloescht + ' Einträge' + (det ? ' + ' + det + ' Erkennungen' : ''), neu: '0' }],
      zeit: Date.now(),
    });
    res.json({ ok: true, geloescht, det });
  });

  r.post('/secret/clean', (req, res) => {
    const gid = String(req.query.guildId || '');
    const loescheAelterAls = (coll, tage) => {
      const grenze = Date.now() - tage * 86400000;
      let n = 0;
      for (const [id, d] of db.all(coll)) {
        if (d.guildId !== gid) continue;
        if ((d.zeit || 0) < grenze) { db.del(coll, id); n++; }
      }
      return n;
    };
    const erg = {
      filterTreffer: loescheAelterAls('filter_hits', 30),
      kiErkennungen: loescheAelterAls('ai_detections', 30),
      transaktionen: loescheAelterAls('transactions', 180),
      abgelaufeneJobs: 0,
    };
    for (const [id, d] of db.all('scheduled')) {
      if ((d.faelligAm || 0) < Date.now()) { db.del('scheduled', id); erg.abgelaufeneJobs++; }
    }
    res.json({ ok: true, ...erg });
  });

  r.get('/secret/stats', (_req, res) => {
    const client = bot.getClient();
    const cols = {};
    for (const c of db.COLLECTIONS) {
      const n = db.values(c).length;
      if (n) cols[c] = n;
    }
    const mu = process.memoryUsage();
    res.json({
      collections: cols,
      ram: { rss: Math.round(mu.rss / 1048576), heap: Math.round(mu.heapUsed / 1048576), extern: Math.round(mu.external / 1048576) },
      uptime: process.uptime(),
      node: process.version,
      ping: client && client.ws ? Math.round(client.ws.ping) : null,
      gilden: client ? client.guilds.cache.size : 0,
      commands: client && client.commands ? client.commands.size : 0,
    });
  });


  r.get('/secret/userlist', (req, res) => {
    const gid = String(req.query.guildId || '');
    const zaehler = new Map();
    for (const e of db.values('mod_entries')) {
      if (e.guildId !== gid) continue;
      const z = zaehler.get(e.userId) || { userId: e.userId, eintraege: 0, erkennungen: 0 };
      z.eintraege++;
      zaehler.set(e.userId, z);
    }
    for (const d of db.values('ai_detections')) {
      if (d.guildId !== gid) continue;
      const z = zaehler.get(d.userId) || { userId: d.userId, eintraege: 0, erkennungen: 0 };
      z.erkennungen++;
      zaehler.set(d.userId, z);
    }
    const client = bot.getClient();
    const liste = [...zaehler.values()].map((z) => {
      const u = client ? client.users.cache.get(z.userId) : null;
      return { ...z, name: u ? u.username : 'Unbekannt', avatar: u ? u.displayAvatarURL({ size: 64 }) : null };
    }).sort((a, b) => (b.eintraege + b.erkennungen) - (a.eintraege + a.erkennungen));
    res.json({ liste });
  });

  r.post('/secret/resolve', (req, res) => {
    const gid = String(req.query.guildId || '');
    const userId = String(req.body.userId || '').trim();
    if (!/^[0-9]{5,25}$/.test(userId)) return res.status(400).json({ error: 'userId ungültig.' });
    let n = 0;
    for (const [id, e] of db.all('mod_entries')) {
      if (e.guildId === gid && e.userId === userId && e.status !== 'erledigt') {
        e.status = 'erledigt';
        db.set('mod_entries', id, e);
        n++;
      }
    }
    const admin = db.get('dashboard_users', req.session.userId);
    db.push('admin_log', {
      guildId: gid, admin: admin ? admin.benutzername : '?', zielUser: userId,
      felder: [{ feld: 'Geheimpanel', alt: n + ' offene Einträge', neu: 'alle erledigt' }],
      zeit: Date.now(),
    });
    res.json({ ok: true, erledigt: n });
  });


  // ═══ EMBED-STUDIO: Entwürfe + Versand ═══
  function sanitizeEmbed(e) {
    if (!e || typeof e !== 'object') return null;
    const out = {};
    if (e.title) out.title = String(e.title).slice(0, 256);
    if (e.description) out.description = String(e.description).slice(0, 4096);
    if (e.url && /^https?:\/\//.test(e.url)) out.url = e.url;
    const farbe = parseInt(e.color, 10);
    if (!isNaN(farbe)) out.color = farbe;
    if (e.author && e.author.name) {
      out.author = { name: String(e.author.name).slice(0, 256) };
      if (e.author.icon_url && /^https?:/.test(e.author.icon_url)) out.author.icon_url = e.author.icon_url;
      if (e.author.url && /^https?:/.test(e.author.url)) out.author.url = e.author.url;
    }
    if (e.footer && e.footer.text) {
      out.footer = { text: String(e.footer.text).slice(0, 2048) };
      if (e.footer.icon_url && /^https?:/.test(e.footer.icon_url)) out.footer.icon_url = e.footer.icon_url;
    }
    if (e.thumbnail && e.thumbnail.url && /^https?:/.test(e.thumbnail.url)) out.thumbnail = { url: e.thumbnail.url };
    if (e.image && e.image.url && /^https?:/.test(e.image.url)) out.image = { url: e.image.url };
    if (Array.isArray(e.fields)) {
      const f = e.fields.slice(0, 25).map((x) => ({
        name: String(x.name || '\u200b').slice(0, 256),
        value: String(x.value || '\u200b').slice(0, 1024),
        inline: !!x.inline,
      }));
      if (f.length) out.fields = f;
    }
    if (e.timestamp) out.timestamp = new Date().toISOString();
    return out;
  }
  r.get('/embeds', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json({ liste: db.values('embeds')
      .filter((e) => e.guildId === gid)
      .sort((a, b) => b.zeit - a.zeit)
      .map((e) => ({ id: e.id, name: e.name, zeit: e.zeit })) });
  });
  r.get('/embeds/:id', (req, res) => {
    const e = db.get('embeds', req.params.id);
    if (!e) return res.status(404).json({ error: 'Entwurf nicht gefunden' });
    res.json({ name: e.name, data: e.data });
  });
  r.post('/embeds', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Name fehlt.' });
    if (!b.data || typeof b.data !== 'object') return res.status(400).json({ error: 'Embed-Daten fehlen.' });
    const id = db.push('embeds', { guildId: gid, name: String(b.name).slice(0, 50), data: b.data, zeit: Date.now() });
    res.json({ ok: true, id });
  });
  r.delete('/embeds/:id', (req, res) => {
    res.json({ ok: db.del('embeds', req.params.id) });
  });
  r.post('/embeds/send', async (req, res) => {
    const client = bot.getClient();
    if (!client || !client.isReady()) return res.status(400).json({ error: 'Bot nicht verbunden.' });
    const ch = await client.channels.fetch(String(req.body.channelId || '')).catch(() => null);
    if (!ch || !ch.isTextBased()) return res.status(400).json({ error: 'Kanal nicht gefunden.' });
    const perms = ch.permissionsFor(ch.guild.members.me);
    if (!perms || !perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.EmbedLinks)) {
      return res.status(400).json({ error: 'Mir fehlen Schreib- oder Embed-Rechte in diesem Kanal.' });
    }
    const emb = sanitizeEmbed(req.body.embed);
    if (!emb || (!emb.title && !emb.description && !emb.fields && !emb.image && !emb.thumbnail && !emb.author && !emb.footer)) {
      return res.status(400).json({ error: 'Der Embed ist leer (mindestens Titel, Text, Feld, Bild oder Footer nötig).' });
    }
    try {
      await ch.send({ embeds: [emb] });
      res.json({ ok: true });
    } catch (e) { res.status(400).json({ error: e.message }); }
  });
  // ═══ 0.8.1: Backups · Ziele · Hinweise ═══
  const autobackup = require('../../bot/systems/autobackup');
  const modHinweise = require('../../bot/systems/modHinweise');
  const zielTracking = require('../../bot/systems/zielTracking');

  r.get('/ext/settings', (req, res) => {
    const s = config.getGuildSettings(String(req.query.guildId || ''));
    res.json({ backups: config.get().backups || {}, wochenbericht: s.wochenbericht,
      inviteTracking: s.inviteTracking, modHinweise: s.modHinweise, zielTracking: s.zielTracking });
  });

  r.post('/ext/backups', (req, res) => {
    const b = req.body || {};
    config.set({ backups: {
      enabled: !!b.enabled, intervall: b.intervall === 'wöchentlich' ? 'wöchentlich' : 'täglich',
      uhrzeit: /^\d{2}:\d{2}$/.test(b.uhrzeit || '') ? b.uhrzeit : '04:00',
      maxAnzahl: Math.max(1, Math.min(50, parseInt(b.maxAnzahl, 10) || 10)),
    } });
    res.json({ ok: true, next: autobackup.naechsterLauf() });
  });

  r.post('/ext/backups/jetzt', (req, res) => {
    const d = autobackup.einmalBackup('Manuell (Dashboard)');
    res.json({ ok: true, datei: require('path').basename(d) });
  });

  r.get('/ext/backups/liste', (_req, res) => {
    const dir = autobackup.BACKUP_DIR;
    const liste = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => ({
          name: f, groesse: Math.round(fs.statSync(path.join(dir, f)).size / 1024), zeit: fs.statSync(path.join(dir, f)).mtimeMs,
        })).sort((a, b) => b.zeit - a.zeit)
      : [];
    res.json({ liste });
  });

  r.get('/ext/ziele', (req, res) => {
    res.json({ liste: zielTracking.fortschritt(String(req.query.guildId || '')) });
  });

  r.post('/ext/ziele', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    if (!b.name || !b.zielWert) return res.status(400).json({ error: 'name + zielWert nötig' });
    const id = db.push('ziele', {
      guildId: gid, name: String(b.name).slice(0, 80),
      typ: ['mitglieder', 'nachrichten', 'verstossen_beseitigt'].includes(b.typ) ? b.typ : 'mitglieder',
      zielWert: Math.max(1, parseInt(b.zielWert, 10) || 1),
      erreicht: false, stand: 0, zeit: Date.now(),
    });
    res.json({ ok: true, id });
  });

  r.delete('/ext/ziele/:id', (req, res) => res.json({ ok: db.del('ziele', req.params.id) }));

  r.post('/ext/hinweis', (req, res) => {
    const client = bot.getClient();
    const g = client ? client.guilds.cache.get(String(req.query.guildId || '')) : null;
    if (!g) return res.status(400).json({ error: 'Server nicht gefunden' });
    const admin = db.get('dashboard_users', req.session.userId);
    modHinweise.hinzu(g, String(req.body.userId || ''), String(req.body.grund || ''), admin ? admin.benutzername : '?')
      .then((r) => res.json({ ok: true, ...r }))
      .catch((e) => res.status(400).json({ error: e.message }));
  });


  // ═══ Geheim: Treasury (v2 – robust) ═══
  r.post('/secret/treasury', (req, res) => {
    try {
      const gid = String(req.query.guildId || '');
      const betrag = Math.round(Number(req.body && req.body.betrag));
      if (!betrag || isNaN(betrag)) {
        return res.status(400).json({ error: 'Betrag ungültig (Zahl nötig, negativ = entnehmen).' });
      }
      const stand = economy.kasseAdd(gid, betrag, 'Kassen-Spritze (Geheimpanel)', 'Geheimpanel');
      kiLog.log('warn', 'Geheimpanel: Kasse um ' + betrag + ' geändert (neu: ' + stand + ')');
      res.json({ ok: true, stand });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // ═══ Geheim: Spion (Login-Historie) ═══
  r.get('/secret/spion', (_req, res) => {
    const logins = db.values('login_log').sort((a, b) => b.zeit - a.zeit).slice(0, 30);
    res.json({ liste: logins });
  });

  // ═══ Geheim: Nuke-Reset (Gilden-Wirtschaft+Level+Einträge) ═══
  r.post('/secret/nuke', (req, res) => {
    const gid = String(req.query.guildId || '');
    const code = String(req.body.code || '');
    if (code !== 'NUKE-' + gid.slice(-4)) {
      return res.status(400).json({ error: 'Bestätigungscode falsch. Er lautet: NUKE-' + gid.slice(-4) });
    }
    let n = 0;
    for (const coll of ['economy', 'levels', 'mod_entries', 'ai_detections', 'transactions']) {
      for (const [id, d] of db.all(coll)) {
        if (d.guildId === gid) { db.del(coll, id); n++; }
      }
    }
    kiLog.log('warn', 'GEHEIM-NUKE: ' + n + ' Datensätze der Gilde ' + gid + ' gelöscht');
    res.json({ ok: true, geloescht: n });
  });

  // ═══ Geheim: Troll-Modus (Bot-Nickname + Status) ═══
  r.post('/secret/troll', (req, res) => {
    const client = bot.getClient();
    if (!client || !client.isReady()) return res.status(400).json({ error: 'Bot nicht verbunden.' });
    const an = !!req.body.an;
    (async () => {
      try {
        for (const [, g] of client.guilds.cache) {
          const me = g.members.me;
          if (an) await me.setNickname('⛔ Wartungsmodus').catch(() => {});
          else await me.setNickname(null).catch(() => {});
        }
        client.user.setPresence(an
          ? { activities: [{ name: '🛠️ Wartungsarbeiten …' }], status: 'dnd' }
          : { activities: [{ name: 'lokalen KI-Moderation 🧠' }], status: 'online' });
      } catch (_) {}
    })();
    kiLog.log('warn', 'Geheimpanel: Troll-Modus ' + (an ? 'AN' : 'AUS'));
    res.json({ ok: true });
  });


  // ═══ 0.8.2: STAAT & POLIZEI ═══
  const staatSys = require('../../bot/systems/staat');
  r.get('/staat/info', (req, res) => {
    const gid = String(req.query.guildId || '');
    const s = config.getGuildSettings(gid);
    const st = staatSys.doc(gid);
    const pe = db.get('steuerPeriode', gid);
    res.json({
      kasse: st.kasse, wacheKasse: st.wacheKasse,
      fangChance: staatSys.fangChance(gid),
      settings: { staat: s.staat, steuererklaerung: s.steuererklaerung, polizei: s.polizei, kredit: s.kredit, klauen: s.klauen },
      periode: pe || null,
    });
  });
  r.post('/staat/settings', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    const s = config.getGuildSettings(gid);
    if (b.staat) config.setGuildSettings(gid, { staat: { ...s.staat, ...b.staat, zahlt: { ...(s.staat || {}).zahlt, ...(b.staat.zahlt || {}) } } });
    if (b.steuererklaerung) config.setGuildSettings(gid, { steuererklaerung: { ...s.steuererklaerung, ...b.steuererklaerung, spiele: Array.isArray(b.steuererklaerung.spiele) ? b.steuererklaerung.spiele : (s.steuererklaerung || {}).spiele } });
    if (b.polizei) config.setGuildSettings(gid, { polizei: { ...s.polizei, ...b.polizei } });
    if (b.kredit) config.setGuildSettings(gid, { kredit: { ...s.kredit, ...b.kredit } });
    if (b.klauen) config.setGuildSettings(gid, { klauen: { enabled: !!b.klauen.enabled } });
    kiLog.log('warn', 'Staat-Einstellungen geändert (Dashboard)');
    res.json({ ok: true });
  });

  const boerseSys = require('../../bot/systems/boerse');

  r.get('/boerse/kurse', (req, res) => {
    const gid = String(req.query.guildId || '');
    const d = boerseSys.doc(gid);
    res.json({ kurse: d.kurse, alt: d.alt, intervallSek: d.intervallSek,
      pfad: d.pfad, letzteAenderung: d.letzteAenderung, von: d.von, liste: boerseSys.alleAktien(gid) });
  });
  r.get('/boerse/historie', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json({ liste: db.values('boerse_historie').filter((h) => h.guildId === gid)
      .sort((a, b) => b.zeit - a.zeit).slice(0, 200) });
  });
  r.post('/boerse/intervall', (req, res) => {
    const sek = boerseSys.intervallSetzen(String(req.query.guildId || ''), parseInt(req.body.sekunden, 10) || 3600);
    res.json({ ok: true, intervallSek: sek });
  });


  // ═══ Depot des eingeloggten Admins ═══
  r.get('/boerse/depot', (req, res) => {
    const d = boerseSys.depot(String(req.query.guildId || ''), req.session.userId);
    res.json({ anteile: d.anteile });
  });
  // ═══ GEHEIM: BTC-Mint & Supply ═══
  r.get('/secret/btc', (req, res) => {
    const gid = String(req.query.guildId || '');
    const supply = db.get('btc_supply', gid) || { id: gid, gesamt: 0, preise: [] };
    const d = boerseSys.doc(gid);
    res.json({ gesamt: supply.gesamt, preis: d.kurse.BTC || 25000, preise: supply.preise || [] });
  });
  r.post('/secret/btc/mint', (req, res) => {
    const gid = String(req.query.guildId || '');
    const menge = Math.max(1, Math.min(1000, Number(req.body.menge) || 0));
    const supply = db.get('btc_supply', gid) || { id: gid, gesamt: 0, preise: [] };
    const GAP = 21000000;
    if (supply.gesamt + menge > GAP) {
      return res.status(400).json({ error: 'Cap erreicht! Maximal noch ' + Math.max(0, GAP - supply.gesamt) + ' BTC mintbar (Limit: 21 Mio.).' });
    }
    supply.gesamt += menge;
    const von = (db.get('dashboard_users', req.session.userId) || {}).benutzername || '?';
    supply.preise = (supply.preise || []).slice(-19);
    supply.preise.push({ menge, von, zeit: Date.now() });
    db.set('btc_supply', gid, supply);
    kiLog.log('warn', 'GEHEIM: ' + menge + ' BTC gemint (Supply: ' + supply.gesamt + '/21000000) von ' + von);
    res.json({ ok: true, gesamt: supply.gesamt });
  });
  r.post('/secret/btc/kurs', (req, res) => {
    const gid = String(req.query.guildId || '');
    const prozent = Math.max(-95, Math.min(500, Number(req.body.prozent) || 0));
    const ok2 = boerseSys.manipulieren(gid, 'BTC', prozent, 'BTC-Steuerung');
    const d = boerseSys.doc(gid);
    res.json({ ok: ok2, preis: d.kurse.BTC });
  });


  r.get('/secret/aktien', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json({ liste: boerseSys.alleAktien(gid) });
  });
  r.post('/secret/aktien', (req, res) => {
    const admin = db.get('dashboard_users', req.session.userId);
    const r = boerseSys.aktieHinzufuegen(String(req.query.guildId || ''), req.body.sym, req.body.name, req.body.basis, admin ? admin.benutzername : '?');
    if (r.error) return res.status(400).json(r);
    res.json(r);
  });
  r.delete('/secret/aktien/:sym', (req, res) => {
    res.json({ ok: boerseSys.aktieLoeschen(String(req.query.guildId || ''), String(req.params.sym).toUpperCase()) });
  });
  r.post('/secret/aktien/autoupdate', (req, res) => {
    res.json({ ok: boerseSys.autoUpdateSetzen(String(req.query.guildId || ''), String(req.body.sym || ''), !!req.body.auto) });
  });


  // ═══ 0.8.45: Börsen-Statistik + Richtungs-Steuerung ═══
  r.get('/boerse/statistik', (req, res) => {
    const gid = String(req.query.guildId || '');
    const d = boerseSys.doc(gid);
    const jetzt = Date.now();
    const hist = db.values('boerse_historie').filter((h) => h.guildId === gid && jetzt - h.zeit <= 86400000);
    const proAktie = {};
    for (const h of hist) {
      if (!proAktie[h.sym]) proAktie[h.sym] = { hoch: h.kurs, tief: h.kurs, punkte: 0 };
      proAktie[h.sym].hoch = Math.max(proAktie[h.sym].hoch, h.kurs);
      proAktie[h.sym].tief = Math.min(proAktie[h.sym].tief, h.kurs);
      proAktie[h.sym].punkte++;
    }
    // Depot-Gesamtwert aller Spieler
    let depotGesamt = 0;
    const trader = new Set();
    for (const dep of db.values('depots')) {
      if (dep.guildId !== gid) continue;
      let hat = false;
      for (const [sym, anz] of Object.entries(dep.anteile || {})) {
        if (anz > 0.001) { depotGesamt += anz * (d.kurse[sym] || 0); hat = true; }
      }
      if (hat) trader.add(dep.userId);
    }
    const manips = db.values('boerse_historie').filter((h) => h.guildId === gid && h.manip && jetzt - h.zeit <= 7 * 86400000).length;
    res.json({ proAktie, depotGesamt: Math.round(depotGesamt * 100) / 100, trader: trader.size, manips });
  });

  r.post('/boerse/richtung', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    const d = boerseSys.doc(gid);
    if (!d.kurse[b.sym]) return res.status(400).json({ error: 'Symbol unbekannt' });
    const alt = d.kurse[b.sym];
    const zielProzent = Math.max(-90, Math.min(500, Number(b.prozent) || 0));
    d.alt[b.sym] = alt;
    d.kurse[b.sym] = Math.max(0.5, Math.round(alt * (1 + zielProzent / 100) * 100) / 100);
    d.letzteAenderung = Date.now(); d.von = 'Dashboard-Admin';
    db.set('boerse', gid, d);
    db.push('boerse_historie', { guildId: gid, sym: b.sym, kurs: d.kurse[b.sym], zeit: Date.now(), manip: true, von: 'Dashboard' });
    const admin = db.get('dashboard_users', req.session.userId);
    kiLog.log('warn', 'Kurs-Steuerung (Dashboard/' + (admin ? admin.benutzername : '?') + '): ' + b.sym + ' ' + zielProzent + '%');
    res.json({ ok: true, neuKurs: d.kurse[b.sym] });
  });

  r.get('/secret/markt/symbole', (req, res) => {
    const gid = String(req.query.guildId || '');
    res.json({ liste: boerseSys.alleAktien(gid).map((a) => ({ sym: a.sym, name: a.name })) });
  });


  r.get('/boerse/verlauf/:sym', (req, res) => {
    const gid = String(req.query.guildId || '');
    const sym = String(req.params.sym).toUpperCase();
    const liste = db.values('boerse_historie')
      .filter((h) => h.guildId === gid && h.sym === sym)
      .sort((a, b) => a.zeit - b.zeit).slice(-100)
      .map((h) => ({ kurs: h.kurs, zeit: h.zeit }));
    const d = boerseSys.doc(gid);
    // VERLAUF-FALLBACK: mindestens der aktuelle Kurs, damit der Chart nie leer ist
    const finale = liste.length ? liste : [{ kurs: d.kurse[sym] || 0, zeit: Date.now() }];
    res.json({ sym, kurs: d.kurse[sym] || 0, liste: finale });
  });
  r.post('/boerse/zeichnen/:sym', (req, res) => {
    const admin = db.get('dashboard_users', req.session.userId);
    const ok2 = boerseSys.zeichnungStarten(String(req.query.guildId || ''),
      String(req.params.sym).toUpperCase(), req.body.punkte, admin ? admin.benutzername : '?');
    if (!ok2) return res.status(400).json({ error: 'Mindestens 2 Punkte nötig.' });
    res.json({ ok: true });
  });


  // ═══ 0.8.46: Eigene Crypto mit begrenztem Supply ═══
  r.post('/boerse/crypto', (req, res) => {
    const gid = String(req.query.guildId || '');
    const b = req.body || {};
    const admin = db.get('dashboard_users', req.session.userId);
    const von = admin ? admin.benutzername : '?';
    const sym = String(b.sym || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!sym) return res.status(400).json({ error: 'Symbol nötig (z. B. GINZ)' });
    const supply = Math.max(1, Math.min(21000000, Math.round(Number(b.supply) || 1000)));
    const d = boerseSys.doc(gid);
    d.customAktien = d.customAktien || [];
    if (d.customAktien.some((c) => c.sym === sym)) return res.status(400).json({ error: 'Symbol existiert schon.' });
    const basis = Math.max(0.01, Number(b.basis) || 1);
    d.customAktien.push({ sym, name: String(b.name || sym).slice(0, 40), basis, autoUpdate: b.autoUpdate !== false,
      von, crypto: true, supply, verfuegbar: supply });
    d.kurse[sym] = basis; d.alt[sym] = basis;
    db.set('boerse', gid, d);
    kiLog.log('warn', 'NEUE CRYPTO: ' + sym + ' (' + (b.name || sym) + ') Supply: ' + supply + ' von ' + von);
    res.json({ ok: true, sym, supply });
  });
  r.get('/boerse/crypto/:sym', (req, res) => {
    const gid = String(req.query.guildId || '');
    const sym = String(req.params.sym).toUpperCase();
    const d = boerseSys.doc(gid);
    const c = (d.customAktien || []).find((x) => x.sym === sym);
    if (!c) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ sym, name: c.name, supply: c.supply, verfuegbar: c.verfuegbar, crypto: !!c.crypto, kurs: d.kurse[sym] });
  });
  r.post('/boerse/crypto/:sym/setzen', (req, res) => {
    // Geheim: verfuegbare Menge ändern (burnen/minten)
    const gid = String(req.query.guildId || '');
    const sym = String(req.params.sym).toUpperCase();
    const d = boerseSys.doc(gid);
    const c = (d.customAktien || []).find((x) => x.sym === sym);
    if (!c || !c.crypto) return res.status(404).json({ error: 'Keine Crypto.' });
    const neu = Math.max(0, Math.round(Number(req.body.verfuegbar) || 0));
    c.verfuegbar = neu;
    db.set('boerse', gid, d);
    res.json({ ok: true, verfuegbar: neu });
  });


  r.post('/secret/umlage', (req, res) => {
    const gid = String(req.query.guildId || '');
    const betrag = Math.max(1, Math.round(Number(req.body && req.body.betrag) || 0));
    const stand = economy.kasseGet(gid);
    if (stand < betrag) return res.status(400).json({ error: 'Serverkasse hat nur ' + stand + '.' });
    economy.kasseRemove(gid, betrag, 'Umlage Serverkasse → Staatskasse (Geheimpanel)', 'Geheimpanel');
    const neuStaat = staatSys.einzahlen(gid, betrag, 'Umlage von Serverkasse');
    res.json({ ok: true, serverKasse: stand - betrag, staatKasse: neuStaat });
  });


  r.post('/ext/umlage', (req, res) => {
    try {
      const gid = String(req.query.guildId || '');
      const b = Math.max(1, Math.round(Number(req.body && req.body.betrag) || 0));
      const stand = economy.kasseGet(gid);
      if (stand < b) return res.status(400).json({ error: 'Serverkasse hat nur ' + stand + '.' });
      economy.kasseRemove(gid, b, 'Umlage → Staatskasse (Dashboard)', 'Admin');
      const neuStaat = staatSys.einzahlen(gid, b, 'Umlage von Serverkasse');
      res.json({ ok: true, serverKasse: stand - b, staatKasse: neuStaat });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });


  // ═══ 0.8.8e: COMMAND-STUDIO ═══
  r.get('/studio/bloecke', (_req, res) => {
    res.json({
      katalog: [
                { typ:'cooldown_user', kat:'conditions', name:'Cooldown (pro User)', desc:'Nutzer-Wartezeit, bricht ab', felder:[
                  {k:'minuten',l:'Minuten',t:'number',d:5}] },
                { typ:'var_vergleich', kat:'variables', name:'Compare Variable', desc:'Variable = Wert?', felder:[
                  {k:'name',l:'Variablen-Name',t:'text',d:'meineVar'},{k:'wert',l:'Vergleich mit',t:'text'},
                  {k:'dann',l:'Gleich',t:'nested'},{k:'sonst',l:'Ungleich',t:'nested'}] },
                { typ:'zufalls_nachricht', kat:'message', name:'Random Message', desc:'Zufällige Antwort', felder:[
                  {k:'nachrichten',l:'Texte mit | trennen',t:'text',d:'Hi! | Hallo! | Servus!'}] },
                { typ:'embed_felder', kat:'message', name:'Embed with Fields', desc:'Embed mit Feldern', felder:[
                  {k:'title',l:'Titel',t:'text'},{k:'text',l:'Text',t:'textarea',d:'Beschreibung'},
                  {k:'felder',l:'Felder (Name=Wert | N2=W2)',t:'text'},{k:'color',l:'Farbe HEX',t:'text',d:'5865F2'}] },
                { typ:'webseite', kat:'message', name:'Website Embed', desc:'Embed mit Link', felder:[
                  {k:'titel',l:'Titel',t:'text'},{k:'url',l:'URL',t:'text'},
                  {k:'text',l:'Text',t:'textarea'},{k:'bild',l:'Bild-URL',t:'text'}] },
        { typ: 'respond', name: '💬 Antwort senden', felder: [
          { key: 'text', label: 'Text', typ: 'text', default: 'Hallo {user}!' },
          { key: 'title', label: 'Embed-Titel (optional)', typ: 'text' },
          { key: 'color', label: 'Farbe (HEX)', typ: 'text', default: '5865F2' },
          { key: 'ephemeral', label: 'Nur für den Nutzer sichtbar?', typ: 'bool' },
          { key: 'embed', label: 'Als Embed?', typ: 'bool' },
        ], var: '{user} {username} {server} {member} {arg1} {arg2}' },
        { typ: 'send_channel', name: '📨 In Kanal senden', felder: [
          { key: 'kanal', label: 'Kanal-ID', typ: 'kanal' },
          { key: 'text', label: 'Text', typ: 'text', default: 'Neues Ereignis!' } ] },
        { typ: 'dm', name: '📩 DM an Nutzer', felder: [
          { key: 'text', label: 'Text', typ: 'text', default: 'Private Nachricht!' } ] },
        { typ: 'add_money', name: '💰 Geld hinzufügen', felder: [
          { key: 'menge', label: 'Menge', typ: 'number', default: 100 },
          { key: 'grund', label: 'Grund (optional)', typ: 'text' } ] },
        { typ: 'remove_money', name: '💸 Geld entfernen', felder: [
          { key: 'menge', label: 'Menge', typ: 'number', default: 50 } ] },
        { typ: 'add_xp', name: '⭐ XP hinzufügen', felder: [
          { key: 'menge', label: 'XP-Menge', typ: 'number', default: 25 } ] },
        { typ: 'give_role', name: '🏷️ Rolle geben', felder: [
          { key: 'rolle', label: 'Rolle', typ: 'rolle' } ] },
        { typ: 'remove_role', name: '🏷️ Rolle entfernen', felder: [
          { key: 'rolle', label: 'Rolle', typ: 'rolle' } ] },
        { typ: 'delay', name: '⏱️ Warten', felder: [
          { key: 'sekunden', label: 'Sekunden (1–60)', typ: 'number', default: 3 } ] },
        { typ: 'if_role', name: '❓ WENN Rolle', felder: [
          { key: 'rolle', label: 'Rolle prüfen', typ: 'rolle' },
          { key: 'dann', label: 'Dann-Blöcke', typ: 'nested' },
          { key: 'sonst', label: 'Sonst-Blöcke', typ: 'nested' } ] },
        { typ: 'if_money', name: '❓ WENN Geld ≥', felder: [
          { key: 'menge', label: 'Mindest-Geld', typ: 'number', default: 100 },
          { key: 'dann', label: 'Dann-Blöcke', typ: 'nested' },
          { key: 'sonst', label: 'Sonst-Blöcke', typ: 'nested' } ] },
        { typ: 'random', name: '🎲 ZUFALL', felder: [
          { key: 'chance', label: 'Chance in %', typ: 'number', default: 50 },
          { key: 'dann', label: 'Getroffen-Blöcke', typ: 'nested' },
          { key: 'sonst', label: 'Nicht-getroffen-Blöcke', typ: 'nested' } ] },
        { typ: 'react', name: '💬 Nachricht in Kanal', felder: [
          { key: 'text', label: 'Text', typ: 'text', default: '✅ Erledigt!' } ] },
        { typ: 'poll', name: '📊 Mini-Umfrage', felder: [
          { key: 'frage', label: 'Frage', typ: 'text', default: 'Wie findet ihr das?' },
          { key: 'optionen', label: 'Optionen (Komma)', typ: 'text', default: 'Ja, Nein' } ] },
        { typ: 'log', name: '📜 Ins Mod-Log', felder: [
          { key: 'text', label: 'Log-Text', typ: 'text', default: 'Block-Ereignis' } ] },
        { typ: 'abbruch', name: '⛔ Abbrechen (stoppt Kette)', felder: [] },
      ],
    });
  });

  r.get('/studio/befehle', (_req, res) => {
    res.json({ liste: db.values('custom_commands') });
  });

  r.post('/studio/befehle', async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || '').toLowerCase().trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(name)) return res.status(400).json({ error: 'Name: a-z, 0-9, _ und -' });
    const hatGraph = Array.isArray(b.nodes) && b.nodes.length > 0;
    const hatBlocks = Array.isArray(b.blocks) && b.blocks.length > 0;
    if (!hatGraph && !hatBlocks) return res.status(400).json({ error: 'Keine Blöcke/Nodes gefunden' });
    if (hatBlocks && b.blocks.length > 50) return res.status(400).json({ error: 'Max. 50 Blöcke' });
    const id = b.id || db.newId('bs_');
    db.set('custom_commands', id, {
      id, name,
      description: String(b.description || 'Studio-Command').slice(0, 100),
      response: '', embed: false,
      blocks: (Array.isArray(b.blocks) ? b.blocks : []).slice(0, 50),
      nodes: Array.isArray(b.nodes) ? b.nodes.slice(0, 100) : [],
      edges: Array.isArray(b.edges) ? b.edges.slice(0, 200) : [],
      roles: Array.isArray(b.roles) ? b.roles.slice(0, 20) : [],
      cooldown: Math.max(0, Math.min(3600, parseInt(b.cooldown, 10) || 0)),
      guildId: String(b.guildId || config.get().guildId || ''),
      erstelltAm: Date.now(),
      studio: true,
    });
    const client = bot.getClient();
    if (client) {
      registry.reloadCustom(client);
      await registry.refreshSlash(client);
    }
    res.json({ ok: true, id });
  });

  r.get('/studio/befehl/:id', (req, res) => {
    const c = db.get('custom_commands', req.params.id);
    if (!c) return res.status(404).json({ error: 'nicht gefunden' });
    res.json({ befehl: c });
  });
  r.delete('/studio/befehle/:id', async (req, res) => {
    const ok = db.del('custom_commands', req.params.id);
    const client = bot.getClient();
    if (ok && client) { registry.reloadCustom(client); await registry.refreshSlash(client); }
    res.json({ ok });
  });

  app.use('/api', r);
};
