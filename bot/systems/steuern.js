// ═══════════════════════════════════════════════════════════════
// STEUERSYSTEM
//  - Einkommensteuer: flach ODER progressive Staffeln
//  - Transaktionssteuer: fester Prozentsatz
//  - Vermögenssteuer: periodisch (täglich/wöchentlich/monatlich
//    + Uhrzeit), progressive Staffeln, 24-h-Warnung, Fälligkeit
//    per Cron-Logik (aufgerufen vom zentralen Scheduler)
//  - Schulden mit Tageszins, Schuldner-Rolle
//  - ALLE Einnahmen fließen in die Serverkasse (Treasury)
// ═══════════════════════════════════════════════════════════════
'use strict';

const { EmbedBuilder } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const logger = require('../../core/logger');

// ── Mathematik ──────────────────────────────────────────────────
// Progressive Staffel: [{ bis: 1000, percent: 0 }, { bis: null, percent: 10 }]
// "bis: null" = offen nach oben. Jede Stufe besteuert nur ihren Abschnitt.
function progressiv(betrag, tiers) {
  let steuer = 0;
  let vorher = 0;
  for (const t of tiers || []) {
    const grenze = t.bis == null ? Infinity : Number(t.bis);
    const anteil = Math.max(0, Math.min(betrag, grenze) - vorher);
    if (anteil > 0) steuer += anteil * ((t.percent || 0) / 100);
    vorher = grenze;
    if (betrag <= grenze) break;
  }
  return Math.floor(steuer);
}

function staffelText(tiers, symbol) {
  return (tiers || []).map((t) => {
    const bis = t.bis == null ? 'unbegrenzt' : `${Number(t.bis).toLocaleString('de-DE')} ${symbol}`;
    return `• bis **${bis}**: **${t.percent} %**`;
  }).join('\n');
}

// Einkommensteuer auf /work & /daily
function einkommensteuer(s, brutto, klasse) {
  if (klasse && Number(klasse.incomePercent) >= 0) {
    const p = Number(klasse.incomePercent);
    const steuer = Math.floor(brutto * (p / 100));
    return { steuer, netto: brutto - steuer, prozent: p, staffel: false, klasse: klasse.name };
  }
  const econ = s.economy;
  if ((econ.incomeTaxPercent || 0) > 0) {
    const steuer = Math.floor(brutto * (econ.incomeTaxPercent / 100));
    return { steuer, netto: brutto - steuer, prozent: econ.incomeTaxPercent, staffel: false };
  }
  const steuer = progressiv(brutto, econ.incomeTaxTiers);
  const prozent = brutto > 0 ? Math.round((steuer / brutto) * 1000) / 10 : 0;
  return { steuer, netto: brutto - steuer, prozent, staffel: true };
}

// Transaktionssteuer auf /pay
function transaktionssteuer(s, betrag, klasse) {
  if (klasse && Number(klasse.txPercent) >= 0) {
    const p = Number(klasse.txPercent);
    const steuer = Math.floor(betrag * (p / 100));
    return { steuer, netto: betrag - steuer };
  }
  const steuer = Math.floor(betrag * ((s.economy.transactionTaxPercent || 0) / 100));
  return { steuer, netto: betrag - steuer };
}

// Vermögenssteuer auf Gesamtvermögen
function vermoegenssteuer(s, verm, klasse) {
  const basis = progressiv(verm, (s.economy.wealthTax && s.economy.wealthTax.tiers) || []);
  if (klasse && Number(klasse.wealthMultiplier) !== 1) {
    return Math.floor(basis * Math.max(0, Number(klasse.wealthMultiplier)));
  }
  return basis;
}

// Steuerklasse eines Users finden (null = Standard/global)
function klasseFuer(s, eco) {
  const sk = s && s.steuerklassen;
  if (!sk || !sk.enabled || !Array.isArray(sk.klassen) || !eco || !eco.steuerklasse) return null;
  return sk.klassen.find((k) => k.name === eco.steuerklasse) || null;
}

