// ═══════════════════════════════════════════════════════════════
// Command-Registry:
//  - Lädt alle statischen Command-Module (pro Kategorie gebündelt
//    = weniger Datei-Handles & RAM auf dem Handy)
//  - Lädt eigene Commands aus der DB als echte Slash-Commands
//  - Registriert alles beim Start (Gilden-spezifisch = sofort,
//    sonst global) und jederzeit per refreshSlash() neu
// ═══════════════════════════════════════════════════════════════
'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../core/config');
const db = require('../core/db');
const logger = require('../core/logger');
const blockEngine = require('./systems/blockEngine');

const STATIC = [
  ...require('./commands/moderation'), // Commands 1–16
  ...require('./commands/wirtschaft'), // Commands 17–38
  ...require('./commands/level'),      // Commands 39–42
  ...require('./commands/fun'),        // Commands 43–50
  ...require('./commands/utility'),    // Commands 51–66
  ...require('./commands/tickets'),    // Commands 67–71
  ...require('./commands/giveaway'),   // Commands 72–74
  ...require('./commands/extras'),   // 0.8.1 Commands
  ...require('./commands/extras2'),   // 0.8.1 Commands
  ...require('./commands/extras3'),   // 0.8.2 Commands
  ...require('./commands/updates'),   // 0.9.0
];

// Eigenen Dashboard-Command in ein Command-Objekt verwandeln
function customToCommand(c) {
  const data = new SlashCommandBuilder()
    .setName(c.name)
    .setDescription((c.description || 'Eigener Befehl').slice(0, 100));
  return {
      blockDef: c,
    data,
    custom: true,
    guildId: c.guildId || '',
    cooldownMs: (c.cooldown || 0) * 1000,
    async execute(interaction) {
      // ═══ BLOCK-ENGINE (Studio-Commands) ═══
      const _cmdDef = interaction.client.commands.get(interaction.commandName);
      if (_cmdDef && _cmdDef.blockDef && Array.isArray(_cmdDef.blockDef.blocks)) {
        try {
          await blockEngine.fuehreCustomAus(_cmdDef.blockDef, interaction);
        } catch (e) {
          logger.error('Block-Command: ' + e.message);
          try { await interaction.reply({ content: '❌ ' + e.message, ephemeral: true }); } catch (_) {}
        }
        return;
      }
      // Rollen-Beschränkung
      if (c.roles && c.roles.length) {
        const hat = interaction.member.roles.cache.some((r) => c.roles.includes(r.id));
        if (!hat) {
          return interaction.reply({ content: '⛔ Du hast keine Berechtigung für diesen Befehl.', ephemeral: true });
        }
      }
      if (c.embed) {
        const e = new EmbedBuilder()
          .setDescription(c.response || '')
          .setColor(c.color || 0x5865F2);
        if (c.title) e.setTitle(c.title.slice(0, 256));
        if (c.image) e.setImage(c.image);
        for (const f of c.fields || []) {
          if (f.name && f.value) {
            e.addFields({ name: f.name.slice(0, 256), value: f.value.slice(0, 1024), inline: !!f.inline });
          }
        }
        await interaction.reply({ embeds: [e] });
      } else {
        await interaction.reply({ content: c.response || '…' });
      }
    },
  };
}

function build(client) {
  for (const cmd of STATIC) client.commands.set(cmd.data.name, cmd);
  for (const [, c] of db.all('custom_commands')) {
    if (!c.name) continue;
    try {
      client.commands.set(c.name, customToCommand(c));
    } catch (e) {
      logger.warn(`Eigener Befehl "${c.name}" ist ungültig: ${e.message}`);
    }
  }
  logger.ok(`${client.commands.size} Befehle geladen (inkl. eigene).`);
}

// Nach CRUD im Dashboard: eigene Commands neu laden, ohne Neustart
function reloadCustom(client) {
  for (const [name, cmd] of [...client.commands]) {
    if (cmd.custom) client.commands.delete(name);
  }
  for (const [, c] of db.all('custom_commands')) {
    if (!c.name) continue;
    try { client.commands.set(c.name, customToCommand(c)); } catch (_) { /* bereits geloggt */ }
  }
}

// Slash-Commands (neu) registrieren
async function refreshSlash(client) {
  if (!client || !client.isReady()) return;
  const cfg = config.get();
  const alle = [...client.commands.values()];
  try {
    if (cfg.guildId) {
      // Schneller Weg: alles direkt auf dem konfigurierten Server
      const g = await client.guilds.fetch(cfg.guildId).catch(() => null);
      if (g) {
        const payload = alle
          .filter((c) => !c.custom || !c.guildId || c.guildId === cfg.guildId)
          .map((c) => c.data.toJSON());
        await g.commands.set(payload);
        logger.ok(`Slash-Commands auf Server ${g.name} registriert (${payload.length}).`);
      }
    } else {
      // Global registrieren; eigene Commands zusätzlich je Gilde
      const globalPayload = alle.filter((c) => !c.custom).map((c) => c.data.toJSON());
      await client.application.commands.set(globalPayload);
      logger.ok(`Slash-Commands global registriert (${globalPayload.length}).`);
      for (const [, g] of client.guilds.cache) {
        const payload = alle
          .filter((c) => c.custom && (!c.guildId || c.guildId === g.id))
          .map((c) => c.data.toJSON());
        if (payload.length) await g.commands.set(payload).catch(() => {});
      }
    }
  } catch (e) {
    logger.error('Slash-Registrierung fehlgeschlagen: ' + e.message);
  }
}

module.exports = { build, refreshSlash, reloadCustom };
