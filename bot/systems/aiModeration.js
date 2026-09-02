// ═══════════════════════════════════════════════════════════════
// KI-MODERATION (v3 – Sentinel/Ollama-Engine + Prozess-Log)
//  - Engine wählbar: 'sentinel' (ohne KI) oder 'ollama' (Sprachmodell)
//  - Gleitender Nachrichten-Puffer, Einzel- + Kontext-Prüfung
//  - Jeder Schritt landet im kiLog → Dashboard "KI-Prozesse"
// ═══════════════════════════════════════════════════════════════
'use strict';

const db = require('../../core/db');
const config = require('../../core/config');
const ollama = require('../../core/ollama');
const logger = require('../../core/logger');
const kiLog = require('./kiLog');
const modLog = require('./modLog');
const sentinel = require('./sentinel');

const buffer = new Map();      // guildId -> [{ authorId, autor, inhalt, kanal, kanalName, zeit }]
const letzteBatch = new Map(); // guildId -> ts
let kette = Promise.resolve();

function enqueue(message, s, nurPuffer = false) {
  const am = s.aiMod;
  if (!am || !am.enabled) {
    kiLog.log('skip', `KI-Moderation ist AUS – ${message.author.username} nicht gepuffert (auf der KI-Prozesse-Seite aktivierbar)`);
    return;
  }
  if ((am.whitelistUsers || []).includes(message.author.id)) {
    kiLog.log('skip', `${message.author.username} steht auf der User-Whitelist`);
    return;
  }
  if ((am.whitelistChannels || []).includes(message.channel.id)) {
    kiLog.log('skip', `#${message.channel.name} steht auf der Kanal-Whitelist`);
    return;
  }
  if ((am.whitelistRoles || []).some((r) => message.member && message.member.roles.cache.has(r))) {
    kiLog.log('skip', `${message.author.username} hat eine Whitelist-Rolle`);
    return;
  }

  const list = buffer.get(message.guild.id) || [];
  list.push({
    authorId: message.author.id,
    autor: message.author.username,
    inhalt: message.content || '',
    kanal: message.channel.id,
    kanalName: message.channel.name || '?',
    zeit: Date.now(),
  });
  buffer.set(message.guild.id, list);
  sweep(message.guild.id, am.contextWindowMinutes || 10);
  kiLog.zaehle('gepuffert');
  kiLog.log('puffer', `${message.author.username} in #${message.channel.name} gepuffert (Puffer: ${list.length}): "${String(message.content || '').slice(0, 80)}"`);

  if (!am.contextBatch && !nurPuffer) {
    kiLog.log('analyse', `Einzelprüfung (${(am.engine || 'sentinel') === 'ollama' ? 'Ollama' : 'Sentinel'}) für ${message.author.username} gestartet`);
    kette = kette.then(() => pruefeEinzel(message, am)).catch((e) => {
      kiLog.zaehle('fehler');
      kiLog.log('fehler', 'Einzelprüfung fehlgeschlagen: ' + e.message);
    });
  }
}

function sweep(guildId, minuten) {
  const grenze = Date.now() - minuten * 60000;
  const list = (buffer.get(guildId) || []).filter((e) => e.zeit >= grenze);
  buffer.set(guildId, list);
}

function sweepAll() {
  for (const gid of buffer.keys()) {
    const s = config.getGuildSettings(gid);
    sweep(gid, (s.aiMod && s.aiMod.contextWindowMinutes) || 10);
  }
}

function buildSystemPrompt(am) {
  return (
    (am.systemPrompt || 'Du bist ein strenger, aber fairer Content-Moderator für einen deutschsprachigen Chat.') +
    '\nAntworte AUSSCHLIESSLICH mit einem einzigen gültigen JSON-Objekt, ohne weiteren Text.\n' +
    'Format: {"beleidigung": true/false, "diskriminierung": true/false, "kategorie": "beleidigung|diskriminierung|mobbing|bedrohung|sexual|sonstiges", "schweregrad": 1-10, "begruendung": "...", "zitat": "..."}\n' +
    'Schweregrad-Leitlinie: 1-2 harmlos, 3-4 raue Sprache, 5-6 klare Beleidigung, 7-8 schwere Beleidigung/Mobbing, 9-10 Diskriminierung/Bedrohung.'
  );
}

