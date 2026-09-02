// ═══════════════════════════════════════════════════════════════
// ZENTRALER SCHEDULER – ein einziger Herzschlag für ALLES:
//  - alle 30 s: Tempbans, Unmutes, Reminders, Giveaway-Ziehungen
//  - alle 60 s: Voice-XP, KI-Kontext-Batches, KI-Puffer-Sweep,
//               Vermögenssteuer (Fälligkeit + 24h-Warnung),
//               Lotterie-Ziehung, Cooldown-Cleanup
//  - alle 60 min: Bank-/Schuldenzinsen (intern 1×/Tag pro Konto)
// Ressourcenschonend: keine Timer pro User/Kanal, alles läuft
// über die Datenbank. Intervalle mit unref() (blockieren kein Exit).
// ═══════════════════════════════════════════════════════════════
'use strict';

const db = require('../../core/db');
const config = require('../../core/config');
const logger = require('../../core/logger');

const automod = require('./automod');
const logSystem = require('./logSystem');
const aiModeration = require('./aiModeration');
const levelSystem = require('./levelSystem');
const steuern = require('./steuern');
const economy = require('./economy');
const giveaways = require('./giveaways');
const inviteTracking = require('./inviteTracking');
const reminders = require('./reminders');
const umfragen = require('./umfragen');
const boerse = require('./boerse');
const kredite = require('./kredite');
const immobilien = require('./immobilien');
const steuererklaerung = require('./steuererklaerung');
const polizei = require('./polizei');
const extras10 = require('./extras0_8_10');
const autobackup = require('./autobackup');
const wochenbericht = require('./wochenbericht');
const zielTracking = require('./zielTracking');
const { sweepCooldowns } = require('../events/interactionCreate');

let clientRef = null;

function init(client) {
  clientRef = client;

  // Live-Event-Überwachungen mit angebunden (Anti-Nuke, Logs)
  automod.init(client);
  logSystem.init(client);

  const t30 = setInterval(herzschlag30, 30000);
  const t60 = setInterval(herzschlag60, 60000);
  const tHour = setInterval(herzschlagStunde, 3600000);
  if (t30.unref) t30.unref();
  if (t60.unref) t60.unref();
  if (tHour.unref) tHour.unref();

    autobackup.init();
  wochenbericht.init(client);
  inviteTracking.init(client);
  autobackup.init();
  wochenbericht.init(client);
  inviteTracking.init(client);
    logger.ok('Scheduler gestartet (30 s / 60 s / 60 min Takte).');
}

// ── 30-Sekunden-Takt ────────────────────────────────────────────
async function herzschlag30() {
  if (!clientRef || !clientRef.isReady()) return;
  const jetzt = Date.now();
  try {
    // Tempbans & Unmutes aus "scheduled"
    for (const eintrag of db.values('scheduled')) {
      if (eintrag.faelligAm > jetzt) continue;
      db.del('scheduled', eintrag.id);
      if (eintrag.typ === 'tempban') {
        const guild = await clientRef.guilds.fetch(eintrag.guildId).catch(() => null);
        if (guild) {
          await guild.bans.remove(eintrag.userId, 'Tempban abgelaufen').catch(() => {});
          const s = config.getGuildSettings(eintrag.guildId);
          const ch = s.moderation.modLogChannel ? guild.channels.cache.get(s.moderation.modLogChannel) : null;
          if (ch) await ch.send(`⏰ Tempban abgelaufen: <@${eintrag.userId}> wurde automatisch entbannt.`).catch(() => {});
        }
      } else if (eintrag.typ === 'unmute') {
        const guild = await clientRef.guilds.fetch(eintrag.guildId).catch(() => null);
        if (guild) {
          const member = await guild.members.fetch(eintrag.userId).catch(() => null);
          const rolle = guild.roles.cache.find((r) => r.name === 'Muted');
          if (member && rolle && member.roles.cache.has(rolle.id)) {
            await member.roles.remove(rolle, 'Mute abgelaufen').catch(() => {});
            if (eintrag.channelId) {
              const ch = guild.channels.cache.get(eintrag.channelId);
              if (ch) await ch.send(`🔊 <@${eintrag.userId}> ist automatisch entmuteiert.`).catch(() => {});
            }
          }
        }
      }
    }
    // Reminders & Giveaways
    await reminders.pruefe(clientRef);
    await giveaways.pruefeBeendet(clientRef);
    await umfragen.pruefe(clientRef).catch(() => {});
    for (const [, g] of clientRef.guilds.cache) {
      await zielTracking.pruefe(g).catch(() => {});
    }
        await umfragen.pruefe(clientRef).catch(() => {});
    for (const [, g] of clientRef.guilds.cache) {
      await boerse.tick(g).catch(() => {});
      await kredite.tick(g).catch(() => {});
      await immobilien.tick(g).catch(() => {});
      await steuererklaerung.tick(g).catch(() => {});
      await polizei.gehaltTick(g).catch(() => {});
    }
    for (const [, g] of clientRef.guilds.cache) {
      await zielTracking.pruefe(g).catch(() => {});
    }
  } catch (e) {
    logger.warn('Scheduler (30 s): ' + e.message);
  }
}

