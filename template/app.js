/* ============ ERROR DIAGNOSTICS ============ */
function showDebugBanner(msg){
  let b = document.getElementById('debug-banner');
  if(!b){
    b = document.createElement('div');
    b.id = 'debug-banner';
    b.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#A8202E;color:#fff;padding:10px 16px;font-size:12px;z-index:99999;font-family:Arial,sans-serif;line-height:1.5;box-shadow:0 -2px 10px rgba(0,0,0,.3);';
    document.body.appendChild(b);
  }
  b.textContent = msg;
  b.style.display = 'block';
}
window.addEventListener('error', function(e){
  showDebugBanner('Se detecto un error cargando el reporte: ' + (e.message||'desconocido') + '. Si estas dentro de una vista previa, descarga el archivo .html y abrilo directamente en tu navegador.');
});

/* ============ STATE ============ */
let DATASET = [];
let MAXES = {};
let charts = { weekly:null, scatter:null };
let currentPage = 1;
const ROWS_PER_PAGE = 15;
let lastUpdateLabel = "planilla original";

/* ============ CHART.JS GLOBAL STYLE ============ */
if(typeof Chart !== 'undefined'){
  Chart.defaults.font.family = "'Poppins','Segoe UI',Arial,sans-serif";
  Chart.defaults.color = '#5B6470';
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(20,23,26,0.94)';
  Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
  Chart.defaults.plugins.tooltip.bodyColor = '#E8F5FC';
  Chart.defaults.plugins.tooltip.titleFont = {weight:'700', size:12};
  Chart.defaults.plugins.tooltip.bodyFont = {size:11.5};
  Chart.defaults.plugins.tooltip.padding = 11;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.displayColors = false;
  Chart.defaults.plugins.tooltip.boxPadding = 4;
}
let LOGO_IMAGES = {};
let LOGO_IMAGES_SMALL = {};
let BALL_IMAGE = null;
let IMAGES_READY = false;

/* ============ OPPONENT LOGO MATCHING ============ */
const OPPONENT_PATTERNS = [
  {re:/champagnat/i, key:'Champagnat'},
  {re:/los\s*tilos/i, key:'LosTilos'},
  {re:/san\s*luis/i, key:'SanLuis'},
  {re:/\blprc\b/i, key:'LaPlata'},
  {re:/\blmrc\b/i, key:'LosMatreros'},
  {re:/plaza/i, key:'Plaza'},
  {re:/\bcrbv\b/i, key:'CRBV'},
  {re:/\bcuba\b/i, key:'CUBA'},
  {re:/\bcasi\b/i, key:'CASI'},
  {re:/\bbac\b/i, key:'BAC'},
  {re:/hindu/i, key:'Hindu'},
  {re:/newman/i, key:'Newman'},
  {re:/alumni/i, key:'Alumni'},
  {re:/\bba\b/i, key:'BA'}
];
function opponentLogoKey(actividad){
  for(const p of OPPONENT_PATTERNS){
    if(p.re.test(actividad)) return p.key;
  }
  return 'SIC';
}

