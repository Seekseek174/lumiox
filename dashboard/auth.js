// ═══════════════════════════════════════════════════════════════
// AUTH: scrypt-Passwort-Hashing (eingebaut, kein bcrypt-Kompilier-
//stress in Termux), Session-Middleware mit HttpOnly-Cookie und
// Login-Rate-Limit (5 Versuche, dann 10 Min. Sperre).
// ═══════════════════════════════════════════════════════════════
'use strict';

const crypto = require('crypto');
const db = require('../core/db');

const MAX_VERSUCHE = 5;
const SPERRE_MS = 10 * 60000;
const loginVersuche = new Map(); // benutzername -> { count, gesperrtBis }

// ── scrypt-Hashing ──────────────────────────────────────────────
function hashPasswort(passwort) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(passwort), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function pruefePasswort(passwort, gespeichert) {
  if (!gespeichert || !gespeichert.includes(':')) return false;
  const [salt, hash] = gespeichert.split(':');
  const probe = crypto.scryptSync(String(passwort), salt, 64).toString('hex');
  // timingSafeEqual verhindert Timing-Angriffe
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(probe, 'hex'));
}

// ── Rate-Limit ──────────────────────────────────────────────────
function istGesperrt(benutzername) {
  const e = loginVersuche.get(benutzername);
  if (!e) return false;
  if (e.gesperrtBis && Date.now() < e.gesperrtBis) return true;
  if (e.gesperrtBis && Date.now() >= e.gesperrtBis) {
    loginVersuche.delete(benutzername); // Sperre abgelaufen
  }
  return false;
}

function registriereFehlversuch(benutzername) {
  const e = loginVersuche.get(benutzername) || { count: 0, gesperrtBis: 0 };
  e.count++;
  if (e.count >= MAX_VERSUCHE) {
    e.gesperrtBis = Date.now() + SPERRE_MS;
    e.count = 0;
  }
  loginVersuche.set(benutzername, e);
  return { gesperrt: !!e.gesperrtBis, restliche: Math.max(0, MAX_VERSUCHE - e.count) };
}

// ── Benutzer-Verwaltung ─────────────────────────────────────────
function erstelleBenutzer(benutzername, passwort) {
  if (!benutzername || !passwort || String(passwort).length < 6) return null;
  const id = db.newId('user_');
  db.set('dashboard_users', id, {
    id, benutzername: String(benutzername).slice(0, 40),
    hash: hashPasswort(passwort),
    rolle: 'admin',
    design: null, // pro-Account-Design (Design-Editor)
    erstelltAm: Date.now(),
  });
  return id;
}

function findeBenutzer(benutzername) {
  return db.values('dashboard_users').find(u => u.benutzername === benutzername) || null;
}

function login(benutzername, passwort) {
  if (istGesperrt(benutzername)) {
    const e = loginVersuche.get(benutzername);
    const rest = Math.ceil((e.gesperrtBis - Date.now()) / 60000);
    return { ok: false, fehler: `Zu viele Fehlversuche – gesperrt für ${rest} Minute(n).` };
  }
  const u = findeBenutzer(benutzername);
  if (!u || !pruefePasswort(passwort, u.hash)) {
    const info = registriereFehlversuch(benutzername);
    return {
      ok: false,
      fehler: info.gesperrt
        ? `Zu viele Fehlversuche – gesperrt für 10 Minuten.`
        : `Falscher Benutzername oder Passwort. (${MAX_VERSUCHE - info.restliche}/${MAX_VERSUCHE})`,
    };
  }
  loginVersuche.delete(benutzername);
  return { ok: true, user: u };
}

// ── Session-Middleware ──────────────────────────────────────────
function sessionMiddleware(sessionLib, cfg) {
  return sessionLib({
    secret: cfg.dashboard.sessionSecret || 'neonbot-fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,                       // kein JS-Zugriff – XSS-Schutz
      sameSite: 'lax',
      maxAge: (cfg.dashboard.sessionHours || 24) * 3600000,
    },
  });
}

// Guard für alle geschützten API-Endpunkte
function requireLogin(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Nicht eingeloggt' });
}

module.exports = {
  hashPasswort, pruefePasswort, login, istGesperrt,
  erstelleBenutzer, findeBenutzer,
  sessionMiddleware, requireLogin,
};
