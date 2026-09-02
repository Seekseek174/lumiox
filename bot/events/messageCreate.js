// Nachrichten-Pipeline: alles delegiert an systems.handleMessage
// (Wortfilter -> Auto-Mod -> Statistik/Level -> KI-Moderation -> KI-Chat)
'use strict';

const systems = require('../systems');

module.exports = function messageCreate(message) {
  if (!message.guild || message.author.bot) return;
  return systems.handleMessage(message);
};