// ── 60-Sekunden-Takt ────────────────────────────────────────────
async function herzschlag60() {
  if (!clientRef || !clientRef.isReady()) return;
  try {
    sweepCooldowns();
    aiModeration.sweepAll();

    for (const [, guild] of clientRef.guilds.cache) {
      const s = config.getGuildSettings(guild.id);

      // Voice-XP
      if (s.level.enabled) await levelSystem.voiceTick(guild, s).catch(() => {});

      // KI-Kontext-Batch
      if (s.aiMod.enabled && s.aiMod.contextBatch) {
        await aiModeration.runContextBatch(guild).catch(() => {});
      }

      // Vermögenssteuer: Fälligkeit + 24h-Warnung
      if (s.economy.wealthTax && s.economy.wealthTax.enabled) {
        await steuern.pruefeFaelligkeit(guild).catch(() => {});
      }

      // Lotterie-Ziehung (täglich zur konfigurierten Uhrzeit)
      await pruefeLotterie(guild, s).catch(() => {});
    }
  } catch (e) {
    logger.warn('Scheduler (60 s): ' + e.message);
  }
}

// ── Stunden-Takt (Zinsen) ───────────────────────────────────────
async function herzschlagStunde() {
  if (!clientRef || !clientRef.isReady()) return;
  try {
    for (const [, guild] of clientRef.guilds.cache) {
      await steuern.zinsenTick(guild).catch(() => {});
    }
  } catch (e) {
    logger.warn('Scheduler (Std): ' + e.message);
  }
}

// ── Lotterie (Jackpot gespeist aus der Serverkasse) ─────────────
async function pruefeLotterie(guild, s) {
  const dok = db.get('guilds', guild.id) || { id: guild.id };
  if (!dok.nextLottery) {
    dok.nextLottery = steuern.naechsterLauf('täglich', s.economy.announcementChannel ? '20:00' : '20:00');
    db.set('guilds', guild.id, dok);
    return;
  }
  if (Date.now() < dok.nextLottery) return;

  dok.nextLottery = steuern.naechsterLauf('täglich', '20:00');
  db.set('guilds', guild.id, dok);

  const lot = db.get('lottery', guild.id) || { id: guild.id, einsaetze: [] };
  const einsaetze = lot.einsaetze || [];
  lot.einsaetze = [];
  db.set('lottery', guild.id, lot);
  if (!einsaetze.length) return;

  const pot = einsaetze.reduce((sum, e) => sum + e.betrag, 0);
  // Jackpot-Boost aus der Serverkasse: 50 % des Pots (max. Kassenstand)
  const bonus = Math.min(economy.kasseGet(guild.id), Math.floor(pot * 0.5));
  if (bonus > 0) economy.kasseRemove(guild.id, bonus, 'Lotterie-Jackpot-Boost', 'Lotterie');
  const jackpot = pot + bonus;

  // Gewinner gewichtet nach Einsatz
  const gesamt = einsaetze.reduce((sum, e) => sum + e.betrag, 0);
  let los = Math.random() * gesamt;
  let gewinner = einsaetze[0].userId;
  for (const e of einsaetze) {
    los -= e.betrag;
    if (los <= 0) { gewinner = e.userId; break; }
  }

  const eco = economy.getEco(guild.id, gewinner);
  eco.bargeld += jackpot;
      try { const st3 = config.getGuildSettings(guild.id).staat; if (st3 && st3.enabled && st3.zahlt && st3.zahlt.lotterie) staat.zahlen(guild.id, jackpot, 'Lotterie-Auszahlung'); } catch (_) {} // STAAT-LOTTERIE
  economy.saveEco(eco);
  economy.transaktion(guild.id, gewinner, 'lottery', jackpot, `Jackpot (${einsaetze.length} Spieler)`);

  const chId = s.economy.announcementChannel;
  const ch = chId ? guild.channels.cache.get(chId) : null;
  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setTitle('🎰 Lotterie-Ziehung!')
    .setColor(0xE91E63)
    .setDescription(
      `**${einsaetze.length}** Spieler, Jackpot: **${jackpot.toLocaleString('de-DE')} ${s.economy.symbol}**\n` +
      `(davon ${bonus.toLocaleString('de-DE')} aus der Serverkasse 🏛️)\n\n` +
      ` Winner: <@${gewinner}> 🎉`
    )
    .setTimestamp();
  if (ch && ch.isTextBased()) await ch.send({ embeds: [embed] }).catch(() => {});
}

module.exports = { init };
