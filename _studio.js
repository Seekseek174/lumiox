  // ══════════════════ SEITE: EMBED-STUDIO ══════════════════
  async function seiteEmbedStudio(page) {
    const kan = await ladeKanäle();
    const textKanäle = kan.filter((k) => k.typ !== 4);

    page.appendChild(el('<div class="panel card"><h3>🪄 Embed-Studio <span class="dim small">– professionelle Discord-Embeds mit echter Live-Vorschau</span></h3>' +
      '<p class="dim small">Links bauen, rechts siehst du exakt, wie es in Discord aussieht. Limit-Zähler included.</p></div>'));

    const grid = el('<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:start"></div>');
    page.appendChild(grid);
    const formCol = el('<div style="display:flex;flex-direction:column;gap:14px"></div>');
    const prevCol = el('<div style="position:sticky;top:80px;display:flex;flex-direction:column;gap:14px"></div>');
    grid.appendChild(formCol);
    grid.appendChild(prevCol);
    const responsiv = () => {
      const einspaltig = innerWidth < 1050;
      grid.style.gridTemplateColumns = einspaltig ? '1fr' : 'minmax(0,1fr) minmax(0,1fr)';
      prevCol.style.position = einspaltig ? 'static' : 'sticky';
    };
    responsiv();
    addEventListener('resize', responsiv);

    const zeichen = (id, max) => {
      const f = document.getElementById(id);
      const c = document.getElementById(id + 'Cnt');
      if (!f || !c) return;
      const n = f.value.length;
      c.textContent = n + ' / ' + max;
      c.style.color = n > max ? 'var(--err)' : 'var(--dim)';
    };
    const eingabe = (id, max, label) =>
      '<input class="input" id="' + id + '" placeholder="' + esc(label) + '" maxlength="' + (max + 50) + '">' +
      '<div class="dim small" id="' + id + 'Cnt" style="text-align:right">0 / ' + max + '</div>';

    formCol.appendChild(karte('🎨 Basis', `
      <div class="grid-2">
        ${feld('Farbe', `<div style="display:flex;gap:10px;align-items:center"><input type="color" id="esColor" value="#5865F2" style="height:38px"><input class="input" id="esColorHex" value="#5865F2" style="max-width:110px" placeholder="5865F2"></div>`)}
        <div></div>
      </div>
      ${feld('Titel', eingabe('esTitle', 256, 'z. B. 🎉 Server-Update 0.8 ist da!'))}
      ${feld('Titel-Link (optional)', `<input class="input" id="esUrl" placeholder="https://…">`)}
      ${feld('Beschreibung', `<textarea class="input" id="esDesc" rows="5" placeholder="Der Haupttext deines Embeds…"></textarea><div class="dim small" id="esDescCnt" style="text-align:right">0 / 4096</div>`)}`));

    formCol.appendChild(karte('👤 Autor', `
      ${feld('Autor-Name', eingabe('esAuthorName', 256, 'z. B. Dein Server'))}
      <div class="grid-2">
        ${feld('Autor-Icon (URL)', `<input class="input" id="esAuthorIcon" placeholder="https://…png">`)}
        ${feld('Autor-Link', `<input class="input" id="esAuthorUrl" placeholder="https://…">`)}
      </div>`));

    formCol.appendChild(karte('🧱 Felder <span class="dim small" id="esFieldCnt">(0 / 25)</span>', `
      <div id="esFelder"></div>
      <button class="btn small mt" id="esFieldAdd">+ Feld hinzufügen</button>
      <p class="dim small mt">Bis zu 25 Felder. „Inline" = bis zu 3 nebeneinander.</p>`));

    formCol.appendChild(karte('🖼️ Medien', `
      <div class="grid-2">
        ${feld('Thumbnail (klein, oben rechts)', `<input class="input" id="esThumb" placeholder="https://…png">`)}
        ${feld('Großes Bild (unten)', `<input class="input" id="esImage" placeholder="https://…png">`)}
      </div>`));

    formCol.appendChild(karte('🦶 Fußzeile', `
      ${feld('Fußzeilen-Text', eingabe('esFooter', 2048, 'z. B. Lumiox · heute'))}
      <div class="grid-2">
        ${feld('Fußzeilen-Icon (URL)', `<input class="input" id="esFooterIcon" placeholder="https://…png">`)}
        <div class="feld"><span>Zeitstempel anhängen</span><label class="toggle"><input type="checkbox" id="esTimestamp"><i></i></label></div>
      </div>`));

    formCol.appendChild(karte('💾 & 📤 Speichern / Senden', `
      ${feld('Entwurfs-Name', `<input class="input" id="esName" placeholder="z. B. Update-Ankündigung">`)}
      <div class="row mb">
        <button class="btn primary" id="esSave">💾 Entwurf speichern</button>
        <button class="btn" id="esExport">⬇ JSON exportieren</button>
        <button class="btn danger" id="esReset">↺ Leeren</button>
      </div>
      <hr class="trenner">
      ${feld('Ziel-Kanal', `<select class="input" id="esKanal"><option value="">– Kanal wählen –</option>` +
        textKanäle.map((k) => `<option value="${esc(k.id)}">#${esc(k.name)}</option>`).join('') + `</select>`)}
      <button class="btn primary full" id="esSend">📤 In Kanal senden</button>
      <p class="dim small mt">Vor dem Senden werden geprüft: Discord-Limits, Bot-Rechte im Ziel-Kanal.</p>`));

    const draftKarte = karte('📚 Gespeicherte Entwürfe', '<div id="esDrafts"><p class="dim">Lade …</p></div>');
    formCol.appendChild(draftKarte);

    prevCol.appendChild(el('<div class="panel card"><h3>👁️ Live-Vorschau</h3>' +
      '<p class="dim small mb">So sieht es in Discord aus.</p>' +
      '<div id="esPrev"></div>' +
      '<div class="row mt" style="justify-content:space-between"><span class="dim small">Gesamt (Max 6000):</span>' +
      '<span class="dim small mono" id="esTotalCnt">0 / 6000</span></div>' +
      '<div class="progress mt"><i id="esTotalBar" style="width:0%"></i></div></div>'));

    function leseFelder() {
      return $$('#esFelder .es-frow').map((row) => ({
        name: $('.es-f-name', row).value,
        value: $('.es-f-value', row).value,
        inline: $('input[type=checkbox]', row).checked,
      })).filter((f) => f.name.trim() || f.value.trim());
    }

    function baueEmbed() {
      const v = (id) => { const n = document.getElementById(id); return n ? n.value.trim() : ''; };
      const emb = {};
      const hex = v('esColor').replace('#', '');
      emb.color = parseInt(hex, 16) || 0x5865F2;
      if (v('esTitle')) emb.title = v('esTitle');
      if (v('esUrl')) emb.url = v('esUrl');
      if (v('esDesc')) emb.description = v('esDesc');
      const felder = leseFelder();
      if (felder.length) emb.fields = felder.map((f) => ({ name: f.name || '\u200b', value: f.value || '\u200b', inline: f.inline }));
      if (v('esAuthorName')) {
        emb.author = { name: v('esAuthorName') };
        if (v('esAuthorIcon')) emb.author.icon_url = v('esAuthorIcon');
        if (v('esAuthorUrl')) emb.author.url = v('esAuthorUrl');
      }
      if (v('esFooter')) {
        emb.footer = { text: v('esFooter') };
        if (v('esFooterIcon')) emb.footer.icon_url = v('esFooterIcon');
      }
      if (v('esThumb')) emb.thumbnail = { url: v('esThumb') };
      if (v('esImage')) emb.image = { url: v('esImage') };
      if (chk('esTimestamp')) emb.timestamp = new Date().toISOString();
      return emb;
    }

    function gesamtLaenge(emb) {
      let n = 0;
      if (emb.title) n += emb.title.length;
      if (emb.description) n += emb.description.length;
      if (emb.author) n += emb.author.name.length;
      if (emb.footer) n += emb.footer.text.length;
      if (emb.fields) for (const f of emb.fields) n += f.name.length + f.value.length;
      return n;
    }

    function renderPreview() {
      const emb = baueEmbed();
      const farbe = '#' + (emb.color || 0x5865F2).toString(16).padStart(6, '0');
      let html = '<div style="display:flex;gap:12px">' +
        '<div style="width:38px;height:38px;border-radius:50%;flex-shrink:0;background:linear-gradient(135deg,#22d3ee,#e879f9)"></div>' +
        '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
        '<b style="font-size:.95rem">Lumiox</b><span style="font-size:.62rem;background:#5865F2;color:#fff;padding:1px 6px;border-radius:4px;font-weight:700">BOT</span></div>';
      html += '<div style="position:relative;background:rgba(4,6,14,.5);border-radius:8px;padding:14px;display:flex;gap:14px">' +
        '<div style="position:absolute;left:0;top:0;bottom:0;width:4px;border-radius:4px 0 0 4px;background:' + farbe + '"></div>' +
        '<div style="flex:1;min-width:0">';
      if (emb.author) {
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
          (emb.author.icon_url ? '<img src="' + esc(emb.author.icon_url) + '" style="width:22px;height:22px;border-radius:50%" onerror="this.remove()">' : '') +
          '<b style="font-size:.82rem">' + esc(emb.author.name) + '</b></div>';
      }
      if (emb.title) html += '<div style="font-weight:700;font-size:1rem;margin-bottom:6px;word-break:break-word">' +
        (emb.url ? '<a href="' + esc(emb.url) + '" target="_blank" style="color:inherit">' + esc(emb.title) + '</a>' : esc(emb.title)) + '</div>';
      if (emb.description) html += '<div style="font-size:.88rem;color:#c9cfdb;line-height:1.5;word-break:break-word;white-space:pre-wrap">' + esc(emb.description) + '</div>';
      if (emb.fields && emb.fields.length) {
        html += '<div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:10px">';
        for (const f of emb.fields) {
          html += '<div style="' + (f.inline ? 'width:calc(33.3% - 7px);min-width:120px' : 'width:100%') + '">' +
            '<b style="display:block;font-size:.8rem">' + esc(f.name) + '</b>' +
            '<span style="font-size:.78rem;color:var(--dim)">' + esc(f.value) + '</span></div>';
        }
        html += '</div>';
      }
      const fuss = [];
      if (emb.footer) {
        fuss.push((emb.footer.icon_url ? '<img src="' + esc(emb.footer.icon_url) + '" style="width:20px;height:20px;border-radius:50%" onerror="this.remove()">' : '') +
          '<span>' + esc(emb.footer.text) + '</span>');
      }
      if (emb.timestamp) fuss.push('<span>· ' + new Date().toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) + '</span>');
      if (fuss.length) html += '<div style="display:flex;align-items:center;gap:6px;margin-top:12px;color:var(--dim);font-size:.75rem">' + fuss.join(' ') + '</div>';
      html += '</div>';
      if (emb.thumbnail) html += '<img src="' + esc(emb.thumbnail.url) + '" style="width:84px;height:84px;border-radius:6px;object-fit:cover;flex-shrink:0" onerror="this.style.display=\'none\'">';
      html += '</div></div>';
      if (emb.image) html += '<div style="margin-top:8px"><img src="' + esc(emb.image.url) + '" style="max-width:100%;border-radius:8px" onerror="this.parentElement.remove()"></div>';
      html += '</div>';
      document.getElementById('esPrev').innerHTML = html;
      const total = gesamtLaenge(emb);
      document.getElementById('esTotalCnt').textContent = total + ' / 6000';
      document.getElementById('esTotalCnt').style.color = total > 6000 ? 'var(--err)' : 'var(--dim)';
      document.getElementById('esTotalBar').style.width = Math.min(100, (total / 6000) * 100) + '%';
      document.getElementById('esTotalBar').style.background = total > 6000 ? 'var(--err)' : '';
      document.getElementById('esFieldCnt').textContent = '(' + leseFelder().length + ' / 25)';
    }

    function addFieldRow(name = '', value = '', inline = true) {
      const n = $$('#esFelder .es-frow').length;
      if (n >= 25) return toast('Maximum: 25 Felder', 'err');
      const row = el('<div class="es-frow" style="border:1px solid rgba(127,127,127,.2);border-radius:10px;padding:10px;margin-bottom:8px">' +
        '<div class="grid-2 mb" style="gap:8px">' +
        '<input class="input es-f-name" placeholder="Feld-Name" value="' + esc(name) + '" maxlength="306">' +
        '<div style="display:flex;gap:8px;align-items:center">' +
        '<label style="display:flex;gap:6px;align-items:center;font-size:.8rem;white-space:nowrap"><input type="checkbox"' + (inline ? ' checked' : '') + '> Inline</label>' +
        '<button class="btn small danger es-f-del" style="margin-left:auto">✕</button></div></div>' +
        '<textarea class="input es-f-value" rows="2" placeholder="Feld-Wert" maxlength="1074">' + esc(value) + '</textarea></div>');
      $('.es-f-del', row).addEventListener('click', () => { row.remove(); renderPreview(); });
      $('input[type=checkbox]', row).addEventListener('change', renderPreview);
      $('.es-f-name', row).addEventListener('input', renderPreview);
      $('.es-f-value', row).addEventListener('input', renderPreview);
      document.getElementById('esFelder').appendChild(row);
    }
    $('#esFieldAdd', formCol).addEventListener('click', () => { addFieldRow(); renderPreview(); });

    formCol.addEventListener('input', (e) => {
      const map = { esTitle: 256, esDesc: 4096, esAuthorName: 256, esFooter: 2048 };
      if (e.target.id && map[e.target.id]) zeichen(e.target.id, map[e.target.id]);
      if (e.target.id === 'esColor') document.getElementById('esColorHex').value = e.target.value.toUpperCase();
      if (e.target.id === 'esColorHex') {
        const hex = e.target.value.replace('#', '');
        if (/^[0-9a-fA-F]{6}$/.test(hex)) document.getElementById('esColor').value = '#' + hex;
      }
      renderPreview();
    });
    formCol.addEventListener('change', renderPreview);
    document.getElementById('esColor').addEventListener('input', (e) => {
      document.getElementById('esColorHex').value = e.target.value.toUpperCase();
    });

    async function ladeDrafts() {
      const box = document.getElementById('esDrafts');
      try {
        const { liste } = await API.get('/embeds?guildId=' + gid);
        if (!liste.length) { box.innerHTML = '<p class="dim">Noch keine Entwürfe gespeichert.</p>'; return; }
        box.innerHTML = '';
        for (const dr of liste) {
          const row = el('<div class="feed-item"><span style="flex:1"><b class="small">' + esc(dr.name) + '</b>' +
            '<div class="dim small">' + fmtDatum(dr.zeit) + '</div></span>' +
            '<button class="btn small es-load" data-id="' + esc(dr.id) + '">Laden</button>' +
            '<button class="btn small danger es-del" data-id="' + esc(dr.id) + '">✕</button></div>');
          $('.es-load', row).addEventListener('click', async () => {
            const r = await API.get('/embeds/' + dr.id);
            const dt = r.data || {};
            document.getElementById('esColor').value = '#' + (dt.color || 5865).toString(16).padStart(6, '0');
            document.getElementById('esColorHex').value = '#' + (dt.color || 5865).toString(16).padStart(6, '0').toUpperCase();
            document.getElementById('esTitle').value = dt.title || '';
            document.getElementById('esDesc').value = dt.description || '';
            document.getElementById('esUrl').value = dt.url || '';
            document.getElementById('esAuthorName').value = (dt.author && dt.author.name) || '';
            document.getElementById('esAuthorIcon').value = (dt.author && dt.author.icon_url) || '';
            document.getElementById('esAuthorUrl').value = (dt.author && dt.author.url) || '';
            document.getElementById('esFooter').value = (dt.footer && dt.footer.text) || '';
            document.getElementById('esFooterIcon').value = (dt.footer && dt.footer.icon_url) || '';
            document.getElementById('esThumb').value = (dt.thumbnail && dt.thumbnail.url) || '';
            document.getElementById('esImage').value = (dt.image && dt.image.url) || '';
            document.getElementById('esTimestamp').checked = !!dt.timestamp;
            document.getElementById('esFelder').innerHTML = '';
            for (const f of dt.fields || []) addFieldRow(f.name === '\u200b' ? '' : f.name, f.value === '\u200b' ? '' : f.value, f.inline);
            renderPreview();
            toast('Entwurf geladen ✔', 'ok');
          });
          $('.es-del', row).addEventListener('click', async () => {
            if (!(await confirmDlg('Entwurf löschen?'))) return;
            await API.del('/embeds/' + dr.id);
            toast('Gelöscht ✔', 'ok');
            ladeDrafts();
          });
          box.appendChild(row);
        }
      } catch (e) { box.innerHTML = '<p class="dim">' + esc(e.message) + '</p>'; }
    }
    ladeDrafts();

    $('#esSave', formCol).addEventListener('click', async () => {
      const name = val('esName');
      if (!name) return toast('Bitte erst einen Entwurfs-Namen eingeben', 'err');
      try {
        await API.post('/embeds?guildId=' + gid, { name, data: baueEmbed() });
        toast('Entwurf gespeichert ✔', 'ok');
        ladeDrafts();
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#esExport', formCol).addEventListener('click', () => {
      download('lumiox-embed.json', JSON.stringify(baueEmbed(), null, 2));
      toast('JSON exportiert ✔', 'ok');
    });
    $('#esReset', formCol).addEventListener('click', async () => {
      if (!(await confirmDlg('Alle Eingaben leeren?'))) return;
      $$('#page input, #page textarea').forEach((i) => {
        if (i.id && i.id.startsWith('es') && i.type !== 'checkbox' && i.type !== 'color') i.value = '';
        if (i.type === 'checkbox' && i.id && i.id.startsWith('es')) i.checked = false;
      });
      document.getElementById('esColor').value = '#5865F2';
      document.getElementById('esColorHex').value = '#5865F2';
      document.getElementById('esFelder').innerHTML = '';
      renderPreview();
    });
    $('#esSend', formCol).addEventListener('click', async () => {
      const kanalId = val('esKanal');
      if (!kanalId) return toast('Erst einen Ziel-Kanal wählen', 'err');
      const emb = baueEmbed();
      if (gesamtLaenge(emb) > 6000) return toast('Gesamt-Länge über 6000 – bitte kürzen', 'err');
      if (!emb.title && !emb.description && !(emb.fields || []).length && !emb.image && !emb.thumbnail && !emb.author && !emb.footer) {
        return toast('Der Embed ist leer', 'err');
      }
      try {
        await API.post('/embeds/send?guildId=' + gid, { channelId: kanalId, embed: emb });
        toast('📤 Gesendet!', 'ok');
      } catch (e) { toast(e.message, 'err'); }
    });

    document.getElementById('esTitle').value = '🎉 Server-Update 0.8 ist da!';
    document.getElementById('esDesc').value = 'Das Embed-Studio ist live – baue Ankündigungen, Regeln & Infos direkt im Dashboard mit echter Live-Vorschau.';
    document.getElementById('esFooter').value = 'Lumiox';
    addFieldRow('📅 Wann?', 'Heute, 20:00 Uhr', true);
    addFieldRow('🆕 Neu?', 'Embed-Studio', true);
    addFieldRow('🐛 Fixes', '12 Stück', true);
    ['esTitle', 'esDesc', 'esFooter'].forEach((id) => zeichen(id, { esTitle: 256, esDesc: 4096, esFooter: 2048 }[id]));
    renderPreview();
  }

