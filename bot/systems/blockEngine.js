'use strict';
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('./economy');
const levelSystem = require('./levelSystem');
const logger = require('../../core/logger');

function fill(t, i, ctx) {
  ctx = ctx || {};
  let x = String(t || '');
  try {
    x = x.split('{user}').join('<@' + i.user.id + '>')
      .split('{username}').join(i.user.username)
      .split('{server}').join(i.guild.name)
      .split('{member}').join(String(i.guild.memberCount))
      .split('{var}').join(String(ctx.varValue != null ? ctx.varValue : ''));
    for (const [k, v] of Object.entries(ctx.vars || {})) {
      x = x.split('{' + k + '}').join(String(v));
    }
  } catch (_) {}
  return x;
}
function vGet(ctx, k) { ctx.vars = ctx.vars || {}; return ctx.vars[k]; }
function vSet(ctx, k, v) { ctx.vars = ctx.vars || {}; ctx.vars[k] = v; }

// ═══ LISTEN-MODUS (Ketten) ═══
async function ausfuehren(bloecke, interaction, ctx) {
  for (const b of bloecke || []) {
    try { await blockAus(b, interaction, ctx); }
    catch (e) { logger.warn('Block [' + b.typ + ']: ' + e.message); }
  }
}

// ═══ EINZELNER BLOCK ═══
async function blockAus(b, interaction, ctx) {
  const gid = interaction.guild ? interaction.guild.id : null;
  const member = interaction.member;
  const s = gid ? config.getGuildSettings(gid) : {};
  switch (b.typ) {
    // ── MESSAGE ──
    case 'respond': {
      const t = fill(b.text, interaction, ctx);
      if (b.embed) {
        const e = new EmbedBuilder().setColor(parseInt(b.color || '5865F2', 16)).setDescription(t);
        if (b.title) e.setTitle(fill(b.title, interaction, ctx));
        return interaction.reply({ embeds: [e], flags: b.ephemeral ? 64 : 0 });
      }
      return interaction.reply({ content: t.slice(0, 1900), flags: b.ephemeral ? 64 : 0 });
    }
    case 'send_channel': {
      const ch = interaction.guild.channels.cache.get(b.kanal);
      if (ch && ch.isTextBased()) await ch.send(fill(b.text, interaction, ctx).slice(0, 1900));
      return 'out';
    }
    case 'dm':
      await interaction.user.send(fill(b.text, interaction, ctx).slice(0, 1900)).catch(() => {});
      return 'out';
    case 'react_msg': {
      const m = b.msgId ? await interaction.channel.messages.fetch(b.msgId).catch(() => null) : interaction.message;
      if (m) await m.react(b.emoji || '👍').catch(() => {});
      return 'out';
    }
    case 'pin_msg': {
      const m = b.msgId ? await interaction.channel.messages.fetch(b.msgId).catch(() => null) : null;
      if (m) await m.pin().catch(() => {});
      return 'out';
    }
    case 'create_transcript': {
      const msgs = await interaction.channel.messages.fetch({ limit: 50 });
      const txt = [...msgs.values()].reverse().map((m) => m.author.username + ': ' + m.content).join('\n').slice(0, 1500);
      const ch = interaction.guild.channels.cache.get(b.kanal);
      if (ch && ch.isTextBased()) await ch.send('📄 Transkript #' + interaction.channel.name + ':\n```' + txt + '```').catch(() => {});
      return 'out';
    }
    case 'poll': {
      const opt = (b.optionen || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 5);
      const msg = await interaction.channel.send({ content: fill(b.frage || 'Umfrage', interaction, ctx) });
      const em = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
      for (let i = 0; i < opt.length; i++) await msg.react(em[i]).catch(() => {});
      return 'out';
    }
    // ── WIRTSCHAFT ──
    case 'add_money': {
      const eco = economy.getEco(gid, interaction.user.id);
      eco.bargeld += Math.round(Number(b.menge) || 0);
      economy.saveEco(eco);
      return 'out';
    }
    case 'remove_money': {
      const eco = economy.getEco(gid, interaction.user.id);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - Math.abs(Math.round(Number(b.menge) || 0)));
      economy.saveEco(eco);
      return 'out';
    }
    case 'add_xp':
      await levelSystem.addXp(member, Math.max(1, Number(b.menge) || 10), s);
      return 'out';
    // ── ROLLEN ──
    case 'give_role': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r && member) await member.roles.add(r, 'Block').catch(() => {});
      return 'out';
    }
    case 'remove_role': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r && member) await member.roles.remove(r, 'Block').catch(() => {});
      return 'out';
    }
    case 'add_role_all': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r) { const ms = await interaction.guild.members.fetch().catch(() => null);
        if (ms) for (const [, m] of ms) { if (!m.user.bot) await m.roles.add(r).catch(() => {}); } }
      return 'out';
    }
    case 'create_role':
      await interaction.guild.roles.create({ name: b.name || 'Neu', color: b.farbe || '99AAB5' }).catch(() => {});
      return 'out';
    case 'delete_role': {
      const r = interaction.guild.roles.cache.get(b.rolle);
      if (r) await r.delete().catch(() => {});
      return 'out';
    }
    // ── KANÄLE/THREADS ──
    case 'create_channel':
      await interaction.guild.channels.create({ name: fill(b.name, interaction, ctx) || 'neu', type: 0 }).catch(() => {});
      return 'out';
    case 'delete_channel': {
      const ch = interaction.guild.channels.cache.get(b.kanal);
      if (ch) await ch.delete().catch(() => {});
      return 'out';
    }
    case 'create_thread':
      await interaction.channel.threads.create({ name: fill(b.name, interaction, ctx) || 'Thread' }).catch(() => {});
      return 'out';
    // ── SERVER/MOD ──
    case 'kick': {
      const m = await interaction.guild.members.fetch(b.user).catch(() => null);
      if (m && m.kickable) await m.kick(fill(b.grund, interaction, ctx)).catch(() => {});
      return 'out';
    }
    case 'ban': {
      const m = await interaction.guild.members.fetch(b.user).catch(() => null);
      if (m && m.bannable) await m.ban({ reason: fill(b.grund, interaction, ctx) }).catch(() => {});
      return 'out';
    }
    case 'timeout_user': {
      const m = await interaction.guild.members.fetch(b.user).catch(() => null);
      if (m && m.moderatable) await m.timeout((Number(b.min) || 5) * 60000, fill(b.grund, interaction, ctx)).catch(() => {});
      return 'out';
    }
    case 'nickname': {
      const m = await interaction.guild.members.fetch(b.user).catch(() => null);
      if (m) await m.setNickname(fill(b.name, interaction, ctx)).catch(() => {});
      return 'out';
    }
    case 'purge': {
      const ms = await interaction.channel.messages.fetch({ limit: Math.min(100, Number(b.anzahl) || 10) });
      await interaction.channel.bulkDelete(ms, true).catch(() => {});
      return 'out';
    }
    case 'invite': {
      const inv = await interaction.channel.createInvite({ maxAge: (Number(b.stunden) || 24) * 3600 }).catch(() => null);
      if (inv) await interaction.channel.send('🔗 ' + inv.url).catch(() => {});
      return 'out';
    }
    // ── VARIABLEN ──
    case 'set_var': vSet(ctx, b.name || 'var', fill(b.wert, interaction, ctx)); return 'out';
    case 'run_equation': {
      try {
        const expr = String(b.equation || '').replace(/[^0-9+\-*/(). ]/g, '');
        vSet(ctx, b.name || 'result', Function('"use strict";return (' + expr + ')')());
      } catch (_) {}
      return 'out';
    }
    case 'delete_var': { if (ctx.vars) delete ctx.vars[b.name]; return 'out'; }
    case 'var_vergleich': {
      const a2 = String(vGet(ctx, b.name || 'var'));
      const erg = a2 === fill(b.wert, interaction, ctx) ? 'dann' : 'sonst';
      if (b[erg] && b[erg].length) await ausfuehren(b[erg], interaction, ctx);
      return erg;
    }
    // ── API ──
    case 'fetch_api': {
      try {
        const r = await fetch(b.url);
        const j = await r.json();
        vSet(ctx, b.varName || 'api', JSON.stringify(j).slice(0, 1500));
      } catch (_) {}
      return 'out';
    }
    // ── LOOPS ──
    case 'run_loop': {
      const n = Math.max(1, Math.min(20, Number(b.mal) || 3));
      for (let z = 0; z < n; z++) {
        if (b.dann && b.dann.length) await ausfuehren(b.dann, interaction, ctx);
      }
      return 'out';
    }
    case 'stop_loop': return 'ABBRUCH';
    // ── VOICE ──
    case 'join_voice': {
      const vc = interaction.guild.channels.cache.get(b.kanal);
      try { const { joinVoiceChannel } = require('@discordjs/voice'); joinVoiceChannel({ channelId: b.kanal, guildId: gid, adapterCreator: interaction.guild.voiceAdapterCreator }); } catch (_) {}
      return 'out';
    }
    case 'leave_voice':
      try { interaction.guild.me.voice.disconnect().catch(() => {}); } catch (_) {}
      return 'out';
    // ── CONDITIONS ──
    case 'comparison': {
      let a2 = fill(b.wertA, interaction, ctx), b2 = fill(b.wertB, interaction, ctx);
      const na = Number(a2), nb = Number(b2);
      let erg = false;
      if (!isNaN(na) && !isNaN(nb)) erg = b.op === '>' ? na > nb : b.op === '<' ? na < nb : b.op === '=' ? na === nb : b.op === '>=' ? na >= nb : na <= nb;
      else erg = a2 === b2;
      const zweig = erg ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'random': {
      const t = Math.random() * 100 < Math.max(1, Math.min(100, Number(b.chance) || 50));
      const zweig = t ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'permission': {
      const hat = member && member.permissions.has(PermissionFlagsBits[b.perm || 'ManageMessages']);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'role_cond': {
      const hat = member && member.roles.cache.has(b.rolle);
      const zweig = hat ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'channel_cond': {
      const ok2 = i.channel.id === b.kanal;
      const zweig = ok2 ? 'dann' : 'sonst';
      if (b[zweig] && b[zweig].length) await ausfuehren(b[zweig], interaction, ctx);
      return zweig;
    }
    case 'user_cond': {
      const ok2 = i.user.id === b.user;
      const zweig = ok2 ? 'dann' : 'sonst';
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
    case 'cooldown_user': {
      const key = 'stud_cool_' + (interaction.commandName || 'sys') + '_' + interaction.user.id;
      const bis = db.get('counters', key) || 0;
      if (Date.now() < bis) {
        const rest = Math.ceil((bis - Date.now()) / 60000);
        await interaction.reply({ content: '⏳ Warte noch ' + rest + ' Min.!', ephemeral: true });
        return 'ABBRUCH';
      }
      db.set('counters', key, Date.now() + (Number(b.minuten) || 5) * 60000);
      return 'out';
    }
    case 'zufalls_nachricht': {
      const liste = (b.nachrichten || '').split('|').map((x) => x.trim()).filter(Boolean);
      if (liste.length) await interaction.reply(fuellen(liste[Math.floor(Math.random() * liste.length)], interaction));
      return 'out';
    }
    case 'embed_felder': {
      const e = new EmbedBuilder().setColor(parseInt(b.color || '5865F2', 16)).setDescription(fill(b.text, interaction, ctx));
      if (b.title) e.setTitle(fill(b.title, interaction, ctx));
      for (const paar of (b.felder || '').split('|')) {
        const [n, v] = paar.split('=');
        if (n && v) e.addFields({ name: fill(n, interaction, ctx).slice(0, 250), value: fill(v, interaction, ctx).slice(0, 1000) });
      }
      return interaction.reply({ embeds: [e] });
    }
    case 'webseite': {
      const e = new EmbedBuilder().setTitle(fill(b.titel, interaction, ctx) || 'Link').setColor(0x5865F2);
      if (b.url) e.setURL(b.url);
      if (b.bild) e.setImage(b.bild);
      e.setDescription(fill(b.text, interaction, ctx));
      return interaction.reply({ embeds: [e] });
    }
    case 'log': {
      const s2 = config.getGuildSettings(gid);
      const ch = s2.moderation.modLogChannel ? interaction.guild.channels.cache.get(s2.moderation.modLogChannel) : null;
      if (ch) await ch.send('🧩 Block: ' + fill(b.text || 'Ereignis', interaction, ctx).slice(0, 500)).catch(() => {});
      return 'out';
    }
    case 'abbruch': return 'ABBRUCH';
    default: return 'unbekannt: ' + b.typ;
  }
}

// ═══ GRAPH-MODUS (Visual-Editor): folgt edges ═══
async function fuehreGraphAus(cmd, interaction) {
  const nodes = cmd.nodes || [];
  const edges = cmd.edges || [];
  const map = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    out.get(e.from).push(e);
  }
  let cur = nodes.find((n) => n.typ === 'start');
  let guard = 0;
  while (cur && guard++ < 300) {
    const block = Object.assign({ typ: cur.typ }, cur.felder || {});
    const port = await blockAus(block, interaction, {});
    if (port === 'ABBRUCH') break;
    const moeglich = out.get(cur.id) || [];
    const weiter = moeglich.find((e) => e.fromPort === port) || moeglich.find((e) => e.fromPort === 'out') || moeglich[0];
    cur = weiter ? map.get(weiter.to) : null;
  }
}

// ═══ CUSTOM AUSFÜHREN (Commands) ═══
async function fuehreCustomAus(cmd, interaction) {
  if (cmd.roles && cmd.roles.length && interaction.member) {
    const hat = interaction.member.roles.cache.some((r) => cmd.roles.includes(r.id));
    if (!hat) return interaction.reply({ content: '⛔ Keine Berechtigung.', ephemeral: true }).catch(() => {});
  }
  if (cmd.cooldown) {
    const key = 'blockcd_' + cmd.name + '_' + interaction.user.id;
    const bis = db.get('counters', key) || 0;
    if (Date.now() < bis) return interaction.reply({ content: '⏳ Cooldown aktiv.', ephemeral: true }).catch(() => {});
    db.set('counters', key, Date.now() + cmd.cooldown * 1000);
  }
  if (cmd.nodes && cmd.nodes.length && cmd.edges) return fuehreGraphAus(cmd, interaction);
  if (cmd.blocks && cmd.blocks.length) return ausfuehren(cmd.blocks, interaction, {});
  if (cmd.embed) {
    const e = new EmbedBuilder().setDescription(cmd.response || '').setColor(cmd.color || 0x5865F2);
    if (cmd.title) e.setTitle(cmd.title);
    return interaction.reply({ embeds: [e] });
  }
  return interaction.reply({ content: cmd.response || '...' }).catch(() => {});
}

// ═══ SYSTEME (auto-getriggert) ═══
async function fuehreSystemAus(sys, trigger) {
  // trigger: { event: 'memberJoin'|'memberLeave'|'message'|'voiceJoin', member, channel, ... }
  const fakeInteraction = {
    user: trigger.user || trigger.member?.user || { id: 'sys', username: 'System' },
    member: trigger.member || null,
    guild: trigger.guild,
    channel: trigger.channel || { id: 'sys', send: async () => {}, isTextBased: () => false },
    reply: async (o) => { const ch = trigger.channel; if (ch && ch.isTextBased()) await ch.send(typeof o === 'string' ? o : o.content || '…').catch(() => {}); },
    options: null,
  };
  const gid = trigger.guild ? trigger.guild.id : null;
  const s = gid ? config.getGuildSettings(gid) : {};
  const ctx = { vars: {}, member: trigger.member };
  for (const b of sys.nodes || []) {
    try { await blockAus(Object.assign({ typ: b.typ }, b.felder || {}), fakeInteraction, ctx); }
    catch (e) { logger.warn('System-Block [' + b.typ + ']: ' + e.message); }
  }
}

module.exports = { ausfuehren, blockAus, fuehreCustomAus, fuehreGraphAus, fuehreSystemAus, fill, vGet, vSet };
