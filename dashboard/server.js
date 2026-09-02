// ═══════════════════════════════════════════════════════════════
// EXPRESS-WEBERVER: Statisches Frontend + API + Auth.
// Der Port ist im Dashboard änderbar (Neustart des Prozesses
// erforderlich – wird dem Admin im Toast mitgeteilt).
// ═══════════════════════════════════════════════════════════════
'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const logger = require('../core/logger');
const config = require('../core/config');

let server = null;

function startDashboard() {
  const app = express();
  const cfg = config.get();
  const port = cfg.dashboard.port || 3000;

  app.disable('x-powered-by');
  app.use(express.json({ limit: '5mb' })); // Design-Backups können groß sein

  // Sessions (HttpOnly-Cookie, scrypt-Login in auth.js)
  const { sessionMiddleware } = require('./auth');
  app.use(sessionMiddleware(session, cfg));

  // Statisches Frontend (kein Build-Step – reines HTML/CSS/JS)
  app.use(express.static(path.join(__dirname, 'public'), { index: false }));

  // API-Routen (Setup, Auth, alle Dashboard-Endpunkte)
  require('./routes/api')(app);

  // Fallback: unbekannte Pfade -> Index (SPA)
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'Endpunkt nicht gefunden' });
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });

  // Fehlerbehandlung
  app.use((err, req, res, _next) => {
    logger.error('Express [' + req.method + ' ' + req.originalUrl + ']: ' + err.message);
    logger.error((err.stack || '').split('\n').slice(1, 4).join('\n'));
    res.status(500).json({ error: 'Interner Serverfehler' });
  });

  server = app.listen(port, '0.0.0.0', () => {
    logger.ok(`Dashboard erreichbar unter http://localhost:${port}`);
  });
  return server;
}

function stopDashboard() {
  if (server) {
    try { server.close(); } catch (_) { /* ok */ }
    server = null;
  }
}

module.exports = { startDashboard, stopDashboard };
