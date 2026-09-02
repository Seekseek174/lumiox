#!/data/data/com.termux/files/usr/bin/bash
# ═══════════════════════════════════════════════════════════
#  LUMIOX – Ein-Klick-Installation für Termux
#  Nutzung:  curl -sL https://raw.githubusercontent.com/Seekseek174/lumiox/main/install.sh | bash
# ═══════════════════════════════════════════════════════════
set -e
GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
schritt() { echo -e "${CYAN}▶ $1${NC}"; }
fertig()  { echo -e "${GREEN}✔ $1${NC}"; }

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   LUMIOX Installation                    ║"
echo "  ║   Light. Data. Possibilities.            ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

schritt "1/7  Android wecken (verhindert, dass der Bot einschläft)"
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || echo "   (termux-wake-lock nicht verfügbar – übersprungen)"

schritt "2/7  System-Pakete installieren (dauert einige Minuten)"
pkg update -y >/dev/null 2>&1 || true
pkg install -y nodejs-lts git
fertig "Node.js $(node --version) installiert"

schritt "3/7  Lumiox-Code herunterladen"
if [ -d "$HOME/lumiox" ]; then
  echo "   Ordner existiert schon – update stattdessen ..."
  cd "$HOME/lumiox" && git pull || true
else
  git clone https://github.com/Seekseek174/lumiox.git "$HOME/lumiox"
  cd "$HOME/lumiox"
fi
fertig "Code liegt in ~/lumiox"

schritt "4/7  Bot-Abhängigkeiten installieren"
npm install --no-audit --no-fund
fertig "discord.js & Server bereit"

schritt "5/7  Start-Skript ausführbar machen"
chmod +x start-skript.sh 2>/dev/null || true
fertig "start-skript.sh bereit"

schritt "6/7  KI (Ollama) – Hinweis"
echo "   Die lokale KI braucht Ollama. Installiere es jetzt mit:"
echo ""
echo "      pkg install ollama && ollama pull gemma2:2b"
echo ""
echo "   (kann je nach Internet 10–30 Min. dauern, ~1,7 GB)"
echo "   Ohne Ollama läuft Lumiox trotzdem – dann ohne KI-Moderation."

schritt "7/7  Homescreen-Icon erstellen (Termux:Widget)"
mkdir -p ~/.shortcuts
cat > ~/.shortcuts/Lumiox\ starten << 'WEOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
cd ~/lumiox
if ! curl -s -o /dev/null http://127.0.0.1:11434/api/tags; then
  ollama serve >/dev/null 2>&1 &
  sleep 3
fi
node index.js
WEOF
chmod +x ~/.shortcuts/Lumiox\ starten
fertig "Shortcut angelegt (mit Termux:Widget-App aufs Homescreen legen)"

echo ""
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo "  Installation fertig! So startest du:"
echo ""
echo "    cd ~/lumiox && node index.js"
echo ""
echo "  Dann im Browser öffnen:"
echo "    http://localhost:3000"
echo ""
echo "  → Setup-Assistent folgt (Token, Admin-Login, Design)"
echo -e "${GREEN}════════════════════════════════════════════${NC}"
echo ""
echo "Jetzt starten? [j/N]"
read -r ANTWORT
if [ "$ANTWORT" = "j" ] || [ "$ANTWORT" = "J" ]; then
  node index.js
fi
