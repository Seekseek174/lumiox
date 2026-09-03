'use strict';
// ══════════════════ LUMIOX STUDIO – BLOCK-KATALOG (46 Blöcke) ══════════════════
const KAT = [
  { typ:'respond', kat:'message', c:'#34d399', ico:'💬', name:'Send Reply', desc:'Antwort an den Nutzer', felder:[
    {k:'text',l:'Text',t:'textarea',d:'Hallo {user}! 🎉'},{k:'title',l:'Embed-Titel (optional)',t:'text'},
    {k:'color',l:'Embed-Farbe HEX',t:'text',d:'5865F2'},{k:'embed',l:'Als Embed',t:'bool'},{k:'ephemeral',l:'Nur für Nutzer',t:'bool'}] },
  { typ:'send_channel', kat:'message', c:'#4aa3ff', ico:'📨', name:'Send in Channel', desc:'In Kanal senden', felder:[
    {k:'kanal',l:'Kanal-ID',t:'text'},{k:'text',l:'Text',t:'textarea',d:'Neuigkeit!'}] },
  { typ:'dm', kat:'message', c:'#e879f9', ico:'📩', name:'Send DM', desc:'Private Nachricht', felder:[
    {k:'text',l:'Text',t:'textarea',d:'Private Nachricht!'}] },
  { typ:'react_msg', kat:'message', c:'#fbbf24', ico:'⚡', name:'React', desc:'Emoji hinzufügen', felder:[
    {k:'emoji',l:'Emoji',t:'text',d:'👍'}] },
  { typ:'pin_msg', kat:'message', c:'#818cf8', ico:'📌', name:'Pin Last Message', desc:'Letzte Nachricht pinnen', felder:[] },
  { typ:'create_transcript', kat:'message', c:'#46c2cb', ico:'📄', name:'Create Transcript', desc:'Transkript senden', felder:[
    {k:'kanal',l:'Ziel-Kanal-ID',t:'text'}] },
  { typ:'poll', kat:'message', c:'#9b59b6', ico:'📊', name:'Mini Poll', desc:'Umfrage starten', felder:[
    {k:'frage',l:'Frage',t:'text',d:'Wie findet ihr das?'},{k:'optionen',l:'Optionen (Komma)',t:'text',d:'Ja,Nein'}] },
  { typ:'comparison', kat:'conditions', c:'#fbbf24', ico:'⚖️', name:'Comparison', desc:'Zwei Werte vergleichen', felder:[
    {k:'wertA',l:'Wert A',t:'text'},{k:'op',l:'Operator',t:'select',opts:['>','<','=','>=','<=']},
    {k:'wertB',l:'Wert B',t:'text'},{k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'random', kat:'conditions', c:'#e879f9', ico:'🎲', name:'Chance', desc:'Zufalls-Zweig', felder:[
    {k:'chance',l:'Chance %',t:'number',d:50},{k:'dann',l:'Getroffen',t:'nested'},{k:'sonst',l:'Nicht',t:'nested'}] },
  { typ:'permission', kat:'conditions', c:'#f43f5e', ico:'🔒', name:'Permissions', desc:'Permission prüfen', felder:[
    {k:'perm',l:'Permission',t:'select',opts:['ManageMessages','KickMembers','BanMembers','ManageRoles','Administrator']},
    {k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'role_cond', kat:'conditions', c:'#22d3ee', ico:'🏷️', name:'Role Condition', desc:'Rolle prüfen', felder:[
    {k:'rolle',l:'Rolle',t:'rolle'},{k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'channel_cond', kat:'conditions', c:'#46c2cb', ico:'#️⃣', name:'Channel Condition', desc:'Kanal prüfen', felder:[
    {k:'kanal',l:'Kanal-ID',t:'text'},{k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'user_cond', kat:'conditions', c:'#9b59b6', ico:'👤', name:'User Condition', desc:'User prüfen', felder:[
    {k:'user',l:'User-ID',t:'text'},{k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'if_money', kat:'conditions', c:'#f7931a', ico:'💰', name:'Money Condition', desc:'Geld >= X', felder:[
    {k:'menge',l:'Mindest-Geld',t:'number',d:100},{k:'dann',l:'Dann',t:'nested'},{k:'sonst',l:'Sonst',t:'nested'}] },
  { typ:'add_roles', kat:'roles', c:'#22d3ee', ico:'➕', name:'Add Roles', desc:'Rollen geben (IDs mit Komma)', felder:[
    {k:'rolle',l:'Rollen-IDs',t:'text'}] },
  { typ:'remove_roles', kat:'roles', c:'#f43f5e', ico:'➖', name:'Remove Roles', desc:'Rollen entfernen', felder:[
    {k:'rolle',l:'Rollen-IDs',t:'text'}] },
  { typ:'add_role_all', kat:'roles', c:'#f43f5e', ico:'🌍', name:'Add Role to ALL', desc:'Rolle an ALLE Mitglieder', felder:[
    {k:'rolle',l:'Rolle',t:'rolle'}] },
  { typ:'create_role', kat:'roles', c:'#34d399', ico:'✨', name:'Create Role', desc:'Rolle erstellen', felder:[
    {k:'name',l:'Name',t:'text',d:'Neue Rolle'},{k:'farbe',l:'Farbe HEX',t:'text',d:'99AAB5'}] },
  { typ:'delete_role', kat:'roles', c:'#C0392B', ico:'🗑️', name:'Delete Role', desc:'Rolle löschen', felder:[
    {k:'rolle',l:'Rolle-ID',t:'text'}] },
  { typ:'create_channel', kat:'channels', c:'#34d399', ico:'➕', name:'Create Channel', desc:'Kanal erstellen', felder:[
    {k:'name',l:'Name',t:'text',d:'neuer-kanal'}] },
  { typ:'delete_channel', kat:'channels', c:'#C0392B', ico:'🗑️', name:'Delete Channel', desc:'Kanal löschen', felder:[
    {k:'kanal',l:'Kanal-ID',t:'text'}] },
  { typ:'create_thread', kat:'channels', c:'#818cf8', ico:'🧵', name:'Create Thread', desc:'Thread erstellen', felder:[
    {k:'name',l:'Name',t:'text',d:'Neuer Thread'}] },
  { typ:'kick', kat:'server', c:'#f43f5e', ico:'👢', name:'Kick Member', desc:'Mitglied kicken', felder:[
    {k:'user',l:'User-ID',t:'text'},{k:'grund',l:'Grund',t:'text',d:'Kick'}] },
  { typ:'ban', kat:'server', c:'#C0392B', ico:'🔨', name:'Ban Member', desc:'Mitglied bannen', felder:[
    {k:'user',l:'User-ID',t:'text'},{k:'grund',l:'Grund',t:'text',d:'Ban'}] },
  { typ:'timeout', kat:'server', c:'#fbbf24', ico:'⏳', name:'Timeout', desc:'Timeout in Minuten', felder:[
    {k:'user',l:'User-ID',t:'text'},{k:'min',l:'Minuten',t:'number',d:10},{k:'grund',l:'Grund',t:'text',d:'Timeout'}] },
  { typ:'nickname', kat:'server', c:'#818cf8', ico:'✏️', name:'Change Nickname', desc:'Nickname ändern', felder:[
    {k:'user',l:'User-ID',t:'text'},{k:'name',l:'Neuer Name',t:'text'}] },
  { typ:'purge', kat:'server', c:'#e67e22', ico:'🧹', name:'Purge Messages', desc:'Nachrichten löschen', felder:[
    {k:'anzahl',l:'Anzahl',t:'number',d:10}] },
  { typ:'invite', kat:'server', c:'#34d399', ico:'🔗', name:'Create Invite', desc:'Einladung erstellen', felder:[
    {k:'stunden',l:'Stunden',t:'number',d:24}] },
  { typ:'add_money', kat:'wirtschaft', c:'#34d399', ico:'💰', name:'Add Money', desc:'Geld geben', felder:[
    {k:'menge',l:'Menge',t:'number',d:100}] },
  { typ:'remove_money', kat:'wirtschaft', c:'#f43f5e', ico:'💸', name:'Remove Money', desc:'Geld nehmen', felder:[
    {k:'menge',l:'Menge',t:'number',d:50}] },
  { typ:'add_xp', kat:'wirtschaft', c:'#22d3ee', ico:'⭐', name:'Add XP', desc:'XP geben', felder:[
    {k:'menge',l:'XP',t:'number',d:25}] },
  { typ:'set_var', kat:'variables', c:'#9b59b6', ico:'✏️', name:'Set Variable', desc:'Variable setzen', felder:[
    {k:'name',l:'Name',t:'text',d:'meineVar'},{k:'wert',l:'Wert',t:'text'}] },
  { typ:'run_equation', kat:'variables', c:'#8e44ad', ico:'🧮', name:'Run Equation', desc:'Rechnung ausführen', felder:[
    {k:'equation',l:'Rechnung',t:'text',d:'2+2'},{k:'name',l:'Ergebnis-Name',t:'text',d:'result'}] },
  { typ:'delete_var', kat:'variables', c:'#C0392B', ico:'🗑️', name:'Delete Variable', desc:'Variable löschen', felder:[
    {k:'name',l:'Name',t:'text',d:'meineVar'}] },
  { typ:'fetch_api', kat:'api', c:'#4aa3ff', ico:'🌐', name:'Send API Request', desc:'HTTP GET -> JSON', felder:[
    {k:'url',l:'API-URL',t:'text'},{k:'varName',l:'In Variable',t:'text',d:'api'}] },
  { typ:'run_loop', kat:'loops', c:'#2ecc71', ico:'🔁', name:'Run a Loop', desc:'X-mal ausführen', felder:[
    {k:'mal',l:'Wie oft',t:'number',d:3},{k:'dann',l:'Loop-Blöcke',t:'nested'}] },
  { typ:'stop_loop', kat:'loops', c:'#C0392B', ico:'⏹️', name:'Stop a Loop', desc:'Loop stoppen', felder:[] },
  { typ:'join_voice', kat:'voice', c:'#9b59b6', ico:'🔊', name:'Join Voice', desc:'Voice betreten', felder:[
    {k:'kanal',l:'Voice-Kanal-ID',t:'text'}] },
  { typ:'leave_voice', kat:'voice', c:'#95a5a6', ico:'🔇', name:'Leave Voice', desc:'Voice verlassen', felder:[] },
  { typ:'start', kat:'start', c:'#34d399', ico:'▶️', name:'START', desc:'Beginn des Befehls', felder:[] },
  { typ:'abbruch', kat:'other', c:'#33343d', ico:'⛔', name:'Stop Flow', desc:'Kette beenden', felder:[] },
];
// ── NEUE BLÖCKE 0.9.1 ──
KAT.push(
  { typ:'wait_min', kat:'other', c:'#f39c12', ico:'⏲️', name:'Wait Minutes', desc:'Warten in Minuten (bis 60)', felder:[
    {k:'minuten',l:'Minuten',t:'number',d:5}]},
  { typ:'send_embed_webhook', kat:'message', c:'#4aa3ff', ico:'🪝', name:'Webhook Message', desc:'Via Webhook senden', felder:[
    {k:'url',l:'Webhook-URL',t:'text'},{k:'text',l:'Text',t:'textarea',d:'Via Webhook!'}]},
  { typ:'nickname_user', kat:'server', c:'#818cf8', ico:'✏️', name:'Set MY Nickname', desc:'Eigenen Nickname ändern', felder:[
    {k:'name',l:'Neuer Nickname',t:'text',d:'Lumiox'}]},
  { typ:'channel_info', kat:'message', c:'#22d3ee', ico:'ℹ️', name:'Channel Info', desc:'Kanal-Infos senden', felder:[
    {k:'kanal',l:'Kanal-ID (leer = dieser)',t:'text'}]},
  { typ:'random_color', kat:'message', c:'#e879f9', ico:'🎨', name:'Random Color Embed', desc:'Embed mit Zufallsfarbe', felder:[
    {k:'text',l:'Text',t:'textarea',d:'Bunte Nachricht!'}]},
  { typ:'user_avatar', kat:'message', c:'#9b59b6', ico:'🖼️', name:'Show Avatar', desc:'Avatar des Nutzers zeigen', felder:[
    {k:'user',l:'User-ID (leer = ausführender)',t:'text'}]},
  { typ:'server_icon', kat:'message', c:'#f7931a', ico:'🏰', name:'Server Icon Embed', desc:'Server-Icon + Infos', felder:[]},
  { typ:'time_check', kat:'conditions', c:'#fbbf24', ico:'🕐', name:'Time Condition', desc:'Prüfe Tageszeit', felder:[
    {k:'vonStunde',l:'Von Stunde (0-23)',t:'number',d:18},{k:'bisStunde',l:'Bis Stunde',t:'number',d:6},
    {k:'dann',l:'Innerhalb',t:'nested'},{k:'sonst',l:'Außerhalb',t:'nested'}]},
  { typ:'counter', kat:'variables', c:'#46c2cb', ico:'🔢', name:'Counter +1', desc:'Zähler hochzählen', felder:[
    {k:'name',l:'Zähler-Name',t:'text',d:'zaehler'}]},
  { typ:'counter_reset', kat:'variables', c:'#C0392B', ico:'🔄', name:'Counter Reset', desc:'Zähler auf 0', felder:[
    {k:'name',l:'Zähler-Name',t:'text',d:'zaehler'}]},
);
const KAT_NAMEN = { start:'▶️ Start', message:'💬 Message', conditions:'❓ Conditions', roles:'🏷️ Roles',
  channels:'#️⃣ Channels', server:'⚙️ Server', wirtschaft:'💰 Wirtschaft', variables:'📝 Variables',
  api:'🌐 API', loops:'🔁 Loops', voice:'🔊 Voice', other:'✨ Other' };