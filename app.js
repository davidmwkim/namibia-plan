
const DATA = window.NAMIBIA_TRIP_DATA;
const $ = (id) => document.getElementById(id);
let state = {
  dayIndex: 0,
  apiKey: localStorage.getItem('namibia_google_api_key') || '',
  googleLoaded: false,
  directionsService: null,
  directionsRenderer: null,
  map: null,
  markers: [],
  gpsMarker: null,
  gps: null,
  renderedRoutes: JSON.parse(localStorage.getItem('namibia_routes_cache_v5') || '{}'),
  activeTab: 'overview',
};

function esc(s){ return String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function log(s){ const el=$('log'); if(el) el.textContent += s + "\n"; }
function setStatus(id, text){ const el=$(id); if(el) el.textContent = text; }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseTimeMinutes(t){ const m=String(t||'').match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i); if(!m) return null; let h=+m[1], min=+(m[2]||0); if(m[3].toUpperCase()==='PM'&&h!==12)h+=12; if(m[3].toUpperCase()==='AM'&&h===12)h=0; return h*60+min; }
function nowMinutes(){ const d=new Date(); return d.getHours()*60+d.getMinutes(); }
function day(){ return DATA.days[state.dayIndex]; }
function mandatoryStops(d=day()){ return d.stops.filter(s => ['mandatory','mandatoryAction'].includes(s.routeRole)); }
function routeStops(d=day()){ return d.stops.filter(s => s.routeRole === 'mandatory'); }
function wazeUrl(s){ return `https://waze.com/ul?ll=${encodeURIComponent(s.lat+','+s.lng)}&navigate=yes&zoom=17&utm_source=namibia_trip`; }
function googleMapsStopQuery(s){
  const raw = s?.googleMapsQuery || s?.mapsQuery || s?.placeQuery || s?.name || '';
  let q = String(raw).replace(/\s+/g, ' ').trim();
  if (q) {
    if (!/\bnamibia\b/i.test(q)) q += ' Namibia';
    return q;
  }
  const fallback = String(s?.type || 'Namibia stop').replace(/\s+/g, ' ').trim();
  return /\bnamibia\b/i.test(fallback) ? fallback : `${fallback} Namibia`;
}
function googleMapsStopUrl(s){
  const p = new URLSearchParams({api:'1',query:googleMapsStopQuery(s)});
  return 'https://www.google.com/maps/search/?' + p.toString();
}
function googleMapsUrl(d=day()){
  const s=routeStops(d); if(s.length<2) return '';
  const p=new URLSearchParams({api:'1',origin:`${s[0].lat},${s[0].lng}`,destination:`${s[s.length-1].lat},${s[s.length-1].lng}`,travelmode:'driving'});
  const wp=s.slice(1,-1).map(x=>`${x.lat},${x.lng}`).join('|'); if(wp) p.set('waypoints',wp);
  return 'https://www.google.com/maps/dir/?'+p.toString();
}
function streetViewUrl(lat,lng,heading=0,size='600x320'){
  if(!state.apiKey) return '';
  // radius lets the Street View Static API snap to the nearest available
  // panorama (defaults to 50m on the API; bump to 200m so remote-road turns
  // still find a usable panorama instead of returning a "no imagery" tile).
  const p=new URLSearchParams({size,location:`${lat},${lng}`,heading:String(Math.round(heading)),pitch:'0',fov:'80',source:'default',radius:'800',return_error_code:'true',key:state.apiKey});
  return 'https://maps.googleapis.com/maps/api/streetview?'+p.toString();
}
function distMeters(a,b){
  const R=6371000, rad=x=>x*Math.PI/180;
  const dLat=rad(b.lat-a.lat), dLng=rad(b.lng-a.lng), lat1=rad(a.lat), lat2=rad(b.lat);
  const x=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x));
}
function bearing(a,b){
  const rad=x=>x*Math.PI/180, deg=x=>x*180/Math.PI;
  const lat1=rad(a.lat), lat2=rad(b.lat), dLon=rad(b.lng-a.lng);
  const y=Math.sin(dLon)*Math.cos(lat2);
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
  return (deg(Math.atan2(y,x))+360)%360;
}
function cleanHtml(s){ return String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim(); }
function roleBadge(s){
  const cls=s.routeRole==='optional'?'optional':'mandatory';
  return `<span class="badge ${cls}">${esc(s.routeRole)}</span>`;
}
function pressureBadge(s){ return s.pressure ? `<span class="badge pressure">tyre pressure</span>` : ''; }
function fuelBadge(s){ return s.fuel ? `<span class="badge fuel">fuel estimate</span>` : ''; }

