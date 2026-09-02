#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# NEONBOT-Starter für Termux
# Startet Ollama und den Bot gemeinsam und verhindert, dass
# Android den Prozess einschläft.
# ═══════════════════════════════════════════════════════════════
command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock

# Ollama nur starten, wenn es nicht bereits läuft
if ! curl -s -o /dev/null http://127.0.0.1:11434/api/tags; then
  echo "[start] Ollama wird gestartet ..."
  ollama serve >/dev/null 2>&1 &
  sleep 3
fi

echo "[start] Bot + Dashboard werden gestartet ..."
node index.js