const RUGBY_BALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<ellipse cx="20" cy="20" rx="17" ry="10.5" fill="#8B5A2B" stroke="#5A3818" stroke-width="1.5" transform="rotate(-32 20 20)"/>
<g stroke="#F4E9DC" stroke-width="1.3" transform="rotate(-32 20 20)">
<line x1="8" y1="20" x2="32" y2="20"/>
<line x1="14" y1="17" x2="14" y2="23"/>
<line x1="18" y1="16.3" x2="18" y2="23.7"/>
<line x1="22" y1="16.3" x2="22" y2="23.7"/>
<line x1="26" y1="17" x2="26" y2="23"/>
</g>
</svg>`;

function loadImage(src){
  return new Promise((resolve)=>{
    const img = new Image();
    img.onload = ()=>resolve(img);
    img.onerror = ()=>resolve(null);
    img.src = src;
  });
}

async function preloadImages(){
  const entries = Object.keys(LOGOS_B64);
  const results = await Promise.all(entries.map(k=>loadImage('data:image/png;base64,'+LOGOS_B64[k])));
  entries.forEach((k,i)=>{ LOGO_IMAGES[k] = results[i]; });
  const smallEntries = Object.keys(LOGOS_SMALL_B64);
  const smallResults = await Promise.all(smallEntries.map(k=>loadImage('data:image/png;base64,'+LOGOS_SMALL_B64[k])));
  smallEntries.forEach((k,i)=>{ LOGO_IMAGES_SMALL[k] = smallResults[i]; });
  BALL_IMAGE = await loadImage('data:image/svg+xml;utf8,'+encodeURIComponent(RUGBY_BALL_SVG));
  IMAGES_READY = true;
}

/* ============ DECODE RAW COLUMNAR DATA ============ */
function decodeRaw(raw){
  const cols = raw.cols;
  const dicts = raw.dicts;
  const idx = {};
  cols.forEach((c,i)=> idx[c]=i );
  return raw.data.map((row,i)=>{
    return {
      __id: i,
      Jugador: dicts.Jugador[row[idx.Jugador]],
      Temporada: row[idx.Temporada],
      Tipo: dicts.Tipo[row[idx.Tipo]],
      Actividad: dicts.Actividad[row[idx.Actividad]],
      Fecha: row[idx.Fecha],
      Puesto: dicts.Puesto[row[idx.Puesto]],
      Distancia: row[idx.Distancia]||0,
      HSR: row[idx.HSR]||0,
      EsfExpl: row[idx.EsfExpl]||0,
      RHIE: row[idx.RHIE]||0,
      BiG: row[idx.BiG]||0,
      Contactos: row[idx.Contactos]||0,
      MaxVel: row[idx.MaxVel]||0,
      DuracionMin: row[idx.DuracionMin]||0
    };
  });
}

/* ============ INDEX / MAXES ============ */
function safeDiv(v,m){ return m>0 ? (v/m) : 0; }

function computeMaxes(data){
  const m = {};
  data.forEach(r=>{
    const t = r.Temporada;
    if(!m[t]) m[t] = {Distancia:0,HSR:0,EsfExpl:0,RHIE:0,BiG:0,Contactos:0,MaxVel:0};
    const o = m[t];
    if(r.Distancia>o.Distancia) o.Distancia=r.Distancia;
    if(r.HSR>o.HSR) o.HSR=r.HSR;
    if(r.EsfExpl>o.EsfExpl) o.EsfExpl=r.EsfExpl;
    if(r.RHIE>o.RHIE) o.RHIE=r.RHIE;
    if(r.BiG>o.BiG) o.BiG=r.BiG;
    if(r.Contactos>o.Contactos) o.Contactos=r.Contactos;
    if(r.MaxVel>o.MaxVel) o.MaxVel=r.MaxVel;
  });
  return m;
}

function computeIndexForRow(r, maxes){
  const mo = maxes[r.Temporada];
  if(!mo) return 0;
  const parts = {
    Contactos: safeDiv(r.Contactos, mo.Contactos),
    Distancia: safeDiv(r.Distancia, mo.Distancia),
    EsfExpl: safeDiv(r.EsfExpl, mo.EsfExpl),
    RHIE: safeDiv(r.RHIE, mo.RHIE),
    HSR: safeDiv(r.HSR, mo.HSR),
    BiGinv: 1 - safeDiv(r.BiG, mo.BiG)
  };
  const idx = (parts.Contactos + parts.Distancia + parts.EsfExpl + parts.RHIE + parts.HSR + parts.BiGinv) / 6 * 100;
  return { value: idx, parts: parts };
}

function attachIndex(data){
  MAXES = computeMaxes(data);
  data.forEach(r=>{
    const res = computeIndexForRow(r, MAXES);
    r.Indice = res.value;
    r.IndiceParts = res.parts;
  });
  return data;
}

/* ============ SWC (per player, chronological) ============ */
function attachSWC(data){
  const byPlayer = {};
  data.forEach(r=>{
    if(!byPlayer[r.Jugador]) byPlayer[r.Jugador]=[];
    byPlayer[r.Jugador].push(r);
  });
  Object.keys(byPlayer).forEach(p=>{
    const arr = byPlayer[p].sort((a,b)=> new Date(a.Fecha) - new Date(b.Fecha));
    const vals = arr.map(r=>r.Indice);
    const mean = vals.reduce((a,b)=>a+b,0)/vals.length;
    const variance = vals.reduce((a,b)=>a+(b-mean)*(b-mean),0)/Math.max(vals.length-1,1);
    const sd = Math.sqrt(variance);
    const swc = 0.2 * sd;
    arr.forEach((r,i)=>{
      r.SWC = swc;
      if(i===0){ r.PrevIndice = null; r.DeltaIndice = null; }
      else{
        r.PrevIndice = arr[i-1].Indice;
        r.DeltaIndice = r.Indice - arr[i-1].Indice;
      }
    });
  });
  return data;
}

function attachPlayerSeasonMax(data){
  const groups = {};
  data.forEach(r=>{
    const key = r.Jugador+'|'+r.Temporada;
    if(!groups[key]) groups[key] = [];
    groups[key].push(r);
  });
  Object.values(groups).forEach(arr=>{
    const maxIdx = Math.max(...arr.map(r=>r.Indice));
    arr.forEach(r=>{ r.PlayerSeasonMaxIndice = maxIdx>0 ? maxIdx : null; });
  });
  return data;
}

/* ============ RADAR COMPARISON: NORMALIZATION ============ */
const RADAR_METRICS = [
  {key:'Contactos', label:'Contactos'},
  {key:'Distancia', label:'Distancia'},
  {key:'EsfExpl', label:'Esf. Explosivos'},
  {key:'RHIE', label:'RHIE'},
  {key:'HSR', label:'HSR'},
  {key:'BiG', label:'BiG (menor = mejor)'}
];
let GLOBAL_MAXES = {Contactos:1,Distancia:1,EsfExpl:1,RHIE:1,HSR:1,BiG:1};

function computeGlobalMaxes(data){
  const m = {Contactos:0,Distancia:0,EsfExpl:0,RHIE:0,HSR:0,BiG:0};
  data.forEach(r=>{
    if(r.Contactos>m.Contactos) m.Contactos=r.Contactos;
    if(r.Distancia>m.Distancia) m.Distancia=r.Distancia;
    if(r.EsfExpl>m.EsfExpl) m.EsfExpl=r.EsfExpl;
    if(r.RHIE>m.RHIE) m.RHIE=r.RHIE;
    if(r.HSR>m.HSR) m.HSR=r.HSR;
    if(r.BiG>m.BiG) m.BiG=r.BiG;
  });
  Object.keys(m).forEach(k=>{ if(m[k]<=0) m[k]=1; });
  return m;
}

function radarNormalize(row){
  const out = {};
  RADAR_METRICS.forEach(m=>{
    const max = GLOBAL_MAXES[m.key] || 1;
    if(m.key==='BiG'){
      out[m.key] = Math.max(0, Math.min(100, (1 - row.BiG/max) * 100));
    } else {
      out[m.key] = Math.max(0, Math.min(100, (row[m.key]/max) * 100));
    }
  });
  return out;
}

/* ============ FORMAT HELPERS ============ */
function fmt1(v){ return (Math.round(v*10)/10).toLocaleString('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1}); }
function fmt0(v){ return Math.round(v).toLocaleString('es-AR'); }
function fmtDate(d){
  const dt = new Date(d);
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yyyy = dt.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
function shortName(name){
  const parts = name.trim().split(/\s+/);
  if(parts.length===1) return parts[0];
  return parts[0][0]+'. '+parts[parts.length-1];
}
function shortActividad(r){
  const a = r.Actividad || '';
  const vsMatch = a.match(/vs\.?\s*(.+)/i);
  if(vsMatch){
    let riv = vsMatch[1].trim();
    riv = riv.replace(/\s*\(.*\)\s*$/,'').trim();
    return riv.length>14 ? riv.slice(0,13)+'.' : riv;
  }
  if(r.Tipo==='Entrenamiento') return 'Entren.';
  return a.length>14 ? a.slice(0,13)+'.' : a;
}

/* ============ FILTER STATE ============ */
function getFilterValues(){
  const startInput = document.getElementById('timeline-start');
  const endInput = document.getElementById('timeline-end');
  let tStart = startInput && startInput.value ? Number(startInput.value) : null;
  let tEnd = endInput && endInput.value ? Number(endInput.value) : null;
  if(tStart!==null && tEnd!==null && tStart>tEnd){ const t=tStart; tStart=tEnd; tEnd=t; }
  return {
    temporada: document.getElementById('f-temporada').value,
    tipo: document.getElementById('f-tipo').value,
    actividad: document.getElementById('f-actividad').value,
    jugador: document.getElementById('f-jugador').value,
    timelineStart: tStart,
    timelineEnd: tEnd
  };
}

function applyFilters(data, f){
  return data.filter(r=>{
    if(f.temporada!=='__ALL__' && String(r.Temporada)!==f.temporada) return false;
    if(f.tipo!=='__ALL__' && r.Tipo!==f.tipo) return false;
    if(f.actividad!=='__ALL__' && r.Actividad!==f.actividad) return false;
    if(f.jugador!=='__ALL__' && r.Jugador!==f.jugador) return false;
    if(f.timelineStart!==null && f.timelineEnd!==null){
      const di = dayIndex(r.Fecha);
      if(di<f.timelineStart || di>f.timelineEnd) return false;
    }
    return true;
  });
}

/* ============ TIMELINE ============ */
function dayIndex(dateStr){
  return Math.floor(new Date(dateStr).getTime()/86400000);
}
function dayIndexToDate(idx){
  return new Date(idx*86400000);
}
function fmtShortDate(idx){
  return fmtDate(dayIndexToDate(idx));
}

function timelineScopeData(){
  const temp = document.getElementById('f-temporada').value;
  return DATASET.filter(r=> temp==='__ALL__' || String(r.Temporada)===temp);
}

function initTimelineDomain(){
  const scope = timelineScopeData();
  if(scope.length===0) return;
  const idxs = scope.map(r=>dayIndex(r.Fecha));
  const min = Math.min(...idxs);
  const max = Math.max(...idxs);
  const startInput = document.getElementById('timeline-start');
  const endInput = document.getElementById('timeline-end');
  startInput.min = min; startInput.max = max; startInput.step = 1; startInput.value = min;
  endInput.min = min; endInput.max = max; endInput.step = 1; endInput.value = max;
  updateTimelineFillAndLabel();
  renderTimelineMarkers(scope);
}

function updateTimelineFillAndLabel(){
  const startInput = document.getElementById('timeline-start');
  const endInput = document.getElementById('timeline-end');
  const fill = document.getElementById('timeline-range-fill');
  const label = document.getElementById('timeline-range-label');
  const min = Number(startInput.min), max = Number(startInput.max);
  let s = Number(startInput.value), e = Number(endInput.value);
  if(s>e){ const t=s; s=e; e=t; }
  const range = Math.max(max-min,1);
  const pctStart = ((s-min)/range)*100;
  const pctEnd = ((e-min)/range)*100;
  fill.style.left = pctStart+'%';
  fill.style.width = (pctEnd-pctStart)+'%';
  label.textContent = fmtShortDate(s) + '  \u2192  ' + fmtShortDate(e);
}

function renderTimelineMarkers(scope){
  const startInput = document.getElementById('timeline-start');
  const min = Number(startInput.min), max = Number(startInput.max);
  const range = Math.max(max-min,1);
  const seen = new Set();
  const uniqueActs = [];
  scope.slice().sort((a,b)=> new Date(a.Fecha)-new Date(b.Fecha)).forEach(r=>{
    if(seen.has(r.Actividad)) return;
    seen.add(r.Actividad);
    uniqueActs.push(r);
  });
  const currentActividad = document.getElementById('f-actividad').value;
  const holder = document.getElementById('timeline-markers');
  holder.innerHTML = uniqueActs.map(r=>{
    const di = dayIndex(r.Fecha);
    const pct = ((di-min)/range)*100;
    const cls = ['timeline-marker'];
    if(r.Tipo==='Entrenamiento') cls.push('entren');
    if(r.Actividad===currentActividad) cls.push('selected');
    const title = `${r.Actividad} - ${fmtDate(r.Fecha)}`.replace(/"/g,'&quot;');
    return `<div class="${cls.join(' ')}" style="left:${pct}%;" data-actividad="${r.Actividad.replace(/"/g,'&quot;')}" title="${title}"></div>`;
  }).join('');

  holder.querySelectorAll('.timeline-marker').forEach(el=>{
    el.addEventListener('click', ()=>{
      const act = el.getAttribute('data-actividad');
      const selAct = document.getElementById('f-actividad');
      selAct.value = act;
      selAct.dispatchEvent(new Event('change'));
    });
  });
}

/* ============ POPULATE FILTER OPTIONS ============ */
function populateFilters(){
  const temporadas = [...new Set(DATASET.map(r=>r.Temporada))].sort((a,b)=>b-a);
  const selTemp = document.getElementById('f-temporada');
  const prevTemp = selTemp.value;
  selTemp.innerHTML = '<option value="__ALL__">Todas las temporadas</option>' +
    temporadas.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(prevTemp && [...selTemp.options].some(o=>o.value===prevTemp)) selTemp.value = prevTemp;
  else if(temporadas.map(String).includes('2026')) selTemp.value = '2026';
  else if(temporadas.length) selTemp.value = String(temporadas[0]);

  refreshActividadYJugadorOptions(true);
  initTimelineDomain();
}

