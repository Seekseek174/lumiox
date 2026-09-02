// Ready-Event: Systeme starten, Slash-Commands registrieren,
// Gilden-Dokumente anlegen.
'use strict';

const logger = require('../../core/logger');
const db = require('../../core/db');
const { refreshSlash } = require('../registry');
const systems = require('../systems');
const { getGuildDoc } = require('../../core/utils');

module.exports = async function ready(client) {
  logger.ok(`Eingeloggt als ${client.user.tag}`);
  client.user.setPresence({
    activities: [{ name: 'lokalen KI-Moderation 🧠' }],
    status: 'online',
  });

  // Gilden-Dokumente sicherstellen
  for (const [, g] of client.guilds.cache) {
    const dok = getGuildDoc(g.id);
    if (!dok.name) { dok.name = g.name; db.set('guilds', g.id, dok); }
  }

  // Systeme initialisieren (Scheduler, KI-Puffer, …)
  systems.init(client);

  // Slash-Commands registrieren (Guild-ID = sofort, sonst global)
  await refreshSlash(client);
};
