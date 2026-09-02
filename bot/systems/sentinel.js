// ═══════════════════════════════════════════════════════════════
// LUMIOX SENTINEL v2 – erweiterte Erkennung ganz ohne Sprachmodell
//  - Muster-Bibliothek über ALLE Schweregrade (SG 2–10): milde
//    Muster greifen automatisch nur bei hoher Empfindlichkeit,
//    weil die Verstoß-Schwelle = 11 − Empfindlichkeit ist.
//  - 6 abschaltbare Kategorien (Dashboard: KI-Moderation → Feineinstellung)
//  - Eskalations-Scoring: mehrere Treffer in EINER Nachricht,
//    CAPS-Aggression, !!!-Ketten und Mentions erhöhen den SG
//  - Wiederholungstäter: frühere Verstöße härten das Urteil
//  - Mobbing-Erkennung über gerichtete Angriffe im Zeitfenster
// ═══════════════════════════════════════════════════════════════
'use strict';

const wordFilter = require('./wordFilter');

const mobbingVerlauf = new Map(); // gid_autor -> [{ ziel, zeit }]
const delikte = new Map();        // gid_autor -> [Zeitpunkte früherer Verstöße]
setInterval(() => { mobbingVerlauf.clear(); delikte.clear(); }, 30 * 60000).unref();

function cfg(s) {
  const am = (s && s.aiMod) || {};
  return {
    kategorien: am.kategorien || { beleidigung: true, diskriminierung: true, mobbing: true, bedrohung: true, sexual: true, passiv: true },
    sent: am.sentinel || {},
    wiederholung: am.wiederholung || { aktiv: true, fensterMin: 30, maxBonus: 3 },
    schwelle: 11 - (am.sensitivity || 5),
  };
}

function katVonWort(w) { return (w.schweregrad || 0) >= 9 ? 'diskriminierung' : 'beleidigung'; }

