// ═══════════════════════════════════════════════════════════════
// Discord-Client: Aufbau, Login, Reconnect (vom Dashboard aus,
// ohne Neustart der Konsole) und Statusabfrage.
// ═══════════════════════════════════════════════════════════════
'use strict';

const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const logger = require('../core/logger');
const config = require('../core/config');
const registry = require('./registry');

let client = null;
const status = { connected: false, lastError: '', startedAt: 0 };

function createClient() {
  const c = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildModeration,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember],
  });

  c.commands = new Collection();
  c.components = new Collection();

  registry.build(c);

  const EVENTS = {
    ready:             require('./events/ready'),
    guildCreate:       require('./events/guildCreate'),
    interactionCreate: require('./events/interactionCreate'),
    messageCreate:     require('./events/messageCreate'),
    messageUpdate:     require('./events/messageUpdate'),
    messageDelete:     require('./events/messageDelete'),
    guildMemberAdd:    require('./events/guildMemberAdd'),
    guildMemberRemove: require('./events/guildMemberRemove'),
  };
  for (const [name, fn] of Object.entries(EVENTS)) {
    c.on(name, (...args) => {
      Promise.resolve(fn(...args, c)).catch((e) =>
        logger.error(`Event ${name}: ${e.message}`)
      );
    });
  }
  return c;
}

// Wartet, bis der Client wirklich bereit ist (READY-Event) –
// sonst meldet das Dashboard fälschlich "nicht verbunden".
function waitForReady(ms = 20000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = setInterval(() => {
      if (client && client.isReady()) {
        clearInterval(check);
        resolve(true);
      } else if (Date.now() - start > ms) {
        clearInterval(check);
        resolve(false);
      }
    }, 250);
  });
}

async function startBot() {
  const token = config.get().token;
  if (!token) throw new Error('Kein Token konfiguriert.');
  if (client) { try { await client.destroy(); } catch (_) { /* war schon weg */ } }
  client = createClient();
  status.lastError = '';
  await client.login(token); // wirft bei ungültigem Token
  status.connected = true;
  status.startedAt = Date.now();
  await waitForReady(20000); // ← NEU: auf echte Bereitschaft warten
  return client;
}

async function restartBot() {
  if (client) {
    try { await client.destroy(); } catch (_) { /* ok */ }
    client = null;
    status.connected = false;
  }
  return startBot();
}

function getClient() { return client; }

function getStatus() {
  return {
    connected: !!(client && client.isReady()),
    ping: client && client.ws ? Math.max(0, Math.round(client.ws.ping)) : null,
    uptimeSec: status.startedAt ? Math.floor((Date.now() - status.startedAt) / 1000) : 0,
    lastError: status.lastError,
    user: client && client.user ? client.user.tag : null,
    guilds: client ? client.guilds.cache.size : 0,
  };
}

module.exports = { startBot, restartBot, getClient, getStatus };
