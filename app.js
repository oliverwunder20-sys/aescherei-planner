/* =========================================================
   Äscherei & Spalt – Planer (app.js)
   Stand: v1.0 – kompakte Tagesplanung, offline-fähig
   ========================================================= */

(() => {
  // ---------- Konfiguration ----------
  const BARRELS = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19]; // Fass 17 existiert nicht
  const DAYS = ["Mo","Di","Mi","Do","Fr","Sa","So"];
  const STORAGE_KEY = "aescherer_planner_v1";

  // Felder je Fass-Zeile (Schlüssel -> Label)
  const FIELDS = [
    ["fass", "Fass"],
    ["rezept", "Rezept"],
    ["start", "Start"],
    ["laufzeit", "LZ (h)"],
    ["sps", "SPS"],
    ["wechsel_c", "Wechsel C→UC (min)"],
    ["wechsel_uc", "Wechsel UC→C (min)"],
    ["gattung", "Gattung"],
    ["menge", "Menge (kg)"],
    ["status", "Status"],
    ["notiz", "Notiz"]
  ];

  // Defaults für neue Zeilen
  const ROW_DEFAULTS = {
    rezept: "",
    start: "06:00",
    laufzeit: "",
    sps: "",
    wechsel_c: "10",
    wechsel_uc: "5",
    gattung: "",
    menge: "",
    status: "geplant",
    notiz: ""
  };

  // ---------- State ----------
  let state = loadState() || createInitialState();
  let currentDay = autoDayKey();

  // ---------- DOM Root ----------
  const root = ensureRoot();

  // ---------- Render ----------
  render();

  // ---------- Functions ----------
  function ensureRoot() {
    let el = document.getElementById("app");
    if (!el) {
      el = document.createElement("div");
      el.id = "app";
      document.body.prepend(el);
    }
    el.classList.add("app-root");
    return el;
  }

  function createInitialState() {
    const obj = { days: {} };
    DAYS.forEach(d => {
      obj.days[d] = BARRELS.reduce((acc, f) => {
        acc[f] = { fass: String(f), ...ROW_DEFAULTS };
        return acc;
      }, {});
    });
    return obj;
  }

  function autoDayKey() {
    const idx = new Date().getDay(); // 0=So..6=Sa
    // Mapping auf unsere Reihenfolge
    // So->So, Mo->Mo etc.
    const map = [6,0,1,2,3,4,5]; // JS-Index -> DAYS-Index
    return DAYS[ map[idx] ];
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setStatus("Gespeichert • Offlinefähig");
    } catch (e) {
      console.error(e);
      setStatus("Speichern fehlgeschlagen");
    }
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error(e);
      return null;
    }
  }

  function setStatus(text) {
    const el = document.getElementById("status");
    if (el) el.textContent = text;
  }

  function humanDate(d = new Date()) {
    return d.toLocaleDateString("de-DE", { weekday:"long", day:"2-digit", month:"2-digit" });
  }

  function onChangeDay(day) {
    currentDay = day;
    renderTable();
    setStatus(`Tag: ${day} • ${navigator.onLine ? "Online" : "Offline"}`);
  }

  function render() {
    root.innerHTML = `
      <header class="app-topbar">
        <h1>Äscherei & Spalt – Tagesplan</h1>
        <div class="meta">
          <span>${humanDate()}</span>
          <span id="status">Bereit…</span>
        </div>
      </header>

      <nav class="day-tabs">${DAYS.map(d => `
        <button class="tab ${d===currentDay?"active":""}" data-day="${d}">${d}</button>
      `).join("")}</nav>

      <section class="toolbar">
        <button id="btnPrint">Drucken</button>
        <button id="btnExport">Export</button>
        <label class="import-label">
          Import <input id="fileImport" type="file" accept="application/json" hidden />
        </label>
        <button id="btnClear" class="danger">Tag leeren</button>
      </section>

      <section class="table-wrap">
        <table id="planTable" class="compact">
          <thead>${renderHead()}</thead>
          <tbody id="planBody"></tbody>
        </table>
      </section>

      <footer class="footnote">
        <small>Hinweis: Autosave lokal pro Tag. Service Worker liefert Offline-Caching.</small>
      </footer>
    `;

    root.querySelectorAll(".day-tabs .tab").forEach(btn => {
      btn.addEventListener("click", () => onChangeDay(btn.dataset.day));
    });

    document.getElementById("btnPrint").addEventListener("click", () => window.print());

    document.getElementById("btnExport").addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aescherer-planer-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById("fileImport").addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const json = JSON.parse(reader.result);
          if (json && json.days) {
            state = json;
            saveState();
            renderTable();
            alert("Import erfolgreich.");
          } else {
            alert("Ungültige Datei.");
          }
        } catch {
          alert("Import fehlgeschlagen.");
        }
      };
      reader.readAsText(file);
    });

    document.getElementById("btnClear").addEventListener("click", () => {
      if (!confirm(`Alle Eingaben für ${currentDay} löschen?`)) return;
      state.days[currentDay] = BARRELS.reduce((acc, f) => {
        acc[f] = { fass: String(f), ...ROW_DEFAULTS };
        return acc;
      }, {});
      saveState();
      renderTable();
    });

    // Online/Offline-Indikator
    window.addEventListener("online",  () => setStatus("Online"));
    window.addEventListener("offline", () => setStatus("Offline"));

    renderTable();
  }

  function renderHead() {
    return `<tr>${FIELDS.map(([key,label]) =>
      `<th class="${key}">${label}</th>`).join("")}</tr>`;
  }

  function renderTable() {
    const tbody = document.getElementById("planBody");
    tbody.innerHTML = BARRELS.map(f => renderRow(state.days[currentDay][f])).join("");

    // Inputs verdrahten
    tbody.querySelectorAll("input, select").forEach(inp => {
      inp.addEventListener("input", onCellChange);
      inp.addEventListener("change", onCellChange);
    });

    // Aktiven Tag Tab markieren
    root.querySelectorAll(".day-tabs .tab").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.day === currentDay);
    });
  }

  function renderRow(row) {
    const safe = (v="") => (v ?? "");
    // Einfache Selects für Status & SPS
    const statusOpts = ["geplant","gestartet","leer","fertig"]
      .map(s => `<option value="${s}" ${row.status===s?"selected":""}>${s}</option>`).join("");

    const spsOpts = ["SPS 1","SPS 2","SPS 1 (neu)","SPS 2 (neu)","—"]
      .map(s => `<option value="${s}" ${row.sps===s?"selected":""}>${s}</option>`).join("");

    return `
      <tr data-fass="${row.fass}">
        <td class="fass"><input type="text" value="${safe(row.fass)}" data-key="fass" class="ro" /></td>
        <td class="rezept"><input type="text" value="${safe(row.rezept)}" data-key="rezept" placeholder="z. B. 24" /></td>
        <td class="start"><input type="time" value="${safe(row.start)}" data-key="start" /></td>
        <td class="laufzeit"><input type="number" step="0.1" min="0" value="${safe(row.laufzeit)}" data-key="laufzeit" /></td>
        <td class="sps">
          <select data-key="sps">${spsOpts}</select>
        </td>
        <td class="wechsel_c"><input type="number" min="0" value="${safe(row.wechsel_c)}" data-key="wechsel_c" /></td>
        <td class="wechsel_uc"><input type="number" min="0" value="${safe(row.wechsel_uc)}" data-key="wechsel_uc" /></td>
        <td class="gattung"><input type="text" value="${safe(row.gattung)}" data-key="gattung" placeholder="z. B. Kühe 40–49" /></td>
        <td class="menge"><input type="number" min="0" value="${safe(row.menge)}" data-key="menge" placeholder="kg" /></td>
        <td class="status">
          <select data-key="status">${statusOpts}</select>
        </td>
        <td class="notiz"><input type="text" value="${safe(row.notiz)}" data-key="notiz" placeholder="Bemerkung" /></td>
      </tr>
    `;
  }

  function onCellChange(e) {
    const cell = e.target;
    const key = cell.dataset.key;
    const tr = cell.closest("tr");
    const fass = tr?.dataset?.fass;
    if (!key || !fass) return;

    // Wert normalisieren
    let val = cell.value;
    if (key === "fass") val = String(val).trim();
    if (["laufzeit","wechsel_c","wechsel_uc","menge"].includes(key)) {
      if (val === "") val = "";
      else val = String(val).replace(",", ".");
    }

    // In State schreiben
    if (!state.days[currentDay][fass]) {
      state.days[currentDay][fass] = { fass, ...ROW_DEFAULTS };
    }
    state.days[currentDay][fass][key] = val;

    // Barrel-Key aktualisieren, falls Fass geändert
    if (key === "fass" && fass !== val) {
      state.days[currentDay][val] = state.days[currentDay][fass];
      delete state.days[currentDay][fass];
      // Neu zeichnen, damit data-fass passt
      saveState();
      renderTable();
      return;
    }

    saveState();
  }

})();
