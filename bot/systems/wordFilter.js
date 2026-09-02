// ═══════════════════════════════════════════════════════════════
// Wortfilter (Wörterbuch-System):
//  - Erkennt Umgehungsversuche: Leetspeak (h4r3n50hn), Zahlen,
//    Sonderzeichen, Leerzeichen-Spam (h u r e n s o h n) und
//    Doppelbuchstaben (hurenssohn) über Normalisierung + losen Regex
//  - Modus pro Eintrag: 'zensieren' (Platzhalter + Repost) oder 'loeschen'
//  - "eintrag": ja/nein pro Eintrag (Mod-Protokoll)
//  - Treffer werden pro Wort gezählt (Dashboard: Top-gefilterte-Wörter-Diagramm)
// ═══════════════════════════════════════════════════════════════
'use strict';

const db = require('../../core/db');
const modLog = require('./modLog');

// Normalisiert Text für die Prüfung (nicht für die Anzeige!):
// Kleinbuchstaben, Akzente weg, Leetspeak zurückübersetzt,
// Doppelbuchstaben kollabiert, alles außer Buchstaben entfernt.
function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0]/g, 'o')
    .replace(/[1|!¡]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$§]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[9]/g, 'g')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-zäöü]/g, '');
}

// Baut einen tolerant-Regex aus einem Wort: erlaubt Ziffern/Zeichen,
// Doppelbuchstaben und bis zu 2 Müll-Zeichen zwischen Buchstaben.
const LEET = {
  a: 'a4@', e: 'e3', i: 'i1!|', o: 'o0', s: 's5$§',
  t: 't7', b: 'b8', g: 'g9', l: 'l1|', z: 'z2',
};
function looseRegex(word) {
  const teile = [...word.toLowerCase()].map((ch) => {
    const esc = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alt = LEET[ch] || esc;
    // (?:varianten)+ = Doppelbuchstaben ok, [^\w]{0,2} = Müll dazwischen
    return `(?:[${alt}])+[^\\w]{0,2}`;
  });
  return new RegExp(teile.join(''), 'gi');
}

// Zählt einen Treffer für die Statistik:
//  - Counter pro Wort (Topliste)
//  - Event in filter_hits (Zeitverlauf fürs Diagramm)
function bumpFilterHit(guildId, word) {
  db.counter(`fh_${guildId}_${word}`);
  db.push('filter_hits', { guildId, word: String(word).slice(0, 60), zeit: Date.now() });
}

function handleMessage(message, s) {
  const liste = (s.wordFilter.words || []);
  if (!liste.length) return false;
  const content = message.content || '';
  if (!content) return false;

  const normText = normalize(content);
  let treffer = null;

  for (const w of liste) {
    if (!w || !w.word) continue;
    if (w.regex) {
      try {
        if (new RegExp(w.word, 'i').test(content)) { treffer = w; break; }
      } catch (_) { /* ungültiger Regex -> überspringen */ }
    } else if (normText.includes(normalize(w.word))) {
      treffer = w;
      break;
    }
  }
  if (!treffer) return false;

  bumpFilterHit(message.guild.id, treffer.word);

  if (treffer.modus === 'loeschen') {
    message.delete().catch(() => {});
  } else {
    // Zensieren: Original löschen, zensierte Version als Repost
    const zensiert = zensiere(content, treffer, s.wordFilter.placeholder);
    if (zensiert !== content) {
      message.delete().catch(() => {});
      message.channel.send({
        content: `**${message.author.username}:** ${zensiert.slice(0, 1800)}`,
        allowedMentions: { parse: [] },
      }).catch(() => {});
    }
  }

  if (treffer.eintrag) {
    modLog.addEntry(message.guild, {
      userId: message.author.id,
      moderator: 'Wortfilter',
      kategorie: 'Wortfilter-Treffer',
      schweregrad: treffer.schweregrad || 3,
      grund: `Gefiltertes Wort erkannt ("${treffer.word}") – Modus: ${treffer.modus}`,
      beweis: content.slice(0, 500),
      kanal: message.channel.name,
    }).catch(() => {});
  }

  return true;
}

function zensiere(content, eintrag, placeholder) {
  try {
    return content.replace(looseRegex(eintrag.word), placeholder || '████');
  } catch (_) {
    return content;
  }
}

module.exports = { handleMessage, normalize, looseRegex };
