      if (tab === 'diagramm') {
        inhalt.innerHTML = '<div class="ghK"><h4>🎨 Diagramm-Editor</h4>' +
          '<p class="dim" style="font-size:12px;margin:0 0 8px">Klicken = Punkt setzen · <b>Scrollen = Zoom</b> · <b>Ziehen (mit Taste gedrückt auf leere Fläche / Rechtsklick) = Verschieben</b>. Zahlen zeigen dir Zeit (unten) und Kurs (links) im sichtbaren Bereich.</p>' +
          '<div class="row" style="gap:8px;margin-bottom:8px;flex-wrap:wrap">' +
          '<select class="ghI" id="dgSym" style="width:150px"></select>' +
          '<input class="ghI" type="number" id="dgSek" placeholder="Dauer (Sek.)" style="width:110px" value="120">' +
          '<button class="ghB p" id="dgStart">🚀 Kurve starten</button>' +
          '<button class="ghB" id="dgClear">🗑️ Punkte löschen</button>' +
          '<button class="ghB" id="dgReset">🔍 Ansicht zurücksetzen</button></div>' +
          '<div id="dgWrap" style="position:relative;user-select:none">' +
          '<canvas id="dgCanvas" width="600" height="300" style="width:100%;height:300px;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.2);border-radius:10px;cursor:crosshair;touch-action:none"></canvas>' +
          '<div class="dim mono" id="dgMaus" style="position:absolute;top:6px;right:10px;font-size:11px"></div></div>' +
          '<div class="row mt" style="justify-content:space-between">' +
          '<span class="dim mono" id="dgInfo">Zeitbereich: 0 – 120 s · Kursbereich: 0 – 100</span>' +
          '<span class="dim small">Punkte: <span id="dgAnz">0</span></span></div>' +
          '<hr style="border-color:rgba(255,255,255,.1);margin:10px 0">' +
          '<b style="font-size:13px">🟠 Eigene Crypto (begrenzte Menge):</b>' +
          '<div class="row" style="gap:6px;margin-top:6px;flex-wrap:wrap">' +
          '<input class="ghI" id="crSym" placeholder="SYMBOL" style="width:90px">' +
          '<input class="ghI" id="crName" placeholder="Name" style="width:130px">' +
          '<input class="ghI" type="number" id="crSupply" placeholder="Menge" style="width:100px" value="1000">' +
          '<input class="ghI" type="number" id="crKurs" placeholder="Startkurs" style="width:90px" value="1">' +
          '<button class="ghB p" id="crAdd">🪙 Erstellen</button></div>' +
          '<div id="crErg" class="dim" style="font-size:12px;margin-top:6px"></div></div>';
        const gid2 = gid_();
        let punkte = [];
        const cv = inhalt.querySelector('#dgCanvas');
        const ctx2 = cv.getContext('2d');
        const LINKS = 52, UNTEN = 26; // Platz für Achsen-Beschriftung

        // Viewport in Daten-Koordinaten:
        let view = { x0: 0, x1: 120, y0: 0, y1: 100 }; // Sekunden / Kurs
        let drag = null, panVor = null;

        function gesamtSekunden() { return Number(inhalt.querySelector('#dgSek').value) || 120; }
        function datenZuPx(x, y) {
          const breite = cv.width - LINKS, hoehe = cv.height - UNTEN;
          const px = LINKS + ((x - view.x0) / (view.x1 - view.x0)) * breite;
          const py = (cv.height - UNTEN) - ((y - view.y0) / (view.y1 - view.y0)) * hoehe;
          return [px, py];
        }
        function pxDaten(px, py) {
          const breite = cv.width - LINKS, hoehe = cv.height - UNTEN;
          const x = view.x0 + ((px - LINKS) / breite) * (view.x1 - view.x0);
          const y = view.y0 + ((cv.height - UNTEN - py) / hoehe) * (view.y1 - view.y0);
          return [x, y];
        }
        function fmtZeit(s) {
          if (s >= 86400) return (s / 86400).toFixed(1) + ' Tg';
          if (s >= 3600) return (s / 3600).toFixed(1) + ' Std';
          if (s >= 60) return (s / 60).toFixed(0) + ' Min';
          return Math.round(s) + ' s';
        }
        function fmtKurs(k) { return k >= 1000 ? (k / 1000).toFixed(1) + 'k' : k.toFixed(0); }

        function zeichne() {
          const W = cv.width, H = cv.height;
          ctx2.clearRect(0, 0, W, H);
          ctx2.fillStyle = 'rgba(0,0,0,.35)'; ctx2.fillRect(0, 0, W, H);
          // Raster + Achsen-Zahlen
          ctx2.font = '10px monospace'; ctx2.lineWidth = 1;
          const xSteps = 6, ySteps = 5;
          ctx2.fillStyle = '#8b93a7';
          for (let i = 0; i <= xSteps; i++) {
            const x = view.x0 + (i / xSteps) * (view.x1 - view.x0);
            const [px] = datenZuPx(x, 0);
            ctx2.strokeStyle = 'rgba(255,255,255,.07)';
            ctx2.beginPath(); ctx2.moveTo(px, 0); ctx2.lineTo(px, H - UNTEN); ctx2.stroke();
            ctx2.fillText(fmtZeit(x), px - 14, H - 8);
          }
          for (let i = 0; i <= ySteps; i++) {
            const y = view.y0 + (i / ySteps) * (view.y1 - view.y0);
            const [, py] = datenZuPx(0, y);
            ctx2.strokeStyle = 'rgba(255,255,255,.07)';
            ctx2.beginPath(); ctx2.moveTo(LINKS, py); ctx2.lineTo(W, py); ctx2.stroke();
            ctx2.fillText(fmtKurs(y), 4, py + 3);
          }
          // Punkte + Linie
          if (punkte.length) {
            ctx2.strokeStyle = '#22d3ee'; ctx2.lineWidth = 2.5;
            ctx2.beginPath();
            punkte.forEach((p, i) => { const [px, py] = datenZuPx(p.x, p.y); i === 0 ? ctx2.moveTo(px, py) : ctx2.lineTo(px, py); });
            ctx2.stroke();
            punkte.forEach((p) => { const [px, py] = datenZuPx(p.x, p.y);
              ctx2.fillStyle = '#e879f9'; ctx2.beginPath(); ctx2.arc(px, py, 5, 0, 7); ctx2.fill();
              ctx2.fillStyle = '#fff'; ctx2.font = '9px monospace';
              ctx2.fillText(fmtZeit(p.x) + ' · ' + fmtKurs(p.y), px + 7, py - 6); });
          }
          // Achsen-Linien
          ctx2.strokeStyle = 'rgba(255,255,255,.3)';
          ctx2.beginPath(); ctx2.moveTo(LINKS, 0); ctx2.lineTo(LINKS, H - UNTEN); ctx2.lineTo(W, H - UNTEN); ctx2.stroke();
          // Info-Zeile
          const info = inhalt.querySelector('#dgInfo');
          if (info) info.textContent = 'Zeitbereich: ' + fmtZeit(view.x0) + ' – ' + fmtZeit(view.x1) +
            ' · Kursbereich: ' + fmtKurs(view.y0) + ' – ' + fmtKurs(view.y1);
          const anz = inhalt.querySelector('#dgAnz');
          if (anz) anz.textContent = punkte.length;
        }

        // Klick = Punkt (nur Linksklick, kein Drag)
        let mausPos = null;
        cv.addEventListener('mousemove', (e) => {
          const r = cv.getBoundingClientRect();
          const px = (e.clientX - r.left) * (cv.width / r.width);
          const py = (e.clientY - r.top) * (cv.height / r.height);
          const [dx, dy] = pxDaten(px, py);
          const m = inhalt.querySelector('#dgMaus');
          if (m) m.textContent = fmtZeit(dx) + ' · ' + fmtKurs(Math.max(0, dy));
          if (drag) {
            const dx2 = view.x1 - view.x0, dy2 = view.y1 - view.y0;
            view.x0 -= (px - drag.x) / (cv.width - LINKS) * dx2;
            view.x1 -= (px - drag.x) / (cv.width - LINKS) * dx2;
            view.y0 += (py - drag.y) / (cv.height - UNTEN) * dy2;
            view.y1 += (py - drag.y) / (cv.height - UNTEN) * dy2;
            drag.x = px; drag.y = py;
            zeichne();
          }
        });
        cv.addEventListener('click', (e) => {
          if (panVor) return; // nach Pan nicht klicken
          const r = cv.getBoundingClientRect();
          const px = (e.clientX - r.left) * (cv.width / r.width);
          const py = (e.clientY - r.top) * (cv.height / r.height);
          if (px < LINKS) return;
          const [x, y] = pxDaten(px, py);
          punkte.push({ x: Math.max(0, Math.round(x)), y: Math.max(0.01, Math.round(y * 100) / 100) });
          punkte.sort((a, b) => a.x - b.x);
          zeichne();
        });

        // Scrollen = Zoom (um Mausposition)
        cv.addEventListener('wheel', (e) => {
          e.preventDefault();
          const r = cv.getBoundingClientRect();
          const px = (e.clientX - r.left) * (cv.width / r.width);
          const py = (e.clientY - r.top) * (cv.height / r.height);
          const [wx, wy] = pxDaten(px, py);
          const f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
          const bx0 = view.x0 + (wx - view.x0) * f, bx1 = wx + (view.x1 - wx) * f;
          const by0 = view.y0 + (wy - view.y0) * f, by1 = wy + (view.y1 - wy) * f;
          if (bx1 - bx0 > 1 && bx1 - bx0 < 31536000 * 4) { view.x0 = bx0; view.x1 = bx1; }
          if (by1 - by0 > 1 && by1 - by0 < 10e6) { view.y0 = by0; view.y1 = by1; }
          zeichne();
        }, { passive: false });

        // Rechtsklick-Ziehen = Pan (Verschieben)
        cv.addEventListener('contextmenu', (e) => e.preventDefault());
        cv.addEventListener('mousedown', (e) => {
          if (e.button === 2) {
            const r = cv.getBoundingClientRect();
            drag = { x: (e.clientX - r.left) * (cv.width / r.width), y: (e.clientY - r.top) * (cv.height / r.height) };
            panVor = true;
            cv.style.cursor = 'grabbing';
          }
        });
        addEventListener('mouseup', () => {
          if (panVor) { panVor = false; drag = null; cv.style.cursor = 'crosshair';
            setTimeout(() => { panVor = false; }, 50); }
        });

        inhalt.querySelector('#dgClear').addEventListener('click', () => { punkte = []; zeichne(); });
        inhalt.querySelector('#dgReset').addEventListener('click', () => {
          view = { x0: 0, x1: gesamtSekunden(), y0: 0, y1: 100 };
          zeichne();
        });
        inhalt.querySelector('#dgSek').addEventListener('change', () => {
          view.x0 = 0; view.x1 = gesamtSekunden(); zeichne();
        });

        async function ladeSym() {
          try {
            const r = await api('GET', '/secret/aktien?guildId=' + gid2);
            const sel = inhalt.querySelector('#dgSym');
            sel.innerHTML = r.liste.map((a) => '<option value="' + esc(a.sym) + '">' + esc(a.sym) + (a.crypto ? ' 🪙' : '') + '</option>').join('');
          } catch (_) {}
        }
        ladeSym();

        inhalt.querySelector('#dgStart').addEventListener('click', async () => {
          const sym = inhalt.querySelector('#dgSym').value;
          const gesamt = gesamtSekunden();
          if (punkte.length < 2) return toast('Mindestens 2 Punkte klicken!', 'err');
          try {
            const akt = await api('GET', '/boerse/verlauf/' + encodeURIComponent(sym) + '?guildId=' + gid2).catch(() => null);
            const startKurs = akt ? (akt.kurs || 100) : 100;
            // Y im Diagramm ist RELATIV (0–100 Skala): 100 = top. Wir mappen: y=100 → startKurs*3, y=0 → 0
            const punkte2 = punkte
              .map((p) => [Math.round(p.x), Math.max(0.01, Math.round((p.y / 100) * startKurs * 3 * 100) / 100)]);
            await api('POST', '/boerse/zeichnen/' + encodeURIComponent(sym) + '?guildId=' + gid2, { punkte: punkte2 });
            toast('🚀 Kurve aktiv: ' + sym + ' über ' + fmtDauer(gesamt * 1000), 'ok');
            punkte = []; zeichne();
          } catch (e) { toast(e.message, 'err'); }
        });

        inhalt.querySelector('#crAdd').addEventListener('click', async () => {
          try {
            const r = await api('POST', '/boerse/crypto?guildId=' + gid2, {
              sym: inhalt.querySelector('#crSym').value,
              name: inhalt.querySelector('#crName').value,
              supply: Number(inhalt.querySelector('#crSupply').value) || 1000,
              basis: Number(inhalt.querySelector('#crKurs').value) || 1,
            });
            toast('🪙 ' + r.sym + ' erstellt! Supply: ' + r.supply, 'ok');
            const erg = inhalt.querySelector('#crErg');
            if (erg) erg.textContent = r.sym + ' existiert – max. ' + r.supply + ' Stück!';
            ladeSym();
          } catch (e) { toast(e.message, 'err'); }
        });
        zeichne();
      }

