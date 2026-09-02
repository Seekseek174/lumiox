'use strict';
const levelSystem = require('./levelSystem');
const config = require('../../core/config');
function baueSVG(member, s) {
  const d = levelSystem.getLevelDoc(member.guild.id, member.id);
  const needed = levelSystem.xpFuerLevel(d.level + 1);
  const anteil = Math.min(1, d.xp / Math.max(1, needed));
  const avatar = member.user.displayAvatarURL({ size: 128, extension: 'png' });
  const farbe = member.displayColor && member.displayColor !== 0 ? '#' + member.displayColor.toString(16).padStart(6, '0') : '#5865F2';
  const balkenB = 640 * anteil;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="260">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f1220"/><stop offset="100%" stop-color="#1a1033"/>
    </linearGradient>
    <linearGradient id="bar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#e879f9"/>
    </linearGradient>
    <clipPath id="ava"><circle cx="105" cy="105" r="55"/></clipPath>
  </defs>
  <rect width="800" height="260" rx="20" fill="url(#bg)" stroke="${farbe}" stroke-width="3"/>
  <image href="${avatar}" x="50" y="50" width="110" height="110" clip-path="url(#ava)"/>
  <text x="190" y="80" fill="#eef1f7" font-family="Arial" font-size="28" font-weight="bold">${member.user.username.replace(/[<>&]/g, '')}</text>
  <text x="190" y="115" fill="#8b93a7" font-family="Arial" font-size="18">Level ${d.level} · ${d.xp.toLocaleString('de-DE')} XP</text>
  <rect x="190" y="140" width="540" height="26" rx="13" fill="rgba(255,255,255,.12)"/>
  <rect x="190" y="140" width="${Math.max(10, balkenB)}" height="26" rx="13" fill="url(#bar)"/>
  <text x="192" y="159" fill="#fff" font-family="Arial" font-size="14">${d.xp.toLocaleString('de-DE')} / ${needed.toLocaleString('de-DE')} XP</text>
  <text x="720" y="230" fill="#8b93a7" font-family="Arial" font-size="14">Rang: #${(levelSystem.rangVon ? levelSystem.rangVon(member) : '?')}</text>
  <text x="640" y="40" fill="${farbe}" font-family="Arial" font-size="20" font-weight="bold">LUMIOX</text>
</svg>`;
}
module.exports = { baueSVG };
