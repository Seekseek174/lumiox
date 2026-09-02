// Nachrichten-Bearbeitung -> Log-System
'use strict';

const logSystem = require('../systems/logSystem');

module.exports = function messageUpdate(oldMessage, newMessage) {
  if (!newMessage.guild || newMessage.author?.bot) return;
  logSystem.nachrichtBearbeitet(oldMessage, newMessage);
};
