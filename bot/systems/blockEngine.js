'use strict';
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const levelSystem = require('./levelSystem');
const logger = require('../../core/logger');
let _client = null;
function getClient() { if (!_client) _client = require('../../bot/client').getClient(); return _client; }
let STOP = false;

function fill(t, i, v) {
  v = v || {};
  let x = String(t || '');
  try {
    x = x.split('{user}').join('<@' + i.user.id + '>')
      .split('{username}').join(i.user.username)
      .split('{server}').join(i.guild.name)
      .split('{member}').join(String(i.guild.memberCount))
      .split('{var}').join(String(v.varValue != null ? v.varValue : ''));
  } catch (_) {}
  return x;
}
function varGet(ctx, k) { ctx.vars = ctx.vars || {}; return ctx.vars[k]; }
function varSet(ctx, k, val) { ctx.vars = ctx.vars || {}; ctx.vars[k] = val; }

async function ausfuehren(bloecke, interaction, ctx) {
  ctx = ctx || {};
  for (const b of bloecke || []) {
    try {
      const r = await blockAus(b, interaction, ctx);
      if (r === 'ABBRUCH') break;
    } catch (e) {
      // FEHLER ABGEFANGEN: Block-Fehler stoppen NICHT die Kette
      logger.warn('Block [' + (b.typ || '?') + ']: ' + e.message);
    }
  }
}


