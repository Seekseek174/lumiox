  // ══════════════════ SEITE: BÖRSE (v2) ══════════════════
  async function seiteBoerse(page) {
    const d = await API.get('/boerse/kurse?guildId=' + gid);
    const { liste: historie } = await API.get('/boerse/historie?guildId=' + gid);
    const stat = await API.get('/boerse/statistik?guildId=' + gid).catch(() => null);

    page.appendChild(karte('📈 Lumiox-Börse – Marktübersicht', `
      <div class="row mb">
        <span class="badge info">⏱️ Kurs-Update alle ${fmtDauer(d.intervallSek * 1000)}</span>
        ${d.pfad ? '<span class="badge warn">🎯 PFAD AKTIV: ' + esc(d.pfad.sym) + '</span>' : ''}
        ${d.von ? '<span class="dim small">Letzte Änderung: ' + esc(d.von) + '</span>' : ''}
        <button class="btn small" id="bsRefresh" style="margin-left:auto">↻ Aktualisieren</button>
      </div>
      <div class="grid-3" id="bsKarten"></div>
      <p class="dim small mt">💡 Klick auf einen Kurs → hoch/runter steuern.</p>`));
    const karten = $('#bsKarten', page);
    function mkKarten() {
      karten.innerHTML = d.liste.map((a) => {
        const k = d.kurse[a.sym], alt = d.alt[a.sym] || k;
        const delta = k - alt, up = delta >= 0;
        const fro = a.autoUpdate === false;
        return `<div class="stat" style="cursor:pointer" data-sym="${esc(a.sym)}">
          <span class="val" style="color:${up ? 'var(--ok)' : 'var(--err)'}">${k.toFixed(2)}</span>
          <span class="lbl"><b>${esc(a.sym)}</b> · ${esc(a.name)}${fro ? ' ❄️' : ''}</span>
          <span class="small" style="color:${up ? 'var(--ok)' : 'var(--err)'}">${up ? '▲' : '▼'} ${Math.abs(delta).toFixed(2)}</span></div>`;
      }).join('');
      $$('[data-sym]', karten).forEach((k) => k.addEventListener('click', () => richtungsMenue(k.dataset.sym)));
    }
    mkKarten();

    function richtungsMenue(sym) {
      const body = el(`<div>
        <div class="row mb"><b>${esc(sym)}</b><span class="dim small">Kurs aktuell: ${d.kurse[sym].toFixed(2)}</span></div>
        <div class="row mb" style="gap:8px">
          <button class="btn primary" data-p="10">▲ +10 %</button>
          <button class="btn primary" data-p="25">▲ +25 %</button>
          <button class="btn primary" data-p="100">🚀 +100 %</button></div>
        <div class="row mb" style="gap:8px">
          <button class="btn danger" data-p="-10">▼ −10 %</button>
          <button class="btn danger" data-p="-25">▼ −25 %</button>
          <button class="btn danger" data-p="-50">💥 −50 %</button></div>
        <div class="row">
          <input class="input" type="number" id="bsEigPz" placeholder="eigene %" style="max-width:110px" value="50">
          <button class="btn" id="bsEig">Setzen</button></div>
        <p class="dim small mt">Wird als Marktereignis protokolliert und in den Chart übernommen.</p></div>`);
      openModal('📈 Richtung steuern: ' + sym, body, [
        { label: 'Schließen', klasse: 'primary', action: (zu) => zu() },
      ]);
      const setzen = async (p) => {
        try {
          const r = await API.post('/boerse/richtung?guildId=' + gid, { sym, prozent: p });
          toast(sym + ' → ' + r.neuKurs.toFixed(2), 'ok');
          zu(); route('boerse');
        } catch (e) { toast(e.message, 'err'); }
      };
      $$('[data-p]', body).forEach((b) => b.addEventListener('click', () => setzen(Number(b.dataset.p))));
      $('#bsEig', body).addEventListener('click', () => setzen(Number(val('bsEigPz')) || 0));
    }

    if (stat) {
      page.appendChild(karte('📊 Börsen-Statistik (24 h)', `
        <div class="grid-3 mb">
          <div class="stat"><span class="val">${fmtZahl(stat.depotGesamt)}</span><span class="lbl">Depot-Wert aller Spieler</span></div>
          <div class="stat"><span class="val">${stat.trader}</span><span class="lbl">Aktive Trader</span></div>
          <div class="stat"><span class="val">${stat.manips}</span><span class="lbl">Marktereignisse (7 Tg.)</span></div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Aktie</th><th>24h Hoch</th><th>24h Tief</th><th>Punkte</th></tr></thead>
          ${Object.entries(stat.proAktie).map(([sym, s2]) => `<tr>
            <td><b>${esc(sym)}</b></td><td style="color:var(--ok)">${s2.hoch.toFixed(2)}</td>
            <td style="color:var(--err)">${s2.tief.toFixed(2)}</td><td>${s2.punkte}</td></tr>`).join('') || '<tr><td colspan="4" class="dim">Sammelt ab jetzt – erster Tick fehlt noch.</td></tr>'}
        </table></div>`));
    }

    const chartKarte = karte('📊 Kursverlauf', '<div class="chart-box"><canvas id="bsChart"></canvas></div>');
    page.appendChild(chartKarte);
    if (typeof Chart !== 'undefined' && historie.length) {
      const syms = [...new Set(historie.map((h) => h.sym))];
      const farben = { LUMX: '#22d3ee', MEME: '#f43f5e', PIZA: '#fbbf24', ROKT: '#34d399', GEIST: '#818cf8', BTC: '#f7931a' };
      const zeiten = [...new Set(historie.map((h) => fmtDatum(h.zeit)))].reverse();
      const datasets = syms.map((sym) => {
        const pts = historie.filter((h) => h.sym === sym).sort((a, b) => a.zeit - b.zeit);
        return { label: sym, data: zeiten.map((zt) => {
          const i = pts.findIndex((h) => fmtDatum(h.zeit) === zt);
          return i >= 0 ? pts[i].kurs : null;
        }), borderColor: farben[sym] || '#999', tension: 0.3, pointRadius: 2 };
      });
      charts.push(new Chart($('canvas', chartKarte), {
        type: 'line', data: { labels: zeiten, datasets },
        options: { responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#aab' } } },
          scales: { x: { ticks: { color: '#889' } }, y: { ticks: { color: '#889' } } } },
      }));
    }

    const topKarte = karte('💰 Depots & Statistik', '<div id="bsDepots"><p class="dim">Lade …</p></div>');
    page.appendChild(topKarte);
    (async () => {
      const d2 = await API.get('/boerse/depot?guildId=' + gid);
      const eintraege = Object.entries(d2.anteile || {}).filter(([, v]) => v > 0.001);
      const box = $('#bsDepots', page);
      box.innerHTML = eintraege.length ? eintraege.map(([sym, anz]) => {
        const kurs = d.kurse[sym] || 0;
        return '<div class="feed-item"><b class="small">' + esc(sym) + '</b><span class="small">' + anz.toFixed(2) + ' × ' + kurs.toFixed(2) + ' = <b>' + (anz * kurs).toFixed(2) + ' 🪙</b></span></div>';
      }).join('') : '<p class="dim">Noch keine Aktien. Kaufe über <code>/boerse kaufen</code> in Discord!</p>';
    })();

    page.appendChild(karte('🕵️ Marktereignisse', d.von
      ? '<div class="feed-item"><span class="badge ai">ÄNDERUNG</span><span>' + esc(d.von) + '</span><span class="feed-zeit">' + fmtRelativ(d.letzteAenderung) + '</span></div>'
      : '<p class="dim">Keine Marktereignisse.</p>'));

    $('#bsRefresh', page).addEventListener('click', () => route('boerse'));
  }