// [regex, SG, kategorie, begründung]  – SG 2–4 = mild (nur hohe Empfindlichkeit)
const MUSTER = [
  // ── Bedrohungen (SG 8–10) ──
  [/\bkys\b|kill\s+yourself/i, 10, 'bedrohung', 'Aufforderung zur Selbstschädigung'],
  [/ich\s+(werde|habe\s+vor,?\s*)?(dich|deine\s+familie)\s+(umbringen|killen|schlagen|finden|tot)/i, 10, 'bedrohung', 'Gewaltandrohung gegen eine Person'],
  [/du\s+solltest\s+(dir\s+)?(das\s+leben\s+nehmen|umbringen|sterben)/i, 9, 'bedrohung', 'Lebensmüde Aufforderung an eine Person'],
  [/ich\s+weiß\s+wo\s+du\s+(wohnst|bist|schlafst|zur\s+schule\s+gehst)/i, 9, 'bedrohung', 'Einschüchterung / Stalking-Andeutung'],
  [/sag\s+(mir\s+)?(deine\s+)?(adresse|wohnadresse)|ich\s+bin\s+(jetzt\s+)?(bei|vor)\s+deiner\s+tür/i, 8, 'bedrohung', 'Androhung realer Konfrontation'],

  // ── Diskriminierung / Hetze (SG 8–10) ──
  [/(alle|die)\s+(juden|muslime|moslems|flüchtlinge|ausländer|kanacken|schwulen?|lesben|behinderten?|sinti|roma)\s+(sollen|müssen|sind|gehören|raus|weg|verbrennen)/i, 10, 'diskriminierung', 'Gruppenbezogene Hetze'],
  [/scheiß\s+(juden|muslime|moslems|kanacken|neger|ausländer|flüchtlinge)/i, 10, 'diskriminierung', 'Diskriminierende Gruppen-Beschimpfung'],
  [/ausländer\s+raus|(zurück\s+)?in\s+dein\s+(land|heimat)/i, 8, 'diskriminierung', 'Fremdenfeindliche Parole'],

  // ── Schwere Beleidigung / Ausgrenzung (SG 6–8) ──
  [/verpiss\s+dich/i, 8, 'mobbing', 'Ausgrenzende Aufforderung zu gehen'],
  [/geh\s+(doch\s+)?(sterben|kacken)|dich\s+(doch\s+)?überfahren/i, 8, 'beleidigung', 'Extreme Aufforderung gegen eine Person'],
  [/niemand(en)?\s+(hier\s+)?(mag|braucht|will)\s+dich|no\s+one\s+likes\s+you/i, 7, 'mobbing', 'Soziale Ausgrenzung'],
  [/du\s+(bist|biste)\s+(so\s+)?(wertlos|abfall|müll|dreck|nutzlos|überflüssig)/i, 7, 'beleidigung', 'Schwere Herabwürdigung'],
  [/fick\s+dich|fuck\s+(you|u)\b/i, 7, 'beleidigung', 'Vulgäre direkte Beleidigung'],
  [/halt\s+die\s+fresse/i, 7, 'beleidigung', 'Grobe Schweige-Aufforderung'],
  [/leck\s+mich/i, 6, 'beleidigung', 'Vulgäre Abfuhr'],
  [/halt\s+(doch\s+)?(endlich\s+)?die\s+(klappe|schnauze)|maul\s+halten|klappe\s+halten|shut\s+(the\s+\w+\s+)?up/i, 6, 'beleidigung', 'Herabwürdigende Schweige-Aufforderung'],
  [/geh\s+weg(\s+(aus\s+dem\s+server|hier))?|verlasse\s+(doch\s+)?(den\s+)?server/i, 6, 'mobbing', 'Vertreibung aus der Community'],
  [/sei\s+(doch\s+)?(endlich\s+)?(mal\s+)?(ruhig|still)/i, 3, 'beleidigung', 'Ruhigstellung der Person'],

  // ── Gerichtete Abwertung (SG 3–5) ──
  [/du\s+(bist|biste)\s+(so\s+)?(dumm|blöd(e|es)?|doof|dämlich|retard(ed)?)\b/i, 5, 'beleidigung', 'Gerichtete Intelligenz-Abwertung'],
  [/du\s+(bist|biste)\s+(so\s+)?(lächerlich|traurig|armselig|pathetisch|peinlich)\b/i, 5, 'beleidigung', 'Gerichtete Herabwürdigung'],
  [/du\s+(bist|biste)\s+(ein|eine)\s+(idiot(in)?|trottel|pfeife|niete|versager(in)?|lachnummer|witzfigur)/i, 5, 'beleidigung', 'Personen-Abwertung'],
  [/lern\s+(erstmal|mal|doch\s+mal|erst\s+mal)\s+(lesen|schreiben|rechnen|die\s+grundlagen)/i, 4, 'passiv', 'Herablassende Fähigkeits-Kritik'],
  [/du\s+hast\s+(doch\s+)?(keine|null|0)\s+(ahnung|plan)/i, 3, 'passiv', 'Kompetenz-Abwertung'],
  [/kannst\s+du\s+(überhaupt\s+)?(gar\s+)?nichts(\s+(richtig|gescheites?))?([.!?,]|$)/i, 4, 'passiv', 'Pauschale Fähigkeits-Abwertung'],
  [/warum\s+bist\s+du\s+(überhaupt\s+)?(so\s+)?(nervig|nervtötend|anstrengend|lästig|toxic)/i, 4, 'passiv', 'Persönliche Ablehnung'],
  [/du\s+(bist|biste)\s+(so\s+)?(nervig|nervtötend|anstrengend|toxic|cringe)\b/i, 4, 'beleidigung', 'Gerichtete Ablehnung'],

  // ── Passiv-Aggressiv / Seitenhiebe (SG 2–4) ──
  [/toll\s+gemacht[,.\s]+(mal\s+)?(wieder|echt|richtig|aber)|schön[,.\s]+(dass\s+du\s+)?wieder\s+(mal\s+)?(kaputt|falsch|schief)/i, 3, 'passiv', 'Sarkastischer Seitenhieb'],
  [/wie\s+(immer|üblich)\s+(total\s+)?(versagt|kaputt|schief|falsch|daneben)/i, 4, 'passiv', 'Verallgemeinernde Abwertung'],
  [/natürlich\s+(hast\s+du\s+)?(wieder\s+)?(etwas\s+)?(kaputt|falsch|vermasselt)/i, 3, 'passiv', 'Vorwurfsvolle Verallgemeinerung'],
  [/das\s+kannst\s+du\s+(ja\s+)?wieder(\s+mal)?\s+nicht/i, 2, 'passiv', 'Passiv-aggressive Abwertung'],
  [/ist\s+(ja\s+)?(klar|logisch),?\s+(dass\s+)?(du|bei\s+dir)/i, 2, 'passiv', 'Herablassende Bemerkung'],

  // ── Sexuelle Belästigung (SG 5–8) ──
  [/(zeig|send|schick)\w*\s+(mir\s+)?(mal\s+)?(deine[nm]?\s+)?(brüste|titten|nudes|intimbilder)/i, 8, 'sexual', 'Sexuell übergriffige Forderung'],
  [/bist\s+du\s+(noch\s+)?jungfrau/i, 6, 'sexual', 'Grenzwertig intime Frage'],
  [/(geile?s?|scharfe[sn]?)\s+(figur|körper|brüste|titten)/i, 5, 'sexual', 'Sexualisierender Kommentar'],
];