function buildUserPrompt(am, nachricht, autor) {
  const schwelle = 11 - (am.sensitivity || 5);
  return (
    `Sensitivitätsstufe: ${am.sensitivity}/10 (höher = strenger). ` +
    `Ab Schweregrad ${schwelle} gilt eine Nachricht als Verstoss. ` +
    `Bei Stufe 9-10 werden auch Mobbing-Andeutungen und Seitenhiebe erkannt.\n` +
    `Prüfe diese Chat-Nachricht von "${autor}":\n"""${String(nachricht).slice(0, 800)}"""`
  );
}

async function pruefeEinzel(message, am) {
  if (!message.guild) return;
  const s = config.getGuildSettings(message.guild.id);

  // Sentinel-Engine (ohne Sprachmodell)
  if ((s.aiMod.engine || 'sentinel') !== 'ollama') {
    const r = sentinel.pruefe(message, s);
    kiLog.log('analyse', `Sentinel-Ergebnis für ${message.author.username}: ` +
      (r ? `${r.kategorie}, SG ${r.schweregrad}` : 'keine Auffälligkeit'));
    if (r) await verarbeiteErgebnis(message, r, am, 'sentinel');
    return;
  }

  // Ollama-Engine (echtes Sprachmodell)
  if (!(await ollama.checkOnline())) {
    kiLog.log('fehler', 'Ollama offline – Einzelprüfung übersprungen (Wortfilter übernimmt)');
    return;
  }
  try {
    const roh = await ollama.generate(
      buildUserPrompt(am, message.content, message.author.username),
      { system: buildSystemPrompt(am), temperature: am.temperature, timeoutMs: 30000 }
    );
    const json = ollama.extractJSON(roh);
    if (!json) {
      kiLog.log('fehler', 'Modell lieferte kein JSON. Rohtext: ' + String(roh).slice(0, 120));
      return;
    }
    kiLog.log('analyse', `KI-Rohurteil für ${message.author.username}: SG ${json.schweregrad}, ${json.kategorie}`);
    await verarbeiteErgebnis(message, json, am, 'ki');
  } catch (e) {
    kiLog.zaehle('fehler');
    kiLog.log('fehler', 'KI-Fehler: ' + e.message);
  }
}

async function verarbeiteErgebnis(messageLike, json, am, modus) {
  const guild = messageLike.guild;
  const schweregrad = Math.max(1, Math.min(10, parseInt(json.schweregrad) || 1));
  const erkannt = !!(json.beleidigung || json.diskriminierung);
  const schwellenwert = 11 - (am.sensitivity || 5);
  const istTreffer = erkannt && schweregrad >= schwellenwert;

  const datensatz = {
    guildId: guild.id,
    userId: messageLike.author.id,
    autor: messageLike.author.username,
    kanal: messageLike.channel ? messageLike.channel.id : '',
    kanalName: messageLike.channel ? (messageLike.channel.name || 'unbekannt') : 'unbekannt',
    modus,
    beleidigung: !!json.beleidigung,
    diskriminierung: !!json.diskriminierung,
    kategorie: String(json.kategorie || 'sonstiges').slice(0, 40),
    schweregrad,
    schwellenwert,
    treffer: istTreffer,
    begruendung: String(json.begruendung || json['begründung'] || '').slice(0, 500),
    zitat: String(json.zitat || '').slice(0, 300),
    zeit: Date.now(),
    nachricht: String(messageLike.content || '').slice(0, 500),
  };
  db.push('ai_detections', datensatz);
  kiLog.zaehle('analysen');
  if (istTreffer) kiLog.zaehle('treffer');
  kiLog.log(istTreffer ? 'treffer' : 'ok',
    `${modus}: ${datensatz.autor} – ${datensatz.kategorie}, SG ${schweregrad} (Schwelle ${schwellenwert})` +
    (istTreffer ? ' → TREFFER: Aktionen + Mod-Eintrag folgen' : ' → unter Schwelle, kein Eintrag'));

  if (!istTreffer) return datensatz;

  const stufen = (am.actions || [])
    .filter((a) => schweregrad >= (a.abSchweregrad || 10))
    .sort((a, b) => (a.abSchweregrad || 0) - (b.abSchweregrad || 0));
  const aktion = stufen[stufen.length - 1];
  if (aktion) await fuehreAktionenAus(messageLike, aktion, datensatz);

  await modLog.addEntry(guild, {
    userId: datensatz.userId,
    moderator: (am.engine || 'sentinel') === 'ollama' ? `KI (${config.get().ollama?.model || 'gemma2:2b'})` : 'Sentinel',
    kategorie: 'KI-Erkennung',
    schweregrad,
    grund: `[${datensatz.kategorie}] ${datensatz.begruendung}`,
    beweis: datensatz.nachricht,
    kanal: datensatz.kanalName,
  });

  return datensatz;
}