// ── Fälligkeits-Logik (Cron) ────────────────────────────────────
// Nächster Lauf: heute/morgen zur konfigurierten Uhrzeit;
// wöchentlich = Montag, monatlich = 1. des Monats.
function naechsterLauf(intervall, uhrzeit) {
  const [h, m] = String(uhrzeit || '20:00').split(':').map((n) => parseInt(n, 10) || 0);
  const jetzt = new Date();
  const d = new Date(jetzt);
  d.setHours(h, m, 0, 0);
  if (d <= jetzt) d.setDate(d.getDate() + 1);
  if (intervall === 'wöchentlich') { let guard = 0; while (d.getDay() !== 1 && guard++ < 8) d.setDate(d.getDate() + 1); }
  if (intervall === 'monatlich')   { let guard = 0; while (d.getDate() !== 1 && guard++ < 32) d.setDate(d.getDate() + 1); }
  return d.getTime();
}

function faelligkeitInfo(guildId) {
  const s = config.getGuildSettings(guildId);
  const wt = s.economy.wealthTax;
  if (!wt || !wt.enabled) return null;
  const dok = db.get('guilds', guildId) || {};
  const ts = dok.nextWealthTax || naechsterLauf(wt.intervall, wt.uhrzeit);
  return { ts, intervall: wt.intervall, uhrzeit: wt.uhrzeit };
}

async function sendeKanalNachricht(guild, inhalt, embed = null) {
  const s = config.getGuildSettings(guild.id);
  const chId = s.economy.announcementChannel || s.moderation.modLogChannel;
  if (!chId) return;
  const ch = guild.channels.cache.get(chId);
  if (ch && ch.isTextBased()) await ch.send({ content: inhalt, embeds: embed ? [embed] : [] }).catch(() => {});
}

// 24-Stunden-Warnung + Fälligkeitsprüfung (vom Scheduler aufgerufen)
async function pruefeFaelligkeit(guild) {
  const s = config.getGuildSettings(guild.id);
  const wt = s.economy.wealthTax;
  if (!wt || !wt.enabled) return;

  const dok = db.get('guilds', guild.id) || { id: guild.id };
  if (!dok.nextWealthTax) {
    dok.nextWealthTax = naechsterLauf(wt.intervall, wt.uhrzeit);
    db.set('guilds', guild.id, dok);
    return;
  }
  const jetzt = Date.now();

  // Fällig? → ziehen
  if (jetzt >= dok.nextWealthTax) {
    dok.nextWealthTax = naechsterLauf(wt.intervall, wt.uhrzeit);
    dok.wealthTaxWarnKey = null;
    db.set('guilds', guild.id, dok);
    await runVermoegenssteuer(guild);
    return;
  }

  // 24-h-Warnung (einmal pro Zyklus)
  const warnAb = dok.nextWealthTax - (wt.warnHoursBefore || 24) * 3600000;
  if (jetzt >= warnAb && dok.wealthTaxWarnKey !== dok.nextWealthTax) {
    dok.wealthTaxWarnKey = dok.nextWealthTax;
    db.set('guilds', guild.id, dok);
    const e = new EmbedBuilder()
      .setTitle('⚠️ Vermögenssteuer fällt bald an!')
      .setColor(0xF39C12)
      .setDescription(
        `In weniger als **${wt.warnHoursBefore} Stunden** wird die Vermögenssteuer fällig.\n` +
        `Schau mit \`/steuern\` nach, was dich erwartet – wer nicht zahlen kann, bekommt **Schulden mit Zinsen**!`
      )
      .setTimestamp();
    await sendeKanalNachricht(guild, '💰 **Steuer-Erinnerung**', e);
  }
}

