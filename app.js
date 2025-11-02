/* ====== Core Daten ====== */

// Fässer (2–19; A2 existiert nicht)
const FASS_NUM = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19];

const SPS = ["SPS 1 (neu)","SPS 2 (alt)"];
const STATUS = [
  {k:"geplant", cls:"st-planned"},
  {k:"läuft", cls:"st-running"},
  {k:"verschoben", cls:"st-delayed"},
  {k:"gefüllt", cls:"st-filled"}
];

// ⚠️ HIER deine echten Rezepturen eintragen (Namen exakt wie eure Liste)
// fields: name, durationH (Standardlaufzeit in Stunden), changeC2UC, changeUC2C (min), defaultSPS, remarks
// Ich habe Beispiele/Platzhalter gesetzt – bitte mit euren Werten überschreiben.
const REZEPTE = [
  { name:"Kalb Oukro 15+", durationH:24, changeC2UC:10, changeUC2C:5, defaultSPS:"SPS 1 (neu)", remarks:"lange LZ, frische Ware priorisiert" },
  { name:"Kuh Nordware 8t", durationH:21, changeC2UC:10, changeUC2C:5, defaultSPS:"SPS 2 (alt)", remarks:"Standard" },
  { name:"Bullen M", durationH:24, changeC2UC:10, changeUC2C:5, defaultSPS:"SPS 1 (neu)", remarks:"—" },
  { name:"Zapfen (SPS2)", durationH:16, changeC2UC:10, changeUC2C:5, defaultSPS:"SPS 2 (alt)", remarks:"Kurzläufer" },
  // … weitere aus deiner Liste
];

/* ====== State / Storage ====== */
const DAY_KEYS = ["Mo","Di","Mi","Do","Fr","Sa","So"];
let activeDay = new Date().getDay(); // 0=So … 6=Sa
if (activeDay === 0) activeDay = 6; else activeDay -= 1; // 0=Mo … 6=So

const ROWS = 28; // viele Eingabezeilen

function keyForDay(d){return `plan-v3-day-${d}`}

function loadDay(d){
  const raw = localStorage.getItem(keyForDay(d));
  return raw ? JSON.parse(raw) : Array.from({length:ROWS},()=>blankRow());
}
function saveDay(d,data){
  localStorage.setItem(keyForDay(d), JSON.stringify(data));
  markSaved();
}

function blankRow(){
  return {
    fass:"", start:"06:00", sps:SPS[0], rezept:"", c2uc:10, uc2c:5,
    gattung:"z. B. K", menge:"", status:"geplant", notiz:"",
    durationH:"", // wenn leer -> aus Rezept
    endzeit:"",   // auto
    rest:""       // auto
  };
}

/* ====== UI Build ====== */
const rowsEl = document.getElementById('rows');
const tsEl = document.getElementById('ts');

function buildDayToggle(){
  const c = document.getElementById('dayToggle');
  c.innerHTML = "";
  DAY_KEYS.forEach((k,i)=>{
    const b = document.createElement('button');
    b.textContent = k;
    if (i===activeDay) b.style.outline = "2px solid var(--accent)";
    b.onclick = ()=>{ activeDay=i; render(); };
    c.appendChild(b);
  });
}

function render(){
  buildDayToggle();
  const data = loadDay(activeDay);
  rowsEl.innerHTML = "";
  for(let i=0;i<ROWS;i++){
    rowsEl.appendChild(rowEl(i,data[i]));
  }
  tsEl.textContent = new Date().toLocaleString();
}

function rowEl(idx,row){
  const tr = document.createElement('tr');

  // helpers
  const td = ()=>document.createElement('td');
  const input = (val, on)=>{ const e=document.createElement('input'); e.value=val??""; e.oninput=ev=>on(ev.target.value); return e; };
  const select = (opts,val,on)=>{
    const s=document.createElement('select');
    opts.forEach(o=>{
      const op=document.createElement('option'); 
      if (typeof o === 'string'){ op.value=o; op.textContent=o; }
      else { op.value=o.value; op.textContent=o.label; }
      s.appendChild(op);
    });
    s.value = val ?? opts[0];
    s.onchange=ev=>on(ev.target.value);
    return s;
  };

  const data = loadDay(activeDay); // fresh reference

  const write = ()=>{ 
    data[idx]=row; 
    computeRow(row);
    saveDay(activeDay,data); 
    // quick repaint small fields
    endCell.textContent = row.endzeit || "";
    restCell.textContent = row.rest || "";
  };

  // Fass
  const tdF=td();
  tdF.appendChild(select(FASS_NUM.map(n=>({value:String(n),label:`Fass ${n}`})), row.fass, v=>{row.fass=v; write();}));
  tr.appendChild(tdF);

  // Start
  const tdS=td(); tdS.appendChild(input(row.start, v=>{row.start=v; write();})); tr.appendChild(tdS);

  // SPS
  const tdSp=td(); tdSp.appendChild(select(SPS,row.sps,v=>{row.sps=v; write();})); tr.appendChild(tdSp);

  // Rezept
  const tdR=td();
  const rezeptNames = ["— Rezept wählen —", ...REZEPTE.map(r=>r.name)];
  tdR.appendChild(select(rezeptNames, row.rezept || rezeptNames[0], v=>{
    row.rezept = v === rezeptNames[0] ? "" : v;
    const rz = REZEPTE.find(r=>r.name===row.rezept);
    if (rz){
      row.c2uc = rz.changeC2UC;
      row.uc2c = rz.changeUC2C;
      row.durationH = rz.durationH; // Standard
      if (!row.sps) row.sps = rz.defaultSPS;
    }
    write();
  }));
  tr.appendChild(tdR);

  // Wechselzeiten
  const tdC2=td(); tdC2.appendChild(input(row.c2uc, v=>{row.c2uc=toInt(v,10); write();})); tr.appendChild(tdC2);
  const tdU2=td(); tdU2.appendChild(input(row.uc2c, v=>{row.uc2c=toInt(v,5); write();})); tr.appendChild(tdU2);

  // Gattung
  const tdG=td(); tdG.appendChild(input(row.gattung, v=>{row.gattung=v; write();})); tr.appendChild(tdG);

  // Menge
  const tdM=td(); tdM.appendChild(input(row.menge, v=>{row.menge=v; write();})); tr.appendChild(tdM);

  // Status
  const tdSt=td();
  tdSt.appendChild(select(STATUS.map(s=>s.k), row.status, v=>{row.status=v; write();}));
  tr.appendChild(tdSt);

  // Notiz
  const tdN=td(); const ta=document.createElement('textarea'); ta.value=row.notiz||""; ta.oninput=ev=>{row.notiz=ev.target.value; write();}; tdN.appendChild(ta); tr.appendChild(tdN);

  // LZ
  const tdLZ=td(); tdLZ.appendChild(input(row.durationH, v=>{row.durationH=toFloat(v); write();})); tr.appendChild(tdLZ);

  // Endzeit + Rest
  const tdEnd=td(); const endCell = document.createElement('div'); endCell.textContent=row.endzeit||""; tdEnd.appendChild(endCell); tr.appendChild(tdEnd);
  const tdRest=td(); const restCell = document.createElement('div'); restCell.textContent=row.rest||""; tdRest.appendChild(restCell); tr.appendChild(tdRest);

  // Initial berechnen
  computeRow(row);

  // Status-Pill styling
  tr.classList.add('row');
  return tr;
}

