/* ============================================================================
  Äscherei & Spalt – Planung (DE)
  Dateien: index.html + styles.css + app.js (alle im selben Ordner)
  ----------------------------------------------------------------------------
  Features:
  - Plan-Datum oben inkl. Tag +/- und Schnellwahl Fr/Sa/So/Mo
  - Datum pro Zeile (YYYY-MM-DD)
  - Endzeit = Rezeptur + Wechsel + Waschen + Konservierung (HH:MM), (+1 Tag) bei Überlauf
  - SPS 1 standard 1×60 min Waschen, SPS 2 standard 2×60 min (editierbar), Dialog „nur einmal / als Vorgabe“
  - Konservierung: keine / über Nacht / mehrtägig + Stunden (Vorgaben je Rezeptur)
  - EHW (Ende Hauptweiche): wenn Start unbekannt → Restanteil ab EHW (Platzhalter 55%)
  - Wochenend-Logik:
      * Samstag & Sonntag nur Frühschicht
      * Standard-Start 06:00
      * Warnung bei >5 Fässern (Richtwert 4–5)
      * Sonntags i. d. R. keine Frischware (Schalter vorhanden)
  - Mobil ↔ Desktop automatisch (Karten vs. Tabelle)
  - Export/Import aller Daten + Vorgaben (JSON)
  - Alles deutsch, Einheiten: Stunden/Minuten und Kilogramm
  ============================================================================ */

/* ---------- Grundwerte & Vorgaben ---------- */
const UMSCHALT_GRENZE_PX = 900;
const WASCH_MIN_PRO_GANG = 60;
const BASIS_WASCHEN_NACH_SPS = { "SPS 1": 1, "SPS 2": 2 };

