// ═══════════════════════════════════════════════════════════════
// WIRTSCHAFT & STEUERN – Commands 17 bis 38
// ALLE Einnahmen (Einkommensteuer, Transaktionssteuer, Rob-Strafen,
// Gamble-Hausvorteil) fließen in die SERVERKASSE und erscheinen im
// Dashboard unter "Wirtschaft & Steuern → Kassen-Historie".
// ═══════════════════════════════════════════════════════════════
'use strict';

const {
  SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder,
} = require('discord.js');
const db = require('../../core/db');
const config = require('../../core/config');
const {
  okEmbed, errEmbed, parseBetrag, geldbetrag, progressBar,
} = require('../../core/utils');
const economy = require('../systems/economy');
const steuern = require('../systems/steuern');

const JOBS = [
  'Kellner/in', 'Bäcker/in', 'Programmierer/in', 'Briefträger/in', 'Lehrer/in',
  'Mechaniker/in', 'Gärtner/in', 'Verkäufer/in', 'Fahrer/in', 'Barista/in',
  'Elektriker/in', 'Fensterputzer/in', 'Hundesitter/in', 'Streamer/in', 'Tester/in',
];
const SLOT_SYMBOLE = ['🍒', '🍋', '🔔', '⭐', '💎', '7️⃣'];
const SLOT_MULTI = { '🍒': 3, '🍋': 4, '🔔': 5, '⭐': 8, '💎': 15, '7️⃣': 25 };