function toInt(v,def=0){ const n=parseInt(v,10); return Number.isFinite(n)?n:def; }
function toFloat(v,def){ const n=parseFloat(v); return Number.isFinite(n)?n:def??""; }

function parseTimeHHMM(s){
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h,m] = s.split(':').map(x=>parseInt(x,10));
  if (h>47 || m>59) return null; // wir erlauben >24h für Nachtläufe
  return {h,m};
}
function fmt2(n){return String(n).padStart(2,'0')}
function addHoursToTime(t, hours){
  const totalMin = t.h*60 + t.m + Math.round(hours*60);
  let h = Math.floor(totalMin/60)%24; if (h<0) h+=24;
  const m = totalMin%60;
  return `${fmt2(h)}:${fmt2(m)}`;
}
function diffNowToEnd(endHHMM){
  const now = new Date();
  const [eh,em] = endHHMM.split(':').map(Number);
  const end = new Date(now); end.setHours(eh,em,0,0);
  let diff = (end - now)/60000; // min
  // wenn Endzeit „über Mitternacht“, diff neg wenn wir vor End liegen → korrigieren
  if (diff < -12*60) diff += 24*60;
  const sign = diff<0?"-":"";
  diff = Math.abs(diff);
  const h=Math.floor(diff/60), m=Math.round(diff%60);
  return `${sign}${h}h ${fmt2(m)}m`;
}

function computeRow(row){
  // LZ aus Rezept wenn leer
  if (!row.durationH && row.rezept){
    const rz = REZEPTE.find(r=>r.name===row.rezept);
    if (rz) row.durationH = rz.durationH;
  }
  if (!row.start || !row.durationH) { row.endzeit=""; row.rest=""; return; }
  const t = parseTimeHHMM(row.start);
  if (!t){ row.endzeit=""; row.rest=""; return; }

  // Endzeit = Start + Laufzeit (Std); Wechselzeiten beeinflussen Fassfolge, nicht die reine LZ
  const end = addHoursToTime(t, Number(row.durationH||0));
  row.endzeit = end;

  // Restlaufzeit live
  try { row.rest = diffNowToEnd(end); } catch { row.rest=""; }
}

/* ====== Export/Import/Reset ====== */
document.getElementById('btnExport').onclick = ()=>{
  const payload = {};
  DAY_KEYS.forEach((_,i)=>payload[keyForDay(i)] = loadDay(i));
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aescherei-plan-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
};

document.getElementById('btnImport').onclick = ()=>{
  const inp = document.createElement('input'); inp.type='file'; inp.accept='.json,application/json';
  inp.onchange = ()=> {
    const f = inp.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = ()=> {
      try {
        const data = JSON.parse(String(r.result));
        Object.keys(data).forEach(k=>{
          if (k.startsWith('plan-v3-day-')) localStorage.setItem(k, JSON.stringify(data[k]));
        });
        render();
      } catch(e){ alert('Import fehlgeschlagen: '+e.message); }
    };
    r.readAsText(f);
  }
  inp.click();
};

document.getElementById('btnClear').onclick = ()=>{
  if (!confirm('Tag wirklich leeren?')) return;
  saveDay(activeDay, Array.from({length:ROWS},()=>blankRow()));
  render();
};

function markSaved(){ /* könnte ein kleines Toast zeigen */ }

/* Live-Update Restlaufzeit jede Minute */
setInterval(()=>{
  const data = loadDay(activeDay);
  data.forEach(r=>computeRow(r));
  saveDay(activeDay,data);
  render();
}, 60*1000);

/* Boot */
render();