/* Rezeptur-Laufzeiten (Minuten) + Konservierungsvorgaben (kannst du später jederzeit anpassen) */
const BASIS_REZEPTUREN = {
  "21": { name:"Schwöde IVN Standard",              minuten:16*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "22": { name:"Schwöde Kühe (Frisch)",             minuten:16*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "24": { name:"Schwöde Bullen (Frisch)",           minuten:16*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "25": { name:"Schwöde SBB (Sep–Apr)",             minuten:16*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "26": { name:"Schwöde Salzware",                  minuten:16*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "23": { name:"Schwöde Flanken (nur Äscher)",      minuten:13*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "30": { name:"Liming Ecco – Kälber (gespalten)",  minuten:26*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} },
  "31": { name:"Liming – Kälber (ungespalten)",     minuten:26*60, konserv:{ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}} }
};

/* ---------- Persistenz ---------- */
const LS = {
  waschen: "aesch_plan_vorgaben_waschen",
  rezepte: "aesch_plan_rezepte",
  einstellungen: "aesch_plan_settings",
  planDatum: "aesch_plan_date"
};
const loadJSON = (k,f)=>{try{const v=localStorage.getItem(k);return v?JSON.parse(v):f}catch{return f}};
const saveJSON = (k,o)=>{try{localStorage.setItem(k,JSON.stringify(o))}catch{}};

let VORGABE_WASCHEN_NACH_SPS = loadJSON(LS.waschen, {...BASIS_WASCHEN_NACH_SPS});
let REZEPTUREN = loadJSON(LS.rezepte, {...BASIS_REZEPTUREN});
let SETTINGS = loadJSON(LS.einstellungen, {
  spaltenAmSamstag:true,
  spaltenAmSonntag:true,
  sonntagFrischwareAnnahme:false
});
let PLAN_DATUM = localStorage.getItem(LS.planDatum) || isoVon(new Date());

/* ---------- Helfer ---------- */
const $  = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>Array.from(el.querySelectorAll(s));
const zz = n=>String(n).padStart(2,"0");

function isoVon(d){ return `${d.getFullYear()}-${zz(d.getMonth()+1)}-${zz(d.getDate())}`; }
function parseISO(iso){ const m=String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/); if(!m)return null; return new Date(+m[1],+m[2]-1,+m[3],0,0,0,0); }
function plusTage(iso,dx){ const d=parseISO(iso)||new Date(); d.setDate(d.getDate()+dx); return isoVon(d); }
function wtag(iso){ const d=parseISO(iso)||new Date(); return d.getDay(); } // 0 So ... 6 Sa
function istMobil(){ return matchMedia(`(max-width:${UMSCHALT_GRENZE_PX}px)`).matches; }

function parseHHMM(t){
  if(!t) return null;
  const m=String(t).trim().match(/^(\d{1,2}):?(\d{2})$/);
  if(!m) return null;
  const h=+m[1], min=+m[2];
  return (h>=0&&h<24&&min>=0&&min<60)?{h,min}:null;
}
function datumUhr(iso,h,m){ const d=parseISO(iso)||new Date(); d.setHours(h,m,0,0); return d; }
function addMin(d,m){ const x=new Date(d); x.setMinutes(x.getMinutes()+m); return x; }
function fmt(d){ return `${zz(d.getHours())}:${zz(d.getMinutes())}`; }
function tageDiff(a,b){ const A=parseISO(a),B=parseISO(b); return Math.round((B-A)/(24*60*60*1000)); }

function defRZ(code){ return REZEPTUREN[String(code||"").trim()]; }
function rzMinuten(code){ return defRZ(code)?.minuten ?? 16*60; }
function wechselMin(text){ if(!text) return 0; const m=String(text).trim().match(/^(UC|C)\s+(\d{1,3})$/i); return m?+m[2]:0; }
function waschMinuten(z){
  const basis = z.waschenAnzahlOverride!=null ? +z.waschenAnzahlOverride : (VORGABE_WASCHEN_NACH_SPS[z.sps] ?? 1);
  return Math.max(0,basis)*WASCH_MIN_PRO_GANG;
}
function konzVorgaben(z){
  const d=defRZ(z.rz);
  return d?.konserv ?? {ueberNacht:{voreinstellung:12,max:24}, mehrtaegig:{voreinstellung:24,max:48}};
}
function konzMinuten(z){
  if(z.konservArt==="keine") return 0;
  const alle=konzVorgaben(z);
  const cfg=z.konservArt==="ueberNacht"?alle.ueberNacht:alle.mehrtaegig;
  let h=Number(z.konservStunden);
  if(Number.isNaN(h)||h<=0) h=cfg.voreinstellung;
  h=Math.min(h,cfg.max);
  return h*60;
}

/* Endzeit + Überlauf */
function endzeit(z){
  const sum =
    (z.rzMinutenOverride!=null?+z.rzMinutenOverride:rzMinuten(z.rz)) +
    wechselMin(z.wechsel) + waschMinuten(z) + konzMinuten(z);

  const iso=z.datum||PLAN_DATUM;
  const st=parseHHMM(z.start);
  if(st){
    const s=datumUhr(iso,st.h,st.min);
    const e=addMin(s,sum);
    const eIso=isoVon(e); const over=eIso!==iso?tageDiff(iso,eIso):0;
    return {end:e,endIso:eIso,over,basis:"start",sum};
  }
  const ehw=parseHHMM(z.ehw);
  if(ehw){
    const s=datumUhr(iso,ehw.h,ehw.min);
    const rest=Math.round(sum*0.55); // Platzhalter bis exakte Anteile je RZ vorliegen
    const e=addMin(s,rest);
    const eIso=isoVon(e); const over=eIso!==iso?tageDiff(iso,eIso):0;
    return {end:e,endIso:eIso,over,basis:"ehw",sum};
  }
  return {end:null,endIso:null,over:0,basis:"unbekannt",sum};
}

/* ---------- Daten ---------- */
let zeilen=[];
function initZeilen(n=12){ zeilen=Array.from({length:n}).map(()=>neuZeile()); }
function neuZeile(){ return {
  datum: PLAN_DATUM,
  sps: "SPS 1",
  start: "06:00",
  rz: "",
  gattung: "",
  mengeKg: "",
  status: "geplant",
  notiz: "",
  wechsel: "",
  waschenAnzahlOverride: null,
  rzMinutenOverride: null,
  konservArt: "keine",
  konservStunden: "",
  ehw: ""
};}

/* ---------- Render ---------- */
function render(){
  const root=$("#app");
  root.innerHTML = (istMobil()? viewMobil(): viewDesktop());
  verbindeEvents();
  wochenendBanner();
}

function toolbar(){
  const wt=["So","Mo","Di","Mi","Do","Fr","Sa"][wtag(PLAN_DATUM)];
  return `
  <div class="toolbar">
    <div class="titel">Äscherei & Spalt – Planung</div>
    <div class="gruppe">
      <label>Plan-Datum <input id="planDate" type="date" value="${PLAN_DATUM}"></label>
      <button id="dayMinus">– Tag</button><button id="dayPlus">+ Tag</button>
      <span class="klein">(${wt})</span>
      <button id="jumpFr">Fr</button><button id="jumpSa">Sa</button><button id="jumpSo">So</button><button id="jumpMo">Mo</button>
    </div>
    <div class="gruppe">
      <label style="display:flex;gap:6px;align-items:center">
        <input id="satOn" type="checkbox" ${SETTINGS.spaltenAmSamstag?"checked":""}> Samstag spalten
      </label>
      <label style="display:flex;gap:6px;align-items:center">
        <input id="sunOn" type="checkbox" ${SETTINGS.spaltenAmSonntag?"checked":""}> Sonntag spalten
      </label>
      <label style="display:flex;gap:6px;align-items:center">
        <input id="sunFresh" type="checkbox" ${SETTINGS.sonntagFrischwareAnnahme?"checked":""}> Sonntag Frischware annehmen
      </label>
      <button id="addRow">+ Zeile</button>
      <button id="doExport">Export</button>
      <button id="doImport">Import</button>
    </div>
  </div>
  <div id="woBanner" class="banner"></div>
  `;
}

/* Desktop-Tabelle */
function viewDesktop(){
  return `
    ${toolbar()}
    <table class="tabelle">
      <thead>
        <tr>
          <th>#</th><th>Datum</th><th>Start (HH:MM)</th><th>Spaltstraße</th>
          <th>Rezeptur</th><th>Wechsel<br>(C/UC)</th><th>Waschen<br>(Anzahl × 60 min)</th>
          <th>Konservierung</th><th>Stunden</th><th>EHW</th><th>Endzeit</th>
          <th>Gattung</th><th>Menge (kg)</th><th>Status</th><th>Notiz</th>
        </tr>
      </thead>
      <tbody>${zeilen.map((z,i)=>rowDesk(z,i)).join("")}</tbody>
    </table>
  `;
}
function rowDesk(z,i){
  const t=endzeit(z); const cfg=konzVorgaben(z);
  const info=defRZ(z.rz)?`${defRZ(z.rz).name} • ~${Math.round(rzMinuten(z.rz)/60)} h`:"";
  const endTxt=t.end?`${fmt(t.end)}${t.over>0?` <span class="plusTag">(+${t.over} Tag)</span>`:""}`:"";
  return `
  <tr data-idx="${i}">
    <td>${i+1}</td>
    <td><input class="inp dt" type="date" value="${z.datum||PLAN_DATUM}"></td>
    <td><input class="inp st" value="${z.start||""}" placeholder="HH:MM"></td>
    <td>
      <select class="sel sps">
        <option ${z.sps==="SPS 1"?"selected":""}>SPS 1</option>
        <option ${z.sps==="SPS 2"?"selected":""}>SPS 2</option>
      </select>
    </td>
    <td>
      <input class="inp rz" value="${z.rz||""}" placeholder="24">
      <div class="hinweis">${info}</div>
    </td>
    <td><input class="inp wex" value="${z.wechsel||""}" placeholder="UC 5 / C 10"></td>
    <td><input class="inp wash" type="number" min="0" step="1" value="${z.waschenAnzahlOverride??""}" placeholder="Auto"></td>
    <td>
      <select class="sel konzArt">
        <option value="keine"      ${z.konservArt==="keine"?"selected":""}>keine</option>
        <option value="ueberNacht" ${z.konservArt==="ueberNacht"?"selected":""}>über Nacht</option>
        <option value="mehrtaegig" ${z.konservArt==="mehrtaegig"?"selected":""}>mehrtägig</option>
      </select>
      <div class="klein">Vorgabe/Max: ÜN ${cfg.ueberNacht.voreinstellung}/${cfg.ueberNacht.max} h, MT ${cfg.mehrtaegig.voreinstellung}/${cfg.mehrtaegig.max} h</div>
    </td>
    <td><input class="inp konzStd" type="number" min="0" step="1" value="${z.konservStunden??""}" placeholder="Auto"></td>
    <td><input class="inp ehw" value="${z.ehw||""}" placeholder="HH:MM"></td>
    <td class="endzeit">${endTxt}</td>
    <td><input class="inp gat" value="${z.gattung||""}" placeholder="z. B. K"></td>
    <td><input class="inp kg" type="number" min="0" step="1" value="${z.mengeKg||""}" placeholder="kg"></td>
    <td>
      <select class="sel stat">
        ${["geplant","läuft","verschoben","fertig"].map(s=>`<option ${z.status===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </td>
    <td><input class="inp note" value="${z.notiz||""}"></td>
  </tr>`;
}

/* Mobil-Karten */
function viewMobil(){
  return `
    ${toolbar()}
    <div class="karten">${zeilen.map((z,i)=>card(z,i)).join("")}</div>
  `;
}
function card(z,i){
  const t=endzeit(z); const cfg=konzVorgaben(z);
  const info=defRZ(z.rz)?`${defRZ(z.rz).name} • ~${Math.round(rzMinuten(z.rz)/60)} h`:"Rezeptur unbekannt";
  const endTxt=t.end?`${fmt(t.end)}${t.over>0?` (+${t.over} Tag)`:``}`:"–";
  return `
  <div class="karte" data-idx="${i}">
    <div class="kopf"><div>#${i+1} • ${z.status}</div><div class="endzeit">Endzeit: ${endTxt}</div></div>
    <div class="zeile"><label>Datum</label><input class="inp dt" type="date" value="${z.datum||PLAN_DATUM}"></div>
    <div class="zeile"><label>Start</label><input class="inp st" value="${z.start||""}" placeholder="HH:MM"></div>
    <div class="zeile"><label>Spaltstraße</label>
      <select class="sel sps">
        <option ${z.sps==="SPS 1"?"selected":""}>SPS 1</option>
        <option ${z.sps==="SPS 2"?"selected":""}>SPS 2</option>
      </select>
    </div>
    <div class="zeile"><label>Rezeptur</label><input class="inp rz" value="${z.rz||""}" placeholder="24"></div>
    <div class="zeile"><span class="klein">${info}</span></div>
    <div class="zeile"><label>Wechsel</label><input class="inp wex" value="${z.wechsel||""}" placeholder="UC 5 / C 10"></div>
    <div class="zeile"><label>Waschen</label><input class="inp wash" type="number" min="0" step="1" value="${z.waschenAnzahlOverride??""}" placeholder="Auto"></div>
    <div class="zeile"><label>Konserv.</label>
      <select class="sel konzArt">
        <option value="keine"      ${z.konservArt==="keine"?"selected":""}>keine</option>
        <option value="ueberNacht" ${z.konservArt==="ueberNacht"?"selected":""}>über Nacht</option>
        <option value="mehrtaegig" ${z.konservArt==="mehrtaegig"?"selected":""}>mehrtägig</option>
      </select>
    </div>
    <div class="zeile"><label>Stunden</label><input class="inp konzStd" type="number" min="0" step="1" value="${z.konservStunden??""}" placeholder="Auto"></div>
    <div class="zeile"><label>EHW</label><input class="inp ehw" value="${z.ehw||""}" placeholder="HH:MM"></div>
    <div class="zeile"><label>Gattung</label><input class="inp gat" value="${z.gattung||""}"></div>
    <div class="zeile"><label>Menge (kg)</label><input class="inp kg" type="number" min="0" step="1" value="${z.mengeKg||""}"></div>
    <div class="zeile"><label>Status</label>
      <select class="sel stat">
        ${["geplant","läuft","verschoben","fertig"].map(s=>`<option ${z.status===s?"selected":""}>${s}</option>`).join("")}
      </select>
    </div>
    <div class="zeile"><label>Notiz</label><input class="inp note" value="${z.notiz||""}"></div>
  </div>`;
}

/* ---------- Ereignisse & Logik ---------- */
let resizeTimer=null;
function verbindeEvents(){
  // Toolbar
  $("#planDate")?.addEventListener("change", e=>{
    PLAN_DATUM = e.target.value || isoVon(new Date());
    localStorage.setItem(LS.planDatum, PLAN_DATUM); render();
  });
  $("#dayMinus")?.addEventListener("click", ()=>{ PLAN_DATUM=plusTage(PLAN_DATUM,-1); localStorage.setItem(LS.planDatum,PLAN_DATUM); render(); });
  $("#dayPlus") ?.addEventListener("click", ()=>{ PLAN_DATUM=plusTage(PLAN_DATUM,+1); localStorage.setItem(LS.planDatum,PLAN_DATUM); render(); });
  $("#jumpFr")  ?.addEventListener("click", ()=>jumpTo(5));
  $("#jumpSa")  ?.addEventListener("click", ()=>jumpTo(6));
  $("#jumpSo")  ?.addEventListener("click", ()=>jumpTo(0));
  $("#jumpMo")  ?.addEventListener("click", ()=>jumpTo(1));

  $("#satOn")?.addEventListener("change", e=>{ SETTINGS.spaltenAmSamstag=e.target.checked; saveJSON(LS.einstellungen,SETTINGS); wochenendBanner(); });
  $("#sunOn")?.addEventListener("change", e=>{ SETTINGS.spaltenAmSonntag=e.target.checked; saveJSON(LS.einstellungen,SETTINGS); wochenendBanner(); });
  $("#sunFresh")?.addEventListener("change", e=>{ SETTINGS.sonntagFrischwareAnnahme=e.target.checked; saveJSON(LS.einstellungen,SETTINGS); wochenendBanner(); });

  $("#addRow") ?.addEventListener("click", ()=>{ zeilen.push(neuZeile()); render(); });
  $("#doExport")?.addEventListener("click", exportJSON);
  $("#doImport")?.addEventListener("click", importJSON);

  // Zeilen-Ereignisse
  $$(".tabelle tr, .karte").forEach(el=>{
    const i=+el.getAttribute("data-idx"); const z=zeilen[i]; const q=s=>$(s,el);

    q(".dt")  ?.addEventListener("change", e=>{ z.datum=e.target.value||PLAN_DATUM; render(); });
    q(".st")  ?.addEventListener("input",  e=>{ z.start=e.target.value; render(); });
    q(".sps") ?.addEventListener("change", e=>{ z.sps=e.target.value; render(); });
    q(".rz")  ?.addEventListener("input",  e=>{ z.rz=e.target.value; render(); });
    q(".wex") ?.addEventListener("input",  e=>{ z.wechsel=e.target.value; render(); });

    // Waschen (Dialog bei Abweichung von Vorgabe)
    q(".wash")?.addEventListener("change", async e=>{
      const val = e.target.value===""?null:+e.target.value;
      if(val===null){ z.waschenAnzahlOverride=null; return render(); }
      const vorg = VORGABE_WASCHEN_NACH_SPS[z.sps] ?? BASIS_WASCHEN_NACH_SPS[z.sps];
      if(val!==vorg){
        const wahl = await dialog({
          titel:"Waschen-Vorgabe ändern?",
          text:`${z.sps}: bisher ${vorg}×60 min, neu ${val}×60 min. Nur einmal oder als neue Vorgabe speichern?`
        });
        if(wahl==="abbruch"){ e.target.value=z.waschenAnzahlOverride??""; return; }
        if(wahl==="dauerhaft"){ VORGABE_WASCHEN_NACH_SPS[z.sps]=val; saveJSON(LS.waschen,VORGABE_WASCHEN_NACH_SPS); }
      }
      z.waschenAnzahlOverride=val; render();
    });

    // Konservierung
    q(".konzArt")?.addEventListener("change", e=>{ z.konservArt=e.target.value; render(); });
    q(".konzStd")?.addEventListener("change", async e=>{
      const st = e.target.value===""?NaN:+e.target.value; z.konservStunden=e.target.value;
      if(!z.rz || !z.konservArt || isNaN(st)) return render();
      const alle=konzVorgaben(z); const akt=z.konservArt==="ueberNacht"?alle.ueberNacht:alle.mehrtaegig;
      if(st>0 && st!==akt.voreinstellung){
        const wahl = await dialog({
          titel:"Konservierungs-Vorgabe ändern?",
          text:`RZ ${z.rz} – ${z.konservArt==="ueberNacht"?"über Nacht":"mehrtägig"}: bisher Vorgabe ${akt.voreinstellung} h (max ${akt.max} h), neu ${st} h.`
        });
        if(wahl==="dauerhaft"){
          REZEPTUREN[z.rz]=REZEPTUREN[z.rz]||{...BASIS_REZEPTUREN[z.rz]};
          if(z.konservArt==="ueberNacht"){
            const alt=REZEPTUREN[z.rz].konserv?.ueberNacht||akt;
            REZEPTUREN[z.rz].konserv=REZEPTUREN[z.rz].konserv||{};
            REZEPTUREN[z.rz].konserv.ueberNacht={voreinstellung:st,max:alt.max};
          }else{
            const alt=REZEPTUREN[z.rz].konserv?.mehrtaegig||akt;
            REZEPTUREN[z.rz].konserv=REZEPTUREN[z.rz].konserv||{};
            REZEPTUREN[z.rz].konserv.mehrtaegig={voreinstellung:st,max:alt.max};
          }
          saveJSON(LS.rezepte,REZEPTUREN);
        }
        render();
      }else{ render(); }
    });

    // Rezeptur-Dauer dauerhaft setzen (Doppelklick auf RZ-Feld)
    q(".rz")?.addEventListener("dblclick", async ()=>{
      const code=String(z.rz||"").trim(); if(!code||!REZEPTUREN[code]) return;
      const alt=REZEPTUREN[code].minuten;
      const neu=prompt(`Neue Laufzeit für Rezeptur ${code} (Minuten, bisher ${alt})`, alt);
      if(neu===null) return;
      const m=Math.max(0,Math.round(+neu||0));
      const wahl=await dialog({titel:"Rezeptur-Laufzeit festlegen?", text:`RZ ${code}: neu ~${Math.round(m/60)} h.`});
      if(wahl==="dauerhaft"){ REZEPTUREN[code].minuten=m; saveJSON(LS.rezepte,REZEPTUREN); }
      else { z.rzMinutenOverride=m; }
      render();
    });

    q(".ehw") ?.addEventListener("input", e=>{ z.ehw=e.target.value; render(); });
    q(".gat") ?.addEventListener("input", e=>{ z.gattung=e.target.value; });
    q(".kg")  ?.addEventListener("input", e=>{ z.mengeKg=e.target.value; });
    q(".stat")?.addEventListener("change",e=>{ z.status=e.target.value; });
    q(".note")?.addEventListener("input", e=>{ z.notiz=e.target.value; });
  });

  // Umschalten mobil/desktop
  window.addEventListener("resize", ()=>{
    clearTimeout(resizeTimer); resizeTimer=setTimeout(render,120);
  });
}

/* Wochenend-Banner & Regeln */
function wochenendBanner(){
  const b=$("#woBanner"); if(!b) return;
  const wt=wtag(PLAN_DATUM); const istSa=(wt===6), istSo=(wt===0);
  let msg="";
  if(istSa||istSo){
    msg += `<b class="hart">${istSa?"Samstag":"Sonntag"}:</b> nur Frühschicht, Startvorgabe 06:00, Ziel <b>4–5 Fässer</b>. `;
    if(istSo && !SETTINGS.sonntagFrischwareAnnahme) msg += `Frischware-Annahme i. d. R. <b>aus</b>. `;
    // sanfte Warnung falls >5 Zeilen am Tag
    const count=zeilen.filter(z=>z.datum===PLAN_DATUM).length;
    if(count>5){ msg += ` | Hinweis: aktuell ${count} Partien eingetragen → ggf. reduzieren.`; }
    b.classList.add("aktiv"); b.innerHTML=msg;
    // auto-Start 06:00 vorschlagen
    zeilen.filter(z=>z.datum===PLAN_DATUM).forEach(z=>{ if(!z.start) z.start="06:00"; });
  }else{
    b.classList.remove("aktiv"); b.innerHTML="";
  }
}

/* Tag springen zur nächsten Instanz des Wochentags */
function jumpTo(ziel){ // 0 So ... 6 Sa
  let d=parseISO(PLAN_DATUM) || new Date();
  let guard=0;
  while(d.getDay()!==ziel && guard<10){ d.setDate(d.getDate()+1); guard++; }
  PLAN_DATUM=isoVon(d); localStorage.setItem(LS.planDatum,PLAN_DATUM); render();
}

/* Export/Import */
function exportJSON(){
  const data={zeilen,VORGABE_WASCHEN_NACH_SPS,REZEPTUREN,SETTINGS,PLAN_DATUM};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=`aescherei-plan-${new Date().toISOString().slice(0,10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}
function importJSON(){
  const inp=document.createElement("input"); inp.type="file"; inp.accept="application/json";
  inp.onchange=()=>{
    const f=inp.files?.[0]; if(!f) return;
    const r=new FileReader();
    r.onload=()=>{
      try{
        const obj=JSON.parse(r.result);
        if(obj?.zeilen) zeilen=obj.zeilen;
        if(obj?.VORGABE_WASCHEN_NACH_SPS) {VORGABE_WASCHEN_NACH_SPS=obj.VORGABE_WASCHEN_NACH_SPS; saveJSON(LS.waschen,VORGABE_WASCHEN_NACH_SPS);}
        if(obj?.REZEPTUREN){REZEPTUREN=obj.REZEPTUREN; saveJSON(LS.rezepte,REZEPTUREN);}
        if(obj?.SETTINGS){SETTINGS=obj.SETTINGS; saveJSON(LS.einstellungen,SETTINGS);}
        if(obj?.PLAN_DATUM){PLAN_DATUM=obj.PLAN_DATUM; localStorage.setItem(LS.planDatum,PLAN_DATUM);}
        render();
      }catch{ alert("Datei konnte nicht gelesen werden."); }
    };
    r.readAsText(f);
  };
  inp.click();
}

/* Dialog (Nur einmal / Als Vorgabe / Abbruch) */
function ensureDialog(){
  if($("#ueberlagerung")) return;
  const html=`
    <div id="ueberlagerung">
      <div id="dialog">
        <h3 id="dlgT">Vorgabewert ändern?</h3>
        <p id="dlgX"></p>
        <div class="aktionen">
          <button id="dlgOnce">Nur einmal</button>
          <button id="dlgSave" class="primaer">Als neue Vorgabe speichern</button>
          <button id="dlgAbort" class="gefahr">Abbrechen</button>
        </div>
      </div>
    </div>`;
  document.body.insertAdjacentHTML("beforeend",html);
}
function dialog({titel,text}){
  ensureDialog();
  return new Promise(res=>{
    $("#dlgT").textContent=titel||"Vorgabewert ändern?";
    $("#dlgX").textContent=text||"Nur einmal übernehmen oder als neue Vorgabe speichern?";
    const ovl=$("#ueberlagerung"); ovl.style.display="flex";
    const close=()=>{ ovl.style.display="none"; };
    $("#dlgOnce").onclick =()=>{close();res("einmal");};
    $("#dlgSave").onclick =()=>{close();res("dauerhaft");};
    $("#dlgAbort").onclick=()=>{close();res("abbruch");};
  });
}

/* Start */
(function(){
  initZeilen(12);
  render();
})();
