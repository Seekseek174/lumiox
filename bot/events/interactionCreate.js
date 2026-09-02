// Zentrale Interaktions-Verarbeitung:
//  - Slash-Commands (mit Cooldown, pro-Server An/Aus & Fehlerbehandlung)
//  - Buttons/Dropdowns -> systems.handleComponent
//  - Modals (z. B. Embed-Builder) -> Handler aus client.components
'use strict';

const logger = require('../../core/logger');
const config = require('../../core/config');
const systems = require('../systems');

const cooldowns = new Map(); // key -> ts, wird periodisch aufgeräumt (scheduler)

module.exports = async function interactionCreate(interaction, client) {
  try {
    if (interaction.isAutocomplete && interaction.isAutocomplete()) {
      try {
        const boerseSys = require('../systems/boerse');
        if (interaction.commandName === 'boerse') {
          const focused = interaction.options.getFocused(true).find((o) => o.focused);
          if (focused && focused.name === 'symbol') {
            const alle = boerseSys.alleAktien(interaction.guild.id)
              .filter((x) => x.sym.toLowerCase().includes(String(focused.value).toLowerCase()))
              .slice(0, 25);
            return interaction.respond(alle.map((x) => ({ name: x.sym + ' · ' + x.name, value: x.sym })));
          }
        }
        return interaction.respond([]);
      } catch (_) {
        try { return interaction.respond([]); } catch (_) {}
      }
    }

    if (interaction.isChatInputCommand()) {
      const cmd = client.commands.get(interaction.commandName);
      if (!cmd) return;

      // Pro-Server Command-Sperre (gesteuert im Dashboard → "Commands An/Aus")
      if (interaction.guild) {
        const s = config.getGuildSettings(interaction.guild.id);
        if (s.commandToggles && s.commandToggles.disabled &&
            s.commandToggles.disabled[interaction.commandName]) {
          return interaction.reply({
            content: `⛔ Der Befehl \`/${interaction.commandName}\` ist auf diesem Server derzeit deaktiviert.`,
            ephemeral: true,
          });
        }
      }

      const cdMs = cmd.cooldownMs || 0;
      if (cdMs > 0) {
        const key = `${interaction.commandName}:${interaction.user.id}`;
        const bis = cooldowns.get(key) || 0;
        const jetzt = Date.now();
        if (bis > jetzt) {
          return interaction.reply({
            content: `⏳ Bitte warte noch **${Math.ceil((bis - jetzt) / 1000)} Sekunden**.`,
            ephemeral: true,
          });
        }
        cooldowns.set(key, jetzt + cdMs);
        if (cooldowns.size > 2000) {
          for (const [k, t] of cooldowns) if (t < jetzt) cooldowns.delete(k);
        }
      }

      await cmd.execute(interaction, client);
      return;
    }

    if (interaction.isButton() || interaction.isAnySelectMenu()) {
      await systems.handleComponent(interaction, client);
      return;
    }

    if (interaction.isModalSubmit()) {
      const handler = client.components.get(interaction.customId);
      if (handler) await handler(interaction, client);
      return;
    }
  } catch (e) {
    logger.error(`Interaction "${interaction.commandName || interaction.customId}": ${e.message}`);
    const payload = {
      content: '❌ Ups, da ist etwas schiefgelaufen: `' + String(e.message || 'Unbekannter Fehler').slice(0, 200) + '`',
      ephemeral: true,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
};

function sweepCooldowns() {
  const jetzt = Date.now();
  for (const [k, t] of cooldowns) if (t < jetzt) cooldowns.delete(k);
}
module.exports.sweepCooldowns = sweepCooldowns;