async function ausf(b, i, ctx) {
  const gid = i.guild ? i.guild.id : null;
  const member = i.member;
  const s = gid ? config.getGuildSettings(gid) : config.get();
  switch (b.typ) {
    // ── MESSAGE ──
    case 'respond': {
      const t = fill(b.text, i, ctx);
      if (b.embed) {
        const e = new EmbedBuilder().setColor(parseInt(b.color || '5865F2', 16)).setDescription(t);
        if (b.title) e.setTitle(fill(b.title, i, ctx));
        return i.reply({ embeds: [e], flags: b.ephemeral ? 64 : 0 });
      }
      return i.reply({ content: t.slice(0, 1900), flags: b.ephemeral ? 64 : 0 });
    }
    case 'send_channel': {
      const ch = i.guild.channels.cache.get(b.kanal);
      if (ch && ch.isTextBased()) await ch.send(fill(b.text, i, ctx).slice(0, 1900));
      return 'out';
    }
    case 'dm':
      await i.user.send(fill(b.text, i, ctx).slice(0, 1900)).catch(() => {});
      return 'out';
    case 'delete_msg': {
      try { await i.channel.messages.fetch(b.msgId).then((m) => m.delete()); } catch (_) {}
      return 'out';
    }
    case 'publish': {
      if (i.channel.isTextBased() && i.channel.type === 5) {
        const m = await i.channel.messages.fetch({ limit: 1 });
        if (m.first()) await m.first().crosspost().catch(() => {});
      }
      return 'out';
    }
    case 'react_msg': {
      const m = b.msgId ? await i.channel.messages.fetch(b.msgId).catch(() => null) : i.message;
      if (m) await m.react(b.emoji || '👍').catch(() => {});
      return 'out';
    }
    case 'pin_msg': {
      const m = b.msgId ? await i.channel.messages.fetch(b.msgId).catch(() => null) : i.message;
      if (m) await m.pin().catch(() => {});
      return 'out';
    }
    case 'create_transcript': {
      const msgs = await i.channel.messages.fetch({ limit: 50 });
      const txt = [...msgs.values()].reverse().map((m) => m.author.username + ': ' + m.content).join('\n').slice(0, 1800);
      const ch = i.guild.channels.cache.get(b.kanal);
      if (ch && ch.isTextBased()) await ch.send('📄 Transkript von #' + i.channel.name + ':\n```' + txt.slice(0, 1500) + '```').catch(() => {});
      return 'out';
    }
    case 'wait':
      await new Promise((r) => setTimeout(r, Math.min(60000, Math.max(100, (Number(b.sekunden) || 1) * 1000))));
      return 'out';
    case 'manipulate': {
      let t = fill(b.text, i, ctx);
      if (b.mode === 'upper') t = t.toUpperCase();
      else if (b.mode === 'lower') t = t.toLowerCase();
      else if (b.mode === 'replace') t = t.split(b.suche).join(b.ersetze);
      varSet(ctx, 'text', t);
      return 'out';
    }
    case 'error_log': {
      logger.error('Block-Fehler (absichtlich): ' + fill(b.text, i, ctx));
      return 'out';
    }
    // ── VARIABLES ──
    case 'set_var': varSet(ctx, b.name || 'var', fill(b.wert, i, ctx)); return 'out';
    case 'run_equation': {
      try {
        const expr = String(b.equation || '').replace(/[^0-9+\-*/(). ]/g, '');
        varSet(ctx, b.name || 'result', Function('"use strict";return (' + expr + ')')());
      } catch (_) {}
      return 'out';
    }
    case 'delete_var': { if (ctx.vars) delete ctx.vars[b.name]; return 'out'; }
    // ── API ──
    case 'fetch_api': {
      try {
        const r = await fetch(b.url);
        const j = await r.json();
        varSet(ctx, b.varName || 'api', JSON.stringify(j).slice(0, 1500));
      } catch (_) {}
      return 'out';
    }
    // ── LOOPS ──
    case 'run_loop': {
      const n = Math.max(1, Math.min(20, Number(b.mal) || 3));
      for (let z = 0; z < n; z++) {
        if (STOP) break;
        if (b.dann && b.dann.length) await ausfuehren(b.dann, i, ctx);
      }
      return 'out';
    }
    case 'stop_loop': STOP = true; return 'out';
    // ── VOICE ──
    case 'join_voice': {
      const vc = i.guild.channels.cache.get(b.kanal);
      try { await vc.join(); } catch (_) {}
      return 'out';
    }
    case 'leave_voice': {
      const conn = i.guild.voiceStates && i.guild.me.voice;
      try { await i.guild.me.voice.disconnect().catch(() => {}); } catch (_) {}
      return 'out';
    }
    // ── CONDITIONS ──
    case 'comparison': {
      let a2 = fill(b.wertA, i, ctx), b2 = fill(b.wertB, i, ctx);
      const na = Number(a2), nb = Number(b2);
      let erg = false;
      if (!isNaN(na) && !isNaN(nb)) {
        erg = b.op === '>' ? na > nb : b.op === '<' ? na < nb : b.op === '=' ? na === nb : b.op === '>=' ? na >= nb : na <= nb;
      } else erg = a2 === b2;
      const zweig = erg ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    case 'random': {
      const t = Math.random() * 100 < Math.max(1, Math.min(100, Number(b.chance) || 50));
      const zweig = t ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    case 'permission': {
      const hat = member && member.permissions.has(PermissionFlagsBits[b.perm || 'ManageMessages']);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    case 'role_cond': {
      const hat = member && member.roles.cache.has(b.rolle);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    case 'channel_cond': {
      const ok2 = i.channel.id === b.kanal;
      const zweig = ok2 ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    case 'user_cond': {
      const ok2 = i.user.id === b.user;
      const zweig = ok2 ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], i, ctx);
      return 'out';
    }
    // ── ROLES ──
    case 'add_roles': {
      for (const r of (b.rolle || '').split(',')) {
        const rolle = i.guild.roles.cache.get(r.trim());
        if (rolle && member) await member.roles.add(rolle).catch(() => {});
      }
      return 'out';
    }
    case 'remove_roles': {
      for (const r of (b.rolle || '').split(',')) {
        const rolle = i.guild.roles.cache.get(r.trim());
        if (rolle && member) await member.roles.remove(rolle).catch(() => {});
      }
      return 'out';
    }
    case 'add_role_all': {
      const rolle = i.guild.roles.cache.get(b.rolle);
      if (rolle) {
        const ms = await i.guild.members.fetch().catch(() => null);
        if (ms) for (const [, m] of ms) { if (!m.user.bot) await m.roles.add(rolle).catch(() => {}); }
      }
      return 'out';
    }
    case 'create_role': {
      await i.guild.roles.create({ name: b.name || 'Neue Rolle', color: b.farbe || '99AAB5' }).catch(() => {});
      return 'out';
    }
    case 'delete_role': {
      const rolle = i.guild.roles.cache.get(b.rolle);
      if (rolle) await rolle.delete().catch(() => {});
      return 'out';
    }
    // ── CHANNELS / THREADS ──
    case 'create_channel': {
      await i.guild.channels.create({ name: fill(b.name, i, ctx) || 'neu', type: 0 }).catch(() => {});
      return 'out';
    }
    case 'delete_channel': {
      const ch = i.guild.channels.cache.get(b.kanal);
      if (ch) await ch.delete().catch(() => {});
      return 'out';
    }
    case 'create_thread': {
      await i.channel.threads.create({ name: fill(b.name, i, ctx) || 'Thread' }).catch(() => {});
      return 'out';
    }
    // ── SERVER ──
    case 'kick': {
      const m = await i.guild.members.fetch(b.user).catch(() => null);
      if (m && m.kickable) await m.kick(fill(b.grund, i, ctx)).catch(() => {});
      return 'out';
    }
    case 'ban': {
      const m = await i.guild.members.fetch(b.user).catch(() => null);
      if (m && m.bannable) await m.ban({ reason: fill(b.grund, i, ctx) }).catch(() => {});
      return 'out';
    }
    case 'timeout': {
      const m = await i.guild.members.fetch(b.user).catch(() => null);
      if (m && m.moderatable) await m.timeout((Number(b.min) || 10) * 60000).catch(() => {});
      return 'out';
    }
    case 'nickname': {
      const m = await i.guild.members.fetch(b.user).catch(() => null);
      if (m) await m.setNickname(fill(b.name, i, ctx)).catch(() => {});
      return 'out';
    }
    case 'purge': {
      const ms = await i.channel.messages.fetch({ limit: Math.min(100, Number(b.anzahl) || 10) });
      await i.channel.bulkDelete(ms, true).catch(() => {});
      return 'out';
    }
    case 'invite': {
      const inv = await i.channel.createInvite({ maxAge: Number(b.stunden) * 3600 || 86400 }).catch(() => null);
      if (inv) await i.channel.send('🔗 ' + inv.url).catch(() => {});
      return 'out';
    }
    // ── WIRTSCHAFT / XP (Bestand) ──
    case 'add_money': {
      const eco = economy.getEco(gid, i.user.id);
      eco.bargeld += Math.round(Number(b.menge) || 0);
      economy.saveEco(eco);
      return 'out';
    }
    case 'remove_money': {
      const eco = economy.getEco(gid, i.user.id);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - Math.abs(Math.round(Number(b.menge) || 0)));
      economy.saveEco(eco);
      return 'out';
    }
    case 'add_xp': {
      await levelSystem.addXp(member, Math.max(1, Number(b.menge) || 10), s);
      return 'out';
    }
    case 'abbruch': return 'ABBRUCH';
    case 'cooldown_user': {
      const key = 'stud_cool_' + interaction.commandName + '_' + interaction.user.id;
      const bis = db.get('counters', key) || 0;
      if (Date.now() < bis) {
        const rest = Math.ceil((bis - Date.now()) / 60000);
        await interaction.reply({ content: '⏳ Warte noch ' + rest + ' Min.!', ephemeral: true });
        return 'ABBRUCH';
      }
      db.set('counters', key, Date.now() + (Number(b.minuten) || 5) * 60000);
      return 'ok';
    }
    case 'var_vergleich': {
      const a2 = varGet(ctx, b.name || 'var'), b2 = fill(b.wert, interaction);
      const erg = String(a2) === String(b2) ? 'dann' : 'sonst';
      if (b[erg] && b[erg].length) await ausfuehren(b[erg], interaction, ctx);
      return erg;
    }
    case 'zufalls_nachricht': {
      const liste = (b.nachrichten || '').split('|').map((x) => x.trim()).filter(Boolean);
      if (liste.length) await interaction.reply(fuellen(liste[Math.floor(Math.random() * liste.length)], interaction));
      return 'ok';
    }
    case 'embed_felder': {
      const e = new EmbedBuilder().setColor(parseInt(b.color || '5865F2', 16)).setDescription(fill(b.text, interaction));
      if (b.title) e.setTitle(fill(b.title, interaction));
      for (const paar of (b.felder || '').split('|')) {
        const [n, v] = paar.split('=');
        if (n && v) e.addFields({ name: fill(n, interaction).slice(0, 250), value: fill(v, interaction).slice(0, 1000) });
      }
      return interaction.reply({ embeds: [e] });
    }
    case 'webseite': {
      const inv = await interaction.channel.createInvite({ maxAge: 86400 }).catch(() => null);
      const e = new EmbedBuilder().setTitle(fill(b.titel, interaction) || '🔗 Link').setColor(0x5865F2);
      if (b.url) e.setURL(b.url);
      if (b.bild) e.setImage(b.bild);
      e.setDescription(fill(b.text, interaction));
      return interaction.reply({ embeds: [e] });
    }
    default: return 'unbekannt';
  }
}

async function fuehreCustomAus(cmd, interaction) {
  // GRAPH-MODUS: nodes + edges aus dem Visual-Editor folgen
  if (cmd.nodes && cmd.nodes.length && cmd.edges) {
    const map = new Map(cmd.nodes.map((n) => [n.id, n]));
    const out = new Map();
    for (const e of cmd.edges) {
      if (!out.has(e.from)) out.set(e.from, []);
      out.get(e.from).push(e);
    }
    let cur = cmd.nodes.find((n) => n.typ === 'start');
    let guard = 0;
    while (cur && guard++ < 300) {
      const block = Object.assign({ typ: cur.typ }, cur.felder || {});
      const port = await blockAus(block, interaction, {});
      if (port === 'ABBRUCH') break;
      const moeglich = out.get(cur.id) || [];
      const weiter = moeglich.find((e) => e.fromPort === port) || moeglich.find((e) => e.fromPort === 'out') || moeglich[0];
      cur = weiter ? map.get(weiter.to) : null;
    }
    return 'graph fertig';
  }
  if (cmd.roles && cmd.roles.length && interaction.member) {
    const hat = interaction.member.roles.cache.some((r) => cmd.roles.includes(r.id));
    if (!hat) return interaction.reply({ content: '⛔ Keine Berechtigung.', flags: 64 });
  }
  if (cmd.cooldown) {
    const key = 'blockcd_' + cmd.name + '_' + interaction.user.id;
    const bis = db.get('counters', key) || 0;
    if (Date.now() < bis) return interaction.reply({ content: '⏳ Cooldown aktiv.', flags: 64 });
    db.set('counters', key, Date.now() + cmd.cooldown * 1000);
  }
  if (cmd.nodes && cmd.nodes.length && cmd.edges) {
    const nodes = cmd.nodes, edges = cmd.edges;
    const map = new Map(nodes.map((n) => [n.id, n]));
    const out = new Map();
    for (const e of edges) { if (!out.has(e.from)) out.set(e.from, []); out.get(e.from).push(e); }
    let cur = nodes.find((n) => n.typ === 'start');
    let guard = 0;
    while (cur && guard++ < 300) {
      const r = await ausf({ typ: cur.typ, ...cur.felder }, interaction, {});
      if (r === 'ABBRUCH') break;
      const next = (out.get(cur.id) || []).find((e) => e.fromPort === r) || (out.get(cur.id) || [])[0];
      cur = next ? map.get(next.to) : null;
    }
    return 'graph';
  }
  if (cmd.blocks && cmd.blocks.length) return ausfuehren(cmd.blocks, interaction, {});
  return interaction.reply({ content: cmd.response || '…' });
}

function fuellen(t, interaction) {
  let x = String(t || '');
  try {
    x = x.split('{user}').join('<@' + interaction.user.id + '>')
         .split('{username}').join(interaction.user.username)
         .split('{server}').join(interaction.guild.name)
         .split('{member}').join(String(interaction.guild.memberCount));
  } catch (_) {}
  return x;
}

async function blockAus(b, interaction, ctx) {
  const gid = interaction.guild.id;
  const member = interaction.member;
  const s = config.getGuildSettings(gid);
  switch (b.typ) {
    case 'respond': {
      const t = fuellen(b.text || '', interaction);
      if (b.embed) {
        const e = new EmbedBuilder().setColor(parseInt(b.color || '5865F2', 16)).setDescription(t);
        if (b.title) e.setTitle(fuellen(b.title, interaction));
        return interaction.reply({ embeds: [e], flags: b.ephemeral ? 64 : 0 });
      }
      return interaction.reply({ content: t.slice(0, 1900), flags: b.ephemeral ? 64 : 0 });
    }
    case 'send_channel': {
      const ch = interaction.guild.channels.cache.get(b.kanal);
      if (ch && ch.isTextBased()) await ch.send(fuellen(b.text || '', interaction).slice(0, 1900));
      return 'out';
    }
    case 'dm':
      await interaction.user.send(fuellen(b.text || '', interaction).slice(0, 1900)).catch(() => {});
      return 'out';
    case 'add_money': {
      const eco = economy.getEco(gid, interaction.user.id);
      eco.bargeld += Math.round(Number(b.menge) || 0);
      economy.saveEco(eco);
      return b.dann && !b.sonst ? 'dann' : 'sonst';
    }
    case 'remove_money': {
      const eco = economy.getEco(gid, interaction.user.id);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - Math.abs(Math.round(Number(b.menge) || 0)));
      economy.saveEco(eco);
      return 'ok';
    }
    case 'add_xp':
      await levelSystem.addXp(member, Math.max(1, Number(b.menge) || 10), s);
      return 'ok';
    case 'give_role': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r && member) await member.roles.add(r, 'Block').catch(() => {});
      return 'ok';
    }
    case 'remove_role': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r && member) await member.roles.remove(r, 'Block').catch(() => {});
      return 'ok';
    }
    case 'delay':
      await new Promise((r) => setTimeout(r, Math.min(60000, Math.max(100, (Number(b.sekunden) || 1) * 1000))));
      return 'ok';
    case 'if_role': {
      const hat = member && member.roles.cache.has(b.rolle);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'if_money': {
      const eco = economy.getEco(gid, interaction.user.id);
      const hat = (eco.bargeld || 0) >= Math.max(0, Number(b.menge) || 0);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'random': {
      const t = Math.random() * 100 < Math.max(2, Math.min(100, Number(b.chance) || 50));
      if (t && b.dann && b.dann.length) await ausfuehren(b.dann, interaction, ctx);
      if (!t && b.sonst && b.sonst.length) await ausfuehren(b.sonst, interaction, ctx);
      return b.dann && !b.sonst ? 'dann' : 'sonst';
    }
    case 'react':
      await interaction.channel.send(fuellen(b.text || '✅', interaction).slice(0, 100));
      return 'out';
    case 'poll': {
      const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      const opt = (b.optionen || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const msg = await interaction.channel.send({ content: fuellen(b.frage || 'Umfrage', interaction) });
      for (let i = 0; i < opt.length; i++) await msg.react(emojis[i]).catch(() => {});
      return 'ok';
    }
    case 'log': {
      const s2 = config.getGuildSettings(gid);
      const ch = s2.moderation.modLogChannel ? interaction.guild.channels.cache.get(s2.moderation.modLogChannel) : null;
      if (ch) await ch.send('Block-Log: ' + fuellen(b.text || 'Ereignis', interaction).slice(0, 500)).catch(() => {});
      return 'ok';
    }
    case 'abbruch':
      return 'ABBRUCH';
    default:
      return 'unbekannt: ' + b.typ;
  }
}

module.exports = { ausfuehren, fuehreCustomAus, fuellen };
