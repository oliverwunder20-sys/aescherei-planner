// --- State ---
const state = {
  unit: 'kg',        // 'kg' oder 't'
  day: 'Mo',
  entries: JSON.parse(localStorage.getItem('aescher_plan')||'[]'), // {day,fass,rezept,start,laufh,sps,wcuc,wucc,gattung,menge,status,note}
  stdHours: { '22':24, '24':24, '25':25, '30':30 }, // Default-Laufzeiten nach Rezept
};

// --- Helpers ---
const $ = s => document.querySelector(s);
const fmtTime = mins => {
  const h = Math.floor(mins/60), m = mins%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
};
const toMins = t => { const [h,m]=t.split(':').map(Number); return h*60+m; };
const nowStamp = () => new Date().toLocaleString('de-DE');

// --- UI Init ---
$('#ts').textContent = nowStamp();
$('#status').textContent = navigator.onLine ? 'Online' : 'Offline';
window.addEventListener('online', () => $('#status').textContent = 'Online');
window.addEventListener('offline', () => $('#status').textContent = 'Offline');

// Day chips
document.querySelectorAll('#dayRow .chip[data-day]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    state.day = btn.dataset.day;
    renderAll();
  });
});

// Unit toggle
$('#unitToggle').addEventListener('click',()=>{
  state.unit = state.unit==='kg'?'t':'kg';
  $('#unit').textContent = state.unit;
  document.querySelectorAll('.unitlbl').forEach(el=>el.textContent = state.unit);
  renderAll();
});

// Night toggle (nur Optik)
$('#nightToggle').addEventListener('click',()=>{
  document.documentElement.classList.toggle('alt');
});

// Form submit
$('#entryForm').addEventListener('submit', e=>{
  e.preventDefault();
  const f = {
    day: state.day,
    fass: Number($('#fass').value),
    rezept: ($('#rezept').value||'').trim(),
    start: $('#start').value,
    laufh: Number($('#laufh').value||state.stdHours[$('#rezept').value]||24),
    sps: $('#sps').value,
    wcuc: Number($('#w_cuc').value||10),
    wucc: Number($('#w_ucc').value||5),
    gattung: ($('#gattung').value||'').trim(),
    menge: Number($('#menge').value||0),
    status: $('#statusSel').value,
    note: ($('#note').value||'').trim(),
  };
  state.entries.push(f);
  save();
  e.target.reset();
  $('#start').value='06:00';
  renderAll();
});

$('#resetBtn').addEventListener('click', ()=> $('#entryForm').reset());

$('#exportBtn').addEventListener('click', ()=>{
  const blob = new Blob([JSON.stringify(state.entries,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `aescher-plan-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
});

$('#clearBtn').addEventListener('click', ()=>{
  if(!confirm('Wirklich alle Einträge löschen?')) return;
  state.entries = [];
  save(); renderAll();
});

function save(){
  localStorage.setItem('aescher_plan', JSON.stringify(state.entries));
}

// --- Render ---
function renderAll(){
  $('#unit').textContent = state.unit;
  renderTable();
  renderCompact();
  renderNextDay();
}

function renderTable(){
  const host = $('#planList');
  host.innerHTML = '';

  const headers = ['Tag','Fass','SPS','Rezept','Start','Ende','Laufh','Wechsel','Gattung','Menge'];
  headers.forEach(h=>{
    const d=document.createElement('div'); d.textContent=h; d.className='th'; host.appendChild(d);
  });

  // sort: nach Tag=heute zuerst, danach Startzeit
  const order = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const rows = [...state.entries].sort((a,b)=>{
    if (a.day!==b.day) return order.indexOf(a.day)-order.indexOf(b.day);
    return toMins(a.start)-toMins(b.start);
  });

  // Kollisionen je SPS/Fass/Zeitfenster erkennen
  const slotsBySps = { 'SPS 1':[], 'SPS 2':[] };

  rows.forEach(r=>{
    const startM = toMins(r.start);
    const endM = startM + Math.round((r.laufh||24)*60);
    const slot = {fass:r.fass, startM, endM};
    const clashes = slotsBySps[r.sps].some(s => s.fass===r.fass && Math.max(s.startM,startM) < Math.min(s.endM,endM));
    slotsBySps[r.sps].push(slot);

    const add = v => { const d=document.createElement('div'); d.textContent=v; host.appendChild(d); };

    add(r.day);
    add(r.fass);
    const sps = document.createElement('div');
    sps.innerHTML = `<span class="badge ${r.sps==='SPS 1'?'sps1':'sps2'}">${r.sps}${clashes?' • ⚠':''}</span>`;
    host.appendChild(sps);

    add(r.rezept||'–');
    add(r.start);
    add(fmtTime(endM% (24*60)));
    add((r.laufh||24).toFixed(1));
    add(`${r.wcuc}/${r.wucc}`);
    add(r.gattung||'–');

    const qty = state.unit==='t' ? (r.menge/1000).toFixed(2)+' t' : (r.menge||0)+' kg';
    add(qty);
  });
}

function renderCompact(){
  const host = $('#compactToday'); host.innerHTML='';
  const today = state.entries.filter(e=>e.day===state.day)
    .sort((a,b)=>toMins(a.start)-toMins(b.start));
  if(!today.length){ host.innerHTML='<div class="kv">– keine Einträge –</div>'; return; }

  today.forEach(r=>{
    const el=document.createElement('div'); el.className='item';
    el.innerHTML = `
      <span class="badge ${r.sps==='SPS 1'?'sps1':'sps2'}">${r.sps}</span>
      <strong>Fass ${r.fass}</strong>
      <span class="kv">${r.start} → ${(fmtTime((toMins(r.start)+Math.round((r.laufh||24)*60))%(24*60)))}</span>
      <span class="kv">${r.rezept||'–'}</span>
      <span class="kv">${state.unit==='t'?(r.menge/1000).toFixed(2)+' t':(r.menge||0)+' kg'}</span>`;
    host.appendChild(el);
  });
}

function renderNextDay(){
  const host = $('#nextDay'); host.innerHTML='';
  const order = ['Mo','Di','Mi','Do','Fr','Sa','So'];
  const idx = (order.indexOf(state.day)+1)%7;
  const next = order[idx];
  const list = state.entries.filter(e=>e.day===next)
    .sort((a,b)=>toMins(a.start)-toMins(b.start));
  if(!list.length){ host.innerHTML='<div class="kv">– keine Einträge –</div>'; return; }
  list.forEach(r=>{
    const el=document.createElement('div'); el.className='item';
    el.innerHTML = `<span class="badge ${r.sps==='SPS 1'?'sps1':'sps2'}">${r.sps}</span>
      <strong>Fass ${r.fass}</strong> <span class="kv">${r.start}</span> <span class="kv">${r.rezept||'–'}</span>`;
    host.appendChild(el);
  });
}

// Erst-Render
renderAll();
