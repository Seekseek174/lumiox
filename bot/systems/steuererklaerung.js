// ═══════════════════════════════════════════════════════════════
// STEUERERKLÄRUNG: Perioden-Verwaltung + 4 Mini-Spiele + Rollover
// mit Hinterziehungs-Verdacht (Fangquote der Polizeiwache!).
// ═══════════════════════════════════════════════════════════════
'use strict';
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const logger = require('../../core/logger');

function periodeVon(ts) { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function periodeDok(gid) {
  const s = config.getGuildSettings(gid);
  const intervall = Math.max(7, Math.min(90, (s.steuererklaerung && s.steuererklaerung.intervallTage) || 30));
  let d = db.get('steuerPeriode', gid);
  if (!d) {
    d = { id: gid, guildId: gid, periode: periodeVon(Date.now()), start: Date.now(), ende: Date.now() + intervall * 86400000 };
    db.set('steuerPeriode', gid, d);
  }
  return d;
}
function statusFuer(gid, userId) {
  const p = periodeDok(gid);
  return db.get('steuer', gid + '_' + userId + '_' + p.periode);
}

// ── Mini-Spiele (Qualität 0–100) ──
async function frage(interaction, text, choices, korrektIndex, limitMs) {
  const rows = [new ActionRowBuilder().addComponents(choices.map((c, i) =>
    new ButtonBuilder().setCustomId('c' + i).setLabel(String(c).slice(0, 80)).setStyle(ButtonStyle.Secondary)))];
  const msg = await interaction.editReply({ content: text, components: rows, embeds: [] });
  return new Promise((resolve) => {
    const col = msg.createMessageComponentCollector({ time: limitMs, max: 1,
      filter: (i) => i.user.id === interaction.user.id });
    col.on('collect', (btn) => {
      const ok = btn.customId === 'c' + korrektIndex;
      btn.reply({ content: ok ? '✅ Richtig!' : '❌ Leider falsch.', ephemeral: true }).catch(() => {});
      resolve(ok);
    });
    col.on('end', (c) => { if (!c.size) resolve(false); });
  });
}

async function spielStarten(interaction, spiel) {
  const gid = interaction.guild.id;
  let qualitaet = 0;
  if (spiel === 'mathe') {
    const einkommen = 500 + Math.floor(Math.random() * 30) * 100;
    const satz = [10, 15, 20, 25][Math.floor(Math.random() * 4)];
    const korrekt = Math.round(einkommen * satz / 100);
    const opts = new Set([korrekt]);
    let guard = 0;
    while (opts.size < 4 && guard++ < 50) opts.add(korrekt + [10, -10, 25, -25, 37, -37, 50][Math.floor(Math.random() * 7)]);
    const arr = [...opts].slice(0, 4).sort(() => Math.random() - 0.5);
    const ok = await frage(interaction, `🧮 **Steuer-Mathe:**\nEinkommen: **${einkommen} 🪙** · Steuersatz: **${satz} %**\n\nWie hoch ist die Steuer?`,
      arr, arr.indexOf(korrekt), 20000);
    qualitaet = ok ? 100 : 25;
  } else if (spiel === 'blitz') {
    const a = 120 + Math.floor(Math.random() * 400);
    const b = 20 + Math.floor(Math.random() * 90);
    const korrekt = a - b;
    const arr = [korrekt, korrekt + 10, korrekt - 15, korrekt + 25].sort(() => Math.random() - 0.5);
    const ok = await frage(interaction, `⏱️ **Blitz-Rechnung (9 Sekunden!):**\n\n## ${a} − ${b} = ?`,
      arr, arr.indexOf(korrekt), 9000);
    qualitaet = ok ? 100 : 25;
  } else if (spiel === 'roulette') {
    const icons = ['🪙', '📄', '🏛️', '💼'];
    const w = [0, 1, 2].map(() => icons[Math.floor(Math.random() * icons.length)]);
    let q = 30;
    if (w[0] === w[1] && w[1] === w[2]) q = 100;
    else if (w[0] === w[1] || w[1] === w[2] || w[0] === w[2]) q = 60;
    await interaction.editReply({ content: `🍀 **Ehrlichkeits-Wurf:**\n\n${w.join(' ')} ${w.join(' ')} ${w.join(' ')}\n\nDeine Ehrlichkeit: **${q} %**`, components: [], embeds: [] });
    qualitaet = q;
  } else if (spiel === 'memory') {
    const zahl = String(1000 + Math.floor(Math.random() * 9000));
    await interaction.editReply({ content: `🧠 **Merke dir diese Zahl** (3,5 Sekunden):\n\n# ${zahl}`, components: [], embeds: [] });
    await new Promise((r) => setTimeout(r, 3500));
    const arr = [zahl, String(Number(zahl) + 7), String(Number(zahl) - 13), String(Number(zahl) + 101)].sort(() => Math.random() - 0.5);
    const ok = await frage(interaction, '🧠 **Wie lautete die Zahl?**', arr, arr.indexOf(zahl), 12000);
    qualitaet = ok ? 100 : 25;
  }

  const p = periodeDok(gid);
  const erledigt = qualitaet >= 40;
  db.set('steuer', gid + '_' + interaction.user.id + '_' + p.periode, {
    id: gid + '_' + interaction.user.id + '_' + p.periode,
    guildId: gid, userId: interaction.user.id, periode: p.periode,
    status: erledigt ? 'erledigt' : 'gescheitert', spiel, qualitaet, zeit: Date.now(),
  });
  let bonus = 0;
  if (erledigt && qualitaet >= 60) {
    const s = config.getGuildSettings(gid);
    bonus = 50 + Math.round(qualitaet / 2);
    if (s.staat && s.staat.enabled) bonus = require('./staat').zahlen(gid, bonus, 'Steuererklärungs-Bonus');
    const eco = economy.getEco(gid, interaction.user.id);
    eco.bargeld += bonus;
    economy.saveEco(eco);
  }
  const e = new EmbedBuilder()
    .setTitle(erledigt ? '✅ Steuererklärung abgegeben' : '❌ Steuererklärung FEHLGESCHLAGEN')
    .setColor(erledigt ? 0x2ECC71 : 0xE74C3C)
    .setDescription(`Ehrlichkeits-Qualität: **${qualitaet} %**` +
      (bonus ? `\n\n💸 Bonus-Auszahlung vom Staat: **${bonus.toLocaleString('de-DE')} 🪙**` : ''));
  await interaction.editReply({ content: '', embeds: [e], components: [] }).catch(() => {});
  return { qualitaet, erledigt };
}

// ── Perioden-Rollover: Verpasste ermitteln + Fahndung ──
async function tick(guild) {
  const s = config.getGuildSettings(guild.id);
  const cfgS = s.steuererklaerung || {};
  const d = periodeDok(guild.id);
  if (Date.now() < d.ende) return;
  const mindest = cfgS.mindestVermoegen != null ? cfgS.mindestVermoegen : 1000;
  const strafeP = cfgS.strafeProzent != null ? cfgS.strafeProzent : 5;
  const polizei = require('./polizei');
  const staat = require('./staat');
  const chance = polizei.fangChance(guild.id);
  let erwischt = 0;
  for (const eco of db.values('economy')) {
    if (eco.guildId !== guild.id) continue;
    if (db.get('steuer', guild.id + '_' + eco.userId + '_' + d.periode)) continue;
    const verm = (eco.bargeld || 0) + (eco.bank || 0);
    if (verm < mindest) continue;
    if (Math.random() * 100 < chance) {
      const strafe = Math.max(100, Math.floor(verm * strafeP / 100));
      const vonB = Math.min(eco.bargeld || 0, strafe);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - vonB);
      eco.bank = Math.max(0, (eco.bank || 0) - (strafe - vonB));
      economy.saveEco(eco);
      staat.einzahlen(guild.id, strafe, 'Steuerstrafe (Hinterziehung)');
      await polizei.belohnen(guild, strafe).catch(() => {});
      erwischt++;
      db.set('steuer', guild.id + '_' + eco.userId + '_' + d.periode, {
        id: guild.id + '_' + eco.userId + '_' + d.periode, guildId: guild.id,
        userId: eco.userId, periode: d.periode, status: 'verpasst-erwischt',
        strafe, zeit: Date.now(),
      });
      const user = await guild.client.users.fetch(eco.userId).catch(() => null);
      if (user) user.send(`🚔 **Steuerhinterziehung aufgedeckt!** Du hast die Steuererklärung verpasst.\nStrafe: **${strafe.toLocaleString('de-DE')} 🪙**`).catch(() => {});
    } else {
      db.set('steuer', guild.id + '_' + eco.userId + '_' + d.periode, {
        id: guild.id + '_' + eco.userId + '_' + d.periode, guildId: guild.id,
        userId: eco.userId, periode: d.periode, status: 'verpasst', zeit: Date.now(),
      });
    }
  }
  logger.info(`Steuerperiode ${d.periode} beendet (${guild.name}): ${erwischt} Hinterzieher erwischt (Fangquote ${chance} %)`);
  db.set('steuerPeriode', guild.id, {
    id: guild.id, guildId: guild.id, periode: periodeVon(Date.now()),
    start: Date.now(), ende: Date.now() + Math.max(7, Math.min(90, (cfgS.intervallTage) || 30)) * 86400000,
  });
}

module.exports = { periodeDok, statusFuer, spielStarten, tick, SPIELE: ['mathe', 'blitz', 'roulette', 'memory'] };
