// ═══════════════════════════════════════════════════════════════
// NEONBOT – Startpunkt
// Startet Bot UND Dashboard in einem einzigen Node-Prozess.
// Ressourcenschonend ausgelegt für Termux (kein Root, begrenztes RAM).
// ═══════════════════════════════════════════════════════════════
'use strict';

const logger = require('./core/logger');
const db = require('./core/db');
const config = require('./core/config');

// Globale Fehlerbehandlung – der Prozess darf auf einem Handy nicht sterben.
process.on('uncaughtException', (err) => {
  logger.error('Unbehandelter Fehler: ' + (err && err.stack ? err.stack : err));
});
process.on('unhandledRejection', (err) => {
  logger.error('Unbehandelte Zusage (Promise): ' + (err && err.stack ? err.stack : err));
});

async function main() {
  logger.banner();
  db.init();
  db.shutdownHooks();
  config.init();

  // 1) Dashboard zuerst starten, damit der Setup-Assistent IMMER erreichbar
  //    ist – auch wenn der Bot noch keinen Token hat oder ein falscher
  //    Token hinterlegt ist.
  const { startDashboard } = require('./dashboard/server');
  startDashboard();

  // 2) Bot starten, sobald ein Token vorhanden ist. Schlägt der Login fehl
  //    (z. B. falscher Token, kein Internet), läuft das Dashboard trotzdem
  //    weiter und der Token kann dort korrigiert werden.
  const { startBot } = require('./bot/client');
  if (config.get().token) {
    try {
      await startBot();
    } catch (err) {
      logger.error('Bot-Start fehlgeschlagen: ' + err.message);
      logger.info('Das Dashboard läuft weiter – Token kann dort korrigiert werden.');
    }
  } else {
    logger.info('Kein Token vorhanden – bitte den Setup-Assistenten im Dashboard öffnen.');
  }
}

main();