function refreshActividadYJugadorOptions(keepSelection){
  const f = getFilterValues();
  const scoped = DATASET.filter(r=>{
    if(f.temporada!=='__ALL__' && String(r.Temporada)!==f.temporada) return false;
    return true;
  });

  const selTipo = document.getElementById('f-tipo');
  const prevTipo = keepSelection ? selTipo.value : '__ALL__';
  const tipos = [...new Set(scoped.map(r=>r.Tipo))].sort();
  selTipo.innerHTML = '<option value="__ALL__">Todos</option>' + tipos.map(t=>`<option value="${t}">${t}</option>`).join('');
  if(prevTipo && [...selTipo.options].some(o=>o.value===prevTipo)) selTipo.value = prevTipo;
  else if(tipos.includes('Partido')) selTipo.value = 'Partido';

  const selAct = document.getElementById('f-actividad');
  const prevAct = keepSelection ? selAct.value : '__ALL__';
  const actividades = [...new Set(scoped.map(r=>r.Actividad))].sort();
  selAct.innerHTML = '<option value="__ALL__">Todas</option>' + actividades.map(a=>`<option value="${a.replace(/"/g,'&quot;')}">${a}</option>`).join('');
  if(prevAct && [...selAct.options].some(o=>o.value===prevAct)) selAct.value = prevAct;

  const selJug = document.getElementById('f-jugador');
  const prevJug = keepSelection ? selJug.value : '__ALL__';
  const jugadores = [...new Set(scoped.map(r=>r.Jugador))].sort();
  selJug.innerHTML = '<option value="__ALL__">Todos los jugadores</option>' + jugadores.map(j=>`<option value="${j.replace(/"/g,'&quot;')}">${j}</option>`).join('');
  if(prevJug && [...selJug.options].some(o=>o.value===prevJug)) selJug.value = prevJug;
}

