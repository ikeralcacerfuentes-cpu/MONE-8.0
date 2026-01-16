// ============================
// MONE Frontend — Sheets backend (Apps Script)
// + Registro/Login
// + Sin moderador (claimRequest)
// + Admin (verificación)
// + Date/Time selector
// ============================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwafz8ZHQCUT3k-5E58JG803UOwC7C38RnEIQ-2Y8XiHDsHj_P16jLfSKS1iq0zWczM6Q/exec"; // <- pon tu URL

const LS_SESSION = "mone_session";
function loadSession(){ try{return JSON.parse(localStorage.getItem(LS_SESSION));}catch{return null;} }
function saveSession(s){ localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
function clearSession(){ localStorage.removeItem(LS_SESSION); }

async function api(action, payload={}){
  const res = await fetch(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`,{
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if(!data.ok) throw new Error(data.error || "API error");
  return data;
}

let DB = { me:null, users:[], requests:[], ratings:[], notifications:[] };

function truthy(v){
  if(v===true) return true;
  if(typeof v==="string") return v.toLowerCase()==="true";
  return Boolean(v);
}

function userRatingLabel(userId){
  const u = DB.users.find(x=>String(x.id)===String(userId));
  if(!u || !Number(u.ratingCount)) return "Sin valoraciones";
  const avg = (Number(u.ratingSum)/Number(u.ratingCount)).toFixed(1);
  return `${avg} / 5 (${u.ratingCount})`;
}

function hasRated(requestId, fromUserId){
  return DB.ratings.some(r => String(r.requestId)===String(requestId) && String(r.fromUserId)===String(fromUserId));
}

function statusChip(status){
  const map = {
    "NUEVA": { cls:"new", label:"Nueva" },
    "ACEPTADA": { cls:"accepted", label:"Confirmada" },
    "CIERRE_SOLICITADO": { cls:"pending", label:"Cierre solicitado" },
    "COMPLETADA": { cls:"accepted", label:"Completada" }
  };
  const m = map[status] || {cls:"", label:status};
  return `<span class="chip ${m.cls}">${m.label}</span>`;
}

/* ---------- NAV ---------- */
function moneNav(which){
  const home = document.getElementById("home");
  const help = document.getElementById("help");
  const notifications = document.getElementById("notifications");

  const navHome = document.getElementById("navHome");
  const navHelp = document.getElementById("navHelp");
  const navNotif = document.getElementById("navNotif");

  const show = (el,on)=>{ if(el) el.style.display = on ? "block":"none"; };
  show(home, which==="home");
  show(help, which==="help");
  show(notifications, which==="notifications");

  if(navHome) navHome.classList.toggle("active", which==="home");
  if(navHelp) navHelp.classList.toggle("active", which==="help");
  if(navNotif) navNotif.classList.toggle("active", which==="notifications");

  if(which==="notifications") renderNotifications();
}

/* ---------- AUTH ---------- */
async function moneRegister(){
  const name = (document.getElementById("regName")?.value || "").trim();
  const role = document.getElementById("regRole")?.value;
  const zone = document.getElementById("regZone")?.value;

  if(!name){ alert("Pon un nombre"); return; }

  try{
    const data = await api("register",{name,role,zone});
    saveSession({userId: data.user.id});
    window.location.href = "dashboard.html";
  } catch(e){
    alert("Error en registro: " + e.message);
  }
}

async function moneLogin(){
  const name = (document.getElementById("name")?.value || "").trim();
  const role = document.getElementById("role")?.value;

  if(!name){ alert("Pon un nombre"); return; }

  try{
    const data = await api("login",{name,role});
    saveSession({userId: data.user.id});
    window.location.href = "dashboard.html";
  } catch(e){
    alert("Login: " + e.message);
  }
}

function moneLogout(){
  clearSession();
  window.location.href = "index.html";
}

/* ---------- BOOT ---------- */
async function moneBootDashboard(){
  const session = loadSession();
  if(!session?.userId){ window.location.href="index.html"; return; }

  try{
    const data = await api("listAll",{userId: session.userId});
    DB = {
      me: data.me,
      users: data.users||[],
      requests: data.requests||[],
      ratings: data.ratings||[],
      notifications: data.notifications||[]
    };

    const who = document.getElementById("whoami");
    if(who) who.textContent = `${DB.me.name} · ${DB.me.role} · ${DB.me.zone}`;

    // tag de verificación
    const tag = document.getElementById("verifyTag");
    if(tag){
      if(DB.me.role==="acompañante" && !truthy(DB.me.verified)){
        tag.style.display = "inline-flex";
      } else {
        tag.style.display = "none";
      }
    }

    // views
    const views = {
      "acompañado": "view-acompañado",
      "acompañante": "view-acompañante",
      "admin": "view-admin"
    };
    Object.values(views).forEach(id=>{
      const el = document.getElementById(id);
      if(el) el.style.display="none";
    });
    const v = document.getElementById(views[DB.me.role]);
    if(v) v.style.display="block";

    updateNotifUI();
    moneNav("home");
    renderAll();
  } catch(e){
    alert("Error cargando: " + e.message);
    moneLogout();
  }
}

/* ---------- DATA REFRESH ---------- */
async function refresh_(){
  const data = await api("listAll",{userId: DB.me.id});
  DB = {
    me: data.me,
    users: data.users||[],
    requests: data.requests||[],
    ratings: data.ratings||[],
    notifications: data.notifications||[]
  };

  const tag = document.getElementById("verifyTag");
  if(tag){
    if(DB.me.role==="acompañante" && !truthy(DB.me.verified)) tag.style.display="inline-flex";
    else tag.style.display="none";
  }

  renderAll();
}

/* ---------- REQUESTS ---------- */
async function moneCreateRequest(){
  const type = document.getElementById("reqType")?.value;
  const date = document.getElementById("reqDate")?.value;
  const time = document.getElementById("reqTime")?.value;
  const notes = (document.getElementById("reqNotes")?.value || "").trim();

  if(!date){ alert("Selecciona un día"); return; }
  if(!time){ alert("Selecciona una hora"); return; }

  // guardamos en 'when' como string simple (backend no cambia)
  const when = `${date} ${time}${notes ? " · " + notes : ""}`;

  try{
    await api("createRequest",{userId: DB.me.id, type, when});
    await refresh_();
    if(document.getElementById("reqNotes")) document.getElementById("reqNotes").value="";
  } catch(e){
    alert("Error creando: " + e.message);
  }
}

async function moneClaimRequest(requestId){
  try{
    await api("claimRequest",{companionId: DB.me.id, requestId});
    await refresh_();
  } catch(e){
    alert("No se pudo aceptar: " + e.message);
  }
}

async function moneRequestClose(requestId){
  try{
    await api("requestClose",{companionId: DB.me.id, requestId});
    await refresh_();
  } catch(e){
    alert("Error cierre: " + e.message);
  }
}

async function moneConfirmClose(requestId){
  try{
    await api("confirmClose",{accompaniedId: DB.me.id, requestId});
    await refresh_();
  } catch(e){
    alert("Error confirmación: " + e.message);
  }
}

/* ---------- RATINGS (stars) ---------- */
function starsWidgetHTML(requestId, targetUserId){
  const id = `stars_${requestId}_${targetUserId}`;
  return `
    <div class="starbox" role="group" aria-label="Valoración de 1 a 5">
      <div class="stars" id="${id}">
        ${[1,2,3,4,5].map(n=>`
          <button class="starbtn" type="button" aria-label="${n} estrellas"
            onclick="moneClickStar('${requestId}','${targetUserId}',${n})">★</button>
        `).join("")}
      </div>
      <div class="starhint">Pulsa una estrella</div>
    </div>
  `;
}
function paintStars(containerId,n){
  const box = document.getElementById(containerId);
  if(!box) return;
  box.querySelectorAll(".starbtn").forEach((b,i)=>b.classList.toggle("on", i<n));
}

async function moneClickStar(requestId, targetUserId, score){
  if(hasRated(requestId, DB.me.id)){
    alert("Ya has valorado este acompañamiento.");
    return;
  }
  paintStars(`stars_${requestId}_${targetUserId}`, score);

  try{
    await api("submitRating",{fromUserId: DB.me.id, requestId, toUserId: targetUserId, score});
    await refresh_();
  } catch(e){
    alert("Error valoración: " + e.message);
  }
}

/* ---------- NOTIFICATIONS ---------- */
function updateNotifUI(){
  if(!DB.me) return;
  const unread = DB.notifications.filter(n=>!truthy(n.read)).length;

  const badge = document.getElementById("notifBadge");
  const pill = document.getElementById("notifCountPill");
  if(badge){
    badge.style.display = unread>0 ? "inline-flex":"none";
    badge.textContent = String(unread);
  }
  if(pill) pill.textContent = `${unread} sin leer`;
}

function renderNotifications(){
  const list = document.getElementById("notifList");
  if(!list) return;

  updateNotifUI();
  const items = DB.notifications.slice();

  if(!items.length){
    list.innerHTML = `<div class="item"><p class="muted">No tienes notificaciones aún.</p></div>`;
    return;
  }

  list.innerHTML = items.map(n=>{
    const read = truthy(n.read);
    const dotClass = read ? "notifDot read" : "notifDot";
    const d = new Date(n.createdAt);
    const whenTxt = `${d.toLocaleDateString()} ${String(d.toLocaleTimeString()).slice(0,5)}`;

    return `
      <div class="item">
        <div class="notif">
          <div class="${dotClass}"></div>
          <div style="flex:1;">
            <p class="notifTitle">${n.title}</p>
            <p class="notifBody">${n.body}</p>
            <p class="notifMeta">${whenTxt}</p>
            <div class="actions">
              ${read ? "" : `<button class="btn" onclick="moneMarkNotificationRead('${n.id}')">Marcar leído</button>`}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function moneMarkNotificationRead(notifId){
  try{
    await api("markNotifRead",{userId: DB.me.id, notifId});
    await refresh_();
    renderNotifications();
  } catch(e){
    alert("Error notif: " + e.message);
  }
}

async function moneMarkAllNotificationsRead(){
  try{
    await api("markAllNotifRead",{userId: DB.me.id});
    await refresh_();
    renderNotifications();
  } catch(e){
    alert("Error notif: " + e.message);
  }
}

async function moneClearNotifications(){
  if(!confirm("¿Vaciar notificaciones?")) return;
  try{
    await api("clearNotifications",{userId: DB.me.id});
    await refresh_();
    renderNotifications();
  } catch(e){
    alert("Error notif: " + e.message);
  }
}

/* ---------- ADMIN ---------- */
async function moneToggleVerified(userId, nextVal){
  try{
    await api("setUserVerified",{adminId: DB.me.id, userId, verified: nextVal});
    await refresh_();
  } catch(e){
    alert("Error verificación: " + e.message);
  }
}

/* ---------- RENDER ---------- */
function renderAll(){
  if(DB.me.role==="acompañado") renderAccompanied();
  if(DB.me.role==="acompañante") renderCompanion();
  if(DB.me.role==="admin") renderAdmin();
  updateNotifUI();
}

function renderAccompanied(){
  const list = document.getElementById("myRequests");
  if(!list) return;

  const reqs = DB.requests.filter(r=>String(r.accompaniedId)===String(DB.me.id));
  if(!reqs.length){
    list.innerHTML = `<div class="item"><p class="muted">Aún no has creado solicitudes.</p></div>`;
    return;
  }

  list.innerHTML = reqs.map(r=>{
    const showComp = (["ACEPTADA","CIERRE_SOLICITADO","COMPLETADA"].includes(r.status))
      ? `<p class="meta"><b>Acompañante:</b> ${r.companionName} · <span class="muted small">${userRatingLabel(r.companionId)}</span></p>` : "";

    const confirmBtn = (r.status==="CIERRE_SOLICITADO")
      ? `<button class="btn primary" onclick="moneConfirmClose('${r.id}')">Confirmar finalización</button>` : "";

    const rateBlock = (r.status==="COMPLETADA" && !hasRated(r.id, DB.me.id))
      ? starsWidgetHTML(r.id, r.companionId)
      : (r.status==="COMPLETADA" ? `<span class="muted small">Gracias, valoración enviada.</span>` : "");

    return `
      <div class="item">
        <h4>${r.type}</h4>
        <p class="meta"><b>Barrio:</b> ${r.zone}</p>
        <p class="meta"><b>Cuándo:</b> ${r.when}</p>
        ${showComp}
        ${statusChip(r.status)}
        <div class="actions">
          ${confirmBtn}
          ${rateBlock}
        </div>
      </div>
    `;
  }).join("");
}

function renderCompanion(){
  const avail = document.getElementById("availableRequests");
  const active = document.getElementById("myAssignmentsActive");
  if(!avail || !active) return;

  // disponibles: NUEVA en su barrio
  const available = DB.requests.filter(r=>r.status==="NUEVA" && r.zone===DB.me.zone);
  if(!available.length){
    avail.innerHTML = `<div class="item"><p class="muted">No hay solicitudes nuevas en tu barrio ahora mismo.</p></div>`;
  } else {
    avail.innerHTML = available.map(r=>`
      <div class="item">
        <h4>${r.type}</h4>
        <p class="meta"><b>Acompañado:</b> ${r.accompaniedName}</p>
        <p class="meta"><b>Barrio:</b> ${r.zone} · <b>Cuándo:</b> ${r.when}</p>
        ${statusChip(r.status)}
        <div class="actions">
          <button class="btn primary" onclick="moneClaimRequest('${r.id}')">Aceptar</button>
        </div>
        ${truthy(DB.me.verified) ? "" : `<p class="hint">⚠️ No verificado: un admin debe validarte.</p>`}
      </div>
    `).join("");
  }

  // en curso / completadas (las suyas)
  const mine = DB.requests.filter(r=>String(r.companionId)===String(DB.me.id));
  const mineShow = mine.filter(r=>["ACEPTADA","CIERRE_SOLICITADO","COMPLETADA"].includes(r.status));

  if(!mineShow.length){
    active.innerHTML = `<div class="item"><p class="muted">No tienes acompañamientos todavía.</p></div>`;
    return;
  }

  active.innerHTML = mineShow.map(r=>{
    const closeBtn = (r.status==="ACEPTADA")
      ? `<button class="btn primary" onclick="moneRequestClose('${r.id}')">Marcar finalizado</button>` : "";

    const waiting = (r.status==="CIERRE_SOLICITADO")
      ? `<span class="muted small">Esperando confirmación del acompañado.</span>` : "";

    const rateBlock = (r.status==="COMPLETADA" && !hasRated(r.id, DB.me.id))
      ? starsWidgetHTML(r.id, r.accompaniedId)
      : (r.status==="COMPLETADA" ? `<span class="muted small">Gracias, valoración enviada.</span>` : "");

    return `
      <div class="item">
        <h4>${r.type}</h4>
        <p class="meta"><b>Acompañado:</b> ${r.accompaniedName} · <span class="muted small">${userRatingLabel(r.accompaniedId)}</span></p>
        <p class="meta"><b>Barrio:</b> ${r.zone} · <b>Cuándo:</b> ${r.when}</p>
        ${statusChip(r.status)}
        <div class="actions">
          ${closeBtn}
          ${waiting}
          ${rateBlock}
        </div>
      </div>
    `;
  }).join("");
}

function renderAdmin(){
  const box = document.getElementById("adminUsers");
  if(!box) return;

  const companions = DB.users.filter(u=>u.role==="acompañante");
  if(!companions.length){
    box.innerHTML = `<div class="item"><p class="muted">No hay acompañantes registrados aún.</p></div>`;
    return;
  }

  box.innerHTML = companions.map(u=>{
    const isV = truthy(u.verified);
    return `
      <div class="item">
        <div class="rowline">
          <div>
            <h4>${u.name}</h4>
            <p class="meta"><b>Barrio:</b> ${u.zone} · <b>Estado:</b> ${isV ? "Verificado" : "No verificado"}</p>
            <p class="meta"><b>Rating:</b> ${userRatingLabel(u.id)}</p>
          </div>
          <div class="actions">
            <button class="btn ${isV ? "danger" : "primary"}"
              onclick="moneToggleVerified('${u.id}', ${isV ? "false" : "true"})">
              ${isV ? "Quitar verificación" : "Verificar"}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/* ---------- RESET ---------- */
function moneResetAll(){
  if(!confirm("Cerrar sesión en este dispositivo?")) return;
  clearSession();
  window.location.href="index.html";
}

/* expose */
window.moneRegister = moneRegister;
window.moneLogin = moneLogin;
window.moneBootDashboard = moneBootDashboard;
window.moneLogout = moneLogout;
window.moneResetAll = moneResetAll;

window.moneNav = moneNav;

window.moneCreateRequest = moneCreateRequest;
window.moneClaimRequest = moneClaimRequest;
window.moneRequestClose = moneRequestClose;
window.moneConfirmClose = moneConfirmClose;

window.moneClickStar = moneClickStar;

window.moneMarkNotificationRead = moneMarkNotificationRead;
window.moneMarkAllNotificationsRead = moneMarkAllNotificationsRead;
window.moneClearNotifications = moneClearNotifications;

window.moneToggleVerified = moneToggleVerified;
