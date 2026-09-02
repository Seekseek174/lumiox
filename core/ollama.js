// ═══════════════════════════════════════════════════════════════
// Ollama-Client mit Offline-Erkennung.
//  - checkOnline(): Status-Cache 15 s (kein Request-Spam)
//  - generate(): /api/generate (Einzel-Prompt, Moderation, /ai)
//  - chat(): /api/chat (KI-Chat-Kanal, Übersetzung, Persona)
//  - extractJSON(): robustes Herausparsen von Modell-JSON
// Alle Aufrufe mit AbortController-Timeout – hängt sich nie auf.
// ═══════════════════════════════════════════════════════════════
'use strict';

const config = require('./config');

const status = { online: false, lastCheck: 0, lastError: '', lastLatencyMs: 0 };
let pruefeLaeuft = false;

function baseUrl() {
  return (config.get().ollama && config.get().ollama.url) || 'http://127.0.0.1:11434';
}
function modelName(fallback) {
  return fallback || (config.get().ollama && config.get().ollama.model) || 'gemma2:2b';
}

async function checkOnline(force = false) {
  const jetzt = Date.now();
  if (!force && jetzt - status.lastCheck < 15000) return status.online;
  if (pruefeLaeuft) return status.online;
  pruefeLaeuft = true;
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch(baseUrl() + '/api/tags', { signal: ctrl.signal });
    clearTimeout(t);
    status.online = res.ok;
    status.lastError = res.ok ? '' : `HTTP ${res.status}`;
  } catch (e) {
    status.online = false;
    status.lastError = e.name === 'AbortError'
      ? 'Zeitüberschreitung – läuft Ollama? (ollama serve)'
      : e.message;
  } finally {
    status.lastCheck = Date.now();
    status.lastLatencyMs = Date.now() - start;
    pruefeLaeuft = false;
  }
  return status.online;
}

// sendet /api/generate, gibt den Antwort-Text zurück
async function generate(prompt, { system = '', temperature = null, model = null, timeoutMs = 45000 } = {}) {
  const body = {
    model: modelName(model),
    prompt,
    stream: false,
    options: { temperature: temperature ?? (config.get().ollama?.temperature ?? 0.2) },
  };
  if (system) body.system = system;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl() + '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama antwortete mit HTTP ${res.status}`);
    const data = await res.json();
    status.online = true;
    status.lastCheck = Date.now();
    status.lastError = '';
    return data.response || '';
  } catch (e) {
    status.online = false;
    status.lastCheck = Date.now();
    status.lastError = e.name === 'AbortError' ? 'Zeitüberschreitung der KI-Anfrage' : e.message;
    throw (e.name === 'AbortError' ? new Error('Ollama antwortet nicht (Timeout).') : e);
  } finally {
    clearTimeout(t);
  }
}

// sendet /api/chat, gibt den Antwort-Text zurück
async function chat(messages, { model = null, temperature = null, timeoutMs = 60000 } = {}) {
  const body = {
    model: modelName(model),
    messages,
    stream: false,
    options: { temperature: temperature ?? (config.get().ollama?.temperature ?? 0.2) },
  };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(baseUrl() + '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`Ollama antwortete mit HTTP ${res.status}`);
    const data = await res.json();
    status.online = true;
    status.lastCheck = Date.now();
    return (data.message && data.message.content) || '';
  } catch (e) {
    status.online = false;
    status.lastError = e.name === 'AbortError' ? 'Zeitüberschreitung der KI-Anfrage' : e.message;
    throw (e.name === 'AbortError' ? new Error('Ollama antwortet nicht (Timeout).') : e);
  } finally {
    clearTimeout(t);
  }
}

// Extrahiert das erste gültige JSON-Objekt aus einer Modellantwort
// (robust gegen ```json-Fences und Geschwafel davor/danach).
function extractJSON(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

function getStatus() {
  return { ...status };
}

module.exports = { checkOnline, generate, chat, extractJSON, getStatus };