/* ============ GAUGE (SVG speedometer) ============ */
function renderGauge(value, maxScale){
  const holder = document.getElementById('gauge-svg-holder');
  const w=280,h=175,cx=140,cy=155,r=118;
  const startAngle=180, endAngle=0;

  const toXY=(angDeg,rad)=>{
    const rd = angDeg*Math.PI/180;
    return [cx + rad*Math.cos(rd), cy - rad*Math.sin(rd)];
  };
  const arcPath=(fromDeg,toDeg,rad)=>{
    const [x1,y1]=toXY(fromDeg,rad);
    const [x2,y2]=toXY(toDeg,rad);
    const largeArc = Math.abs(fromDeg-toDeg) > 180 ? 1 : 0;
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${rad} ${rad} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  };

  const pct = Math.max(0,Math.min(1, maxScale>0 ? value/maxScale : 0));
  const needleAngle = startAngle - pct*(startAngle-endAngle);

  const zoneStops = [
    {from:180, to:120},
    {from:120, to:65},
    {from:65,  to:0}
  ];
  const zoneColors = ['#BFE6F7','#2FA8DE','#0E3A52'];

  let zonesSvg = '';
  zoneStops.forEach((z,i)=>{
    zonesSvg += `<path d="${arcPath(z.from,z.to,r)}" stroke="${zoneColors[i]}" stroke-width="20" fill="none" stroke-linecap="butt"/>`;
  });

  const majorStep = maxScale/8;
  let ticksSvg = '';
  let labelsSvg = '';
  for(let i=0;i<=8;i++){
    const val = i*majorStep;
    const ang = startAngle - (val/maxScale)*(startAngle-endAngle);
    const [ox,oy] = toXY(ang, r+11);
    const [ix,iy] = toXY(ang, r-3);
    ticksSvg += `<line x1="${ix.toFixed(2)}" y1="${iy.toFixed(2)}" x2="${ox.toFixed(2)}" y2="${oy.toFixed(2)}" stroke="#14171A" stroke-width="2.2"/>`;
    const [lx,ly] = toXY(ang, r+24);
    labelsSvg += `<text x="${lx.toFixed(2)}" y="${(ly+4).toFixed(2)}" font-size="10.5" font-weight="600" fill="#5B6470" text-anchor="middle">${Math.round(val)}</text>`;
    for(let j=1;j<4;j++){
      const subVal = val + (majorStep/4)*j;
      if(subVal>maxScale) break;
      const subAng = startAngle - (subVal/maxScale)*(startAngle-endAngle);
      const [sox,soy] = toXY(subAng, r+6);
      const [six,siy] = toXY(subAng, r-3);
      ticksSvg += `<line x1="${six.toFixed(2)}" y1="${siy.toFixed(2)}" x2="${sox.toFixed(2)}" y2="${soy.toFixed(2)}" stroke="#B9C1C9" stroke-width="1.2"/>`;
    }
  }

  const [nx,ny] = toXY(needleAngle, r-20);
  const [tailX,tailY] = toXY(needleAngle+180, 14);
  const needleWidth = 5;
  const perp = needleAngle+90;
  const [bx1,by1] = toXY(perp, needleWidth);
  const [bx2,by2] = toXY(perp+180, needleWidth);

  const svg = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <radialGradient id="hubGrad" cx="35%" cy="30%" r="70%">
        <stop offset="0%" stop-color="#4CB8E8"/>
        <stop offset="55%" stop-color="#14171A"/>
        <stop offset="100%" stop-color="#000"/>
      </radialGradient>
      <linearGradient id="needleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#E8455A"/>
        <stop offset="100%" stop-color="#A8202E"/>
      </linearGradient>
      <filter id="gaugeShadow" x="-50%" y="-50%" width="200%" height="200%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#000" flood-opacity="0.28"/>
      </filter>
    </defs>
    <path d="${arcPath(182,-2,r+13)}" stroke="#DDE3E8" stroke-width="2" fill="none"/>
    ${zonesSvg}
    <path d="${arcPath(180,0,r+12)}" stroke="#0B0D0F" stroke-width="2.5" fill="none"/>
    <path d="${arcPath(180,0,r-11)}" stroke="#0B0D0F" stroke-width="2.5" fill="none"/>
    ${ticksSvg}
    ${labelsSvg}
    <g filter="url(#gaugeShadow)">
      <polygon points="${nx.toFixed(2)},${ny.toFixed(2)} ${bx1.toFixed(2)},${by1.toFixed(2)} ${tailX.toFixed(2)},${tailY.toFixed(2)} ${bx2.toFixed(2)},${by2.toFixed(2)}" fill="url(#needleGrad)"/>
      <circle cx="${cx}" cy="${cy}" r="13" fill="url(#hubGrad)" stroke="#000" stroke-width="1"/>
      <circle cx="${(cx-4)}" cy="${(cy-4)}" r="3.2" fill="#ffffff" opacity="0.55"/>
    </g>
  </svg>`;
  holder.innerHTML = svg;
}

/* ============ WEEKLY AGG (bar+line) ============ */
function isoWeekKey(dateStr){
  const d = new Date(dateStr);
  d.setHours(0,0,0,0);
  const day = (d.getDay()+6)%7;
  d.setDate(d.getDate()-day);
  return d;
}
function weekLabel(d){
  return d.toLocaleDateString('es-AR',{day:'2-digit',month:'short'});
}

function weeklyValueLabelsPlugin(showLabels){
  return {
    id:'weeklyValueLabels',
    afterDatasetsDraw(chart){
      if(!showLabels) return;
      const {ctx} = chart;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '700 10px Poppins, Arial, sans-serif';

      const barMeta = chart.getDatasetMeta(0);
      const distData = chart.data.datasets[0].data;
      ctx.fillStyle = '#136A9E';
      barMeta.data.forEach((el,i)=>{
        const v = distData[i];
        if(v===undefined || v===null) return;
        ctx.fillText(v.toLocaleString('es-AR'), el.x, el.y-8);
      });

      const lineMeta = chart.getDatasetMeta(1);
      const esfData = chart.data.datasets[1].data;
      ctx.fillStyle = '#14171A';
      lineMeta.data.forEach((el,i)=>{
        const v = esfData[i];
        if(v===undefined || v===null) return;
        ctx.fillText(String(v), el.x, el.y-10);
      });
      ctx.restore();
    }
  };
}

function renderWeeklyChart(filtered){
  const map = {};
  filtered.forEach(r=>{
    const wk = isoWeekKey(r.Fecha);
    const key = wk.getTime();
    if(!map[key]) map[key] = {date:wk, dist:0, esf:0};
    map[key].dist += r.Distancia;
    map[key].esf += r.EsfExpl;
  });
  const weeks = Object.values(map).sort((a,b)=>a.date-b.date);
  const labels = weeks.map(w=>weekLabel(w.date));
  const dist = weeks.map(w=>Math.round(w.dist));
  const esf = weeks.map(w=>Math.round(w.esf));

  const ctx = document.getElementById('chart-weekly');
  if(charts.weekly) charts.weekly.destroy();

  const canvasCtx = ctx.getContext && ctx.getContext('2d');
  let barGradient = '#2FA8DE';
  let lineAreaGradient = 'rgba(20,23,26,0.10)';
  if(canvasCtx){
    const bg = canvasCtx.createLinearGradient(0,0,0,300);
    bg.addColorStop(0,'#4CC3F0');
    bg.addColorStop(1,'#136A9E');
    barGradient = bg;
    const lg = canvasCtx.createLinearGradient(0,0,0,300);
    lg.addColorStop(0,'rgba(20,23,26,0.16)');
    lg.addColorStop(1,'rgba(20,23,26,0.0)');
    lineAreaGradient = lg;
  }

  charts.weekly = new Chart(ctx,{
    data:{
      labels: labels,
      datasets:[
        {type:'bar', label:'Distancia (m)', data:dist, backgroundColor:barGradient, hoverBackgroundColor:'#2FA8DE', borderRadius:5, yAxisID:'y', order:2, barThickness: labels.length>20?6: undefined},
        {type:'line', label:'Esfuerzos explosivos', data:esf, borderColor:'#14171A', backgroundColor:lineAreaGradient, fill:true, yAxisID:'y1', order:1, tension:.35, pointRadius:3.5, pointBackgroundColor:'#fff', pointBorderColor:'#14171A', pointBorderWidth:2, pointHoverRadius:6, borderWidth:2.5}
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:18}},
      interaction:{mode:'index', intersect:false},
      plugins:{ legend:{display:false},
        tooltip:{callbacks:{label:(c)=> c.dataset.label+': '+ c.formattedValue }}
      },
      scales:{
        x:{ ticks:{ maxRotation: labels.length>15?60:0, autoSkip: labels.length>25, font:{size:10.5} } , grid:{display:false} },
        y:{ position:'left', title:{display:true,text:'Distancia (m)', font:{size:11,weight:600}}, grid:{color:'#EEF1F4'}, ticks:{font:{size:10.5}} },
        y1:{ position:'right', title:{display:true,text:'Esf. explosivos', font:{size:11,weight:600}}, grid:{drawOnChartArea:false}, ticks:{font:{size:10.5}} }
      }
    },
    plugins:[weeklyValueLabelsPlugin(labels.length<=18)]
  });

  const weeklyNote = document.getElementById('weekly-note');
  if(weeklyNote){
    weeklyNote.textContent = labels.length<=18
      ? `Los valores sobre cada columna y punto son el total semanal de distancia y esfuerzos explosivos.`
      : `Mostrando ${labels.length} semanas. Los valores de referencia se ocultan cuando hay mas de 18 semanas para no saturar el grafico; use los filtros para acotar el periodo, o pase el mouse sobre cada punto.`;
  }
}

/* ============ SCATTER ============ */
function labelsPlugin(showLabels){
  return {
    id:'pointLabels',
    afterDatasetsDraw(chart){
      if(!showLabels) return;
      const {ctx} = chart;
      chart.data.datasets.forEach((ds,di)=>{
        const meta = chart.getDatasetMeta(di);
        meta.data.forEach((pt,i)=>{
          const d = ds.data[i];
          if(!d || !d._label) return;
          ctx.save();
          ctx.textAlign = 'left';
          ctx.font = '600 9.5px Poppins, Arial, sans-serif';
          ctx.fillStyle = '#14171A';
          ctx.fillText(d._label, pt.x+6, pt.y+1);
          ctx.font = '9px Poppins, Arial, sans-serif';
          ctx.fillStyle = '#8C94A0';
          ctx.fillText(d._actividadLabel, pt.x+6, pt.y+11);
          ctx.restore();
        });
      });
    }
  };
}

function pointImageFor(r){
  if(!IMAGES_READY) return undefined;
  if(r.Tipo==='Entrenamiento') return undefined;
  const key = opponentLogoKey(r.Actividad);
  return LOGO_IMAGES_SMALL[key] || LOGO_IMAGES_SMALL['SIC'] || undefined;
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function meanLinesPlugin(meanX, meanY){
  return {
    id:'meanLines',
    afterDatasetsDraw(chart){
      const {ctx, chartArea, scales} = chart;
      if(!chartArea) return;
      const xPix = scales.x.getPixelForValue(meanX);
      const yPix = scales.y.getPixelForValue(meanY);
      ctx.save();
      ctx.setLineDash([6,4]);
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = 'rgba(20,23,26,0.55)';
      ctx.beginPath();
      ctx.moveTo(xPix, chartArea.top);
      ctx.lineTo(xPix, chartArea.bottom);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(47,168,222,0.85)';
      ctx.beginPath();
      ctx.moveTo(chartArea.left, yPix);
      ctx.lineTo(chartArea.right, yPix);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.font = '700 10px Poppins, Arial, sans-serif';
      const labelX = 'Media indice: '+fmt1(meanX);
      const wX = ctx.measureText(labelX).width;
      const pillX = Math.min(xPix+8, chartArea.right-wX-20);
      ctx.fillStyle = '#14171A';
      roundRect(ctx, pillX, chartArea.top+6, wX+16, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelX, pillX+8, chartArea.top+16);

      const labelY = 'Media contactos: '+fmt1(meanY);
      const wY = ctx.measureText(labelY).width;
      const pillY = chartArea.right-wY-20;
      const pillYtop = Math.max(yPix-26, chartArea.top+6);
      ctx.fillStyle = '#2FA8DE';
      roundRect(ctx, pillY, pillYtop, wY+16, 20, 10);
      ctx.fill();
      ctx.fillStyle = '#14171A';
      ctx.fillText(labelY, pillY+8, pillYtop+10);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }
  };
}

function renderScatter(filtered){
  const points = filtered.map(r=>({
    x: Math.round(r.Indice*10)/10,
    y: r.Contactos,
    _label: filtered.length<=80 ? shortName(r.Jugador) : null,
    _actividadLabel: filtered.length<=80 ? shortActividad(r) : null,
    jugador: r.Jugador,
    actividad: r.Actividad,
    fecha: r.Fecha,
    tipo: r.Tipo
  }));
  const pointStyles = filtered.map(r=> pointImageFor(r) || 'circle');
  const usingAnyImages = IMAGES_READY;
  const meanX = points.length ? points.reduce((a,p)=>a+p.x,0)/points.length : 0;
  const meanY = points.length ? points.reduce((a,p)=>a+p.y,0)/points.length : 0;

  const ctx = document.getElementById('chart-scatter');
  if(charts.scatter) charts.scatter.destroy();
  const showLabels = points.length<=80;
  charts.scatter = new Chart(ctx,{
    type:'scatter',
    data:{ datasets:[{
      label:'Jugador / actividad',
      data: points,
      backgroundColor:'rgba(47,168,222,0.75)',
      borderColor:'#ffffff',
      borderWidth:1.5,
      hoverBackgroundColor:'#2FA8DE',
      hoverBorderColor:'#14171A',
      hoverBorderWidth:2,
      pointStyle: usingAnyImages ? pointStyles : undefined,
      pointRadius: 4.5,
      pointHoverRadius: 7
    }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{right:60,top:16}},
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{
          label:(c)=>{
            const d = c.raw;
            const tipoLbl = d.tipo==='Entrenamiento' ? 'Entrenamiento' : ('vs. '+d.actividad.replace(/^SIC\s*vs\s*/i,''));
            return [ d.jugador, tipoLbl, fmtDate(d.fecha), 'Indice: '+fmt1(d.x)+'  Contactos: '+fmt0(d.y) ];
          }
        }}
      },
      scales:{
        x:{ title:{display:true,text:'Indice de exigencia'}, grid:{color:'#EEF1F4'} },
        y:{ title:{display:true,text:'Contactos'}, grid:{color:'#EEF1F4'}, beginAtZero:true }
      }
    },
    plugins:[labelsPlugin(showLabels), meanLinesPlugin(meanX, meanY)]
  });

  const note = document.getElementById('scatter-note');
  if(!showLabels){
    note.textContent = `Mostrando ${points.length} registros. Los nombres directos sobre el grafico se ocultan cuando hay mas de 80 puntos; use los filtros para reducirlos, o pase el mouse sobre un punto para ver el detalle.`;
  } else {
    note.textContent = `Mostrando ${points.length} registros. Pase el mouse sobre un punto para ver jugador, actividad y fecha.`;
  }
}

/* ============ KPI CARDS ============ */
const PARAM_LABELS = [
  {key:'Contactos', label:'Contactos'},
  {key:'Distancia', label:'Distancia'},
  {key:'EsfExpl', label:'Esf.Expl'},
  {key:'RHIE', label:'RHIE'},
  {key:'HSR', label:'HSR'},
  {key:'BiGinv', label:'BiG (inv)'}
];

function renderKpiCards(filtered, f, fullDataInSeason){
  const n = filtered.length;
  document.getElementById('kpi1-n').textContent = n + (n===1?' actividad':' actividades');

  if(n===0){
    document.getElementById('kpi1-value').textContent = '\u2014';
    document.getElementById('kpi1-params').innerHTML = '';
  } else {
    const avgIdx = filtered.reduce((a,r)=>a+r.Indice,0)/n;
    document.getElementById('kpi1-value').textContent = fmt1(avgIdx);
    const avgParts = {};
    PARAM_LABELS.forEach(p=> avgParts[p.key] = filtered.reduce((a,r)=>a+r.IndiceParts[p.key],0)/n );
    document.getElementById('kpi1-params').innerHTML = PARAM_LABELS.map(p=>{
      const pct = Math.round(avgParts[p.key]*100);
      return `<div class="param-row"><span class="param-name">${p.label}</span><div class="param-bar"><div class="param-bar-fill" style="width:${Math.min(100,Math.max(0,pct))}%"></div></div><span class="param-pct">${pct}%</span></div>`;
    }).join('');
  }

  const seasonAvg = fullDataInSeason.length ? fullDataInSeason.reduce((a,r)=>a+r.Indice,0)/fullDataInSeason.length : null;
  const kpi2val = document.getElementById('kpi2-value');
  const kpi2tag = document.getElementById('kpi2-tag');
  const kpi2foot = document.getElementById('kpi2-foot');
  if(n===0 || seasonAvg===null){
    kpi2val.textContent = '\u2014'; kpi2val.className='delta-value flat';
    kpi2tag.textContent = 'Sin datos'; kpi2tag.className='delta-tag flat';
    kpi2foot.textContent='';
  } else {
    const avgIdx = filtered.reduce((a,r)=>a+r.Indice,0)/n;
    const diff = avgIdx - seasonAvg;
    const cls = diff>1 ? 'up' : diff<-1 ? 'down' : 'flat';
    kpi2val.textContent = (diff>=0?'+':'')+fmt1(diff);
    kpi2val.className = 'delta-value '+cls;
    kpi2tag.textContent = cls==='up' ? 'Por encima del promedio' : cls==='down' ? 'Por debajo del promedio' : 'En linea con el promedio';
    kpi2tag.className = 'delta-tag '+cls;
    kpi2foot.textContent = `Promedio de temporada: ${fmt1(seasonAvg)} (${fullDataInSeason.length} actividades)`;
  }

  const kpi3val = document.getElementById('kpi3-value');
  const kpi3tag = document.getElementById('kpi3-tag');
  const kpi3foot = document.getElementById('kpi3-foot');
  if(f.jugador==='__ALL__'){
    const withPrev = filtered.filter(r=>r.DeltaIndice!==null && r.DeltaIndice!==undefined);
    if(withPrev.length===0){
      kpi3val.textContent='\u2014'; kpi3val.className='delta-value flat';
      kpi3tag.textContent='Seleccione un jugador'; kpi3tag.className='delta-tag flat';
      kpi3foot.textContent='Elegi un jugador en los filtros para ver el detalle actividad a actividad.';
    } else {
      const meaningful = withPrev.filter(r=> Math.abs(r.DeltaIndice) >= r.SWC ).length;
      kpi3val.textContent = meaningful+' / '+withPrev.length;
      kpi3val.className='delta-value flat';
      kpi3tag.textContent='Cambios que superan el SWC';
      kpi3tag.className='delta-tag flat';
      kpi3foot.textContent='Cantidad de actividades, dentro de la seleccion, cuyo cambio de indice respecto de la actividad anterior del mismo jugador supera su Smallest Worthwhile Change.';
    }
  } else {
    const sorted = filtered.slice().sort((a,b)=> new Date(b.Fecha)-new Date(a.Fecha));
    const last = sorted[0];
    if(!last || last.DeltaIndice===null || last.DeltaIndice===undefined){
      kpi3val.textContent='\u2014'; kpi3val.className='delta-value flat';
      kpi3tag.textContent='Sin actividad anterior'; kpi3tag.className='delta-tag flat';
      kpi3foot.textContent='No hay un registro previo de este jugador para comparar.';
    } else {
      const cls = last.DeltaIndice >= last.SWC ? 'up' : last.DeltaIndice <= -last.SWC ? 'down' : 'flat';
      kpi3val.textContent = (last.DeltaIndice>=0?'+':'')+fmt1(last.DeltaIndice);
      kpi3val.className = 'delta-value '+cls;
      kpi3tag.textContent = cls==='up' ? 'Aumento relevante' : cls==='down' ? 'Disminucion relevante' : 'Sin cambio relevante';
      kpi3tag.className = 'delta-tag '+cls;
      kpi3foot.textContent = `Ultima actividad: ${last.Actividad} (${fmtDate(last.Fecha)}). SWC de ${last.Jugador}: ${fmt1(last.SWC)} puntos de indice.`;
    }
  }
}

/* ============ TABLE ============ */
/* ============ MEDALLAS (mejores marcas por columna) ============ */
const MEDAL_COLS = [
  {key:'Distancia', dir:'max'},
  {key:'HSR', dir:'max'},
  {key:'EsfExpl', dir:'max'},
  {key:'BiG', dir:'min'},
  {key:'Contactos', dir:'max'},
  {key:'MaxVel', dir:'max'},
  {key:'Indice', dir:'max'}
];
const MEDAL_ICONS = ['\ud83e\udd47','\ud83e\udd48','\ud83e\udd49'];

function computeMedals(rows){
  const map = {};
  if(!rows.length) return map;
  MEDAL_COLS.forEach(mc=>{
    const sorted = rows.slice().sort((a,b)=> mc.dir==='max' ? b[mc.key]-a[mc.key] : a[mc.key]-b[mc.key]);
    sorted.slice(0,3).forEach((r,i)=>{
      if(!map[r.__id]) map[r.__id] = {};
      map[r.__id][mc.key] = MEDAL_ICONS[i];
    });
  });
  return map;
}
function medalSpan(medal){
  return medal ? ` <span title="Una de las 3 mejores marcas de esta metrica, dentro de la seleccion actual">${medal}</span>` : '';
}

function renderTable(filtered){
  const sorted = filtered.slice().sort((a,b)=> new Date(b.Fecha)-new Date(a.Fecha));
  const medals = computeMedals(filtered);
  const totalPages = Math.max(1, Math.ceil(sorted.length/ROWS_PER_PAGE));
  if(currentPage>totalPages) currentPage = totalPages;
  const startIdx = (currentPage-1)*ROWS_PER_PAGE;
  const pageRows = sorted.slice(startIdx, startIdx+ROWS_PER_PAGE);

  const tbody = document.getElementById('table-body');
  const empty = document.getElementById('table-empty');
  if(sorted.length===0){
    tbody.innerHTML=''; empty.style.display='block';
  } else {
    empty.style.display='none';
    tbody.innerHTML = pageRows.map(r=>{
      let swcHtml;
      if(r.DeltaIndice===null || r.DeltaIndice===undefined){
        swcHtml = '<span class="tag-swc na">Sin dato previo</span>';
      } else {
        const cls = r.DeltaIndice >= r.SWC ? 'up' : r.DeltaIndice <= -r.SWC ? 'down' : 'flat';
        const arrow = cls==='up' ? '\u2191' : cls==='down' ? '\u2193' : '\u2248';
        swcHtml = `<span class="tag-swc ${cls}">${arrow} ${(r.DeltaIndice>=0?'+':'')}${fmt1(r.DeltaIndice)} (SWC ${fmt1(r.SWC)})</span>`;
      }
      const m = medals[r.__id] || {};
      return `<tr>
        <td>${r.Jugador}</td>
        <td>${r.Actividad}</td>
        <td>${fmtDate(r.Fecha)}</td>
        <td class="num">${fmt0(r.Distancia)}${medalSpan(m.Distancia)}</td>
        <td class="num">${fmt0(r.HSR)}${medalSpan(m.HSR)}</td>
        <td class="num">${fmt0(r.EsfExpl)}${medalSpan(m.EsfExpl)}</td>
        <td class="num">${fmt1(r.BiG)}${medalSpan(m.BiG)}</td>
        <td class="num">${fmt0(r.Contactos)}${medalSpan(m.Contactos)}</td>
        <td class="num">${fmt1(r.MaxVel)}${medalSpan(m.MaxVel)}</td>
        <td class="num">${fmt1(r.Indice)}${medalSpan(m.Indice)}</td>
        <td>${swcHtml}</td>
      </tr>`;
    }).join('');
  }

  document.getElementById('table-summary').textContent = `${sorted.length} registros`;
  document.getElementById('page-info').textContent = `Pagina ${currentPage} de ${totalPages}`;
  document.getElementById('page-prev').disabled = currentPage<=1;
  document.getElementById('page-next').disabled = currentPage>=totalPages;
}

/* ============ RADAR COMPARISON: UI ============ */
let radarCharts = { a:null, b:null };
let ROW_BY_ID = {};

function rowLabel(r){
  return `${r.Actividad} \u2014 ${fmtDate(r.Fecha)} (${r.Tipo==='Partido'?'Partido':'Entren.'})`;
}

function populateSesionSelect(selectId, jugador){
  const sel = document.getElementById(selectId);
  const rows = DATASET.filter(r=>r.Jugador===jugador).sort((a,b)=> new Date(b.Fecha)-new Date(a.Fecha));
  sel.innerHTML = rows.map(r=>`<option value="${r.__id}">${rowLabel(r).replace(/</g,'&lt;')}</option>`).join('');
}

function initComparisonSelectors(){
  ROW_BY_ID = {};
  DATASET.forEach(r=>{ ROW_BY_ID[r.__id]=r; });

  const jugadores = [...new Set(DATASET.map(r=>r.Jugador))].sort();
  const selJA = document.getElementById('radar-jugador-a');
  const selJB = document.getElementById('radar-jugador-b');
  const opts = jugadores.map(j=>`<option value="${j.replace(/"/g,'&quot;')}">${j}</option>`).join('');
  selJA.innerHTML = opts;
  selJB.innerHTML = opts;

  const sorted = DATASET.slice().sort((a,b)=>b.Indice-a.Indice);
  const defaultA = sorted[0];
  let defaultB = sorted.find(r=>r.Jugador===defaultA.Jugador && r.__id!==defaultA.__id) || sorted[1];

  selJA.value = defaultA.Jugador;
  populateSesionSelect('radar-sesion-a', defaultA.Jugador);
  document.getElementById('radar-sesion-a').value = defaultA.__id;

  selJB.value = defaultB.Jugador;
  populateSesionSelect('radar-sesion-b', defaultB.Jugador);
  document.getElementById('radar-sesion-b').value = defaultB.__id;

  renderRadarComparison();
}