// Kernanalyse eines reinen Texts (ohne Kontext) -> Treffer-Objekt oder null
function analysiereText(text, s) {
  const c = cfg(s);
  const liste = (s.wordFilter && s.wordFilter.words) || [];
  if (!text || String(text).trim().length < 2) return null;
  const norm = wordFilter.normalize(text);
  const funde = [];

  // 1) Wörterbuch (Wortfilter-Einträge als gewichtete Wissensbasis)
  for (const w of liste) {
    if (!w || !w.word) continue;
    let hit = false;
    if (w.regex) { try { hit = new RegExp(w.word, 'i').test(text); } catch (_) {} }
    else hit = norm.includes(wordFilter.normalize(w.word));
    if (!hit) continue;
    const kategorie = katVonWort(w);
    if (!c.kategorien[kategorie]) continue;
    funde.push({ kategorie, sg: w.schweregrad || 5, grund: 'Gewichteter Wörterbuch-Treffer ("' + w.word + '")' });
  }

  // 2) Muster-Bibliothek
  for (const [re, sg, kategorie, grund] of MUSTER) {
    if (!c.kategorien[kategorie]) continue;
    if (re.test(text)) funde.push({ kategorie, sg, grund });
  }

  if (!funde.length) return null;

  // 3) Scoring: härtester Fund + Eskalationen
  const best = funde.reduce((a, b) => (b.sg > a.sg ? b : a));
  let sg = best.sg;
  const eskalation = [];

  const gerichtet = /\b(du|dich|dir|deine[rn]?|deins)\b|\byou(r)?\b/i.test(text);
  const gBonus = c.sent.gerichtetBonus != null ? c.sent.gerichtetBonus : 2;
  if (gerichtet) { sg += gBonus; eskalation.push('gerichtet formuliert (+' + gBonus + ')'); }

  const buchstaben = text.replace(/[^a-zA-ZäöüÄÖÜß]/g, '');
  if (buchstaben.length >= 8 && buchstaben === buchstaben.toUpperCase() && /[A-ZÄÖÜ]{5,}/.test(text)) {
    sg += 1; eskalation.push('CAPS-Aggression (+1)');
  }
  if (/!{3,}/.test(text)) { sg += 1; eskalation.push('Ausrufezeichen-Kette (+1)'); }
  if (funde.length >= 2) {
    const b = funde.length >= 4 ? 2 : 1;
    sg += b; eskalation.push(funde.length + ' Muster in einer Nachricht (+' + b + ')');
  }

  return {
    beleidigung: true,
    diskriminierung: best.kategorie === 'diskriminierung',
    kategorie: best.kategorie,
    schweregrad: Math.max(1, Math.min(10, Math.round(sg))),
    begruendung: best.grund +
      (eskalation.length ? ' – Eskalation: ' + eskalation.join(', ') : '') +
      (funde.length > 1 ? ' (' + funde.length + ' Muster erkannt)' : ''),
    zitat: String(text).slice(0, 200),
  };
}

