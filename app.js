// ============================
// MONE Frontend — Google Sheets backend (Apps Script)
// + PWA + Stars + Notifications
// ============================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwGHpNTjy2odxSt2JLjfFUi7uOxG15Vpl64r3jrP8W6zh0bXlJXqRbAE6W4GAXAl_p2ow/exec"; // <- IMPORTANTE

// Session local (solo guarda userId)
const LS_SESSION = "mone_session";

function loadSession() {
  try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch { return null; }
}
function saveSession(s) { localStorage.setItem(LS_SESSION, JSON.stringify(s)); }
function clearSession() { localStorage.removeItem(LS_SESSION); }

async function api(action, payload = {}) {
  const res = await fetch(`${SCRIPT_URL}?action=${encodeURIComponent(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "API error");
  return data;
}

// In-memory cache (lo que antes era localStorage)
let DB = {
  me: null,
  users: [],
  requests: [],
  ratings: [],
  notifications: []
};

// ---------- UI helpers ----------
function userRatingLabel(userId) {
  const u = DB.users.find(x => String(x.id) === String(userId));
  if (!u || !Number(u.ratingCount)) return "Sin valoraciones";
  const avg = (Number(u.ratingSum) / Number(u.ratingCount)).toFixed(1);
  return `${avg} / 5 (${u.ratingCount})`;
}

function hasRated(requestId, fromUserId) {
  return DB.ratings.some(r => String(r.requestId) === String(requestId) && String(r.fromUserId) === String(fromUserId));
}

function statusChip(status){
  const map = {
    "NUEVA": { cls:"new", label:"Nueva" },
    "PENDIENTE_ACEPTACION": { cls:"pending", label:"Pendiente" },
    "ACEPTADA": { cls:"accepted", label:"Confirmada" },
    "RECHAZADA": { cls:"rejected", label:"Rechazada" },
    "CIERRE_SOLICITADO": { cls:"pending", label:"Cierre solicitado" },
    "COMPLETADA": { cls:"accepted", label:"Completada" },
  };
  const m = map[status] || {cls:"", label:status};
  return `<span class="chip ${m.cls}">${m.label}</span>`;
}

function updateNotifUI() {
  if (!DB.me) return;
  const unread = DB.notifications.filter(n => !truthy(n.read)).length;

  const badge = document.getElementById("notifBadge");
  const pill = document.getElementById("notifCountPill");

  if (badge) {
    badge.style.display = unread > 0 ? "inline-flex" : "none";
    badge.textContent = String(unread);
  }
  if (pill) pill.textContent = `${unread} sin leer`;
}

function truthy(v) {
  if (v === true) return true;
  if (typeof v === "string") return v.toLowerCase() === "true";
  return Boolean(v);
}

// ---------- NAV ----------
function moneNav(which){
  const home = document.getElementById("home");
  const help = document.getElementById("help");
  const notifications = document.getElementById("notifications");

  const navHome = document.getElementById("navHome");
  const navHelp = document.getElementById("navHelp");
  const navNotif = document.getElementById("navNotif");

  const show = (el, on) => { if (el) el.style.display = on ? "block" : "none"; };
  show(home, which === "home");
  show(help, which === "help");
  show(notifications, which === "notifications");

  if (navHome) navHome.classList.toggle("active", which === "home");
  if (navHelp) navHelp.classList.toggle("active", which === "help");
  if (navNotif) navNotif.classList.toggle("active", which === "notifications");

  if (which === "notifications") renderNotifications();
}

// ---------- LOGIN ----------
async function moneEnter() {
  const name = (document.getElementById("name")?.value || "").trim();
  const role = document.getElementById("role")?.value;
  const zone = document.getElementById("zone")?.value;
  if (!name) { alert("Pon un nombre"); return; }

  try {
    const data = await api("enter", { name, role, zone });
    saveSession({ userId: data.user.id });
    window.location.href = "dashboard.html";
  } catch (e) {
    alert("Error al entrar: " + e.message);
  }
}

function moneLogout() {
  clearSession();
  window.location.href = "index.html";
}

// ---------- BOOT ----------
async function moneBootDashboard() {
  const session = loadSession();
  if (!session?.userId) { window.location.href = "index.html"; return; }

  try {
    const data = await api("listAll", { userId: session.userId });
    DB = {
      me: data.me,
      users: data.users || [],
      requests: data.requests || [],
      ratings: data.ratings || [],
      notifications: data.notifications || []
    };

    const who = document.getElementById("whoami");
    if (who) who.textContent = `${DB.me.name} · ${DB.me.role} · ${DB.me.zone}`;

    // Views por rol
    const views = {
      "acompañado": "view-acompañado",
      "moderador": "view-moderador",
      "acompañante": "view-acompañante"
    };
    Object.values(views).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = "none";
    });
    const v = document.getElementById(views[DB.me.role]);
    if (v) v.style.display = "block";

    updateNotifUI();
    moneNav("home");
    renderAll();
  } catch (e) {
    alert("Error cargando datos: " + e.message);
    moneLogout();
  }
}

// ---------- REQUESTS ----------
async function moneCreateRequest() {
  const type = document.getElementById("reqType")?.value;
  const when = (document.getElementById("reqWhen")?.value || "").trim();
  if (!when) { alert("Pon fecha y hora"); return; }

  try {
    await api("createRequest", { userId: DB.me.id, type, when });
    await refresh_();
    document.getElementById("reqWhen").value = "";
  } catch (e) {
    alert("Error creando solicitud: " + e.message);
  }
}

async function moneAssign(requestId, companionId) {
  try {
    await api("assignRequest", { moderatorId: DB.me.id, requestId, companionId });
    await refresh_();
  } catch (e) {
    alert("Error asignando: " + e.message);
  }
}

async function moneAccept(requestId) {
  try {
    await api("acceptRequest", { companionId: DB.me.id, requestId });
    await refresh_();
  } catch (e) {
    alert("Error aceptando: " + e.message);
  }
}

async function moneReject(requestId) {
  try {
    await api("rejectRequest", { companionId: DB.me.id, requestId });
    await refresh_();
  } catch (e) {
    alert("Error rechazando: " + e.message);
  }
}

async function moneRequestClose(requestId) {
  try {
    await api("requestClose", { companionId: DB.me.id, requestId });
    await refresh_();
  } catch (e) {
    alert("Error solicitando cierre: " + e.message);
  }
}

async function moneConfirmClose(requestId) {
  try {
    await api("confirmClose", { accompaniedId: DB.me.id, requestId });
    await refresh_();
  } catch (e) {
    alert("Error confirmando cierre: " + e.message);
  }
}

// ---------- RATINGS ----------
function starsWidgetHTML(requestId, targetUserId) {
  const id = `stars_${requestId}_${targetUserId}`;
  return `
    <div class="starbox" role="group" aria-label="Valoración de 1 a 5">
      <div class="stars" id="${id}">
        ${[1,2,3,4,5].map(n => `
          <button class="starbtn" type="button" aria-label="${n} estrellas"
            onclick="moneClickStar('${requestId}','${targetUserId}',${n})">★</button>
        `).join("")}
      </div>
      <div class="starhint">Pulsa una estrella</div>
    </div>
  `;
}

function paintStars(containerId, n) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const btns = box.querySelectorAll(".starbtn");
  btns.forEach((b, i) => b.classList.toggle("on", i < n));
}

async function moneClickStar(requestId, targetUserId, score) {
  if (hasRated(requestId, DB.me.id)) {
    alert("Ya has valorado este acompañamiento.");
    return;
  }
  paintStars(`stars_${requestId}_${targetUserId}`, score);

  try {
    await api("submitRating", { fromUserId: DB.me.id, requestId, toUserId: targetUserId, score });
    await refresh_();
  } catch (e) {
    alert("Error enviando valoración: " + e.message);
  }
}

// ---------- NOTIFICATIONS ----------
function renderNotifications() {
  const list = document.getElementById("notifList");
  if (!list) return;

  updateNotifUI();
  const items = DB.notifications.slice();

  if (!items.length) {
    list.innerHTML = `<div class="item"><p class="muted">No tienes notificaciones aún.</p></div>`;
    return;
  }

  list.innerHTML = items.map(n => {
    const read = truthy(n.read);
    const dotClass = read ? "notifDot read" : "notifDot";
    const when = new Date(n.createdAt);
    const whenTxt = `${when.toLocaleDateString()} ${String(when.toLocaleTimeString()).slice(0,5)}`;

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

async function moneMarkNotificationRead(notifId) {
  try {
    await api("markNotifRead", { userId: DB.me.id, notifId });
    await refresh_();
    renderNotifications();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function moneMarkAllNotificationsRead() {
  try {
    await api("markAllNotifRead", { userId: DB.me.id });
    await refresh_();
    renderNotifications();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function moneClearNotifications() {
  if (!confirm("¿Vaciar tus notificaciones?")) return;
  try {
    await api("clearNotifications", { userId: DB.me.id });
    await refresh_();
    renderNotifications();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

// ---------- RENDER ALL ----------
function renderAll() {
  if (DB.me.role === "acompañado") renderAccompanied();
  if (DB.me.role === "moderador") renderModerator();
  if (DB.me.role === "acompañante") renderCompanion();
  updateNotifUI();
}

function renderAccompanied() {
  const list = document.getElementById("myRequests");
  if (!list) return;

  const reqs = DB.requests.filter(r => String(r.accompaniedId) === String(DB.me.id));
  if (!reqs.length) {
    list.innerHTML = `<div class="item"><p class="muted">Aún no has creado solicitudes.</p></div>`;
    return;
  }

  list.innerHTML = reqs.map(r => {
    const showComp = (["ACEPTADA","CIERRE_SOLICITADO","COMPLETADA"].includes(r.status))
      ? `<p class="meta"><b>Acompañante:</b> ${r.companionName} · <span class="muted small">${userRatingLabel(r.companionId)}</span></p>`
      : "";

    const confirmBtn = (r.status === "CIERRE_SOLICITADO")
      ? `<button class="btn primary" onclick="moneConfirmClose('${r.id}')">Confirmar finalización</button>`
      : "";

    const rateBlock = (r.status === "COMPLETADA" && !hasRated(r.id, DB.me.id))
      ? starsWidgetHTML(r.id, r.companionId)
      : (r.status === "COMPLETADA" ? `<span class="muted small">Gracias, valoración enviada.</span>` : "");

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

function renderModerator() {
  const container = document.getElementById("modRequests");
  if (!container) return;

  const queue = DB.requests.filter(r => r.status === "NUEVA" || r.status === "RECHAZADA");
  const inProgress = DB.requests.filter(r => ["PENDIENTE_ACEPTACION","ACEPTADA","CIERRE_SOLICITADO"].includes(r.status));

  const kpiP = document.getElementById("kpiPending");
  const kpiI = document.getElementById("kpiInProgress");
  if (kpiP) kpiP.textContent = String(queue.length);
  if (kpiI) kpiI.textContent = String(inProgress.length);

  const companions = DB.users.filter(u => u.role === "acompañante");

  if (!queue.length) {
    container.innerHTML = `<div class="item"><p class="muted">No hay solicitudes pendientes ahora mismo.</p></div>`;
    return;
  }

  container.innerHTML = queue.map(r => {
    const eligible = companions.filter(c => c.zone === r.zone);
    const options = eligible.length
      ? eligible.map(c => `<option value="${c.id}">${c.name} · ${c.zone} · ${userRatingLabel(c.id)}</option>`).join("")
      : `<option value="">Sin acompañantes en ${r.zone}</option>`;

    return `
      <div class="item">
        <h4>${r.type}</h4>
        <p class="meta"><b>Acompañado:</b> ${r.accompaniedName}</p>
        <p class="meta"><b>Barrio:</b> ${r.zone} · <b>Cuándo:</b> ${r.when}</p>
        ${statusChip(r.status)}
        <div class="actions">
          <select class="input" style="max-width:420px;" id="sel_${r.id}">
            ${options}
          </select>
          <button class="btn primary" onclick="(function(){
            const v=document.getElementById('sel_${r.id}').value;
            if(!v){alert('No hay acompañante disponible en ese barrio');return;}
            moneAssign('${r.id}', v);
          })()">Asignar</button>
        </div>
      </div>
    `;
  }).join("");
}

function renderCompanion() {
  const pendingDiv = document.getElementById("myAssignmentsPending");
  const activeDiv = document.getElementById("myAssignmentsActive");
  if (!pendingDiv || !activeDiv) return;

  const mine = DB.requests.filter(r => String(r.companionId) === String(DB.me.id));
  const pending = mine.filter(r => r.status === "PENDIENTE_ACEPTACION");
  const active = mine.filter(r => ["ACEPTADA","CIERRE_SOLICITADO","COMPLETADA"].includes(r.status));

  pendingDiv.innerHTML = pending.length
    ? pending.map(r => `
      <div class="item">
        <h4>${r.type}</h4>
        <p class="meta"><b>Acompañado:</b> ${r.accompaniedName}</p>
        <p class="meta"><b>Barrio:</b> ${r.zone} · <b>Cuándo:</b> ${r.when}</p>
        ${statusChip(r.status)}
        <div class="actions">
          <button class="btn primary" onclick="moneAccept('${r.id}')">Aceptar</button>
          <button class="btn danger" onclick="moneReject('${r.id}')">Rechazar</button>
        </div>
      </div>
    `).join("")
    : `<div class="item"><p class="muted">No tienes decisiones pendientes.</p></div>`;

  activeDiv.innerHTML = active.length
    ? active.map(r => {
      const closeBtn = (r.status === "ACEPTADA")
        ? `<button class="btn primary" onclick="moneRequestClose('${r.id}')">Marcar finalizado</button>`
        : "";

      const waitingConfirm = (r.status === "CIERRE_SOLICITADO")
        ? `<span class="muted small">Esperando confirmación del acompañado.</span>`
        : "";

      const rateBlock = (r.status === "COMPLETADA" && !hasRated(r.id, DB.me.id))
        ? starsWidgetHTML(r.id, r.accompaniedId)
        : (r.status === "COMPLETADA" ? `<span class="muted small">Gracias, valoración enviada.</span>` : "");

      return `
        <div class="item">
          <h4>${r.type}</h4>
          <p class="meta"><b>Acompañado:</b> ${r.accompaniedName} · <span class="muted small">${userRatingLabel(r.accompaniedId)}</span></p>
          <p class="meta"><b>Barrio:</b> ${r.zone} · <b>Cuándo:</b> ${r.when}</p>
          ${statusChip(r.status)}
          <div class="actions">
            ${closeBtn}
            ${waitingConfirm}
            ${rateBlock}
          </div>
        </div>
      `;
    }).join("")
    : `<div class="item"><p class="muted">Aún no tienes acompañamientos activos.</p></div>`;
}

// ---------- Refresh ----------
async function refresh_() {
  const data = await api("listAll", { userId: DB.me.id });
  DB = {
    me: data.me,
    users: data.users || [],
    requests: data.requests || [],
    ratings: data.ratings || [],
    notifications: data.notifications || []
  };
  renderAll();
}

function moneResetAll() {
  // OJO: ahora esto solo borra sesión local (no borra Sheet)
  if (!confirm("Esto cerrará sesión en este dispositivo. ¿Continuar?")) return;
  clearSession();
  window.location.href = "index.html";
}

// Demo rápida ahora solo crea sesión local y te deja entrar;
// si quieres “seed real” en Sheets, lo añadimos luego.
function moneSeedDemoData() {
  alert("En modo Sheets, usa usuarios reales entrando por la pantalla de login (se guardan automáticamente).");
}

// Exponer funciones al global (por onclick)
window.moneEnter = moneEnter;
window.moneBootDashboard = moneBootDashboard;
window.moneLogout = moneLogout;

window.moneNav = moneNav;

window.moneCreateRequest = moneCreateRequest;
window.moneAssign = moneAssign;
window.moneAccept = moneAccept;
window.moneReject = moneReject;
window.moneRequestClose = moneRequestClose;
window.moneConfirmClose = moneConfirmClose;

window.moneClickStar = moneClickStar;

window.moneMarkNotificationRead = moneMarkNotificationRead;
window.moneMarkAllNotificationsRead = moneMarkAllNotificationsRead;
window.moneClearNotifications = moneClearNotifications;

window.moneResetAll = moneResetAll;
window.moneSeedDemoData = moneSeedDemoData;