function getRadarSelection(side){
  const jug = document.getElementById('radar-jugador-'+side).value;
  const sesId = document.getElementById('radar-sesion-'+side).value;
  return ROW_BY_ID[sesId] || DATASET.filter(r=>r.Jugador===jug)[0];
}

function radarRawValueText(row, key){
  switch(key){
    case 'Contactos': return fmt0(row.Contactos);
    case 'Distancia': return fmt0(row.Distancia)+' m';
    case 'EsfExpl': return fmt0(row.EsfExpl);
    case 'RHIE': return fmt0(row.RHIE);
    case 'HSR': return fmt0(row.HSR)+' m';
    case 'BiG': return fmt1(row.BiG);
    default: return '';
  }
}

function radarValueLabelsPlugin(row, colorMain){
  return {
    id:'radarValueLabels',
    afterDatasetsDraw(chart){
      const {ctx} = chart;
      const scale = chart.scales.r;
      if(!scale) return;
      const meta = chart.getDatasetMeta(0);
      const cx = scale.xCenter, cy = scale.yCenter;
      ctx.save();
      ctx.font = '700 10px Poppins, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      meta.data.forEach((pt,i)=>{
        const dx = pt.x-cx, dy = pt.y-cy;
        const len = Math.sqrt(dx*dx+dy*dy) || 1;
        const nx = dx/len, ny = dy/len;
        const offset = 15;
        const lx = pt.x + nx*offset;
        const ly = pt.y + ny*offset;
        const text = radarRawValueText(row, RADAR_METRICS[i].key);
        const w = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.fillRect(lx-w/2-3, ly-8, w+6, 16);
        ctx.fillStyle = colorMain;
        ctx.fillText(text, lx, ly+1);
      });
      ctx.restore();
    }
  };
}