async function fuehreAktionenAus(messageLike, aktion, datensatz) {
  const guild = messageLike.guild;
  try {
    const member = await guild.members.fetch(datensatz.userId).catch(() => null);

    if (aktion.loeschen && typeof messageLike.delete === 'function') {
      await messageLike.delete().catch(() => {});
    }
    if (aktion.timeout && member && member.moderatable) {
      await member.timeout(aktion.timeout * 60000, 'Moderation: ' + datensatz.kategorie).catch(() => {});
    }
    if (aktion.rollenEntzug && member) {
      const rolle = guild.roles.cache.get(aktion.rollenEntzug);
      if (rolle && member.roles.cache.has(rolle.id) &&
          guild.members.me.roles.highest.comparePositionTo(rolle) > 0) {
        await member.roles.remove(rolle, 'Moderation').catch(() => {});
      }
    }
    if (aktion.verwarnung) {
      await modLog.addEntry(guild, {
        userId: datensatz.userId,
        moderator: 'Auto-Moderation',
        kategorie: 'Verwarnung',
        schweregrad: datensatz.schweregrad,
        grund: `Auto-Verwarnung (${datensatz.kategorie}): ${datensatz.begruendung}`,
        beweis: datensatz.nachricht,
        kanal: datensatz.kanalName,
      });
    }
    if (aktion.modPing) {
      const s = config.getGuildSettings(guild.id);
      const logKanal = s.moderation.modLogChannel
        ? guild.channels.cache.get(s.moderation.modLogChannel) : null;
      if (logKanal && logKanal.isTextBased()) {
        const ping = s.moderation.modRole ? `<@&${s.moderation.modRole}> ` : '';
        await logKanal.send({
          content: `${ping}🧠 **Moderation** – Schweregrad ${datensatz.schweregrad}/10 in <#${datensatz.kanal}>: ${datensatz.begruendung.slice(0, 300)}`,
          allowedMentions: { roles: s.moderation.modRole ? [s.moderation.modRole] : [] },
        }).catch(() => {});
      }
    }
  } catch (e) {
    logger.warn('Moderations-Aktionen: ' + e.message);
  }
}

// Vom Scheduler alle X Minuten
async function runContextBatch(guild) {
  const s = config.getGuildSettings(guild.id);
  const am = s.aiMod;
  if (!am.enabled || !am.contextBatch) return;
  const jetzt = Date.now();
  const intervall = (am.contextBatchMinutes || 5) * 60000;
  if (jetzt - (letzteBatch.get(guild.id) || 0) < intervall) return;
  await runContextBatchJetzt(guild).catch((e) => {
    kiLog.zaehle('fehler');
    kiLog.log('fehler', 'Kontext-Batch fehlgeschlagen: ' + e.message);
  });
}

