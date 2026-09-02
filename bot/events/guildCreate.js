// Neuer Server: Gilden-Dokument + Standard-Einstellungen anlegen,
// Commands (inkl. eigener Commands) registrieren.
'use strict';

const db = require('../../core/db');
const config = require('../../core/config');
const logger = require('../../core/logger');
const { getGuildDoc } = require('../../core/utils');
const { refreshSlash } = require('../registry');

module.exports = async function guildCreate(guild, client) {
  logger.info(`Neuer Server beigetreten: ${guild.name} (${guild.id})`);
  const dok = getGuildDoc(guild.id);
  dok.name = guild.name;
  db.set('guilds', guild.id, dok);

  // Standard-Einstellungen einmalig persistieren
  db.set('guild_settings', guild.id, config.getGuildSettings(guild.id));

  await refreshSlash(client).catch(() => {});
};
