// ═══════════════════════════════════════════════════════════════
// Standard-Einstellungen pro Gilde. Alles davon ist später im
// Dashboard einzeln editierbar. Arrays werden beim Merge IMMER
// komplett ersetzt (Dashboard speichert die volle Liste), Objekte
// werden rekursiv gemerged.
// ═══════════════════════════════════════════════════════════════
'use strict';

function guildSettings() {
  return {
    moderation: {
      modRole: '',           // Rolle, die bei modPing angerufen wird
      modLogChannel: '',     // Kanal für das Mod-Protokoll
      escalation: {          // Automatische Eskalation
        enabled: false,
        count: 3,            // ab X Einträgen …
        withinHours: 168,    // … in Y Stunden (Standard: 7 Tage)
        action: 'timeout',   // 'timeout' | 'kick'
        durationMinutes: 60,
      },
    },

    aiMod: {
      enabled: true,
      sensitivity: 5,          // 1 = nur eindeutige Beleidigungen … 10 = extrem streng
      contextWindowMinutes: 10, // gleitender Speicher-Puffer (1–60 Min.)
      contextBatch: true,       // kontextuelle Batch-Rückblick aktiv?
      contextBatchMinutes: 5,   // Batch-Prüfung alle X Minuten
      engine: 'sentinel',
      sentinel: { mobbingFensterMin: 10, mobbingAngriffe: 3, gerichtetBonus: 2 },
      kategorien: { beleidigung: true, diskriminierung: true, mobbing: true, bedrohung: true, sexual: true, passiv: true },
      wiederholung: { aktiv: true, fensterMin: 30, maxBonus: 3 },
      whitelistChannels: [],
      whitelistRoles: [],
      whitelistUsers: [],
      actions: [ // Aktionen pro Schweregrad, alle einzeln schaltbar
        { abSchweregrad: 3, loeschen: true,  verwarnung: false, timeout: 0,  rollenEntzug: '', modPing: false },
        { abSchweregrad: 6, loeschen: true,  verwarnung: true,  timeout: 0,  rollenEntzug: '', modPing: false },
        { abSchweregrad: 8, loeschen: true,  verwarnung: true,  timeout: 60, rollenEntzug: '', modPing: true  },
      ],
    },

    wordFilter: {
      enabled: true,
      placeholder: '████',
      words: [
        { word: 'hurensohn',   regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 7 },
        { word: 'arschloch',   regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 6 },
        { word: 'wichser',     regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 6 },
        { word: 'wixer',       regex: false, modus: 'zensieren', eintrag: false, schweregrad: 3 },
        { word: 'fotze',       regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 7 },
        { word: 'spast',       regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 6 },
        { word: 'missgeburt',  regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 7 },
        { word: 'behindert',   regex: false, modus: 'zensieren', eintrag: false, schweregrad: 3 },
        { word: 'idiot',       regex: false, modus: 'zensieren', eintrag: false, schweregrad: 2 },
        { word: 'neger',       regex: false, modus: 'loeschen',  eintrag: true,  schweregrad: 9 },
        { word: 'nigger',      regex: false, modus: 'loeschen',  eintrag: true,  schweregrad: 10 },
        { word: 'faggot',      regex: false, modus: 'loeschen',  eintrag: true,  schweregrad: 10 },
        { word: 'retard',      regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 7 },
        { word: 'asshole',     regex: false, modus: 'zensieren', eintrag: false, schweregrad: 5 },
        { word: 'bastard',     regex: false, modus: 'zensieren', eintrag: false, schweregrad: 5 },
        { word: 'cunt',        regex: false, modus: 'zensieren', eintrag: true,  schweregrad: 7 },
      ],
    },

    economy: {
      currency: 'Münzen',
      symbol: '🪙',
      startBalance: 250,
      dailyAmount: 250,
      dailyStreakBonus: 25,   // Extra pro Streak-Tag …
      dailyStreakMax: 10,
      dailyMilestoneEvery: 7,         // alle X Tage ein Extra-Bonus (0 = aus)
      dailyMilestoneBonusPercent: 50, // Höhe des Extra-Bonus in % des Grundbetrags     // … maximal so viele Tage
      workCooldownMinutes: 60,
      workMin: 80,
      workMax: 220,
      incomeTaxPercent: 0,    // 0 = progressive Staffeln nutzen
      incomeTaxTiers: [
        { bis: 1000,  percent: 0 },
        { bis: 10000, percent: 5 },
        { bis: null,  percent: 10 },
      ],
      transactionTaxPercent: 3,
      wealthTax: {
        enabled: true,
        intervall: 'wöchentlich', // 'täglich' | 'wöchentlich' | 'monatlich'
        uhrzeit: '20:00',
        tiers: [
          { bis: 5000,  percent: 0 },
          { bis: 50000, percent: 1 },
          { bis: null,  percent: 2 },
        ],
        warnHoursBefore: 24,
      },
      debtInterestPerDay: 2,   // % Zinsen pro Tag auf Schulden
      debtRoleName: 'Schuldner',
      bankInterestPerDay: 0.5, // % Zinsen pro Tag auf Bankguthaben
      robChance: 35,           // % Erfolgschance bei /rob
      robFinePercent: 20,      // Strafe bei Scheitern (in die Serverkasse)
      gambleHouseEdge: 2,      // % Bankvorteil
      announcementChannel: '', // für Steuer-Warnungen & Jackpots
    },

    level: {
      enabled: true,
      xpPerMessage: 15,
      xpCooldownSeconds: 60,
      voiceXpPerMinute: 5,
      levelupChannel: '',      // leer = im aktuellen Kanal antworten
      roleRewards: [],         // [{ level: 5, roleName: 'Stammgast', stack: true }]
      rewardMode: 'stack',     // 'stack' | 'replace'
      cardStyle: 'glass',      // Rank-Card-Stil
    },

    automod: {
      enabled: true,
      whitelistRoles: [],
      whitelistUsers: [],
      inviteFilter: { enabled: true, aktion: 'loeschen', eintrag: true },
      linkFilter:    { enabled: false, whitelist: [], aktion: 'loeschen', eintrag: false },
      capsLimit:     { enabled: true, percent: 70, minLength: 12, aktion: 'zensieren', eintrag: false },
      emojiSpam:     { enabled: true, limit: 10, aktion: 'loeschen', eintrag: false },
      mentionSpam:   { enabled: true, limit: 6, aktion: 'loeschen', eintrag: true },
      messageSpam:   { enabled: true, messages: 6, withinSeconds: 8, aktion: 'timeout', timeoutMinutes: 5, eintrag: true },
      antiRaid:      { enabled: true, joins: 8, withinSeconds: 30, aktion: 'kick' },
      antiNuke:      { enabled: true, channelDeletes: 3, roleChanges: 4, withinMinutes: 10 },
    },

    logs: {
      channels: {
        nachrichten: '', mitglieder: '', rollen: '', kanaele: '', voice: '',
      },
    },

    welcome: {
      channel: '',
      message: 'Willkommen {user} auf **{server}**! Du bist Mitglied #{count}.',
      dm: '', // leer = keine DM
      autoRole: '',
    },

    aiChat: {
      enabled: false,
      channel: '',
      persona: 'Du bist ein freundlicher, hilfsbereiter Server-Bot. Antworte kurz, locker und auf Deutsch.',
    },

    suggestions: { channel: '' },

    tickets: {
      categories: [
        { name: 'Allgemeine Hilfe', emoji: '🛟' },
        { name: 'Bug-Meldung',      emoji: '🐞' },
        { name: 'Beschwerde',       emoji: '⚖️' },
      ],
      staffRole: '',
      category: '',        // Discord-Kategorie für Ticket-Kanäle
      transcriptChannel: '',
    },

        staat: { enabled: true, anteil: 50, zahlt: { start: true, daily: true, work: false, lotterie: false, immobilien: true } },
    steuererklaerung: { intervallTage: 30, mindestVermoegen: 1000, strafeProzent: 5, spiele: ['mathe', 'blitz', 'roulette', 'memory'] },
    polizei: { rolle: '', gehalt: 100 },
    kredit: { maxBetrag: 5000, zinsProTag: 2 },
    klauen: { enabled: true },
    steuerklassen: { enabled: false, klassen: [] },
    infoKanal: { kanal: '' },
    events: { enabled: false, stunden: 6, kanal: '', geheimRolle: '' },
    giveaways: { pingRole: '' },
        backups: { enabled: false, intervall: 'täglich', uhrzeit: '04:00', maxAnzahl: 10 },
    wochenbericht: { kanal: '' },
    inviteTracking: { bonus: 100 },
    modHinweise: { bisVerwarnung: 3 },
    zielTracking: { kanal: '' },
    scheduledMessages: [],
  };
}

module.exports = { guildSettings };
