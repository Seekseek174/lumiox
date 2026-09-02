// Nachrichten-Löschung -> Log-System
'use strict';

const logSystem = require('../systems/logSystem');

module.exports = function messageDelete(message) {
  if (!message.guild || message.author?.bot) return;
  logSystem.nachrichtGeloescht(message);
};