function init(){
  $('app').innerHTML = `
    <div class="app-shell">
      <section class="hero">
        <div class="hero-top">
          <div class="brand">
            <div class="logo">🛻</div>
            <div><h1>${esc(DATA.meta.title)}</h1><p>${esc(DATA.meta.subtitle)} · offline PWA / route companion</p></div>
          </div>
          <div class="hero-actions">
            <span class="hero-hint">Open the <strong>Settings</strong> tab to add your Google Maps key, prepare offline, and export.</span>
          </div>
        </div>
      </section>
      <main class="main">
        <div class="toolbar">
          <div class="toolbar-left">
            <select id="daySelect" class="day-select"></select>
            <button id="todayBtn">Today</button>
            <button id="gpsBtn">Use GPS</button>
          </div>
        </div>
        <div class="grid">
          <aside>
            <section class="panel pad">
              <h2>Assumptions</h2>
              <div class="alerts">
                <div class="alert gold"><strong>Tyres:</strong> ${esc(DATA.meta.pressureAssumptions.note)}</div>
                <div class="alert gold"><strong>Fuel:</strong> ${esc(DATA.meta.fuelAssumptions.note)}</div>
              </div>
              <div class="mini-map"><div id="map"></div><div id="mapFallback" class="map-fallback">Map appears after Google key loads. The app still works offline without map tiles.</div></div>
            </section>
          </aside>
          <section class="panel">
            <div class="tabs">
              <button class="tab active" data-tab="overview">Overview</button>
              <button class="tab" data-tab="stops">Itinerary</button>
              <button class="tab" data-tab="directions">Directions</button>
              <button class="tab" data-tab="street">Street View</button>
              <button class="tab" data-tab="settings">Settings</button>
            </div>
            <div class="content" id="tabContent"></div>
          </section>
        </div>
        <section class="panel pad" style="margin-top:18px">
          <h2>Log</h2><div class="log" id="log"></div>
        </section>
      </main>
      <section class="print-pages" id="printPages"></section>
    </div>`;
  populateDays();
  bind();
  chooseToday(false);
  render();
  registerSW();
}
function populateDays(){
  const sel=$('daySelect');
  sel.innerHTML=DATA.days.map((d,i)=>`<option value="${i}">Day ${d.day} · ${d.date} · ${esc(d.title)}</option>`).join('');
  sel.value=state.dayIndex;
}
function bind(){
  $('daySelect').onchange=e=>{ state.dayIndex=+e.target.value; render(); };
  $('todayBtn').onclick=()=>chooseToday(true);
  $('gpsBtn').onclick=useGps;
  document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{ state.activeTab=t.dataset.tab; renderTab(); });
  window.addEventListener('online',()=>setStatus('offlineStatus','Online'));
  window.addEventListener('offline',()=>setStatus('offlineStatus','Offline'));
}
function chooseToday(renderNow=true){
  const t=todayISO();
  let idx=DATA.days.findIndex(d=>d.date===t);
  if(idx<0) idx=DATA.days.findIndex(d=>d.date>t);
  if(idx<0) idx=0;
  state.dayIndex=idx; $('daySelect').value=idx;
  if(renderNow) render();
}
function render(){
  const d=day();
  const mandatory=mandatoryStops(d);
  const next = d.date===todayISO()
    ? (d.stops.find(s => { const m=parseTimeMinutes(s.time); return m!==null && m>=nowMinutes(); }) || d.stops[d.stops.length-1])
    : d.stops[0];
  let gpsLine='GPS not enabled.';
  if(state.gps){
    const nearest=d.stops.map(s=>({s, m:distMeters(state.gps,s)})).sort((a,b)=>a.m-b.m)[0];
    gpsLine = nearest ? `Nearest stop: ${nearest.s.emoji} ${nearest.s.name} (${Math.round(nearest.m)}m)` : 'GPS enabled.';
  }
  const dashboard = $('dashboard');
  if (dashboard) dashboard.innerHTML = `
    <div class="now-date">Day ${d.day} · ${d.date}</div>
    <div class="now-title">${esc(d.title)}</div>
    <div class="kv">
      <div><strong>Next</strong><span>${next ? `${next.emoji} ${esc(next.time)} — ${esc(next.name)}` : '—'}</span></div>
      <div><strong>Route</strong><span>${d.selfDrive ? `${routeStops(d).length} mandatory route stops` : 'No fixed self-drive route'}</span></div>
      <div><strong>GPS</strong><span>${esc(gpsLine)}</span></div>
    </div>
    <div class="hero-actions" style="justify-content:flex-start;margin-top:12px">
      ${next ? `<a href="${wazeUrl(next)}" target="_blank"><button class="primary">Open next in Waze</button></a>` : ''}
      ${googleMapsUrl(d) ? `<a href="${googleMapsUrl(d)}" target="_blank"><button>Google route</button></a>` : ''}
    </div>`;
  renderMapMarkers();
  renderTab();
  renderPrintPages();
}
function renderTab(){
  document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active', t.dataset.tab===state.activeTab));
  const d=day();
  const route=state.renderedRoutes[d.date];
  if(state.activeTab==='overview'){
    const pressureCount=d.stops.filter(s=>s.pressure).length;
    const fuelCount=d.stops.filter(s=>s.fuel).length;
    $('tabContent').innerHTML = `
      <div class="panel-title" style="padding:0 0 14px"><div><h2>${esc(d.title)}</h2><p>${esc(d.routeNotes)}</p></div></div>
      <div class="route-summary">
        <div class="metric"><b>${d.selfDrive?'Yes':'No'}</b><span>self-drive route</span></div>
        <div class="metric"><b>${pressureCount}</b><span>pressure actions</span></div>
        <div class="metric"><b>${fuelCount}</b><span>fuel estimates</span></div>
      </div>
      <div class="alerts">${d.stops.filter(s=>s.pressure||s.fuel).map(s=>`
        <div class="alert ${s.pressure?'red':'gold'}"><strong>${s.emoji} ${esc(s.name)}</strong><br>${esc(s.pressure || s.fuel)}</div>`).join('') || '<div class="alert green">No special fuel/pressure action today.</div>'}</div>`;
  } else if(state.activeTab==='stops') {
    $('tabContent').innerHTML = `<div class="stop-list">${d.stops.map(stopCard).join('')}</div>`;
  } else if(state.activeTab==='directions') {
    if(route?.legs){
      $('tabContent').innerHTML = `<div class="directions">${route.legs.map((leg,li)=>`
        <h3>Leg ${li+1}: ${esc(leg.start)} → ${esc(leg.end)}</h3>
        <p><strong>${esc(leg.distance)}</strong> · <strong>${esc(leg.duration)}</strong></p>
        <ol>${leg.steps.map(s=>`<li>${esc(s.instruction)} <small>${esc(s.distance)} · ${esc(s.duration)}</small></li>`).join('')}</ol>`).join('')}</div>`;
    } else {
      $('tabContent').innerHTML = `<div class="alert gold">No cached Google Directions yet. Click <strong>Save key + render all</strong> while online, or use Google/Waze links.</div>`;
    }
  } else if(state.activeTab==='street') {
    if(route?.street?.length) {
      $('tabContent').innerHTML = `<div class="street-grid">${route.street.map((s,i)=>`<div class="street-card"><img src="${s.url}" alt="Street View ${i+1}"><div><strong>${i+1}. ${esc(s.label)}</strong><br>${esc(s.lat.toFixed(5))}, ${esc(s.lng.toFixed(5))}</div></div>`).join('')}</div>`;
    } else {
      $('tabContent').innerHTML = `<div class="alert gold">Street View snapshots appear after Google Directions are rendered and the API key is available.</div>`;
    }
  } else {
    $('tabContent').innerHTML = `
      <div class="export-links">
        <a href="#" onclick="exportSelectedKml();return false;">Download selected day KML</a>
        <a href="#" onclick="exportAllKmlZip();return false;">Download all day KML ZIP</a>
        <a href="#" onclick="printMode();return false;">Print / Save PDF — one page per day</a>
      </div>`;
  }
}
function stopCard(s){
  return `<div class="stop">
    <div class="stop-icon">${s.emoji}</div>
    <div>
      <div class="stop-head"><h3>${esc(s.name)}</h3><div class="stop-time">${esc(s.time)}</div></div>
      <div class="badges">${roleBadge(s)}<span class="badge">${esc(s.type)}</span>${pressureBadge(s)}${fuelBadge(s)}</div>
      <p>${esc(s.notes)}</p>
      ${s.pressure ? `<p><strong>Tyre:</strong> ${esc(s.pressure)}</p>` : ''}
      ${s.fuel ? `<p><strong>Fuel:</strong> ${esc(s.fuel)}</p>` : ''}
      <p><a href="${wazeUrl(s)}" target="_blank">Open in Waze</a> · <a href="${esc(googleMapsStopUrl(s))}" target="_blank" rel="noopener">Open in Google Maps</a></p>
    </div>
  </div>`;
}
function registerSW(){
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js').then(()=>setStatus('offlineStatus', navigator.onLine?'Online · shell cached':'Offline · shell cached')).catch(e=>setStatus('offlineStatus','SW failed'));
  } else setStatus('offlineStatus','Service worker unsupported');
}
function loadGoogleAndRenderAll(){
  const inp=$('apiKey')||$('setApiKey');
  if(inp) state.apiKey=inp.value.trim();
  if(!state.apiKey){ alert('Enter your Google Maps API key in Settings.'); return; }
  localStorage.setItem('namibia_google_api_key', state.apiKey);
  if(window.google?.maps){ state.googleLoaded=true; initGoogleMap(); renderAllDays(); return; }
  setStatus('googleStatus','Google: loading…');
  window.__namibiaInitMap=()=>{ state.googleLoaded=true; setStatus('googleStatus','Google: loaded'); initGoogleMap(); renderAllDays(); };
  const script=document.createElement('script');
  script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(state.apiKey)}&libraries=places&callback=__namibiaInitMap`;
  script.async=true; script.defer=true;
  script.onerror=()=>{ setStatus('googleStatus','Google: failed'); log('Google script failed. Check key restrictions and enabled APIs.'); };
  document.head.appendChild(script);
}
function initGoogleMap(){
  if(!state.map){
    $('mapFallback').style.display='none';
    state.map=new google.maps.Map($('map'),{center:{lat:-22.3,lng:16.4},zoom:6,mapTypeControl:true,streetViewControl:false,fullscreenControl:false});
    state.directionsService=new google.maps.DirectionsService();
    state.directionsRenderer=new google.maps.DirectionsRenderer({suppressMarkers:true,preserveViewport:false});
    state.directionsRenderer.setMap(state.map);
  }
  renderMapMarkers();
}
function renderMapMarkers(){
  if(!state.map || !window.google) return;
  state.markers.forEach(m=>m.setMap(null)); state.markers=[];
  const b=new google.maps.LatLngBounds();
  day().stops.forEach(s=>{
    const marker=new google.maps.Marker({position:{lat:s.lat,lng:s.lng},map:state.map,title:`${s.emoji} ${s.name}`,label:s.routeRole==='optional'?'O':'M'});
    marker.addListener('click',()=>new google.maps.InfoWindow({content:`<b>${s.emoji} ${esc(s.name)}</b><br>${esc(s.type)}<br>${esc(s.time)}<br>${esc(s.notes)}<br><a target="_blank" href="${wazeUrl(s)}">Waze</a>`}).open({map:state.map,anchor:marker}));
    state.markers.push(marker); b.extend(marker.getPosition());
  });
  if(state.gps){
    if(state.gpsMarker) state.gpsMarker.setMap(null);
    state.gpsMarker=new google.maps.Marker({position:state.gps,map:state.map,title:'Your GPS location',label:'YOU'});
    b.extend(new google.maps.LatLng(state.gps.lat,state.gps.lng));
  }
  if(!b.isEmpty()) state.map.fitBounds(b,50);
  if(state.renderedRoutes[day().date]?.overviewPath && state.directionsRenderer) {
    // Rendering cached polyline exactly as DirectionsRenderer needs real DirectionsResult; omit if cached.
  }
}
function useGps(){
  if(!navigator.geolocation){ setStatus('gpsStatus','GPS unsupported'); return; }
  setStatus('gpsStatus','GPS: requesting…');
  navigator.geolocation.watchPosition(pos=>{
    state.gps={lat:pos.coords.latitude,lng:pos.coords.longitude,accuracy:pos.coords.accuracy};
    setStatus('gpsStatus',`GPS: ${Math.round(pos.coords.accuracy)}m`);
    render();
  },err=>{ setStatus('gpsStatus','GPS failed'); log('GPS error: '+err.message); },{enableHighAccuracy:true,maximumAge:30000,timeout:15000});
}
async function renderAllDays(){
  if(!state.directionsService){ log('Google not ready.'); return; }
  log('Rendering all routable days and Street View thumbnails…');
  for(const d of DATA.days) await renderDayRoute(d);
  localStorage.setItem('namibia_routes_cache_v5', JSON.stringify(state.renderedRoutes));
  log('All possible days rendered and cached locally.');
  render();
}
async function renderDayRoute(d){
  if(!d.selfDrive) { state.renderedRoutes[d.date]={noRoute:true,street:[]}; return; }
  const rs=routeStops(d); if(rs.length<2) return;
  const waypoints=rs.slice(1,-1).map(s=>({location:{lat:s.lat,lng:s.lng}, stopover:true}));
  try{
    log(`Google Directions: Day ${d.day} ${d.title}`);
    const res=await state.directionsService.route({origin:{lat:rs[0].lat,lng:rs[0].lng},destination:{lat:rs[rs.length-1].lat,lng:rs[rs.length-1].lng},waypoints,travelMode:google.maps.TravelMode.DRIVING,optimizeWaypoints:false,region:'NA'});
    const r=res.routes[0];
    const legs=r.legs.map(leg=>({
      start:leg.start_address,end:leg.end_address,distance:leg.distance?.text||'',duration:leg.duration?.text||'',
      steps:leg.steps.map(step=>({
        instruction:cleanHtml(step.instructions),
        distance:step.distance?.text||'',
        duration:step.duration?.text||'',
        lat:step.start_location.lat(),
        lng:step.start_location.lng(),
        endLat:step.end_location.lat(),
        endLng:step.end_location.lng(),
        // The step's own polyline (encoded) — this is the road geometry for
        // just this step. Used by v12 to get an accurate heading and a tighter
        // road-snapped Street View location.
        polyline: step.polyline?.points || (typeof step.encoded_lat_lngs === 'string' ? step.encoded_lat_lngs : '')
      }))
    }));
    const overviewPath=(r.overview_path||[]).map(p=>({lat:p.lat(),lng:p.lng()}));
    const street=[];
    let n=0;
    for(const leg of legs) for(const st of leg.steps) {
      if(n>=42) break;
      street.push({label:st.instruction.slice(0,80),lat:st.lat,lng:st.lng,url:streetViewUrl(st.lat,st.lng,0)});
      n++;
    }
    // Periodic route checks
    for(let i=0;i<overviewPath.length && street.length<60;i+=Math.max(1,Math.floor(overviewPath.length/18))){
      const p=overviewPath[i]; street.push({label:'Periodic route check',lat:p.lat,lng:p.lng,url:streetViewUrl(p.lat,p.lng,0)});
    }
    state.renderedRoutes[d.date]={legs,overviewPath,street,googleMapsUrl:googleMapsUrl(d)};
  } catch(e) {
    log(`Directions failed Day ${d.day}: ${e.message||e}`);
    state.renderedRoutes[d.date]={error:String(e.message||e),googleMapsUrl:googleMapsUrl(d),street:[]};
  }
}
async function prepareOffline(){
  if(!state.googleLoaded) await loadGoogleAndRenderAll();
  // Force-load Street View images into HTTP/browser cache.
  const urls=Object.values(state.renderedRoutes).flatMap(r=>r.street||[]).map(s=>s.url).filter(Boolean);
  log(`Preloading ${urls.length} Street View images into browser cache…`);
  await Promise.allSettled(urls.map(u=>fetch(u,{mode:'no-cors'})));
  localStorage.setItem('namibia_routes_cache_v5', JSON.stringify(state.renderedRoutes));
  log('Offline preparation requested. Browser cache retention is not guaranteed by Google/static image cache policies; verify before travel by using airplane mode.');
}
function kmlForDay(d){
  const r=state.renderedRoutes[d.date] || {};
  const coords = r.overviewPath?.length ? r.overviewPath.map(p=>`${p.lng},${p.lat},0`).join(' ') : routeStops(d).map(s=>`${s.lng},${s.lat},0`).join(' ');
  const routeLine = coords ? `<Placemark><name>🛣️ Day ${d.day} route — ${esc(d.title)}</name><ExtendedData><Data name="TYPE"><value>route line</value></Data></ExtendedData><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>` : '';
  const pins=d.stops.map(s=>`<Placemark><name>${esc(`${s.emoji} ${s.time} — ${s.name}`)}</name><description><![CDATA[<p>${esc(s.notes)}</p><p><b>Tyre:</b> ${esc(s.pressure||'')}</p><p><b>Fuel:</b> ${esc(s.fuel||'')}</p><p><a href="${wazeUrl(s)}">Waze</a></p>]]></description><ExtendedData><Data name="TYPE"><value>${esc(s.type)}</value></Data><Data name="trip stop type"><value>${esc(s.tripStopType)}</value></Data><Data name="route_role"><value>${esc(s.routeRole)}</value></Data><Data name="time"><value>${esc(s.time)}</value></Data><Data name="tyre_pressure_action"><value>${esc(s.pressure||'')}</value></Data><Data name="fuel_estimate"><value>${esc(s.fuel||'')}</value></Data></ExtendedData><Point><coordinates>${s.lng},${s.lat},0</coordinates></Point></Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Day ${d.day} — ${esc(d.title)}</name>${routeLine}${pins}</Document></kml>`;
}
function download(name, text, mime='application/vnd.google-earth.kml+xml'){
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([text],{type:mime})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function exportSelectedKml(){ const d=day(); download(`day_${d.day}_${d.date}_namibia.kml`, kmlForDay(d)); }
function crc32(str){
  let c=~0; for(let i=0;i<str.length;i++){ c^=str.charCodeAt(i); for(let k=0;k<8;k++) c=(c>>>1)^(0xEDB88320&-(c&1)); } return ~c>>>0;
}
function zipStore(files){
  const enc=new TextEncoder(); let offset=0; const local=[], central=[];
  const push=(arr,...chunks)=>chunks.forEach(c=>arr.push(c));
  const u16=n=>[n&255,n>>8&255], u32=n=>[n&255,n>>8&255,n>>16&255,n>>24&255];
  for(const f of files){
    const name=enc.encode(f.name), data=enc.encode(f.text), crc=crc32(f.text);
    const header=new Uint8Array([...u32(0x04034b50),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...name]);
    local.push(header,data);
    central.push(new Uint8Array([...u32(0x02014b50),...u16(20),...u16(20),...u16(0),...u16(0),...u16(0),...u16(0),...u32(crc),...u32(data.length),...u32(data.length),...u16(name.length),...u16(0),...u16(0),...u16(0),...u16(0),...u32(0),...u32(offset),...name]));
    offset += header.length + data.length;
  }
  const centralSize=central.reduce((s,x)=>s+x.length,0), centralOffset=offset;
  const end=new Uint8Array([...u32(0x06054b50),...u16(0),...u16(0),...u16(files.length),...u16(files.length),...u32(centralSize),...u32(centralOffset),...u16(0)]);
  return new Blob([...local,...central,end],{type:'application/zip'});
}
function exportAllKmlZip(){
  const files=DATA.days.map(d=>({name:`day_${d.day}_${d.date}_namibia.kml`,text:kmlForDay(d)}));
  const blob=zipStore(files), a=document.createElement('a');
  a.href=URL.createObjectURL(blob); a.download='namibia_all_days_kml.zip'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function printMode(){ renderPrintPages(); window.print(); }
function renderPrintPages(){
  $('printPages').innerHTML = DATA.days.map(d=>`
    <article class="print-day">
      <h1>Day ${d.day}: ${esc(d.title)}</h1>
      <h2>${esc(d.date)} · ${d.selfDrive?'Self-drive / route day':'Guided or local day'}</h2>
      <p>${esc(d.routeNotes)}</p>
      <div class="print-grid">
        ${d.stops.map(s=>`<div class="print-card"><h3>${esc(s.emoji+' '+s.time+' — '+s.name)}</h3><p><b>TYPE:</b> ${esc(s.type)} · <b>Route:</b> ${esc(s.routeRole)}</p><p>${esc(s.notes)}</p>${s.pressure?`<p><b>Tyre:</b> ${esc(s.pressure)}</p>`:''}${s.fuel?`<p><b>Fuel:</b> ${esc(s.fuel)}</p>`:''}<p><a href="${wazeUrl(s)}">Waze</a> · <a href="${esc(googleMapsStopUrl(s))}">Google Maps</a></p></div>`).join('')}
      </div>
    </article>`).join('');
}
init();
