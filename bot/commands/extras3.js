// ═══════════════════════════════════════════════════════════════
// 0.8.2 – Steuererklärung · Polizei · Börse · Kredite · Immobilien · Klauen
// ═══════════════════════════════════════════════════════════════
'use strict';
const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const economy = require('../systems/economy');
const staat = require('../systems/staat');
const steuererklaerung = require('../systems/steuererklaerung');
const polizei = require('../systems/polizei');
const boerse = require('../systems/boerse');
const kredite = require('../systems/kredite');
const immobilien = require('../systems/immobilien');
const { okEmbed, errEmbed, geldbetrag } = require('../../core/utils');

module.exports = [
  // ── /steuererklaerung ────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('steuererklaerung')
      .setDescription('📋 Mach deine monatliche Steuererklärung (Mini-Spiel!)')
      .setDMPermission(false),
    async execute(interaction) {
      await interaction.deferReply();
      const gid = interaction.guild.id;
      const p = steuererklaerung.periodeDok(gid);
      const vorhanden = steuererklaerung.statusFuer(gid, interaction.user.id);
      if (vorhanden && vorhanden.status === 'erledigt') {
        return interaction.editReply({ embeds: [okEmbed(
          `✅ Du bist für **${p.periode}** schon erledigt (Qualität ${vorhanden.qualitaet} %).\nNächste Periode: <t:${Math.floor(p.ende / 1000)}:R>`) ] });
      }
      const s = config.getGuildSettings(gid);
      const spiele = (s.steuererklaerung && s.steuererklaerung.spiele) || ['mathe', 'blitz', 'roulette', 'memory'];
      const namen = { mathe: '🧮 Steuer-Mathe', blitz: '⏱️ Blitz-Rechnen', roulette: '🍀 Ehrlichkeits-Wurf', memory: '🧠 Memory-Zahl' };
      const menu = new StringSelectMenuBuilder()
        .setCustomId('sk_spiel_' + interaction.user.id)
        .setPlaceholder('Wähle dein Mini-Spiel …')
        .addOptions(spiele.map((sp) => ({ label: namen[sp] || sp, value: sp })));
      const ende = Math.floor(p.ende / 1000);
      await interaction.editReply({
        content: `📋 **Steuererklärung ${p.periode}**\nDeadline: <t:${ende}:R> · Verpassen = Hinterziehungs-Verdacht (🚔 Fangquote ${polizei.fangChance(gid)} %)!\n\nWähle ein Mini-Spiel:`,
        components: [new ActionRowBuilder().addComponents(menu)],
      });
      const msg = await interaction.fetchReply();
      const col = msg.createMessageComponentCollector({ time: 120000, max: 1,
        filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith('sk_spiel') });
      col.on('collect', async (sel) => {
        await sel.deferUpdate();
        await steuererklaerung.spielStarten(sel, sel.values[0]);
      });
    },
  },

  // ── /polizei ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('polizei')
      .setDescription('🚔 Die Polizeiwache')
      .addSubcommand(sc => sc.setName('info').setDescription('Wachen-Status & Fangquote'))
      .addSubcommand(sc => sc.setName('beitreten').setDescription('Werde Polizist (bekommst Gehalt aus der Wachekasse)'))
      .addSubcommand(sc => sc.setName('verlassen').setDescription('Kündige den Polizeidienst'))
      .addSubcommand(sc => sc.setName('foerndern')
        .setDescription('Spende der Wache Geld – erhöht die Fangquote bei Finanzbetrug!')
        .addStringOption(o => o.setName('betrag').setDescription('Betrag oder "all"').setRequired(true)))
      .setDMPermission(false),
    async execute(interaction) {
      const gid = interaction.guild.id;
      const sub = interaction.options.getSubcommand(true);
      const s = config.getGuildSettings(gid);
      const st = staat.doc(gid);
      const chance = polizei.fangChance(gid);

      if (sub === 'info') {
        const offiziere = interaction.guild.members.cache.filter((m) => !m.user.bot && s.polizei && s.polizei.rolle && m.roles.cache.has(s.polizei.rolle)).size;
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle('🚔 Polizeiwache ' + interaction.guild.name)
          .setColor(0x3498DB)
          .addFields(
            { name: '🚨 Fangquote Finanzbetrug', value: `**${chance} %**`, inline: true },
            { name: '💰 Wachekasse', value: geldbetrag(st.wacheKasse, s.economy), inline: true },
            { name: '👮 Offiziere', value: String(offiziere), inline: true },
            { name: '💵 Gehalt/Tag', value: geldbetrag(s.polizei ? s.polizei.gehalt : 0, s.economy), inline: true },
          )
          .setDescription('Förderungs-Faustregel: **10.000 🪙** in der Wachekasse = maximale Fangquote (+50 %)!')] });
      }
      if (sub === 'beitreten') {
        if (!s.polizei || !s.polizei.rolle) {
          return interaction.reply({ embeds: [errEmbed('Die Polizei-Rolle ist noch nicht eingerichtet (Dashboard → Staat & Polizei).')], ephemeral: true });
        }
        const rolle = interaction.guild.roles.cache.get(s.polizei.rolle);
        if (!rolle) return interaction.reply({ embeds: [errEmbed('Die Polizei-Rolle existiert nicht mehr.')], ephemeral: true });
        await interaction.member.roles.add(rolle, 'Polizei beigetreten').catch(() => {});
        return interaction.reply({ embeds: [okEmbed('🚔 Willkommen im Dienst, Offizier ' + interaction.user.username + '! Du bekommst täglich Gehalt aus der Wachekasse.')] });
      }
      if (sub === 'verlassen') {
        if (s.polizei && s.polizei.rolle) {
          const rolle = interaction.guild.roles.cache.get(s.polizei.rolle);
          if (rolle) await interaction.member.roles.remove(rolle).catch(() => {});
        }
        return interaction.reply({ embeds: [okEmbed('Du hast den Polizeidienst verlassen.')] });
      }
      // foerndern
      const eco = economy.getEco(gid, interaction.user.id);
      const betrag = interaction.options.getString('betrag', true);
      const wert = betrag.toLowerCase() === 'all' ? eco.bargeld : Math.round(Number(betrag));
      if (!wert || wert <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });
      if (eco.bargeld < wert) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });
      eco.bargeld -= wert;
      economy.saveEco(eco);
      const neu = staat.doc(gid);
       neu.wacheKasse = Math.floor((Number(neu.wacheKasse) || 0) + wert); // FOERDERN-FIX-V2 // FOERDERN-FIX
       db.set('staat', gid, neu);
       console.log('[POLIZEI] Förderung +' + wert + ' → WacheKasse: ' + neu.wacheKasse + ' · Fangquote: ' + staat.fangChance(gid) + '%');
      economy.transaktion(gid, interaction.user.id, 'polizei_foerderung', -wert, 'Wachen-Förderung');
      return interaction.reply({ embeds: [okEmbed(
        `🚔 Danke für die Förderung! Wachekasse: **${geldbetrag(neu.wacheKasse, s.economy)}**\nFangquote jetzt: **${polizei.fangChance(gid)} %**`)] });
    },
  },

  // ── /steuerfahndung ──────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('steuerfahndung')
      .setDescription('🚔 Prüfe den Steuerstatus einer Person (nur Polizei)')
      .addUserOption(o => o.setName('user').setDescription('Wen kontrollieren?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const gid = interaction.guild.id;
      const s = config.getGuildSettings(gid);
      if (!s.polizei || !s.polizei.rolle || !interaction.member.roles.cache.has(s.polizei.rolle)) {
        return interaction.reply({ embeds: [errEmbed('Nur Polizisten dürfen das. Rolle in der Wache beantragen: /polizei beitreten')], ephemeral: true });
      }
      const ziel = interaction.options.getUser('user', true);
      const status = steuererklaerung.statusFuer(gid, ziel.id);
      const sauber = status && status.status === 'erledigt';
      const verdacht = !status || status.status === 'gescheitert';
      if (!verdacht) {
        return interaction.reply({ embeds: [okEmbed(`🔍 Fahndungsergebnis: **${ziel.username}** ist sauber (${status.status}).`)] });
      }
      // Fahndungs-Roll
      const chance = polizei.fangChance(gid);
      const gefunden = Math.random() * 100 < chance;
      const eco = economy.getEco(gid, ziel.id);
      const verm = (eco.bargeld || 0) + (eco.bank || 0);
      const strafe = Math.max(100, Math.floor(verm * ((s.steuererklaerung && s.steuererklaerung.strafeProzent) || 5) / 100));
      if (!gefunden) {
        return interaction.reply({ embeds: [errEmbed(
          `🔍 Fahndung gegen **${ziel.username}** … nichts Belastbares gefunden. (Fangquote war ${chance} % – mehr Wachen-Förderung = höhere Quote!)`) ] });
      }
      const vonB = Math.min(eco.bargeld || 0, strafe);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - vonB);
      eco.bank = Math.max(0, (eco.bank || 0) - (strafe - vonB));
      economy.saveEco(eco);
      staat.einzahlen(gid, strafe, 'Steuerstrafe (Fahndung)');
      await polizei.belohnen(interaction.guild, strafe);
      await interaction.reply({ embeds: [new EmbedBuilder()
        .setTitle('🚨 STEUERHINTERZIEHUNG AUFGEDECKT!')
        .setColor(0xE74C3C)
        .setDescription(`**${ziel.username}** wurde von Offizier ${interaction.user.username} erwischt!\nStrafe: **${geldbetrag(strafe, s.economy)}** → Staat + Polizei-Kicker`) ] });
    },
  },

  // ── /boerse ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('boerse')
      .setDescription('📈 Die Lumiox-Börse: Aktien kaufen & verkaufen')
      .addSubcommand(sc => sc.setName('anzeigen').setDescription('Kurse & dein Depot'))
      .addSubcommand(sc => sc.setName('kaufen')
        .setDescription('Aktien kaufen')
        .addStringOption(o => o.setName('symbol').setDescription('Aktien-Symbol').setRequired(true)
          .setAutocomplete(true))
        .addStringOption(o => o.setName('betrag').setDescription('Investitionsbetrag oder "all"').setRequired(true)))
      .addSubcommand(sc => sc.setName('verkaufen')
        .setDescription('Aktien verkaufen')
        .addStringOption(o => o.setName('symbol').setDescription('Aktien-Symbol').setRequired(true)
          .setAutocomplete(true))
        .addStringOption(o => o.setName('anteil').setDescription('Anteil (Zahl) oder "all"').setRequired(true)))
      .setDMPermission(false),
    async execute(interaction) {
      const gid = interaction.guild.id;
      const sub = interaction.options.getSubcommand(true);
      const d = boerse.doc(gid);
      const s = config.getGuildSettings(gid);
      const kursZeile = () => boerse.alleAktien(gid).map((a) => {
        const k = d.kurse[a.sym], alt = d.alt[a.sym] || k;
        const delta = k - alt;
        const pfeil = delta > 0.001 ? '📈 +' : delta < -0.001 ? '📉 ' : '➖ ';
        return `**${a.sym}** (${a.name}): ${k.toFixed(2)} ${pfeil}${Math.abs(delta).toFixed(2)}`;
      }).join('\n');

      if (sub === 'anzeigen') {
        const depot = boerse.depot(gid, interaction.user.id);
        const depotWert = boerse.LISTE.reduce((sum, a) => sum + (depot.anteile[a.sym] || 0) * d.kurse[a.sym], 0);
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle('📈 Lumiox-Börse')
          .setColor(0x3498DB)
          .addFields(
            { name: 'Kurse (Änderung pro Stunde)', value: kursZeile() },
            { name: '📦 Dein Depot', value: depotWert > 0
              ? boerse.alleAktien(gid).filter((a) => depot.anteile[a.sym] > 0).map((a) =>
                  `${a.sym}: ${(depot.anteile[a.sym]).toFixed(2)} Stück = ${(depot.anteile[a.sym] * d.kurse[a.sym]).toFixed(2)} 🪙`).join('\n') +
                `\n**Gesamtwert: ${depotWert.toFixed(2)} 🪙**`
              : 'Noch keine Aktien. Kurse ändern sich **stündlich**!' })] });
      }
      const eco = economy.getEco(gid, interaction.user.id);
      const depot = boerse.depot(gid, interaction.user.id);
      const sym = interaction.options.getString('symbol', true);
      if (!boerse.alleAktien(gid).some((x) => x.sym === sym)) {
        return interaction.reply({ embeds: [errEmbed('Unbekanntes Symbol: ' + sym + '. Aktuelle Liste: /boerse anzeigen')], ephemeral: true });
      }

      if (sub === 'kaufen') {
        const betrag = interaction.options.getString('betrag', true);
        const wert = betrag.toLowerCase() === 'all' ? eco.bargeld : Math.round(Number(betrag));
        if (!wert || wert <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });
        if (eco.bargeld < wert) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });
        eco.bargeld -= wert;
        economy.saveEco(eco);
        depot.anteile[sym] = Math.round(((depot.anteile[sym] || 0) + wert / d.kurse[sym]) * 100) / 100;
        db.set('depots', depot.id, depot);
        economy.transaktion(gid, interaction.user.id, 'boerse_kauf', -wert, sym);
        return interaction.reply({ embeds: [okEmbed(
          `📈 **${(wert / d.kurse[sym]).toFixed(2)} × ${sym}** gekauft für ${geldbetrag(wert, s.economy)} (Kurs: ${d.kurse[sym].toFixed(2)}).`)] });
      }
      // verkaufen
      const anteil = interaction.options.getString('anteil', true);
      const besitz = depot.anteile[sym] || 0;
      if (besitz <= 0) return interaction.reply({ embeds: [errEmbed('Du besitzt keine ' + sym + '-Aktien.')], ephemeral: true });
      const stueck = anteil.toLowerCase() === 'all' ? besitz : Math.min(besitz, Math.max(0.01, Number(anteil) || 0));
      if (stueck <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Anteil.')], ephemeral: true });
      const erloes = Math.floor(stueck * d.kurse[sym]);
      depot.anteile[sym] = Math.round((besitz - stueck) * 100) / 100;
      if (depot.anteile[sym] <= 0.001) delete depot.anteile[sym];
      db.set('depots', depot.id, depot);
      eco.bargeld += erloes;
      economy.saveEco(eco);
      economy.transaktion(gid, interaction.user.id, 'boerse_verkauf', erloes, sym);
      return interaction.reply({ embeds: [okEmbed(
        `📉 **${stueck.toFixed(2)} × ${sym}** verkauft für ${geldbetrag(erloes, s.economy)} (Kurs: ${d.kurse[sym].toFixed(2)}).`)] });
    },
  },

  // ── /kredit ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('kredit')
      .setDescription('🏦 Kredit vom Staat aufnehmen oder zurückzahlen')
      .addSubcommand(sc => sc.setName('info').setDescription('Dein Kredit-Status'))
      .addSubcommand(sc => sc.setName('aufnehmen')
        .setDescription('Kredit aufnehmen (Zinsen pro Tag!)')
        .addIntegerOption(o => o.setName('betrag').setDescription('Kreditbetrag').setRequired(true).setMinValue(100)))
      .addSubcommand(sc => sc.setName('zurueckzahlen')
        .setDescription('Kredit tilgen')
        .addStringOption(o => o.setName('betrag').setDescription('Betrag oder "all"').setRequired(true)))
      .setDMPermission(false),
    async execute(interaction) {
      const gid = interaction.guild.id;
      const sub = interaction.options.getSubcommand(true);
      const s = config.getGuildSettings(gid);
      const d = kredite.doc(gid, interaction.user.id);
      if (sub === 'info') {
        const st = staat.doc(gid);
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle('🏦 Staatsbank')
          .setColor(0x3498DB)
          .addFields(
            { name: 'Dein Kredit', value: d.betrag > 0 ? geldbetrag(d.betrag, s.economy) + ' ⚠️ Zins: ' + (s.kredit ? s.kredit.zinsProTag : 2) + ' %/Tag' : 'Kein aktiver Kredit ✨', inline: false },
            { name: 'Max. Kreditsumme', value: geldbetrag(s.kredit ? s.kredit.maxBetrag : 5000, s.economy), inline: true },
            { name: 'Staatskasse (Deckung)', value: geldbetrag(Math.max(0, st.kasse), s.economy), inline: true })] });
      }
      if (sub === 'aufnehmen') {
        const r = kredite.aufnehmen(gid, interaction.user.id, interaction.options.getInteger('betrag', true));
        if (r.error) return interaction.reply({ embeds: [errEmbed(r.error)], ephemeral: true });
        return interaction.reply({ embeds: [okEmbed(
          `🏦 Kredit über **${geldbetrag(r.betrag, s.economy)}** ausgezahlt!\n⚠️ Zinsen: **${s.kredit ? s.kredit.zinsProTag : 2} % pro Tag** – werden täglich automatisch eingezogen. Tilge schnell mit \`/kredit zurückzahlen\`!`)] });
      }
      const betrag = interaction.options.getString('betrag', true);
      const r2 = kredite.zurueckzahlen(gid, interaction.user.id, betrag);
      if (r2.error) return interaction.reply({ embeds: [errEmbed(r2.error)], ephemeral: true });
      return interaction.reply({ embeds: [okEmbed(
        r2.rest > 0 ? `💰 Tilgung gebucht. Restschuld: **${geldbetrag(r2.rest, s.economy)}**`
                    : '🎉 **Kredit vollständig getilgt!** Die Staatsbank bedankt sich.')] });
    },
  },

  // ── /immobilie ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('immobilie')
      .setDescription('🏠 Immobilien kaufen – tägliche Mieteinnahmen!')
      .addSubcommand(sc => sc.setName('kaufen')
        .setDescription('Immobilie kaufen')
        .addStringOption(o => o.setName('objekt').setDescription('Welche Immobilie?').setRequired(true)
          .addChoices(...immobilien.LISTE.map((x) => ({ name: `${x.name} · ${x.preis} 🪙 · +${x.einkommen}/Tag`, value: x.id })))))
      .addSubcommand(sc => sc.setName('meine').setDescription('Dein Immobilien-Besitz & Einkommen'))
      .setDMPermission(false),
    async execute(interaction) {
      const gid = interaction.guild.id;
      const sub = interaction.options.getSubcommand(true);
      const s = config.getGuildSettings(gid);
      const eco = economy.getEco(gid, interaction.user.id);
      const mein = immobilien.doc(gid, interaction.user.id);

      if (sub === 'meine') {
        const einkommen = mein.besitz.reduce((sum, id2) => {
          const obj = immobilien.LISTE.find((x) => x.id === id2);
          return sum + (obj ? obj.einkommen : 0);
        }, 0);
        return interaction.reply({ embeds: [new EmbedBuilder()
          .setTitle('🏠 Deine Immobilien')
          .setColor(0x2ECC71)
          .setDescription(mein.besitz.length
            ? mein.besitz.map((id2) => '• ' + (immobilien.LISTE.find((x) => x.id === id2) || {}).name).join('\n') +
              `\n\n**Tägliches Einkommen: ${einkommen.toLocaleString('de-DE')} 🪙** (wird vom Staat 💸 gezahlt!)`
            : 'Noch keine Immobilien. Schau auf `kaufen`!')] });
      }
      const id2 = interaction.options.getString('objekt', true);
      const obj = immobilien.LISTE.find((x) => x.id === id2);
      if (mein.besitz.includes(id2)) return interaction.reply({ embeds: [errEmbed('Das besitzt du schon!')], ephemeral: true });
      const verm = (eco.bargeld || 0) + (eco.bank || 0);
      if (verm < obj.preis) return interaction.reply({ embeds: [errEmbed(`Das kostet ${obj.preis.toLocaleString('de-DE')} 🪙 – du hast nur ${verm.toLocaleString('de-DE')}.`)], ephemeral: true });
      const vonB = Math.min(eco.bargeld, obj.preis);
      eco.bargeld -= vonB;
      eco.bank -= obj.preis - vonB;
      economy.saveEco(eco);
      mein.besitz.push(id2);
      db.set('immobilien', mein.id, mein);
      economy.transaktion(gid, interaction.user.id, 'immobilie_kauf', -obj.preis, obj.name);
      return interaction.reply({ embeds: [okEmbed(
        `🏠 **${obj.name}** gekauft für ${obj.preis.toLocaleString('de-DE')} 🪙!\nTägliche Mieteinnahme: **+${obj.einkommen} 🪙** (vom Staat gezahlt).`)] });
    },
  },

  // ── /klauen (Bonus!) ─────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('klauen')
      .setDescription('🥷 Versuche, aus dem Shop zu klauen (bei Erwischt-Werden: Strafe!)')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      if (s.klauen && s.klauen.enabled === false) {
        return interaction.reply({ embeds: [errEmbed('Der Shop hat Sicherheitspersonal – Diebstahl ist deaktiviert.')], ephemeral: true });
      }
      const gid = interaction.guild.id;
      const eco = economy.getEco(gid, interaction.user.id);
      const rest = 30 * 60000 - (Date.now() - (eco.lastKlauen || 0));
      if (rest > 0) return interaction.reply({ embeds: [errEmbed(
        `🎥 Die Shop-Kameras beobachten dich noch. Warte **${Math.ceil(rest / 60000)} Min.**!`)], ephemeral: true });
      eco.lastKlauen = Date.now();
      const item = economy.SHOP[Math.floor(Math.random() * economy.SHOP.length)];
      const chance = Math.max(10, Math.min(60, 48 - Math.round(item.preis / 100)));
      const erfolg = Math.random() * 100 < chance;
      if (erfolg) {
        economy.addItem(eco, item.id);
        economy.transaktion(gid, interaction.user.id, 'klauen_erfolg', 0, item.name);
        return interaction.reply({ embeds: [okEmbed(
          `🥷 **Erfolg!** Du hast **${item.name}** (${item.beschreibung}) aus dem Shop ergaunert!\nErfolgschance war ${chance} % – benutze \`/use\`!`)] });
      }
      const strafe = Math.max(50, Math.floor(item.preis * 0.25));
      const vonB = Math.min(eco.bargeld || 0, strafe);
      eco.bargeld = Math.max(0, (eco.bargeld || 0) - vonB);
      eco.bank = Math.max(0, (eco.bank || 0) - (strafe - vonB));
      economy.saveEco(eco);
      staat.einzahlen(gid, strafe, 'Shop-Diebstahl-Strafe');
      const { modLog } = require('../systems');
      await modLog.addEntry(interaction.guild, {
        userId: interaction.user.id, moderator: 'Shop-Security', kategorie: 'Diebstahl',
        schweregrad: 4, grund: `Shop-Diebstahlversuch erwischt: ${item.name} (Strafe: ${strafe})`,
      });
      return interaction.reply({ embeds: [errEmbed(
        `🚨 **Erwischt!** Shop-Detektive haben dich bei ${item.name} ertappt.\nStrafe: **${geldbetrag(strafe, s.economy)}** → an die Staatskasse 🏛️`)] });
    },
  },
];
