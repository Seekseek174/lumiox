// Austritt -> Log-System
'use strict';

const logSystem = require('../systems/logSystem');
const { getGuildDoc } = require('../../core/utils');
const db = require('../../core/db');

module.exports = function guildMemberRemove(member) {
  const dok = getGuildDoc(member.guild.id);
  dok.mitglieder = member.guild.memberCount;
  db.set('guilds', member.guild.id, dok);
  logSystem.mitgliedVerlassen(member);
};