function drawSingleRadar(canvasId, row, colorMain, colorFill){
  const norm = radarNormalize(row);
  const labels = RADAR_METRICS.map(m=>m.label);
  const values = RADAR_METRICS.map(m=>norm[m.key]);
  const ctx = document.getElementById(canvasId);
  const key = canvasId.endsWith('-a') ? 'a' : 'b';
  if(radarCharts[key]) radarCharts[key].destroy();
  radarCharts[key] = new Chart(ctx,{
    type:'radar',
    data:{
      labels: labels,
      datasets:[{
        data: values,
        backgroundColor: colorFill,
        borderColor: colorMain,
        borderWidth:2.5,
        pointBackgroundColor: colorMain,
        pointBorderColor:'#fff',
        pointBorderWidth:1.5,
        pointRadius:4,
        pointHoverRadius:6
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{ padding:18 },
      plugins:{
        legend:{display:false},
        tooltip:{ callbacks:{ label:(c)=> RADAR_METRICS[c.dataIndex].label+': '+fmt1(c.raw)+'/100 (valor real: '+radarRawValueText(row, RADAR_METRICS[c.dataIndex].key)+')' } }
      },
      scales:{
        r:{
          min:0, max:100,
          ticks:{ stepSize:20, showLabelBackdrop:false, font:{size:9}, color:'#B7C2CC' },
          pointLabels:{ font:{size:10.5, weight:600}, color:'#5B6470' },
          grid:{ color:'#E7EAED' },
          angleLines:{ color:'#E7EAED' }
        }
      }
    },
    plugins:[radarValueLabelsPlugin(row, colorMain)]
  });
  return norm;
}

function sessionPhrase(row){
  if(row.Tipo==='Entrenamiento'){
    return `el entrenamiento del ${fmtDate(row.Fecha)}`;
  }
  return `el partido vs. ${shortActividad(row)} (${fmtDate(row.Fecha)})`;
}

function generateRadarInsights(rowA, rowB, normA, normB, sameJugador, sameSesion){
  const diffs = RADAR_METRICS.map(m=>({
    key:m.key, label:m.label,
    a:normA[m.key], b:normB[m.key],
    delta: normA[m.key]-normB[m.key]
  }));
  diffs.sort((x,y)=> Math.abs(y.delta)-Math.abs(x.delta));
  const notable = diffs.filter(d=>Math.abs(d.delta)>=12).slice(0,4);
  const trivial = diffs.filter(d=>Math.abs(d.delta)<5).length;

  const nameA = sameJugador ? sessionPhrase(rowA) : rowA.Jugador;
  const nameB = sameJugador ? sessionPhrase(rowB) : rowB.Jugador;

  const sumA = RADAR_METRICS.reduce((s,m)=>s+normA[m.key],0);
  const sumB = RADAR_METRICS.reduce((s,m)=>s+normB[m.key],0);
  const overallDiff = sumA-sumB;

  let html = '';
  let summary;
  if(notable.length===0){
    summary = `Perfiles fisicos muy similares: ninguna variable muestra una diferencia relevante entre ${nameA} y ${nameB}.`;
  } else if(Math.abs(overallDiff) < 15){
    summary = `Demanda fisica global similar entre ${nameA} y ${nameB}, aunque con diferencias puntuales en algunos indicadores.`;
  } else if(overallDiff>0){
    summary = `${sameJugador ? 'La sesion A' : nameA} mostro, en conjunto, una demanda fisica mayor que ${sameJugador ? 'la sesion B' : nameB}.`;
  } else {
    summary = `${sameJugador ? 'La sesion B' : nameB} mostro, en conjunto, una demanda fisica mayor que ${sameJugador ? 'la sesion A' : nameA}.`;
  }
  html += `<div class="insight-summary">${summary}</div>`;

  if(notable.length>0){
    html += '<h4>Diferencias mas relevantes</h4><ul>';
    notable.forEach(d=>{
      const winner = d.delta>0 ? 'A' : 'B';
      const winnerName = winner==='A' ? nameA : nameB;
      const loserName = winner==='A' ? nameB : nameA;
      const magnitude = Math.abs(d.delta)>=35 ? 'muy superior' : Math.abs(d.delta)>=20 ? 'notablemente superior' : 'superior';
      const winnerVal = winner==='A' ? d.a : d.b;
      const loserVal = winner==='A' ? d.b : d.a;
      html += `<li><b>${d.label}</b>: ${winnerName} fue ${magnitude} a ${loserName} (${fmt1(winnerVal)} vs ${fmt1(loserVal)} sobre 100).</li>`;
    });
    html += '</ul>';
  }

  if(trivial===RADAR_METRICS.length){
    html += `<div style="margin-top:8px;color:var(--gris-claro);">No se detectaron patrones destacables: todas las variables estan dentro de un rango comparable.</div>`;
  } else if(notable.length>=3){
    html += `<div style="margin-top:8px;">Patron a destacar: ${sameJugador ? 'la sesion con valores mas altos' : (overallDiff>0?nameA:nameB)} concentra ventajas en ${notable.length} de los 6 indicadores analizados, lo que sugiere una carga fisica global mas exigente en esa sesion.</div>`;
  }

  return html;
}

function renderRadarComparison(){
  const rowA = getRadarSelection('a');
  const rowB = getRadarSelection('b');
  if(!rowA || !rowB) return;

  document.getElementById('radar-title-a').textContent = `${rowA.Jugador} \u2014 ${rowA.Actividad} (${fmtDate(rowA.Fecha)})`;
  document.getElementById('radar-title-b').textContent = `${rowB.Jugador} \u2014 ${rowB.Actividad} (${fmtDate(rowB.Fecha)})`;

  const normA = drawSingleRadar('chart-radar-a', rowA, '#2FA8DE', 'rgba(47,168,222,0.28)');
  const normB = drawSingleRadar('chart-radar-b', rowB, '#14171A', 'rgba(20,23,26,0.16)');

  const sameJugador = rowA.Jugador===rowB.Jugador;
  const sameSesion = rowA.Actividad===rowB.Actividad && rowA.Fecha===rowB.Fecha;

  const badge = document.getElementById('radar-comparison-type');
  if(sameJugador){
    badge.textContent = `Mismo jugador, distintas sesiones \u2014 ${rowA.Jugador}`;
  } else if(sameSesion){
    badge.textContent = `Distintos jugadores, misma sesion \u2014 ${rowA.Actividad} (${fmtDate(rowA.Fecha)})`;
  } else {
    badge.textContent = `Comparacion general \u2014 ${rowA.Jugador} vs ${rowB.Jugador}`;
  }

  document.getElementById('radar-insights').innerHTML = generateRadarInsights(rowA, rowB, normA, normB, sameJugador, sameSesion);
}

/* ============ TOP 4 MOST DEMANDING MATCHES ============ */
const TOP4_METRICS = [
  {key:'Distancia', label:'Distancia', fmt:fmt0, unit:'m'},
  {key:'HSR', label:'HSR', fmt:fmt0, unit:'m'},
  {key:'EsfExpl', label:'Esf. Expl.', fmt:fmt0, unit:''},
  {key:'RHIE', label:'RHIE', fmt:fmt0, unit:''},
  {key:'BiG', label:'BiG', fmt:fmt1, unit:''},
  {key:'Contactos', label:'Contactos', fmt:fmt0, unit:''}
];

function renderTop4(f){
  let base = DATASET.filter(r=>r.Tipo==='Partido');
  if(f.temporada!=='__ALL__') base = base.filter(r=>String(r.Temporada)===f.temporada);
  if(f.jugador!=='__ALL__') base = base.filter(r=>r.Jugador===f.jugador);
  const top = base.slice().sort((a,b)=>b.Indice-a.Indice).slice(0,4);

  const grid = document.getElementById('top4-grid');
  if(top.length===0){
    grid.innerHTML = '<div class="empty-state">No hay partidos para los filtros seleccionados.</div>';
    return;
  }
  grid.innerHTML = top.map((r,i)=>{
    const key = opponentLogoKey(r.Actividad);
    const logoSrc = LOGOS_B64[key] ? ('data:image/png;base64,'+LOGOS_B64[key]) : ('data:image/png;base64,'+LOGOS_B64['SIC']);
    const rival = r.Actividad.replace(/^SIC\s*vs\s*/i,'').replace(/^@?\s*SIC.*/i, 'SIC (local)');
    const metricsHtml = TOP4_METRICS.map(m=>`<div>${m.label}<br><span>${m.fmt(r[m.key])}${m.unit}</span></div>`).join('');
    return `<div class="top4-card">
      <div class="top4-rank"><span class="rank-num">${i+1}</span>Mas exigente</div>
      <div class="top4-logo-row">
        <img src="${logoSrc}" alt="">
        <div>
          <div class="top4-jugador">${r.Jugador}</div>
          <div class="top4-actividad">vs. ${rival} &middot; ${fmtDate(r.Fecha)}</div>
        </div>
      </div>
      <div class="top4-index">${fmt1(r.Indice)}</div>
      <div class="top4-index-pct">${r.PlayerSeasonMaxIndice ? fmt1(r.Indice/r.PlayerSeasonMaxIndice*100)+'% del maximo de temporada de '+r.Jugador.split(' ')[0] : ''}</div>
      <div class="top4-metrics">${metricsHtml}</div>
    </div>`;
  }).join('');
}

/* ============ PRINT: FULL TABLE (all filtered rows, no pagination) ============ */
function renderPrintTable(filtered){
  const sorted = filtered.slice().sort((a,b)=> new Date(b.Fecha)-new Date(a.Fecha));
  const medals = computeMedals(filtered);
  const holder = document.getElementById('print-full-table');
  if(sorted.length===0){ holder.innerHTML = ''; return; }
  const rowsHtml = sorted.map(r=>{
    let swcTxt;
    if(r.DeltaIndice===null || r.DeltaIndice===undefined){ swcTxt = 'Sin dato previo'; }
    else{
      const cls = r.DeltaIndice >= r.SWC ? 'Sube' : r.DeltaIndice <= -r.SWC ? 'Baja' : 'Estable';
      swcTxt = `${cls} (${(r.DeltaIndice>=0?'+':'')}${fmt1(r.DeltaIndice)}, SWC ${fmt1(r.SWC)})`;
    }
    const m = medals[r.__id] || {};
    return `<tr>
      <td>${r.Jugador}</td><td>${r.Actividad}</td><td>${fmtDate(r.Fecha)}</td>
      <td class="num">${fmt0(r.Distancia)}${medalSpan(m.Distancia)}</td><td class="num">${fmt0(r.HSR)}${medalSpan(m.HSR)}</td>
      <td class="num">${fmt0(r.EsfExpl)}${medalSpan(m.EsfExpl)}</td><td class="num">${fmt1(r.BiG)}${medalSpan(m.BiG)}</td>
      <td class="num">${fmt0(r.Contactos)}${medalSpan(m.Contactos)}</td><td class="num">${fmt1(r.MaxVel)}${medalSpan(m.MaxVel)}</td>
      <td class="num">${fmt1(r.Indice)}${medalSpan(m.Indice)}</td><td>${swcTxt}</td>
    </tr>`;
  }).join('');
  holder.innerHTML = `<table style="width:100%;border-collapse:collapse;">
    <thead><tr>
      <th>Jugador</th><th>Actividad</th><th>Fecha</th>
      <th class="num">Distancia (m)</th><th class="num">HSR (m)</th>
      <th class="num">Esf. Expl.</th><th class="num">BiG</th>
      <th class="num">Contactos</th><th class="num">Vel. Max (km/h)</th>
      <th class="num">Indice</th><th>SWC vs anterior</th>
    </tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>`;
}

let lastFilteredForPrint = [];

/* ============ MAIN RENDER ============ */
function renderAll(){
  const f = getFilterValues();
  const filtered = applyFilters(DATASET, f);

  document.getElementById('f-count').textContent = filtered.length + ' registros encontrados';
  try{ renderTimelineMarkers(timelineScopeData()); }catch(e){ console.error('timeline markers error', e); }

  try{
    if(filtered.length===0){
      renderGauge(0, 40);
      document.getElementById('gauge-value').textContent = '\u2014';
    } else {
      const maxVel = Math.max(...filtered.map(r=>r.MaxVel));
      const globalMax = Math.max(...DATASET.map(r=>r.MaxVel));
      const scaleMax = Math.ceil((globalMax||30)/5)*5;
      renderGauge(maxVel, scaleMax);
      document.getElementById('gauge-value').textContent = fmt1(maxVel);
    }
  }catch(e){ console.error('gauge render error', e); }

  let seasonScope;
  if(f.temporada==='__ALL__'){
    seasonScope = DATASET;
  } else {
    seasonScope = DATASET.filter(r=> String(r.Temporada)===f.temporada);
  }
  try{ renderKpiCards(filtered, f, seasonScope); }catch(e){ console.error('kpi cards render error', e); }
  try{ renderWeeklyChart(filtered); }catch(e){ console.error('weekly chart render error', e); }
  try{ renderScatter(filtered); }catch(e){ console.error('scatter render error', e); }
  try{ renderTop4(f); }catch(e){ console.error('top4 render error', e); }
  currentPage = 1;
  try{ renderTable(filtered); }catch(e){ console.error('table render error', e); }
  lastFilteredForPrint = filtered;
  try{ renderPrintTable(filtered); }catch(e){ console.error('print table render error', e); }
}

/* ============ FILE UPLOAD / UPDATE ============ */
function processWorkbook(wb){
  const sheetName = wb.SheetNames.includes('GPS') ? 'GPS' : wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {defval:null, raw:true});

  const sessionRows = rows.filter(r=> r['Periodo']==='Session');

  function parseFecha(v){
    if(v instanceof Date) return v;
    if(typeof v === 'number'){
      const d = XLSX.SSF.parse_date_code(v);
      if(d) return new Date(Date.UTC(d.y,d.m-1,d.d));
    }
    if(typeof v === 'string'){
      const m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if(m) return new Date(Date.UTC(+m[3], +m[2]-1, +m[1]));
      const dt = new Date(v);
      if(!isNaN(dt)) return dt;
    }
    return null;
  }

  const groups = {};
  sessionRows.forEach(r=>{
    const fecha = parseFecha(r['Fecha']);
    if(!fecha) return;
    const jugador = r['Jugador']; if(!jugador) return;
    const temporada = r['Temporada'];
    const tipo = r['Etiqueta de Actividad'];
    const actividad = r['Actividad'];
    const puesto = r['Puesto'];
    const key = [jugador,temporada,tipo,actividad,fecha.toISOString().slice(0,10),puesto].join('|');
    if(!groups[key]) groups[key] = {
      Jugador:jugador, Temporada:temporada, Tipo:tipo, Actividad:actividad,
      Fecha:fecha.toISOString().slice(0,10), Puesto:puesto,
      Distancia:0,HSR:0,EsfExpl:0,RHIE:0,BiG:0,Contactos:0,MaxVel:0,DuracionMin:0, _n:0
    };
    const g = groups[key];
    g.Distancia += num(r['Distancia']);
    g.HSR += num(r['HSR (>5 m/s)']);
    g.EsfExpl += num(r['Esf Expl']);
    g.RHIE += num(r['RHIE Total Bouts']);
    g.BiG += num(r[' # BiG ']);
    g.Contactos += num(r['Contactos']);
    g.MaxVel += num(r['Max Vel']);
    g.DuracionMin += num(r['Duracion (min)']);
    g._n += 1;
  });

  function num(v){ return (typeof v==='number' && !isNaN(v)) ? v : 0; }

  const out = Object.values(groups).map((g,i)=>{
    const n = g._n||1;
    return {
      __id: i,
      Jugador:g.Jugador, Temporada:g.Temporada, Tipo:g.Tipo, Actividad:g.Actividad,
      Fecha:g.Fecha, Puesto:g.Puesto,
      Distancia:g.Distancia/n, HSR:g.HSR/n, EsfExpl:g.EsfExpl/n, RHIE:g.RHIE/n,
      BiG:g.BiG/n, Contactos:g.Contactos/n, MaxVel:g.MaxVel/n, DuracionMin:g.DuracionMin/n
    };
  });
  return out;
}

function handleFile(file){
  const reader = new FileReader();
  reader.onload = function(e){
    try{
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, {type:'array', cellDates:true});
      const processed = processWorkbook(wb);
      if(processed.length===0){
        alert('No se encontraron filas con Periodo = "Session" en el archivo. Verifique que la planilla tenga el mismo formato que SIC_Carga.');
        return;
      }
      DATASET = attachIndex(processed);
      DATASET = attachSWC(DATASET);
      DATASET = attachPlayerSeasonMax(DATASET);
      GLOBAL_MAXES = computeGlobalMaxes(DATASET);
      lastUpdateLabel = file.name;
      document.getElementById('last-update-pill').textContent = 'Actualizado: '+file.name;
      populateFilters();
      try{ initComparisonSelectors(); }catch(e){ console.error('comparison selectors error', e); }
      renderAll();
    } catch(err){
      alert('No se pudo procesar el archivo. Verifique que sea una planilla .xlsx con el mismo formato que SIC_Carga.');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ============ INIT ============ */
async function initApp(){
  document.getElementById('btn-print').addEventListener('click', ()=>{
    try{ renderPrintTable(lastFilteredForPrint); }catch(e){ console.error('print table error', e); }
    try{
      window.print();
    }catch(e){
      console.error('window.print failed', e);
      alert('No se pudo abrir el dialogo de impresion. Si estas viendo este reporte dentro de una vista previa (por ejemplo, dentro del chat), descarga el archivo .html y abrilo directamente en tu navegador (Chrome o Edge) para poder imprimir.');
    }
  });
  window.addEventListener('beforeprint', ()=>{
    try{ renderPrintTable(lastFilteredForPrint); }catch(e){ console.error('beforeprint error', e); }
  });

  ['f-temporada'].forEach(id=>{
    document.getElementById(id).addEventListener('change', ()=>{
      refreshActividadYJugadorOptions(false);
      initTimelineDomain();
      renderAll();
    });
  });
  ['f-tipo','f-actividad','f-jugador'].forEach(id=>{
    document.getElementById(id).addEventListener('change', renderAll);
  });
  ['timeline-start','timeline-end'].forEach(id=>{
    document.getElementById(id).addEventListener('input', ()=>{
      updateTimelineFillAndLabel();
      renderAll();
    });
  });
  document.getElementById('f-reset').addEventListener('click', ()=>{
    populateFilters();
    renderAll();
  });

  document.getElementById('radar-jugador-a').addEventListener('change', ()=>{
    populateSesionSelect('radar-sesion-a', document.getElementById('radar-jugador-a').value);
    renderRadarComparison();
  });
  document.getElementById('radar-jugador-b').addEventListener('change', ()=>{
    populateSesionSelect('radar-sesion-b', document.getElementById('radar-jugador-b').value);
    renderRadarComparison();
  });
  document.getElementById('radar-sesion-a').addEventListener('change', renderRadarComparison);
  document.getElementById('radar-sesion-b').addEventListener('change', renderRadarComparison);

  document.getElementById('page-prev').addEventListener('click', ()=>{
    if(currentPage>1){ currentPage--; renderTable(applyFilters(DATASET, getFilterValues())); }
  });
  document.getElementById('page-next').addEventListener('click', ()=>{
    currentPage++; renderTable(applyFilters(DATASET, getFilterValues()));
  });

  document.getElementById('btn-update').addEventListener('click', ()=>{
    document.getElementById('file-input').click();
  });
  document.getElementById('file-input').addEventListener('change', (e)=>{
    if(e.target.files && e.target.files[0]) handleFile(e.target.files[0]);
  });

  DATASET = decodeRaw(RAW_DATA);
  DATASET = attachIndex(DATASET);
  DATASET = attachSWC(DATASET);
  DATASET = attachPlayerSeasonMax(DATASET);
  GLOBAL_MAXES = computeGlobalMaxes(DATASET);

  populateFilters();
  try{ initComparisonSelectors(); }catch(e){ console.error('comparison selectors error', e); }
  try{ renderAll(); }catch(e){ console.error('renderAll error', e); }

  preloadImages().then(()=>{
    try{ renderTop4(getFilterValues()); }catch(e){ console.error('renderTop4 error', e); }
    try{ renderScatter(lastFilteredForPrint); }catch(e){ console.error('scatter re-render error', e); }
  }).catch(e=>console.error('preloadImages error', e));

  window.addEventListener('resize', ()=>{});
}

/* ============ PASSWORD GATE (usuario + contrasena) ============ */
function checkCredentials(){
  const userVal = document.getElementById('user-input').value.trim();
  const pwVal = document.getElementById('pw-input').value;
  const err = document.getElementById('pw-err');
  if(userVal === CORRECT_USERNAME && pwVal === CORRECT_PASSWORD){
    document.getElementById('gate').style.display='none';
    document.getElementById('app').style.display='block';
    if(!window.__APP_INIT__){ window.__APP_INIT__=true; initApp(); }
    try{ sessionStorage.setItem('sic_auth','1'); }catch(e){}
  } else {
    err.textContent = 'Usuario o contrasena incorrectos. Intente nuevamente.';
    document.getElementById('pw-input').value='';
    document.getElementById('pw-input').focus();
  }
}
document.getElementById('pw-btn').addEventListener('click', checkCredentials);
document.getElementById('pw-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') checkCredentials(); });
document.getElementById('user-input').addEventListener('keydown', (e)=>{ if(e.key==='Enter') document.getElementById('pw-input').focus(); });

(function tryAutoAuth(){
  try{
    if(sessionStorage.getItem('sic_auth')==='1'){
      document.getElementById('gate').style.display='none';
      document.getElementById('app').style.display='block';
      window.__APP_INIT__=true;
      initApp();
    }
  }catch(e){}
})();