function zufall(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

module.exports = [
  // ── 17) /balance ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('balance')
      .setDescription('Zeigt dein Guthaben (oder das anderer)')
      .addUserOption(o => o.setName('user').setDescription('Wessen Kontostand?'))
      .setDMPermission(false),
    async execute(interaction) {
      const user = interaction.options.getUser('user') || interaction.user;
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, user.id);
      const e = new EmbedBuilder()
        .setTitle(`💰 Kontostand · ${user.username}`)
        .setColor(0xF1C40F)
        .setThumbnail(user.displayAvatarURL({ size: 128 }))
        .addFields(
          { name: '💵 Bargeld', value: geldbetrag(eco.bargeld, s.economy), inline: true },
          { name: '🏦 Bank', value: geldbetrag(eco.bank, s.economy), inline: true },
          { name: '📊 Gesamt', value: geldbetrag(economy.vermoegen(eco), s.economy), inline: true },
        );
      if (eco.schulden > 0) {
        e.addFields({
          name: '🔴 Offene Schulden',
          value: `${geldbetrag(eco.schulden, s.economy)} (+${s.economy.debtInterestPerDay} % Zinsen/Tag)`,
        });
      }
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 18) /daily (v2 – übersichtlich: Fortschritt, Meilensteine, Vorschau) ──
  {
    data: new SlashCommandBuilder()
      .setName('daily')
      .setDescription('Hol dir deine tägliche Belohnung (mit Streak-Bonus)')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const econ = s.economy;
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const jetzt = Date.now();
      const abstand = jetzt - eco.lastDaily;

      // Noch auf Cooldown? -> klare Anzeige mit Timestamp + Streak-Warnung
      if (eco.lastDaily && abstand < 24 * 3600000) {
        const naechster = eco.lastDaily + 24 * 3600000;
        const e = new EmbedBuilder()
          .setTitle('⏳ Tägliche Belohnung – noch nicht bereit')
          .setColor(0xF39C12)
          .addFields(
            { name: '📅 Abholbar', value: `<t:${Math.floor(naechster / 1000)}:R>`, inline: true },
            { name: '🔥 Aktueller Streak', value: `**${eco.streak || 0} Tag(e)**`, inline: true },
            { name: '⚠️ Streak-Regel', value: 'Setze maximal **48 h** aus, sonst fällt dein Streak auf 1 zurück!' },
          );
        return interaction.reply({ embeds: [e], ephemeral: true });
      }

      // Streak fortschreiben (24–48 h = weiter, darüber = neu)
      eco.streak = (eco.lastDaily && abstand < 48 * 3600000) ? (eco.streak || 0) + 1 : 1;
      eco.lastDaily = jetzt;

      // Beträge
      const grund = econ.dailyAmount || 250;
      const cap = econ.dailyStreakMax || 10;
      const proTag = econ.dailyStreakBonus || 25;
      const streakBonus = Math.min(eco.streak - 1, cap) * proTag;
      const boost = economy.adminBoost(eco, 'geldMulti');
      const boostAktiv = boost > 1;

      // Meilenstein-Bonus (alle X Tage)
      const alle = econ.dailyMilestoneEvery != null ? econ.dailyMilestoneEvery : 7;
      const bonusProzent = econ.dailyMilestoneBonusPercent != null ? econ.dailyMilestoneBonusPercent : 50;
      const meilenstein = (alle > 0 && eco.streak % alle === 0) ? Math.round(grund * (bonusProzent / 100)) : 0;

      const brutto = Math.round((grund + streakBonus + meilenstein) * boost);
      const klasse = steuern.klasseFuer(s, eco);
      const { steuer, netto, prozent } = steuern.einkommensteuer(s, brutto, klasse);

      eco.bargeld += netto;
      try { const st2 = s.staat; if (st2 && st2.enabled && st2.zahlt && st2.zahlt.daily) require('../systems/staat').zahlen(interaction.guild.id, netto, 'Daily-Auszahlung'); } catch (_) {} // STAAT-BUCHUNG-DAILY
      economy.saveEco(eco);
      if (steuer > 0) {
        economy.kasseAdd(interaction.guild.id, steuer, 'Einkommensteuer (/daily)', 'Steuersystem');
        economy.transaktion(interaction.guild.id, interaction.user.id, 'steuer_einkommen', -steuer, 'Daily-Steuer');
      }
      economy.transaktion(interaction.guild.id, interaction.user.id, 'daily', netto, `Streak ${eco.streak}`);

      // Streak-Fortschritt Richtung maximaler Bonus
      const erreicht = Math.min(eco.streak - 1, cap);
      const balken = '█'.repeat(Math.max(0, erreicht)) + '░'.repeat(Math.max(0, cap - erreicht));

      // Vorschau auf morgen
      const bonusMorgen = Math.min(eco.streak, cap) * proTag;
      const vorschau = Math.round((grund + bonusMorgen) * boost);

      const e = new EmbedBuilder()
        .setTitle(`🎁 Tägliche Belohnung – Tag ${eco.streak}`)
        .setColor(meilenstein > 0 ? 0xF1C40F : 0x2ECC71)
        .addFields(
          { name: '💵 Grundbetrag', value: geldbetrag(grund, econ), inline: true },
          { name: '🔥 Streak-Bonus', value: streakBonus > 0 ? geldbetrag(streakBonus, econ) : '–', inline: true },
          { name: '🏅 Meilenstein', value: meilenstein > 0 ? `${geldbetrag(meilenstein, econ)} (Tag ${eco.streak}!)` : '–', inline: true },
        );
      if (boostAktiv) e.addFields({ name: '⚡ Admin-Boost', value: `×${boost} auf alles`, inline: true });
      e.addFields(
        { name: '📦 Brutto', value: geldbetrag(brutto, econ), inline: true },
        {
          name: '🏛️ Einkommensteuer',
          value: steuer > 0
            ? `−${geldbetrag(steuer, econ)} (${prozent} %${klasse ? ` · Klasse ${klasse.name}` : ' · Standard'})`
            : `0 (steuerfrei${klasse ? ` · Klasse ${klasse.name}` : ''})`,
          inline: true,
        },
        { name: '💰 Auszahlung', value: `**${geldbetrag(netto, econ)}**`, inline: true },
        {
          name: `🔥 Streak-Fortschritt (${erreicht}/${cap} Bonus-Tage)`,
          value: `\`${balken}\`\n` + (eco.streak >= cap + 1
            ? '✅ Maximum erreicht – jeder Tag zahlt den Top-Bonus!'
            : `noch **${cap - erreicht} Tag(e)** bis zum maximalen Bonus`),
        },
        {
          name: '🔮 Vorschau morgen',
          value: `≈ **${geldbetrag(vorschau, econ)}** brutto · ⚠️ Streak verfällt bei **48 h** Pause`,
        },
      );
      if (meilenstein > 0) {
        e.setFooter({ text: `🎉 MEILENSTEIN! Alle ${alle} Tage gibt es +${bonusProzent} % Extra – weiter so!` });
      }
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 19) /work ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('work')
      .setDescription('Arbeite und verdiene Geld (Einkommensteuer wird direkt abgezogen)')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const econ = s.economy;
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const jetzt = Date.now();
      const cooldown = (econ.workCooldownMinutes || 60) * 60000;
      const rest = cooldown - (jetzt - eco.lastWork);
      if (eco.lastWork && rest > 0) {
        return interaction.reply({ embeds: [errEmbed(
          `🛌 Du bist noch müde von der letzten Schicht. Versuch es in **${Math.ceil(rest / 60000)} Min.** wieder!`
        )], ephemeral: true });
      }
      eco.lastWork = jetzt;

      const job = JOBS[zufall(0, JOBS.length - 1)];
      const brutto = Math.round(zufall(econ.workMin || 80, econ.workMax || 220) * economy.adminBoost(eco, 'geldMulti'));
      const { steuer, netto, prozent } = steuern.einkommensteuer(s, brutto, steuern.klasseFuer(s, eco));
      eco.bargeld += netto;
      try { const st2 = s.staat; if (st2 && st2.enabled && st2.zahlt && st2.zahlt.work) require('../systems/staat').zahlen(interaction.guild.id, netto, 'Work-Auszahlung'); } catch (_) {} // STAAT-BUCHUNG-WORK
      economy.saveEco(eco);
      if (steuer > 0) {
        economy.kasseAdd(interaction.guild.id, steuer, 'Einkommensteuer (/work)', 'Steuersystem');
        economy.transaktion(interaction.guild.id, interaction.user.id, 'steuer_einkommen', -steuer, 'Work-Steuerr');
      }
      economy.transaktion(interaction.guild.id, interaction.user.id, 'work', netto, job);

      const e = new EmbedBuilder()
        .setTitle(`💼 Schicht erledigt: ${job}`)
        .setColor(0x3498DB)
        .setDescription(
          `**Lohn (brutto):** ${geldbetrag(brutto, econ)}\n` +
          (steuer > 0
            ? `**Einkommensteuer (${prozent} %):** −${geldbetrag(steuer, econ)} → Serverkasse 🏛️\n`
            : '**Steuerfrei (unter Freibetrag)!**\n') +
          `**Auszahlung:** ${geldbetrag(netto, econ)} 💰`
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 20) /pay ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('pay')
      .setDescription('Überweise Geld an einen anderen Benutzer (Transaktionssteuer gilt)')
      .addUserOption(o => o.setName('user').setDescription('An wen?').setRequired(true))
      .addStringOption(o => o.setName('betrag').setDescription('Betrag, "all" oder "50%"').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const empfaengerUser = interaction.options.getUser('user', true);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const betrag = parseBetrag(interaction.options.getString('betrag', true), eco.bargeld);

      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });
      if (empfaengerUser.bot) return interaction.reply({ embeds: [errEmbed('Bots brauchen kein Geld. 😄')], ephemeral: true });
      if (empfaengerUser.id === interaction.user.id) return interaction.reply({ embeds: [errEmbed('An dich selbst überweisen ergibt wenig Sinn.')], ephemeral: true });
      if (eco.bargeld < betrag) return interaction.reply({ embeds: [errEmbed(`Du hast nur ${geldbetrag(eco.bargeld, s.economy)} in Bargeld.`)], ephemeral: true });

      const { steuer, netto } = steuern.transaktionssteuer(s, betrag, steuern.klasseFuer(s, eco));
      eco.bargeld -= betrag;
      const ziel = economy.getEco(interaction.guild.id, empfaengerUser.id);
      ziel.bargeld += netto;
      economy.saveEco(eco);
      economy.saveEco(ziel);
      if (steuer > 0) economy.kasseAdd(interaction.guild.id, steuer, 'Transaktionssteuer (/pay)', 'Steuersystem');
      economy.transaktion(interaction.guild.id, interaction.user.id, 'pay_out', -betrag, `An ${empfaengerUser.username}`);
      economy.transaktion(interaction.guild.id, empfaengerUser.id, 'pay_in', netto, `Von ${interaction.user.username}`);

      await interaction.reply({ embeds: [okEmbed(
        `💸 Du hast **${geldbetrag(netto, s.economy)}** an ${empfaengerUser} überwiesen` +
        (steuer > 0 ? ` (Transaktionssteuer ${s.economy.transactionTaxPercent} %: ${geldbetrag(steuer, s.economy)} → Serverkasse 🏛️)` : '') + '.'
      )] });
    },
  },

  // ── 21) /deposit ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('deposit')
      .setDescription('Zahle Bargeld in die Bank ein (sicher + Zinsen)')
      .addStringOption(o => o.setName('betrag').setDescription('Betrag oder "all"').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const betrag = parseBetrag(interaction.options.getString('betrag', true), eco.bargeld);
      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });
      if (eco.bargeld < betrag) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });
      eco.bargeld -= betrag;
      eco.bank += betrag;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, 'deposit', betrag, 'Einzahlung');
      await interaction.reply({ embeds: [okEmbed(`🏦 **${geldbetrag(betrag, s.economy)}** eingezahlt. Neuer Banksaldo: ${geldbetrag(eco.bank, s.economy)}`)] });
    },
  },

  // ── 22) /withdraw ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('withdraw')
      .setDescription('Hebe Geld von der Bank ab')
      .addStringOption(o => o.setName('betrag').setDescription('Betrag oder "all"').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const betrag = parseBetrag(interaction.options.getString('betrag', true), eco.bank);
      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });
      if (eco.bank < betrag) return interaction.reply({ embeds: [errEmbed('So viel ist nicht auf deiner Bank.')], ephemeral: true });
      eco.bank -= betrag;
      eco.bargeld += betrag;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, 'withdraw', -betrag, 'Abhebung');
      await interaction.reply({ embeds: [okEmbed(`💵 **${geldbetrag(betrag, s.economy)}** abgehoben. Neues Bargeld: ${geldbetrag(eco.bargeld, s.economy)}`)] });
    },
  },

  // ── 23) /bank ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('bank')
      .setDescription('Bank-Übersicht: Zinssatz, nächste Vermögenssteuer, Schulden')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const faellig = steuern.faelligkeitInfo(interaction.guild.id);
      const e = new EmbedBuilder()
        .setTitle('🏦 Deine Bank')
        .setColor(0x3498DB)
        .addFields(
          { name: 'Banksaldo', value: geldbetrag(eco.bank, s.economy), inline: true },
          { name: 'Zinssatz', value: `${s.economy.bankInterestPerDay} % / Tag`, inline: true },
          { name: 'Tageszins aktuell', value: geldbetrag(Math.floor(eco.bank * (s.economy.bankInterestPerDay / 100)), s.economy), inline: true },
        );
      if (faellig) {
        e.addFields({
          name: '🏛️ Nächste Vermögenssteuer',
          value: `<t:${Math.floor(faellig.ts / 1000)}:F> *(<t:${Math.floor(faellig.ts / 1000)}:R>)*\n` +
                 `Deine voraussichtliche Steuer: **${geldbetrag(steuern.vermoegenssteuer(s, economy.vermoegen(eco)), s.economy)}**`,
        });
      }
      e.addFields({
        name: '🔴 Schulden',
        value: eco.schulden > 0
          ? `${geldbetrag(eco.schulden, s.economy)} (+${s.economy.debtInterestPerDay} %/Tag ≈ ${geldbetrag(Math.ceil(eco.schulden * s.economy.debtInterestPerDay / 100), s.economy)} Zinsen pro Tag)`
          : 'Keine – sauber! ✨',
      });
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 24) /shop ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('shop')
      .setDescription('Der Server-Shop: Booster, Rollen und mehr')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const e = new EmbedBuilder()
        .setTitle('🛒 Server-Shop')
        .setColor(0x9B59B6)
        .setDescription(
          economy.SHOP.map(i =>
            `**${i.name}** – ${geldbetrag(i.preis, s.economy)}\n↳ ${i.beschreibung}`
          ).join('\n\n') + '\n\n*Kaufe mit `/buy <name>` – XP-Booster wirken direkt im Levelsystem!*'
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 25) /buy ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('buy')
      .setDescription('Kaufe einen Gegenstand aus dem Shop')
      .addStringOption(o => o.setName('item').setDescription('Name oder ID des Items')
        .setRequired(true)
        .addChoices(...economy.SHOP.map(i => ({ name: i.name, value: i.id }))))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const itemId = interaction.options.getString('item', true);
      const item = economy.findeItem(itemId);
      if (!item) return interaction.reply({ embeds: [errEmbed('Dieses Item gibt es nicht.')], ephemeral: true });
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      if (eco.bargeld < item.preis) {
        return interaction.reply({ embeds: [errEmbed(`Das kostet ${geldbetrag(item.preis, s.economy)} – du hast nur ${geldbetrag(eco.bargeld, s.economy)}.`)], ephemeral: true });
      }
      if (item.id === 'gluecksbringer' && economy.hatItem(eco, 'gluecksbringer')) {
        return interaction.reply({ embeds: [errEmbed('Du hast den Glücksbringer bereits – er ist dauerhaft!')], ephemeral: true });
      }
      eco.bargeld -= item.preis;
      economy.addItem(eco, itemId);
      economy.transaktion(interaction.guild.id, interaction.user.id, 'kauf', -item.preis, item.name);
      await interaction.reply({ embeds: [okEmbed(`🛍️ **${item.name}** gekauft für ${geldbetrag(item.preis, s.economy)}!\nBenutze \`/inventory\` und \`/use ${itemId}\`.`)] });
    },
  },

  // ── 26) /inventory ────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('inventory')
      .setDescription('Zeigt dein Inventar')
      .setDMPermission(false),
    async execute(interaction) {
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const items = eco.items || [];
      if (!items.length) {
        return interaction.reply({ embeds: [errEmbed('📦 Dein Inventar ist leer – schau im `/shop` vorbei!')], ephemeral: true });
      }
      const text = items.map(id => {
        const item = economy.findeItem(id);
        return item ? `• **${item.name}** – ${item.beschreibung}` : `• Unbekanntes Item (${id})`;
      }).join('\n');
      const e = new EmbedBuilder().setTitle('📦 Dein Inventar').setColor(0x9B59B6).setDescription(text);
      await interaction.reply({ embeds: [e], ephemeral: true });
    },
  },

  // ── 27) /use ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('use')
      .setDescription('Benutze einen Gegenstand aus deinem Inventar')
      .addStringOption(o => o.setName('item').setDescription('Item-ID (siehe /inventory)').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const itemId = interaction.options.getString('item', true).toLowerCase().trim();
      const item = economy.findeItem(itemId);
      if (!item || !economy.hatItem(eco, itemId)) {
        return interaction.reply({ embeds: [errEmbed('Das hast du nicht im Inventar.')], ephemeral: true });
      }
      const member = interaction.member;

      if (itemId === 'xp_booster') {
        if (eco.boosterBis > Date.now()) {
          return interaction.reply({ embeds: [errEmbed('Dein XP-Booster läuft noch! Warte, bis er abgelaufen ist.')], ephemeral: true });
        }
        eco.boosterBis = Date.now() + 3600000;
        economy.removeItem(eco, itemId);
        await interaction.reply({ embeds: [okEmbed('⚡ **XP-Booster aktiviert!** Du bekommst **1 Stunde lang doppelte XP** (wirkt sofort im Levelsystem).')] });
      } else if (itemId === 'farbrolle') {
        const farbe = economy.FARBEN[zufall(0, economy.FARBEN.length - 1)];
        let rolle = interaction.guild.roles.cache.find(r => r.name === `🎨 ${interaction.user.username}`);
        if (!rolle) {
          rolle = await interaction.guild.roles.create({
            name: `🎨 ${interaction.user.username}`, color: farbe, reason: 'Farbrolle aus Shop',
          }).catch(() => null);
        } else {
          await rolle.setColor(farbe).catch(() => {});
        }
        if (!rolle) return interaction.reply({ embeds: [errEmbed('Rolle konnte nicht erstellt werden.')], ephemeral: true });
        await member.roles.add(rolle, 'Farbrolle aktiviert').catch(() => {});
        economy.removeItem(eco, itemId);
        await interaction.reply({ embeds: [okEmbed('🎨 **Farbrolle aktiviert!** Schau auf deine neue Farbe.')] });
      } else if (itemId === 'sonderrolle') {
        let rolle = interaction.guild.roles.cache.find(r => r.name === '⭐ VIP');
        if (!rolle) {
          rolle = await interaction.guild.roles.create({
            name: '⭐ VIP', color: 0xF1C40F, reason: 'Sonderrolle aus Shop',
          }).catch(() => null);
        }
        if (!rolle) return interaction.reply({ embeds: [errEmbed('Rolle konnte nicht erstellt werden.')], ephemeral: true });
        await member.roles.add(rolle, 'Sonderrolle aktiviert').catch(() => {});
        economy.removeItem(eco, itemId);
        await interaction.reply({ embeds: [okEmbed('⭐ **VIP-Rolle erhalten!** Willkommen im Club.')] });
      } else if (itemId === 'gluecksbringer') {
        await interaction.reply({ embeds: [okEmbed('🍀 Der **Glücksbringer** ist dauerhaft aktiv – er erhöht deine `/gamble`-Chance um 15 %. Nichts zu tun!')], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errEmbed('Dieses Item kann nicht benutzt werden.')], ephemeral: true });
      }
    },
  },

  // ── 28) /sell ─────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('sell')
      .setDescription('Verkaufe einen Gegenstand (50 % des Kaufpreises)')
      .addStringOption(o => o.setName('item').setDescription('Item-ID (siehe /inventory)').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const itemId = interaction.options.getString('item', true).toLowerCase().trim();
      const item = economy.findeItem(itemId);
      if (!item || !economy.removeItem(eco, itemId)) {
        return interaction.reply({ embeds: [errEmbed('Das hast du nicht im Inventar.')], ephemeral: true });
      }
      const erloes = Math.floor(item.preis * 0.5);
      eco.bargeld += erloes;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, 'verkauf', erloes, item.name);
      await interaction.reply({ embeds: [okEmbed(`🏪 **${item.name}** für ${geldbetrag(erloes, s.economy)} verkauft.`)] });
    },
  },

  // ── 29) /rob ──────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('rob')
      .setDescription('Versuche, jemanden auszurauben (bei Scheitern: Geldstrafe in die Serverkasse!)')
      .addUserOption(o => o.setName('user').setDescription('Wen überfallen?').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const econ = s.economy;
      const ziel = interaction.options.getUser('user', true);
      if (ziel.bot || ziel.id === interaction.user.id) {
        return interaction.reply({ embeds: [errEmbed('Das geht nicht.')], ephemeral: true });
      }
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const jetzt = Date.now();
      const rest = 30 * 60000 - (jetzt - (eco.lastRob || 0));
      if (rest > 0) {
        return interaction.reply({ embeds: [errEmbed(`🚓 Die Polizei sucht noch nach dir. Warte **${Math.ceil(rest / 60000)} Min.**!`)], ephemeral: true });
      }
      eco.lastRob = jetzt;
      const zielEco = economy.getEco(interaction.guild.id, ziel.id);
      if (zielEco.bargeld < 50) {
        economy.saveEco(eco);
        return interaction.reply({ embeds: [errEmbed(`😕 ${ziel} hat kaum Bargeld – das lohnt nicht.`)], ephemeral: true });
      }

      const chance = econ.robChance || 35;
      if (Math.random() * 100 < chance) {
        const beute = Math.floor(zielEco.bargeld * 0.4);
        zielEco.bargeld -= beute;
        eco.bargeld += beute;
        economy.saveEco(eco);
        economy.saveEco(zielEco);
        economy.transaktion(interaction.guild.id, interaction.user.id, 'rob', beute, `Raub von ${ziel.username}`);
        economy.transaktion(interaction.guild.id, ziel.id, 'geraubt', -beute, `Von ${interaction.user.username}`);
        await interaction.reply({ embeds: [okEmbed(`🃏 **Raub erfolgreich!** Du hast ${geldbetrag(beute, econ)} von ${ziel} erbeutet.`)] });
      } else {
        const strafe = Math.max(20, Math.floor(economy.vermoegen(eco) * ((econ.robFinePercent || 20) / 100)));
        const vonBargeld = Math.min(eco.bargeld, strafe);
        eco.bargeld -= vonBargeld;
        eco.bank -= Math.min(eco.bank, strafe - vonBargeld);
        economy.saveEco(eco);
        economy.kasseAdd(interaction.guild.id, strafe, 'Geldstrafe (/rob fehlgeschlagen)', 'Wirtschaft');
        economy.transaktion(interaction.guild.id, interaction.user.id, 'strafe', -strafe, 'Raub fehlgeschlagen');
        await interaction.reply({ embeds: [errEmbed(
          `🚔 **Erwischt!** ${ziel} hat dich überwältigt.\nGeldstrafe: **${geldbetrag(strafe, econ)}** → direkt in die **Serverkasse** 🏛️`
        )] });
      }
    },
  },

  // ── 30) /gamble ───────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('gamble')
      .setDescription('Setze dein Bargeld auf ein Glücksspiel')
      .addStringOption(o => o.setName('betrag').setDescription('Einsatz, "all" oder "50%"').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const betrag = parseBetrag(interaction.options.getString('betrag', true), eco.bargeld);
      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Einsatz.')], ephemeral: true });
      if (eco.bargeld < betrag) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });

      eco.bargeld -= betrag;
      let chance = 45 - (s.economy.gambleHouseEdge || 2) / 2;
      const hatGlueck = economy.hatGluecksbringer(eco);
      if (hatGlueck) chance += 15;
      const gewinn = Math.floor(betrag * (1 - (s.economy.gambleHouseEdge || 2) / 100));
      const gewonnen = Math.random() * 100 < chance;
      if (gewonnen) {
        eco.bargeld += betrag + gewinn;
      }
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, gewonnen ? 'gamble_win' : 'gamble_lose', gewonnen ? gewinn : -betrag, `Chance ${Math.round(chance)}%`);

      const e = new EmbedBuilder()
        .setTitle(gewonnen ? '🎰 Gewonnen!' : '💀 Verloren!')
        .setColor(gewonnen ? 0x2ECC71 : 0xE74C3C)
        .setDescription(
          `**Einsatz:** ${geldbetrag(betrag, s.economy)}\n` +
          `**Gewinnchance:** ${Math.round(chance)} %${hatGlueck ? ' (🍀 Glücksbringer aktiv!)' : ''}\n` +
          (gewonnen
            ? `**Auszahlung:** ${geldbetrag(betrag + gewinn, s.economy)}\nNeues Bargeld: ${geldbetrag(eco.bargeld, s.economy)}`
            : `Dein Einsatz ist weg. Neues Bargeld: ${geldbetrag(eco.bargeld, s.economy)}`)
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 31) /slots ────────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('slots')
      .setDescription('Spiel am Spielautomaten')
      .addStringOption(o => o.setName('einsatz').setDescription('Einsatz, "all" oder "50%"').setRequired(true))
      .setDMPermission(false)
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const einsatz = parseBetrag(interaction.options.getString('einsatz', true), eco.bargeld);
      if (!einsatz || einsatz <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Einsatz.')], ephemeral: true });
      if (eco.bargeld < einsatz) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });

      eco.bargeld -= einsatz;
      const walze = () => SLOT_SYMBOLE[zufall(0, SLOT_SYMBOLE.length - 1)];
      const [a, b, c] = [walze(), walze(), walze()];
      let multi = 0;
      if (a === b && b === c) multi = SLOT_MULTI[a];
      else if (a === b || b === c || a === c) multi = 1.5;

      const gewinn = Math.floor(einsatz * multi);
      eco.bargeld += gewinn;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, gewinn > einsatz ? 'slots_win' : 'slots_lose', gewinn - einsatz, `${a}${b}${c}`);

      const e = new EmbedBuilder()
        .setTitle('🎰 Spielautomaten')
        .setColor(multi >= 2 ? 0xF1C40F : multi > 0 ? 0x2ECC71 : 0xE74C3C)
        .setDescription(`╔═════════╗\n  **${a}  ${b}  ${c}**\n╚═════════╝\n` +
          (multi > 0
            ? `🎉 **Gewinn ×${multi}:** ${geldbetrag(gewinn, s.economy)}\nBargeld: ${geldbetrag(eco.bargeld, s.economy)}`
            : `😅 Leere Walzen. Einsatz (${geldbetrag(einsatz, s.economy)}) verloren.\nBargeld: ${geldbetrag(eco.bargeld, s.economy)}`));
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 32) /coinflip ─────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('coinflip')
      .setDescription('Wirf eine Münze – Kopf oder Zahl?')
      .addStringOption(o => o.setName('betrag').setDescription('Einsatz, "all" oder "50%"').setRequired(true))
      .addStringOption(o => o.setName('seite').setDescription('Auf welche Seite setzt du?').setRequired(true)
        .addChoices({ name: 'Kopf', value: 'kopf' }, { name: 'Zahl', value: 'zahl' }))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const betrag = parseBetrag(interaction.options.getString('betrag', true), eco.bargeld);
      const wahl = interaction.options.getString('seite', true);
      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Einsatz.')], ephemeral: true });
      if (eco.bargeld < betrag) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });

      eco.bargeld -= betrag;
      const ergebnis = Math.random() < 0.5 ? 'kopf' : 'zahl';
      const gewonnen = ergebnis === wahl;
      if (gewonnen) eco.bargeld += betrag * 2;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, gewonnen ? 'coinflip_win' : 'coinflip_lose', gewonnen ? betrag : -betrag, wahl);

      const emoji = ergebnis === 'kopf' ? '🪙' : 'medal_1️⃣';
      await interaction.reply({ embeds: [EmbedBuilder.from({
        title: gewonnen ? '🪙 Richtig geraten!' : '🪙 Daneben!',
        color: gewonnen ? 0x2ECC71 : 0xE74C3C,
        description: `Die Münze landet auf **${ergebnis === 'kopf' ? 'KOPF' : 'ZAHL'}**.\n` +
          (gewonnen ? `Du gewinnst **${geldbetrag(betrag * 2, s.economy)}** (Einsatz + Gewinn)!\n` : `Dein Einsatz von ${geldbetrag(betrag, s.economy)} ist weg.\n`) +
          `Bargeld: ${geldbetrag(eco.bargeld, s.economy)}`,
      })] });
    },
  },

  // ── 33) /lottery ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('lottery')
      .setDescription('Nimm an der serverweiten Lotterie teil – der Jackpot wird aus der Serverkasse aufgestockt!')
      .addStringOption(o => o.setName('einsatz').setDescription('Dein Einsatz (min. 10)').setRequired(true))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const einsatz = parseBetrag(interaction.options.getString('einsatz', true), eco.bargeld);
      if (!einsatz || einsatz < 10) return interaction.reply({ embeds: [errEmbed('Mindesteinsatz: 10.')], ephemeral: true });
      if (eco.bargeld < einsatz) return interaction.reply({ embeds: [errEmbed('So viel Bargeld hast du nicht.')], ephemeral: true });

      eco.bargeld -= einsatz;
      economy.saveEco(eco);
      economy.transaktion(interaction.guild.id, interaction.user.id, 'lottery_einsatz', -einsatz, 'Lotterieteilnahme');

      const lot = db.get('lottery', interaction.guild.id) || { id: interaction.guild.id, einsaetze: [] };
      lot.einsaetze = lot.einsaetze || [];
      const vorhanden = lot.einsaetze.find(e2 => e2.userId === interaction.user.id);
      if (vorhanden) vorhanden.betrag += einsatz;
      else lot.einsaetze.push({ userId: interaction.user.id, betrag: einsatz });
      db.set('lottery', interaction.guild.id, lot);

      const pot = lot.einsaetze.reduce((sum, e2) => sum + e2.betrag, 0);
      const kasse = economy.kasseGet(interaction.guild.id);
      const JackpotPrognose = pot + Math.min(kasse, Math.floor(pot * 0.5));
      await interaction.reply({ embeds: [okEmbed(
        `🎟️ Du bist mit **${geldbetrag(einsatz, s.economy)}** dabei! (dein Gesamteinsatz: ${geldbetrag(vorhanden ? vorhanden.betrag : einsatz, s.economy)})\n` +
        `Aktueller Pot: **${geldbetrag(pot, s.economy)}** · Prognose mit Kassen-Boost: **${geldbetrag(JackpotPrognose, s.economy)}** 🏛️\n` +
        `Die Ziehung findet **täglich um 20:00 Uhr** statt (Gewinnchance steigt mit dem Einsatz).`
      )] });
    },
  },

  // ── 34) /leaderboard ──────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('leaderboard')
      .setDescription('Die Top 10 des Servers')
      .addStringOption(o => o.setName('art').setDescription('Nach was sortieren?')
        .addChoices({ name: 'Geld', value: 'geld' }, { name: 'Level', value: 'level' }))
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const art = interaction.options.getString('art') || 'geld';
      const liste = economy.leaderboard(interaction.guild.id, art, 10);
      if (!liste.length) return interaction.reply({ embeds: [errEmbed('Noch keine Daten.')] });

      const medaillen = ['🥇', '🥈', '🥉'];
      let text;
      if (art === 'level') {
        const nameFuer = async (userId) => {
          const u = await interaction.client.users.fetch(userId).catch(() => null);
          return u ? u.username : 'Unbekannt';
        };
        const zeilen = [];
        for (let i = 0; i < liste.length; i++) {
          zeilen.push(`${medaillen[i] || `**${i + 1}.**`} **${await nameFuer(liste[i].userId)}** – Level ${liste[i].level} (${liste[i].xp.toLocaleString('de-DE')} XP)`);
        }
        text = zeilen.join('\n');
      } else {
        const zeilen = [];
        for (let i = 0; i < liste.length; i++) {
          const u = await interaction.client.users.fetch(liste[i].userId).catch(() => null);
          zeilen.push(`${medaillen[i] || `**${i + 1}.**`} **${u ? u.username : 'Unbekannt'}** – ${geldbetrag(economy.vermoegen(liste[i]), s.economy)}`);
        }
        text = zeilen.join('\n');
      }
      const e = new EmbedBuilder()
        .setTitle(art === 'level' ? '🏆 Rangliste: Level' : '🏆 Rangliste: Reichste Benutzer')
        .setColor(0xF1C40F).setDescription(text);
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 35) /steuern ──────────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('steuern')
      .setDescription('Alles über das Steuersystem: Staffeln, Prozente, Fälligkeit, deine Gruppe')
      .setDMPermission(false),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const econ = s.economy;
      const eco = economy.getEco(interaction.guild.id, interaction.user.id);
      const faellig = steuern.faelligkeitInfo(interaction.guild.id);
      const meinVerm = economy.vermoegen(eco);
      const meineVermoegenssteuer = steuern.vermoegenssteuer(s, meinVerm);

      // Eigene Einkommens-Schuldengruppe: in welcher Staffel liegt ein typischer Work-Lohn?
      const mittelLohn = Math.floor(((econ.workMin || 80) + (econ.workMax || 220)) / 2);
      const probe = steuern.einkommensteuer(s, mittelLohn);

      const e = new EmbedBuilder()
        .setTitle('🏛️ Steuersystem – Übersicht')
        .setColor(0xE67E22)
        .addFields(
          {
            name: '💵 Einkommensteuer (/work & /daily)',
            value: (econ.incomeTaxPercent || 0) > 0
              ? `Flacher Satz: **${econ.incomeTaxPercent} %**`
              : `Progressive Staffeln:\n${steuern.staffelText(econ.incomeTaxTiers, econ.symbol)}\n*Beispiel bei ${geldbetrag(mittelLohn, econ)} Lohn: ${probe.prozent} %*`,
          },
          {
            name: '💸 Transaktionssteuer (/pay)',
            value: `**${econ.transactionTaxPercent} %** pro Überweisung`,
            inline: true,
          },
          {
            name: '🏦 Bankzinsen',
            value: `**+${econ.bankInterestPerDay} %** / Tag`,
            inline: true,
          },
          {
            name: '🏠 Vermögenssteuer',
            value: faellig
              ? `**Nächste Fälligkeit:** <t:${Math.floor(faellig.ts / 1000)}:F> (<t:${Math.floor(faellig.ts / 1000)}:R>)\n` +
                `Staffeln:\n${steuern.staffelText(econ.wealthTax.tiers, econ.symbol)}\n` +
                `⚠️ **24-Stunden-Warnung** kommt vorher im Ankündigungskanal.`
              : 'Deaktiviert',
          },
          {
            name: '📊 Deine Situation',
            value: `Vermögen: ${geldbetrag(meinVerm, econ)} → voraussichtliche Vermögenssteuer: **${geldbetrag(meineVermoegenssteuer, econ)}**\n` +
                   (eco.schulden > 0
                     ? `🔴 **Schuldengruppe:** Du hast ${geldbetrag(eco.schulden, econ)} Schulden (+${econ.debtInterestPerDay} %/Tag Zinsen ≈ ${geldbetrag(Math.ceil(eco.schulden * econ.debtInterestPerDay / 100), econ)}/Tag). Tilge, indem du Bargeld/Bank ansparst – bei der nächsten Ziehung wird automatisch verrechnet!`
                     : '🟢 Keine Schulden – du bist in der besten Gruppe!'),
          },
          {
            name: '💰 Wohin fließt das Geld?',
            value: `Alle Steuern landen in der **Serverkasse** (aktuell: ${geldbetrag(economy.kasseGet(interaction.guild.id), econ)}) – sie speist Lotterie-Jackpots, XP-Booster & Giveaways!`,
          },
        );
      await interaction.reply({ embeds: [e] });
    },
  },

  // ── 36) /treasury (Admin) ─────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('treasury')
      .setDescription('Die Serverkasse verwalten (Admin)')
      .addSubcommand(sc => sc.setName('anzeigen').setDescription('Kassenstand + letzte Bewegungen'))
      .addSubcommand(sc => sc.setName('ausgeben')
        .setDescription('Geld aus der Kasse ausgeben (z. B. für Giveaways)')
        .addStringOption(o => o.setName('betrag').setDescription('Betrag').setRequired(true))
        .addStringOption(o => o.setName('grund').setDescription('Wofür?').setRequired(true)))
      .addSubcommand(sc => sc.setName('einzahlen')
        .setDescription('Geld in die Kasse einzahlen (Korrektur)')
        .addStringOption(o => o.setName('betrag').setDescription('Betrag').setRequired(true))
        .addStringOption(o => o.setName('grund').setDescription('Warum?').setRequired(true)))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const sub = interaction.options.getSubcommand(true);

      if (sub === 'anzeigen') {
        const stand = economy.kasseGet(interaction.guild.id);
        const historie = db.values('treasury_log')
          .filter(t => t.guildId === interaction.guild.id)
          .sort((a, b) => b.zeit - a.zeit).slice(0, 10);
        const e = new EmbedBuilder()
          .setTitle('🏛️ Serverkasse')
          .setColor(0xF1C40F)
          .addFields({ name: 'Aktueller Stand', value: geldbetrag(stand, s.economy) });
        if (historie.length) {
          e.addFields({
            name: 'Letzte Bewegungen',
            value: historie.map(h =>
              `${h.betrag >= 0 ? '➕' : '➖'} ${geldbetrag(Math.abs(h.betrag), s.economy)} – ${h.grund} (<t:${Math.floor(h.zeit / 1000)}:d>)`
            ).join('\n').slice(0, 1024),
          });
        }
        return interaction.reply({ embeds: [e] });
      }

      const betrag = parseInt(interaction.options.getString('betrag', true).replace(/[._]/g, ''), 10);
      const grund = interaction.options.getString('grund', true);
      if (!betrag || betrag <= 0) return interaction.reply({ embeds: [errEmbed('Ungültiger Betrag.')], ephemeral: true });

      if (sub === 'ausgeben') {
        const neu = economy.kasseRemove(interaction.guild.id, betrag, `${grund} (von ${interaction.user.tag})`, 'Admin');
        if (neu === null) return interaction.reply({ embeds: [errEmbed('So viel ist nicht in der Kasse.')], ephemeral: true });
        return interaction.reply({ embeds: [okEmbed(`📤 **${geldbetrag(betrag, s.economy)}** aus der Kasse ausgegeben (*${grund}*).\nNeuer Stand: ${geldbetrag(neu, s.economy)}`)] });
      } else {
        const neu = economy.kasseAdd(interaction.guild.id, betrag, `${grund} (von ${interaction.user.tag})`, 'Admin');
        return interaction.reply({ embeds: [okEmbed(`📥 **${geldbetrag(betrag, s.economy)}** in die Kasse eingezahlt (*${grund}*).\nNeuer Stand: ${geldbetrag(neu, s.economy)}`)] });
      }
    },
  },

  // ── 37) /economy-reset (Admin) ────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('economy-reset')
      .setDescription('Setzt die Wirtschaft des Servers komplett zurück (Admin)')
      .addBooleanOption(o => o.setName('bestaetigen').setDescription('Wirklich ALLE Konten löschen?').setRequired(true))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      if (!interaction.options.getBoolean('bestaetigen', true)) {
        return interaction.reply({ embeds: [errEmbed('Nicht bestätigt – es wurde nichts gelöscht.')], ephemeral: true });
      }
      let n = 0;
      for (const [id, eco] of db.all('economy')) {
        if (eco.guildId === interaction.guild.id) { db.del('economy', id); n++; }
      }
      for (const [id, t] of db.all('transactions')) {
        if (t.guildId === interaction.guild.id) db.del('transactions', id);
      }
      economy.kasseAdd(interaction.guild.id, 0, `Wirtschafts-Reset durch ${interaction.user.tag} (${n} Konten)`, 'Admin');
      await interaction.reply({ embeds: [okEmbed(`♻️ Wirtschaft zurückgesetzt – **${n}** Konten gelöscht, Kasse auf 0.`)] });
    },
  },

  // ── 38) /give (Admin) ─────────────────────────────────────────
  {
    data: new SlashCommandBuilder()
      .setName('give')
      .setDescription('Geld aus dem Nichts erschaffen (Admin) – wird in der Geldmengen-Statistik erfasst')
      .addUserOption(o => o.setName('user').setDescription('Wer soll es bekommen?').setRequired(true))
      .addIntegerOption(o => o.setName('betrag').setDescription('Wie viel?').setRequired(true).setMinValue(1))
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
      const s = config.getGuildSettings(interaction.guild.id);
      const user = interaction.options.getUser('user', true);
      const betrag = interaction.options.getInteger('betrag', true);
      const eco = economy.getEco(interaction.guild.id, user.id);
      eco.bargeld += betrag;
      economy.saveEco(eco);
      // Geldmengen-Statistik: jede Erschaffung wird erfasst
      economy.transaktion(interaction.guild.id, user.id, 'give', betrag, `Erschaffen durch ${interaction.user.tag}`);
      bumpStat(interaction.guild.id, 'geldErschaffen', betrag);
      await interaction.reply({ embeds: [okEmbed(`✨ **${geldbetrag(betrag, s.economy)}** aus dem Nichts für ${user} erschaffen. (Neues Bargeld: ${geldbetrag(eco.bargeld, s.economy)})`)] });
    },
  },
];