// Live-Prüfung einer Discord-Nachricht (Mentions, Mobbing, Wiederholung)
function pruefe(message, s) {
  const c = cfg(s);
  const treffer = analysiereText(message.content || '', s);
  if (!treffer) return null;

  const ziel = message.mentions && message.mentions.users && message.mentions.users.first
    ? message.mentions.users.first() : null;
  const zielId = ziel ? ziel.id : null;

  if (zielId && message.author && zielId !== message.author.id) {
    treffer.schweregrad = Math.min(10, treffer.schweregrad + 1);
    treffer.begruendung += ' – gegen eine konkret genannte Person (+1)';
  }

  // Wiederholungstäter-Bonus (frühere Verstöße im Zeitfenster)
  if (message.guild && message.author && c.wiederholung.aktiv !== false) {
    const key = message.guild.id + '_' + message.author.id;
    const jetzt = Date.now();
    const fenster = (c.wiederholung.fensterMin || 30) * 60000;
    const liste = (delikte.get(key) || []).filter((t) => jetzt - t <= fenster);
    if (liste.length) {
      const bonus = Math.min(liste.length, c.wiederholung.maxBonus || 3);
      treffer.schweregrad = Math.min(10, treffer.schweregrad + bonus);
      treffer.begruendung += ' – Wiederholungstäter: ' + liste.length + ' frühere Verstöße (+' + bonus + ')';
    }
  }

  // Mobbing-Verlauf
  if (zielId && message.guild && message.author && zielId !== message.author.id && treffer.schweregrad >= 4) {
    const key = message.guild.id + '_' + message.author.id;
    const jetzt = Date.now();
    const fenster = (c.sent.mobbingFensterMin || 10) * 60000;
    const list = (mobbingVerlauf.get(key) || []).filter((e) => jetzt - e.zeit <= fenster);
    list.push({ ziel: zielId, zeit: jetzt });
    mobbingVerlauf.set(key, list);
    const gegenZiel = list.filter((e) => e.ziel === zielId).length;
    if (gegenZiel >= (c.sent.mobbingAngriffe || 3)) {
      treffer.kategorie = 'mobbing';
      treffer.diskriminierung = false;
      treffer.beleidigung = true;
      treffer.schweregrad = Math.min(10, Math.max(treffer.schweregrad, 6) + 1);
      treffer.begruendung = 'MOBBING-MUSTER: ' + gegenZiel + ' gerichtete Angriffe in ' +
        (c.sent.mobbingFensterMin || 10) + ' Min. gegen dieselbe Person. ' + treffer.begruendung;
    }
  }

  // Delikt registrieren, wenn die Verstoß-Schwelle erreicht ist
  if (message.guild && message.author && treffer.beleidigung && treffer.schweregrad >= c.schwelle) {
    const key = message.guild.id + '_' + message.author.id;
    const liste = delikte.get(key) || [];
    liste.push(Date.now());
    delikte.set(key, liste);
  }
  return treffer;
}

// Batch-Analyse über den Puffer-Snapshot (KI-Batch-kompatibles Format)
function kontextPruefen(snapshot, s, guildId) {
  const c = cfg(s);
  const proAutor = new Map();
  const verstoesse = [];
  snapshot.forEach((e, index) => {
    const t = analysiereText(e.inhalt, s);
    if (!t) return;
    proAutor.set(e.authorId, (proAutor.get(e.authorId) || 0) + 1);
    verstoesse.push({ index, ...t });
  });
  for (const v of verstoesse) {
    const autor = snapshot[v.index] && snapshot[v.index].authorId;
    const n = proAutor.get(autor) || 0;
    if (n >= (c.sent.mobbingAngriffe || 3) && v.kategorie !== 'mobbing') {
      v.kategorie = 'mobbing';
      v.schweregrad = Math.min(10, v.schweregrad + 1);
      v.begruendung = n + ' auffällige Nachrichten im Zeitraum – wiederholtes Muster. ' + v.begruendung;
    }
    if (guildId && v.beleidigung && v.schweregrad >= c.schwelle) {
      const key = guildId + '_' + autor;
      const liste = delikte.get(key) || [];
      liste.push(Date.now());
      delikte.set(key, liste);
    }
  }
  return { verstoesse };
}

module.exports = { pruefe, kontextPruefen, analysiereText };
