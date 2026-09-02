  // ══════════════════ SEITE: COMMAND-STUDIO ══════════════════
  async function seiteStudio(page) {
    const { katalog } = await API.get('/studio/bloecke');
    const { liste: befehle } = await API.get('/studio/befehle');
    const rol = await ladeRollen();
    let aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
    let editId = null;

    page.appendChild(karte('🧩 Command-Studio 0.8.8e', `
      <div class="row mb">
        <span class="badge ok">NEU</span>
        <span class="dim small">Baue eigene Commands mit Block-Ketten – WENN/DANN, Zufall, Rollen, Wirtschaft. Einfacher Modus = 1 Block. Komplexer Modus = beliebig viele, verschachtelt.</span>
      </div>
      <div class="row mb">
        <input class="input" id="stName" placeholder="command-name" style="max-width:180px">
        <input class="input" id="stDesc" placeholder="Beschreibung" style="max-width:260px">
        <input class="input" type="number" id="stCd" placeholder="Cooldown (s)" style="max-width:120px" value="0">
        <select class="input" id="stRol" multiple style="max-width:200px;height:38px">
          ${rol.map((r) => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}
        </select>
        <span class="dim small">Strg+Klick = mehrere Rollen (leer = alle)</span>
      </div>
      <div class="row mb">
        <button class="btn primary" id="stSave">💾 Speichern & Live laden</button>
        <button class="btn" id="stNeu">↺ Neu anfangen</button>
        <span class="dim small" id="stStatus"></span>
      </div>`));

    // ── Block-Palette ──
    const palKarte = karte('🧱 Block-Palette (Klick = Block hinzufügen)', `
      <div class="grid-3" id="stPal"></div>`);
    page.appendChild(palKarte);
    const pal = $('#stPal', page);
    katalog.forEach((blk) => {
      const b = el(`<button class="btn small" style="text-align:left">${esc(blk.name)}</button>`);
      b.addEventListener('click', () => addBlock(blk, aktuellerBefehl.blocks));
      pal.appendChild(b);
    });

    // ── Kette anzeigen (rekursiv) ──
    const kettenKarte = karte('🔗 Block-Kette (dein Command)', '<div id="stKette"><p class="dim">Noch keine Blöcke. Klicke oben auf die Palette!</p></div>');
    page.appendChild(kettenKarte);

    function renderKette(blöcke, container, pfad) {
      container.innerHTML = '';
      if (!blöcke.length) { container.innerHTML = '<p class="dim">Leer – Klicke oben auf die Palette.</p>'; return; }
      blöcke.forEach((b, i) => {
        const kat = katalog.find((k) => k.typ === b.typ);
        const p2 = pfad.concat(i);
        const div = el(`<div class="panel card" style="margin-bottom:8px;padding:10px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="badge ai">${i + 1}</span>
            <b class="small">${esc(kat ? kat.name : b.typ)}</b>
            <span class="dim small">${blockZusammenfassung(b)}</span>
            <button class="btn small danger bs-del" style="margin-left:auto">✕</button>
          </div>
          <div class="bs-felder mt"></div>
          <div class="bs-nested"></div>
        </div>`);
        $('.bs-del', div).addEventListener('click', () => {
          blöcke.splice(i, 1);
          renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
        });
        // Felder
        const fBox = $('.bs-felder', div);
        (kat ? kat.felder : []).filter((f) => f.typ !== 'nested').forEach((f) => {
          const cur = b[f.key];
          if (f.typ === 'bool') {
            const l = el(`<label style="display:flex;gap:6px;align-items:center;font-size:.82rem;margin:4px 0"><input type="checkbox" ${cur ? 'checked' : ''}><span>${esc(f.label)}</span></label>`);
            l.querySelector('input').addEventListener('change', (e) => { b[f.key] = e.target.checked; });
            fBox.appendChild(l);
          } else if (f.typ === 'rolle') {
            const sel = el(`<select class="input" style="margin:4px 0"><option value="">– wählen –</option>${rol.map((r) => `<option value="${esc(r.id)}" ${cur === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`);
            sel.addEventListener('change', () => { b[f.key] = sel.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)}</span>`));
            fBox.appendChild(sel);
          } else if (f.typ === 'kanal') {
            const inp = el(`<input class="input" placeholder="Kanal-ID" value="${esc(cur || '')}" style="margin:4px 0">`);
            inp.addEventListener('input', () => { b[f.key] = inp.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)} (Kanal-ID)</span>`));
            fBox.appendChild(inp);
          } else {
            const inp = el(`<input class="input" value="${esc(cur != null ? cur : (f.default != null ? f.default : ''))}" placeholder="${esc(f.label)}" style="margin:4px 0">`);
            inp.addEventListener('input', () => { b[f.key] = inp.value; });
            fBox.appendChild(el(`<span class="dim small">${esc(f.label)}</span>`));
            fBox.appendChild(inp);
          }
        });
        // Nested (WENN/DANN-Blöcke)
        const nBox = $('.bs-nested', div);
        (kat ? kat.felder : []).filter((f) => f.typ === 'nested').forEach((f) => {
          if (!Array.isArray(b[f.key])) b[f.key] = [];
          const wrap = el(`<div style="border-left:3px solid var(--accent);padding-left:10px;margin:8px 0">
            <b class="small">${esc(f.label)}:</b>
            <div class="bs-nested-inner"></div>
            <button class="btn small bs-nadd">+ Block hier</button></div>`);
          const inner = $('.bs-nested-inner', wrap);
          renderKette(b[f.key], inner, p2.concat(f.key));
          $('.bs-nadd', wrap).addEventListener('click', () => {
            // Palette-Klick: füge in dieses nested ein
            pendingNested = { list: b[f.key], render: () => renderKette(aktuellerBefehl.blocks, $('#stKette', page), []) };
            palOverlayÖffnen();
          });
          nBox.appendChild(wrap);
        });
        container.appendChild(div);
      });
    }

    function blockZusammenfassung(b) {
      const teile = [];
      if (b.text) teile.push('"' + b.text.slice(0, 40) + '"');
      if (b.menge) teile.push(b.menge);
      if (b.chance) teile.push(b.chance + '%');
      if (b.rolle) teile.push('Rolle');
      if (b.kanal) teile.push('Kanal');
      return teile.join(' · ') || '–';
    }

    // Palette für nested: wir merken uns das Ziel
    let pendingNested = null;
    function palOverlayÖffnen() {
      // Einfach: nächster Palette-Klick geht ins nested
      toast('Klicke jetzt oben in der Palette den Block, der HIERrein soll', 'info');
      pal.dataset.nested = '1';
    }
    pal.addEventListener('click', () => {
      if (pal.dataset.nested) { delete pal.dataset.nested; }
    });

    // addBlock: ins nested oder top-level
    function addBlock(blk, zielListe) {
      const neuer = { typ: blk.typ };
      blk.felder.forEach((f) => {
        if (f.typ === 'nested') neuer[f.key] = [];
        else if (f.default != null) neuer[f.key] = f.default;
        else if (f.typ === 'bool') neuer[f.key] = false;
        else neuer[f.key] = '';
      });
      if (pendingNested) {
        pendingNested.list.push(neuer);
        const r = pendingNested.render; pendingNested = null;
        r();
      } else {
        zielListe.push(neuer);
        renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
      }
    }

    // ── Bestehende Befehle ──
    page.appendChild(karte('📚 Studio-Befehle', `<div id="stListe"></div>`));
    function ladeListe() {
      const box = $('#stListe', page);
      box.innerHTML = befehle.length ? befehle.map((c) => `<div class="feed-item">
        <span style="flex:1"><b class="mono">/${esc(c.name)}</b> <span class="dim small">${esc(c.description || '')}</span>
        <div class="dim small">${(c.blocks || []).length} Blöcke${c.studio ? ' · Studio' : ''}</div></span>
        <button class="btn small st-edit" data-id="${esc(c.id)}">Bearbeiten</button>
        <button class="btn small danger st-del" data-id="${esc(c.id)}">✕</button></div>`).join('')
        : '<p class="dim">Noch keine Studio-Befehle.</p>';
      $$('.st-edit', box).forEach((b) => b.addEventListener('click', async () => {
        const r = await API.get('/studio/befehl/' + b.dataset.id).catch(() => null);
        if (!r || !r.befehl) return toast('Nicht gefunden', 'err');
        editId = r.befehl.id;
        aktuellerBefehl = { name: r.befehl.name, description: r.befehl.description || '',
          cooldown: r.befehl.cooldown || 0, roles: r.befehl.roles || [], blocks: r.befehl.blocks || [] };
        $('#stName', page).value = aktuellerBefehl.name;
        $('#stDesc', page).value = aktuellerBefehl.description;
        $('#stCd', page).value = aktuellerBefehl.cooldown;
        $$('#stRol option', page).forEach((o) => { o.selected = aktuellerBefehl.roles.includes(o.value); });
        renderKette(aktuellerBefehl.blocks, $('#stKette', page), []);
        toast('Befehl geladen – bearbeiten & speichern', 'ok');
      }));
      $$('.st-del', box).forEach((b) => b.addEventListener('click', async () => {
        if (!(await confirmDlg('Befehl löschen?'))) return;
        await API.del('/studio/befehle/' + b.dataset.id);
        toast('Gelöscht ✔', 'ok'); ladeListe();
      }));
    }
    ladeListe();

    $('#stSave', page).addEventListener('click', async () => {
      aktuellerBefehl.name = val('stName');
      aktuellerBefehl.description = val('stDesc');
      aktuellerBefehl.cooldown = num('stCd') || 0;
      aktuellerBefehl.roles = $$('#stRol option', page).filter((o) => o.selected).map((o) => o.value);
      if (!aktuellerBefehl.name) return toast('Name fehlt', 'err');
      if (!aktuellerBefehl.blocks.length) return toast('Mindestens 1 Block', 'err');
      try {
        const payload = { ...aktuellerBefehl, guildId: gid };
        if (editId) payload.id = editId;
        await API.post('/studio/befehle', payload);
        toast('💾 Gespeichert & live geladen! /' + aktuellerBefehl.name + ' ist verfügbar.', 'ok');
        editId = null;
        aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
        $('#stName', page).value = ''; $('#stDesc', page).value = ''; $('#stCd', page).value = '';
        renderKette([], $('#stKette', page), []);
        const r2 = await API.get('/studio/befehle');
        befehle.length = 0; befehle.push(...r2.liste); ladeListe();
      } catch (e) { toast(e.message, 'err'); }
    });
    $('#stNeu', page).addEventListener('click', () => {
      editId = null;
      aktuellerBefehl = { name: '', description: '', cooldown: 0, roles: [], blocks: [] };
      $('#stName', page).value = ''; $('#stDesc', page).value = ''; $('#stCd', page).value = '';
      renderKette([], $('#stKette', page), []);
    });
    renderKette([], $('#stKette', page), []);
  }

