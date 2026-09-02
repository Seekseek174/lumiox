// ═══════════════════════════════════════════════════════════════
// System-Kern (v2): Nachrichten-Pipeline mit Prozess-Log.
// Reihenfolge: Wortfilter → Auto-Mod → Statistik/Level → KI/Sentinel
// Jede Phase meldet sich im kiLog (Dashboard: "KI-Prozesse").
// ═══════════════════════════════════════════════════════════════
'use strict';

const config = require('../../core/config');
const logger = require('../../core/logger');
const ollama = require('../../core/ollama');
const { bumpStat } = require('../../core/utils');
const kiLog = require('./kiLog');

const wordFilter   = require('./wordFilter');
const automod      = require('./automod');
const levelSystem  = require('./levelSystem');
const aiModeration = require('./aiModeration');
const tickets      = require('./tickets');
const giveaways    = require('./giveaways');
const suggestions  = require('./suggestions');
const scheduler    = require('./scheduler');

let clientRef = null;

function init(client) {
  clientRef = client;
  scheduler.init(client);
  kiLog.log('ok', 'Systeme initialisiert – Pipeline bereit');
  logger.ok('Systeme initialisiert.');
}

function getClient() { return clientRef; }

async function handleMessage(message) {
  kiLog.zaehle('nachrichten');
  kiLog.log('msg', `Nachricht von ${message.author.username} in #${message.channel.name} empfangen (${String(message.content || '').length} Zeichen)`);

  const s = config.getGuildSettings(message.guild.id);

  // 1) Wortfilter (synchron, funktioniert ohne KI)
  const wortfilterTreffer = s.wordFilter.enabled && wordFilter.handleMessage(message, s);

  // 2) Auto-Mod – WICHTIG: await (ohne await wäre das Ergebnis immer "truthy")
  let autoModTreffer = false;
  if (!wortfilterTreffer && s.automod.enabled) {
    try {
      autoModTreffer = await automod.handleMessage(message, s);
    } catch (e) {
      kiLog.zaehle('fehler');
      kiLog.log('fehler', 'Auto-Mod-Fehler: ' + e.message);
    }
  }

  // 3) Statistik & Level
  bumpStat(message.guild.id, 'nachrichtenHeute', 1);
  try { kanalStat(message.guild.id, message.channel); } catch (_) {}
  if (s.level.enabled && !wortfilterTreffer && !autoModTreffer) {
    levelSystem.handleMessage(message, s).catch(() => {});
  }

  // 4) KI-/Sentinel-Moderation: ALLE Nachrichten in den Puffer
  aiModeration.enqueue(message, s, wortfilterTreffer || autoModTreffer);
  if (wortfilterTreffer || autoModTreffer) return;

  // 5) KI-Chat-Kanal
  const ai = s.aiChat;
  if (ai.enabled && ai.channel && message.channel.id === ai.channel) {
    (async () => {
      try {
        await message.channel.sendTyping().catch(() => {});
        const antwort = await ollama.chat([
          { role: 'system', content: ai.persona || 'Du bist ein freundlicher Server-Bot.' },
          { role: 'user', content: `${message.author.username} sagt: ${message.content}` },
        ]);
        if (antwort && antwort.trim()) {
          await message.reply({ content: antwort.trim().slice(0, 1900), allowedMentions: { parse: [] } });
        }
      } catch (_) { /* Ollama offline -> still */ }
    })();
  }
}

// Nachrichten-Zähler pro Kanal (Analytics)
function kanalStat(guildId, kanal) {
  const db = require('../../core/db');
  const g = db.get('guilds', guildId) || { id: guildId };
  g.kanalStat = g.kanalStat || {};
  const e = g.kanalStat[kanal.id] || (g.kanalStat[kanal.id] = { name: kanal.name || '?', anzahl: 0 });
  e.name = kanal.name || e.name;
  e.anzahl++;
  db.set('guilds', guildId, g);
}

async function handleComponent(interaction) {
  const id = interaction.customId || '';
  if (id.startsWith('ticket_'))   return tickets.handleComponent(interaction);
  if (id.startsWith('giveaway_')) return giveaways.handleComponent(interaction);
  if (id.startsWith('sugg_'))     return suggestions.handleComponent(interaction);
}

module.exports = { init, handleMessage, handleComponent, getClient };
