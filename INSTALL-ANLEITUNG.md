# 📲 Lumiox installieren (Open Alpha)

Da Lumiox während der Alpha **Closed Source** ist, läuft die Installation
über unsere Release-Pakete statt über den Quellcode.

## Schritt 1: Termux installieren
https://f-droid.org/packages/com.termux/

## Schritt 2: Installer ausführen
```bash
curl -sL https://ginizw.de/lumiox/install.sh | bash

**Das Kernstück – Code-Verschleierung:** Der professionelle Weg heißt **JavaScript-Obfuskation**. Dein Code wird dabei in unlesbaren Maschinencode verwandelt (Funktionsnamen → `a`, `b`, `_0x3f2c` …), bleibt aber funktionsfähig:

```bash
# Obfuscator in Termux installieren:
cd ~/dcbot1
npm install --save-dev javascript-obfuscator

# Ein Release-Build-Skript:
cat > ~/dcbot1/build-release.js << 'EOF'
// Baucht einen verschleierten Release-Ordner (build/) ohne lesbaren Code
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const DIR = __dirname;
const OUT = path.join(DIR, '..', 'lumiox-release');
const OBF = path.join(DIR, 'node_modules', '.bin', 'javascript-obfuscator');

// 1) Aufräumen
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 2) Dateien kopieren (ohne node_modules, .git, config, data, Public-HTML bleibt lesbar –
//    dort steht kein sensibler Code, nur das Design)
function kopiere(quelle, ziel) {
  for (const f of fs.readdirSync(quelle)) {
    if (['node_modules', '.git', 'data', 'config.json', 'build-release.js'].includes(f)) continue;
    const q = path.join(quelle, f), z = path.join(ziel, f);
    if (fs.statSync(q).isDirectory()) { fs.mkdirSync(z, { recursive: true }); kopiere(q, z); }
    else if (f.endsWith('.js')) {
      // Verschlüsseln/verschleiern:
      execSync(`"${OBF}" "${q}" --output "${z}" --compact true --control-flow-flattening true --string-array true --string-array-encoding rc4 --self-defending true`, { stdio: 'pipe' });
    } else { fs.copyFileSync(q, z); }
  }
}
kopiere(DIR, OUT);

// 3) package.json ohne dev-Dinge + Start-Anleitung
fs.writeFileSync(path.join(OUT, 'ALPHA-HINWEIS.txt'),
`LUMIOX v0.8.0-alpha – Closed Source Release
© ginizw – All Rights Reserved.
Dieser Code ist verschleiert. Dekompilieren, Reverse Engineering und
Weitergabe sind laut Lizenz untersagt. Viel Spaß beim Testen!`);

console.log('✔ Release-Build fertig: ' + OUT);
console.log('→ Diesen Ordner als ZIP ins GitHub-Release hochladen (statt Source code).');