// Die eigentliche Vermögenssteuer-Ziehung
async function runVermoegenssteuer(guild) {
  const s = config.getGuildSettings(guild.id);
  const wt = s.economy.wealthTax;
  let eingenommen = 0;
  let schuldner = 0;
  const konten = db.values('economy').filter((e) => e.guildId === guild.id);

  for (const eco of konten) {
    const verm = economy.vermoegen(eco);
    const steuer = vermoegenssteuer(s, verm, klasseFuer(s, eco));
    if (steuer <= 0) continue;

    const verfuegbar = eco.bargeld + eco.bank;
    if (verfuegbar >= steuer) {
      // Erst Bargeld, dann Bank leeren
      const vonBargeld = Math.min(eco.bargeld, steuer);
      eco.bargeld -= vonBargeld;
      eco.bank -= (steuer - vonBargeld);
      economy.saveEco(eco);
      economy.kasseAdd(guild.id, steuer, 'Vermögenssteuer', 'Steuersystem');
      economy.transaktion(guild.id, eco.userId, 'steuer_vermoegen', -steuer, 'Vermögenssteuer');
      eingenommen += steuer;
    } else {
      // Kann nicht zahlen → Schulden + Zinsen
      const fehlt = steuer - verfuegbar;
      eco.bargeld = 0;
      eco.bank = 0;
      eco.schulden = (eco.schulden || 0) + fehlt;
      eco.lastZinsTag = new Date().toISOString().slice(0, 10); // Zinsen erst ab morgen
      economy.saveEco(eco);
      economy.transaktion(guild.id, eco.userId, 'steuer_schulden', -fehlt, 'Vermögenssteuer → Schulden');
      await economy.ensureDebtRole(guild, eco).catch(() => {});
      schuldner++;
    }
    // User persönlich informieren (DM, kann fehlschlagen)
    const user = await guild.client.users.fetch(eco.userId).catch(() => null);
    if (user) {
      await user.send(`💰 **Vermögenssteuer** auf ${guild.name}: ${steuer.toLocaleString('de-DE')} ${s.economy.symbol}` +
        (eco.schulden > 0 ? `\n⚠️ Du konntest nicht zahlen und hast jetzt **${eco.schulden.toLocaleString('de-DE')} Schulden** (+${s.economy.debtInterestPerDay} % Zinsen/Tag).` : '')
      ).catch(() => {});
    }
  }

  const e = new EmbedBuilder()
    .setTitle('🏛️ Vermögenssteuer gezogen')
    .setColor(0x3498DB)
    .addFields(
      { name: 'Eingenommen', value: `${eingenommen.toLocaleString('de-DE')} ${s.economy.symbol}`, inline: true },
      { name: 'Neue Schuldner', value: String(schuldner), inline: true },
      { name: 'Serverkasse', value: `${economy.kasseGet(guild.id).toLocaleString('de-DE')} ${s.economy.symbol}`, inline: true },
    )
    .setTimestamp();
  await sendeKanalNachricht(guild, '🏛️ **Steuerbericht**', e);
  logger.info(`Vermögenssteuer ${guild.name}: +${eingenommen}, ${schuldner} Schuldner`);
}

// ── Zinsen (Bank & Schulden), einmal pro Tag ────────────────────
async function zinsenTick(guild) {
  const s = config.getGuildSettings(guild.id);
  const heute = new Date().toISOString().slice(0, 10);
  const konten = db.values('economy').filter((e) => e.guildId === guild.id);

  for (const eco of konten) {
    if (eco.lastZinsTag === heute) continue;
    eco.lastZinsTag = heute;
    let geaendert = false;

    // Bankzinsen
    if (eco.bank > 0 && s.economy.bankInterestPerDay > 0) {
      const zins = Math.floor(eco.bank * (s.economy.bankInterestPerDay / 100));
      if (zins > 0) {
        eco.bank += zins;
        economy.transaktion(guild.id, eco.userId, 'zins', zins, 'Bankzinsen');
        geaendert = true;
      }
    }
    // Schuldenzinsen
    if (eco.schulden > 0 && s.economy.debtInterestPerDay > 0) {
      const zins = Math.ceil(eco.schulden * (s.economy.debtInterestPerDay / 100));
      eco.schulden += zins;
      economy.transaktion(guild.id, eco.userId, 'zins_schulden', zins, 'Schuldenzinsen');
      geaendert = true;
      await economy.ensureDebtRole(guild, eco).catch(() => {});
    }
    if (geaendert) economy.saveEco(eco);
  }
}

module.exports = {
  progressiv, staffelText, klasseFuer,
  einkommensteuer, transaktionssteuer, vermoegenssteuer,
  naechsterLauf, faelligkeitInfo,
  pruefeFaelligkeit, runVermoegenssteuer, zinsenTick,
};