// Batch SOFORT (Scheduler oder Dashboard-Button)
async function runContextBatchJetzt(guild) {
  const s = config.getGuildSettings(guild.id);
  const am = s.aiMod;
  if (!am.enabled) return { ok: false, fehler: 'KI-Moderation ist ausgeschaltet.' };

  const liste = buffer.get(guild.id) || [];
  if (!liste.length) {
    return { ok: true, geprueft: 0, meldungen: 0,
      hinweis: 'Puffer ist leer – schreibe erst etwas in den Chat, dann erneut drücken.' };
  }
  const snapshot = [...liste];
  kiLog.log('batch', `Kontext-Batch gestartet: ${snapshot.length} Nachrichten werden als zusammenhängender Verlauf geprüft`);

  // Sentinel-Engine
  if ((am.engine || 'sentinel') !== 'ollama') {
    const { verstoesse } = sentinel.kontextPruefen(snapshot, s, guild.id);
    let meldungen = 0;
    for (const v of verstoesse) {
      const e = snapshot[v.index];
      if (!e) continue;
      const kanalObj = guild.channels.cache.get(e.kanal);
      const pseudo = {
        guild,
        author: { id: e.authorId, username: e.autor },
        content: e.inhalt,
        channel: { id: e.kanal, name: kanalObj ? kanalObj.name : 'unbekannt' },
      };
      const d = await verarbeiteErgebnis(pseudo, v, am, 'sentinel-kontext');
      if (d && d.treffer) meldungen++;
    }
    buffer.set(guild.id, (buffer.get(guild.id) || []).filter((x) => !snapshot.includes(x)));
    letzteBatch.set(guild.id, Date.now());
    kiLog.log('batch', `Kontext-Batch (Sentinel) fertig: ${snapshot.length} geprüft, ${meldungen} Treffer`);
    return { ok: true, geprueft: snapshot.length, meldungen };
  }

  // Ollama-Engine
  if (!(await ollama.checkOnline(true))) {
    kiLog.log('fehler', 'Ollama offline – Kontext-Batch nicht möglich');
    return { ok: false, fehler: 'Ollama ist offline (ollama serve).' };
  }
  const transcript = snapshot
    .map((e, i) => `[${i}] ${e.autor}: ${String(e.inhalt).slice(0, 200)}`)
    .join('\n')
    .slice(0, 4000);
  const schwelle = 11 - (am.sensitivity || 5);
  const prompt =
    `Sensitivitätsstufe: ${am.sensitivity}/10 (ab Schweregrad ${schwelle} = Verstoss). ` +
    `Achte AUCH auf Kontext: Mobbing gegen eine Person, gruppierte Seitenhiebe, Passive-Aggressivität.\n` +
    `Hier ist ein Chat-Ausschnitt:\n${transcript}\n\n` +
    `Antworte NUR mit JSON: {"verstoesse": [{"index": <Nummer>, "beleidigung": bool, "diskriminierung": bool, "kategorie": "...", "schweregrad": 1-10, "begruendung": "...", "zitat": "..."}]}\n` +
    `Wenn nichts auffällig ist: {"verstoesse": []}`;

  const roh = await ollama.generate(prompt, {
    system: buildSystemPrompt(am), temperature: am.temperature, timeoutMs: 60000,
  });
  const json = ollama.extractJSON(roh);
  const verstoesse = json && Array.isArray(json.verstoesse) ? json.verstoesse
    : (Array.isArray(json) ? json : null);
  if (!verstoesse) {
    kiLog.log('fehler', 'Kontext-Batch: Modell lieferte kein JSON. Rohtext: ' + String(roh).slice(0, 150));
    return { ok: false, fehler: 'Das Modell lieferte kein verwertbares JSON.', roh: String(roh).slice(0, 400) };
  }
  let meldungen = 0;
  for (const v of verstoesse) {
    const e = snapshot[v.index];
    if (!e) continue;
    const kanalObj = guild.channels.cache.get(e.kanal);
    const pseudo = {
      guild,
      author: { id: e.authorId, username: e.autor },
      content: e.inhalt,
      channel: { id: e.kanal, name: kanalObj ? kanalObj.name : 'unbekannt' },
    };
    const d = await verarbeiteErgebnis(pseudo, v, am, 'kontext');
    if (d && d.treffer) meldungen++;
  }
  buffer.set(guild.id, (buffer.get(guild.id) || []).filter((x) => !snapshot.includes(x)));
  letzteBatch.set(guild.id, Date.now());
  kiLog.log('batch', `Kontext-Batch (Ollama) fertig: ${snapshot.length} geprüft, ${meldungen} Treffer`);
  return { ok: true, geprueft: snapshot.length, meldungen };
}

async function testText(text, { sensitivity = 5, temperature = null, systemPrompt = '' } = {}) {
  const am = { sensitivity, temperature, systemPrompt, contextWindowMinutes: 10 };
  const roh = await ollama.generate(
    buildUserPrompt(am, text, 'TestUser'),
    { system: buildSystemPrompt(am), temperature, timeoutMs: 60000 }
  );
  const json = ollama.extractJSON(roh);
  const schwellenwert = 11 - sensitivity;
  const schweregrad = json ? Math.max(1, Math.min(10, parseInt(json.schweregrad) || 1)) : null;
  return {
    roh: String(roh).slice(0, 2000),
    json,
    schwellenwert,
    treffer: !!(json && (json.beleidigung || json.diskriminierung) && schweregrad >= schwellenwert),
  };
}

function bufferInfo() {
  let gesamt = 0;
  for (const list of buffer.values()) gesamt += list.length;
  return { gilden: buffer.size, nachrichtenImPuffer: gesamt };
}
function pufferFuer(guildId) { return [...(buffer.get(guildId) || [])].slice(-25).reverse(); }
function letzteBatchFuer(guildId) { return letzteBatch.get(guildId) || 0; }

module.exports = { enqueue, sweepAll, runContextBatch, runContextBatchJetzt, testText, bufferInfo, pufferFuer, letzteBatchFuer };
