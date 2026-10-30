/* Kit de prospection assistée — pilote E2C 92 */
(function () {
  "use strict";

  const APP_URL = location.origin + "/pilote/";
  const SITES = { clichy: "Clichy", bagneux: "Bagneux", nanterre: "Nanterre" };
  const METIERS = [
    ["vente", "Vente / employé(e) de commerce", "la vente et le commerce"],
    ["boulangerie", "Boulangerie / pâtisserie", "la boulangerie-pâtisserie"],
    ["restauration", "Cuisine / restauration", "la cuisine et la restauration"],
    ["mecanique", "Mécanique automobile", "la mécanique automobile"],
    ["aide", "Aide à la personne", "l'aide à la personne"],
    ["enfance", "Petite enfance", "la petite enfance"],
    ["proprete", "Propreté / entretien", "la propreté et l'entretien"],
    ["coiffure", "Coiffure / esthétique", "la coiffure et l'esthétique"],
    ["logistique", "Logistique / magasinage", "la logistique"],
    ["batiment", "Bâtiment (électricité, plomberie, peinture)", "le bâtiment"],
    ["hotellerie", "Hôtellerie / accueil", "l'hôtellerie et l'accueil"],
    ["maintenance", "Maintenance industrielle", "la maintenance industrielle"],
    ["securite", "Sécurité / prévention", "la sécurité"],
    ["transport", "Transport / livraison", "le transport et la livraison"],
    ["informatique", "Informatique / réparation", "l'informatique"],
    ["espacesverts", "Espaces verts / paysage", "les espaces verts"],
    ["administratif", "Administratif / secrétariat", "l'administratif et le secrétariat"],
    ["sport", "Sport / animation", "le sport et l'animation"],
    ["automobile", "Commerce automobile / pièces", "le commerce automobile"],
    ["rh", "Ressources humaines / recrutement", "les ressources humaines"],
  ];
  const STATUTS = ["Envoyé", "À rappeler", "Relancé", "Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];
  const REPONSES = ["Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const metierLabel = (id) => (METIERS.find((m) => m[0] === id) || [, ""])[1];
  const domaine = (id) => id === "libre" && J && J.metierLibre ? J.metierLibre.toLowerCase() : (METIERS.find((m) => m[0] === id) || [, , "ce métier"])[2];
  const article = (t) => ({ stage: "un stage", alternance: "une alternance", emploi: "un emploi" }[t] || "un stage");

  // ---------- session ----------
  const mem = {};
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return mem[k] || null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
  };
  const TK = "kp_pilote_token", KIND = "kp_pilote_kind";

  async function api(a, data, opts) {
    opts = opts || {};
    const t = ls.get(TK);
    const headers = {};
    if (t) headers.Authorization = "Bearer " + t;
    let url = "/api/pilote?a=" + encodeURIComponent(a);
    const init = { headers };
    if (opts.get) {
      if (data) url += "&" + new URLSearchParams(data);
    } else {
      init.method = "POST"; headers["Content-Type"] = "application/json"; init.body = JSON.stringify(data || {});
    }
    const r = await fetch(url, init);
    if (opts.raw) {
      if (!r.ok) { let m = "Erreur"; try { m = (await r.json()).error; } catch (e) { /* */ } throw new Error(m); }
      return r;
    }
    let out = {};
    try { out = await r.json(); } catch (e) { /* */ }
    if (r.status === 401 && t && !/^login/.test(a)) { logout(out.error || "Session expirée."); throw new Error(out.error || "Session expirée."); }
    if (!r.ok) throw new Error(out.error || "Le serveur ne répond pas. Réessaie dans un instant.");
    return out;
  }

  async function telecharger(a, params, nomDefaut) {
    const r = await api(a, params, { get: true, raw: true });
    const blob = await r.blob();
    const cd = r.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)/) || cd.match(/filename="([^"]+)"/);
    const nom = m ? decodeURIComponent(m[1]) : nomDefaut;
    const u = URL.createObjectURL(blob);
    const el = document.createElement("a"); el.href = u; el.download = nom; document.body.appendChild(el); el.click(); el.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }

  // ---------- helpers ----------
  function toast(t) {
    const el = $("#toast"); el.textContent = t; el.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2800);
  }
  async function copier(texte) {
    try { await navigator.clipboard.writeText(texte); return true; }
    catch (e) {
      const t = document.createElement("textarea"); t.value = texte; t.style.position = "fixed"; t.style.left = "-9999px";
      document.body.appendChild(t); t.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch (x) { ok = false; }
      t.remove(); return ok;
    }
  }
  const mailLinks = (sujet, corps, to) => {
    const s = encodeURIComponent(sujet), c = encodeURIComponent(corps), t = encodeURIComponent((to || "").trim());
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1${t ? "&to=" + t : ""}&su=${s}&body=${c}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?${t ? "to=" + t + "&" : ""}subject=${s}&body=${c}`,
      autre: `mailto:${t}?subject=${s}&body=${c}`,
    };
  };
  const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());
  const fromIso = (s) => new Date(s + "T12:00:00");
  const fr = (iso) => iso ? fromIso(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "—";
  const quand = (isoDT) => {
    if (!isoDT) return "jamais";
    const d = new Date(isoDT), j = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (j <= 0) return "aujourd'hui"; if (j === 1) return "hier"; if (j < 7) return `il y a ${j} jours`;
    return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  };
  const quandJour = (iso) => { const j = Math.round((new Date(todayIso() + "T12:00:00") - new Date(iso + "T12:00:00")) / 86400000); return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`; };
  const taille = (n) => n > 1048576 ? (n / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(n / 1024)) + " Ko";

  // ---------- agenda ----------
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stampUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  function evDates(day, h, m, dur) { const a = new Date(day); a.setHours(h, m, 0, 0); return [a, new Date(a.getTime() + dur * 60000)]; }
  function gcal(ev) {
    const [a, b] = evDates(ev.day, ev.h, ev.m, ev.dur);
    let u = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(ev.title)
      + "&dates=" + stamp(a) + "/" + stamp(b) + "&ctz=Europe/Paris&details=" + encodeURIComponent(ev.details);
    if (ev.rrule) u += "&recur=" + encodeURIComponent("RRULE:" + ev.rrule);
    return u;
  }
  function ics(ev) {
    const [a, b] = evDates(ev.day, ev.h, ev.m, ev.dur);
    const t = (s) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kit de prospection//FR", "BEGIN:VEVENT",
      "UID:" + Date.now() + Math.random().toString(36).slice(2) + "@kit-prospection", "DTSTAMP:" + stampUTC(new Date()),
      "DTSTART:" + stampUTC(a), "DTEND:" + stampUTC(b), "SUMMARY:" + t(ev.title), "DESCRIPTION:" + t(ev.details), "URL:" + APP_URL];
    if (ev.rrule) L.push("RRULE:" + ev.rrule);
    L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + t(ev.title), "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(L.join("\r\n"));
  }
  const evRelance = (e) => ({ title: "Relancer " + e.entreprise, day: fromIso(e.relance), h: 10, m: 0, dur: 15,
    details: "Pas de réponse de " + e.entreprise + " ? C'est le moment de relancer.\nOuvre ton Kit de prospection, « Mon suivi » : le message est prêt.\n" + APP_URL });
  function evQuotidien() {
    const x = new Date(); x.setDate(x.getDate() + 1); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
    return { title: "Mes candidatures (15 min)", day: x, h: 9, m: 0, dur: 15, rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=15",
      details: "15 minutes pour ma recherche : 2 candidatures et les relances du jour.\n" + APP_URL };
  }
  const liensAgenda = (ev, nom) => `<a href="${gcal(ev)}" target="_blank" rel="noopener">Google Agenda</a> · <a href="${ics(ev)}" download="${nom}.ics">Autre agenda</a>`;

  // ---------- vues ----------
  const VUES = ["login", "jeune", "equipe", "activer"];
  function vue(n) {
    VUES.forEach((v) => { $("#v-" + v).hidden = v !== n; });
    $("#who").hidden = n === "login" || n === "activer";
    $("#btn-moncode").hidden = n !== "equipe";
    window.scrollTo({ top: 0 });
  }
  function logout(msg) {
    ls.del(TK); ls.del(KIND);
    J = null; ME = null;
    initLogin();
    if (msg) toast(msg);
  }
  $("#btn-logout").addEventListener("click", () => logout("À bientôt !"));

  // =====================================================================
  // CONNEXION
  // =====================================================================
  const params = new URLSearchParams(location.search);
  function initLogin() {
    vue("login");
    const site = params.get("site") || ls.get("kp_site");
    if (SITES[site]) {
      $("#lj-site").value = site;
      $("#login-titre").textContent = `E2C ${SITES[site]} : bienvenue sur ton Kit de prospection.`;
    }
    if (params.has("equipe")) setTimeout(() => $("#ls-code").focus(), 50);
  }
  $("#f-jeune").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#lj-err"); err.hidden = true;
    const btn = ev.submitter || $("#f-jeune button[type=submit]"); btn.disabled = true;
    try {
      const r = await api("login-jeune", { site: $("#lj-site").value, ident: $("#lj-ident").value });
      ls.set(TK, r.token); ls.set(KIND, "j"); ls.set("kp_site", $("#lj-site").value);
      startJeune(r.jeune);
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });
  $("#f-staff").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const err = $("#ls-err"); err.hidden = true;
    const btn = ev.submitter || $("#f-staff button[type=submit]"); btn.disabled = true;
    try {
      const r = await api("login-staff", { code: $("#ls-code").value });
      ls.set(TK, r.token); ls.set(KIND, "s");
      startEquipe(r.me);
    } catch (e) { err.textContent = e.message; err.hidden = false; }
    finally { btn.disabled = false; }
  });

  // =====================================================================
  // ESPACE JEUNE
  // =====================================================================
  let J = null;
  const S = { resultats: [], ouvert: null, centre: null, sub: "dossier" };
  const nomComplet = () => `${J.prenom} ${J.nom}`.trim();
  const objetDefaut = () => `Candidature – ${article(J.typ)} – ${nomComplet()}`;

  const optMetiers = METIERS.slice().sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([v, l]) => `<option value="${v}">${l}</option>`).join("") + `<option value="libre">Autre métier (je l'écris)…</option>`;
  $("#p-metier").innerHTML = `<option value="">Choisis…</option>` + optMetiers;
  $("#s-metier").innerHTML = optMetiers;
  // champ métier : liste de suggestions, ou n'importe quel métier écrit librement
  $("#dl-metiers").innerHTML = METIERS.slice().sort((a, b) => a[1].localeCompare(b[1], "fr")).map(([, l]) => `<option value="${esc(l)}">`).join("");
  const majLibre = () => {};
  const libelleMetier = (code, libre) => (code === "libre" ? libre || "" : metierLabel(code) || "");
  function lireMetier(prefix) {
    const v = $(`#${prefix}-metier-txt`).value.trim(), sel = $(`#${prefix}-metier`), lib = $(`#${prefix}-libre`);
    const m = METIERS.find((x) => normTxtJ(x[1]) === normTxtJ(v)) || METIERS.find((x) => normTxtJ(x[1].split(" / ")[0]) === normTxtJ(v));
    if (!v) { sel.value = ""; lib.value = ""; }
    else if (m) { sel.value = m[0]; }
    else { sel.value = "libre"; lib.value = v; }
  }
  const normTxtJ = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  ["s", "p"].forEach((pf) => $(`#${pf}-metier-txt`).addEventListener("change", () => { lireMetier(pf); if (pf === "p") sauver(); }));
  $("#rayon").addEventListener("input", (e) => { $("#rayon-out").textContent = e.target.value + " km"; });

  function startJeune(j) {
    J = j;
    vue("jeune");
    $("#who-txt").textContent = `${J.prenom} · E2C ${J.siteNom}`;
    majBoutonInstall();
    $("#j-hello").textContent = J.test ? "Compte de démonstration" : `Bonjour ${J.prenom} !`;
    $("#j-sous").textContent = J.test ? `E2C ${J.siteNom} · Vous voyez exactement ce que voit un stagiaire. Ce compte est partagé par l'équipe et n'entre pas dans les statistiques : n'y mettez pas de vraies données.` : `E2C ${J.siteNom}. Prépare ton dossier, cherche, envoie, relance.`;
    remplirDossier();
    const pret = !!J.cv && !!(J.lettre || "").trim();
    showSub(pret ? (J.envois.length ? "suivi" : "chercher") : "dossier");
    majJeune();
  }

  function majJeune() {
    const n = (J.cv ? 1 : 0) + ((J.lettre || "").trim() ? 1 : 0);
    const etat = $("#dossier-etat"); etat.textContent = n + "/2"; etat.classList.toggle("ok", n === 2);
    $("#nb-envois").textContent = J.envois.length;
    const t = todayIso();
    const rel = J.envois.filter((e) => ["Envoyé", "À rappeler"].includes(e.statut) && e.relance && e.relance <= t);
    const b = $("#j-banner");
    const prep = (J.prepares || []).filter((x) => !(S.attente && S.attente.siret === x.siret));
    if (prep.length) {
      b.hidden = false;
      b.innerHTML = `<div class="prep-box"><b>Tu as préparé ${prep.length === 1 ? "un message" : prep.length + " messages"}. ${prep.length === 1 ? "L'as-tu envoyé ?" : "Les as-tu envoyés ?"}</b>
        ${prep.map((x) => `<div class="prep-row"><span>${esc(x.entreprise)}${x.ville ? ` <span class="muted sm">· ${esc(x.ville)}</span>` : ""}</span>
          <span class="prep-btns"><button class="btn dark sm" type="button" data-prep-oui="${esc(x.siret)}">Oui, envoyé</button><button class="btn ghost sm" type="button" data-prep-non="${esc(x.siret)}">Non</button></span></div>`).join("")}</div>`;
      $$("[data-prep-oui]", b).forEach((x) => x.addEventListener("click", () => { const p = J.prepares.find((y) => y.siret === x.dataset.prepOui); if (p) envoyer({ siret: p.siret, nom: p.entreprise, adresse: p.adresse, ville: p.ville }); }));
      $$("[data-prep-non]", b).forEach((x) => x.addEventListener("click", async () => { try { J = (await api("annule-prepare", { siret: x.dataset.prepNon })).jeune; majJeune(); if (S.resultats.length) renderListe(); } catch (e) { toast(e.message); } }));
    } else if (rel.length) {
      b.hidden = false;
      b.innerHTML = `<span><b>${rel.length === 1 ? "1 relance ou appel à faire" : rel.length + " relances ou appels à faire"} aujourd'hui</b> : ${rel.map((e) => esc(e.entreprise)).join(", ")}.</span> <button class="btn dark sm" type="button" id="go-suivi">Voir les messages</button>`;
      $("#go-suivi").addEventListener("click", () => showSub("suivi"));
    } else if (n < 2) {
      b.hidden = false;
      b.innerHTML = `<span><b>Commence par ton dossier</b> : ${!J.cv ? "dépose ton CV" : ""}${!J.cv && !(J.lettre || "").trim() ? " et " : ""}${!(J.lettre || "").trim() ? "colle ta lettre de motivation" : ""}. Ensuite, tu pourras écrire aux entreprises.</span>`;
    } else b.hidden = true;
  }

  $$("#v-jeune .subtabs button").forEach((b) => b.addEventListener("click", () => showSub(b.dataset.sub)));
  function showSub(name) {
    S.sub = name;
    $$("#v-jeune .subtabs button").forEach((x) => x.classList.toggle("on", x.dataset.sub === name));
    ["dossier", "chercher", "suivi"].forEach((n) => { $("#sub-" + n).hidden = n !== name; });
    if (name === "suivi") renderSuivi();
    if (name === "chercher") { renderPret(); if (map) setTimeout(() => map.invalidateSize(), 50); }
  }

  // ----- installer sur l'écran d'accueil -----
  let invitInstall = null;
  const estInstalle = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const estIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); invitInstall = e; majBoutonInstall(); });
  window.addEventListener("appinstalled", () => { invitInstall = null; majBoutonInstall(); toast("Le Kit est sur ton écran d'accueil ✓"); });
  function majBoutonInstall() { const b = $("#btn-installer"); if (b) b.hidden = estInstalle() || !(invitInstall || estIOS || /android/i.test(navigator.userAgent)); }
  $("#btn-installer").addEventListener("click", async () => {
    if (invitInstall) { invitInstall.prompt(); try { await invitInstall.userChoice; } catch (e) { /* */ } invitInstall = null; majBoutonInstall(); return; }
    ouvrirDlg(estIOS ? `<h2>Ajouter à l'écran d'accueil</h2>
      <ol class="etapes"><li>Touche le bouton <b>Partager</b> <span aria-hidden="true">⬆️</span> en bas de Safari (ou en haut à droite).</li>
      <li>Fais défiler et choisis <b>« Sur l'écran d'accueil »</b>.</li><li>Touche <b>Ajouter</b>.</li></ol>
      <p class="muted">L'icône « Kit E2C » apparaîtra sur ton téléphone, comme une application. Sur iPhone, il faut ouvrir la page dans Safari.</p>`
      : `<h2>Ajouter à l'écran d'accueil</h2>
      <ol class="etapes"><li>Ouvre le menu <b>⋮</b> de ton navigateur (en haut à droite).</li><li>Choisis <b>« Ajouter à l'écran d'accueil »</b> ou <b>« Installer l'application »</b>.</li><li>Confirme.</li></ol>
      <p class="muted">L'icône « Kit E2C » apparaîtra sur ton téléphone, comme une application.</p>`);
  });

  // ----- partager l'outil avec un camarade -----
  $("#btn-partage").addEventListener("click", () => {
    const url = `${location.origin}/pilote/?site=${J.site}`;
    const txt = `Je cherche mon stage avec le Kit de prospection de l'E2C ${J.siteNom}. Connecte-toi avec ton prénom.nom : ${url}`;
    ouvrirDlg(`<h2>Partager avec un camarade</h2>
      <p class="muted">Ton camarade scanne ce QR code avec son téléphone, puis entre son identifiant (prénom.nom).</p>
      <div class="partage-qr">${window.kpQR ? window.kpQR(url, "M") : ""}</div>
      <p class="center sm muted">${esc(url.replace(/^https?:\/\//, ""))}</p>
      <div class="row-btns partage-row">
        ${navigator.share ? `<button class="btn primary" type="button" id="pt-share">Partager…</button>` : ""}
        <a class="btn ghost" href="https://wa.me/?text=${encodeURIComponent(txt)}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="btn ghost" href="sms:?&body=${encodeURIComponent(txt)}">SMS</a>
        <button class="btn ghost" type="button" id="pt-copy">Copier le lien</button>
      </div>`, (root) => {
      const sh = $("#pt-share", root);
      if (sh) sh.addEventListener("click", () => navigator.share({ title: "Kit de prospection", text: txt, url }).catch(() => {}));
      $("#pt-copy", root).addEventListener("click", async () => { if (await copier(url)) toast("Lien copié."); });
    });
  });

  // ----- dossier -----
  function remplirDossier() {
    $$("input[name=genre]").forEach((r) => { r.checked = r.value === J.genre; });
    $("#p-typ").value = J.typ || "stage";
    $("#p-metier").value = J.metier || "";
    $("#p-libre").value = J.metierLibre || ""; $("#s-libre").value = J.metierLibre || "";
    $("#s-metier").value = J.metier || "vente";
    $("#p-metier-txt").value = libelleMetier(J.metier, J.metierLibre);
    $("#s-metier-txt").value = libelleMetier(J.metier || "vente", J.metierLibre);
    $("#rayon").value = J.rayon || 3; $("#rayon-out").textContent = (J.rayon || 3) + " km";
    $("#p-objet").value = J.objet || objetDefaut();
    $("#p-lettre").value = J.lettre || "";
    $("#p-script").value = J.script || "";
    renderCV(); etatLettre(); etatScript(); majLibre();
  }
  function renderCV() {
    const box = $("#cv-box");
    if (J.cv) {
      box.innerHTML = `<div class="cv-ok"><span class="cv-ico" aria-hidden="true">PDF</span><div><b>${esc(J.cv.nom)}</b><br><span class="muted">${taille(J.cv.taille)} · déposé ${quand(J.cv.date)}</span></div>
        <div class="cv-act"><button class="btn ghost sm" type="button" id="cv-dl">Télécharger</button><button class="btn ghost sm danger" type="button" id="cv-del">Retirer</button></div></div>`;
      $(".cv-ico").textContent = /\.pdf$/i.test(J.cv.nom) ? "PDF" : "DOC";
      $("#cv-dl").addEventListener("click", () => telecharger("cv-fichier", null, J.cv.nom).catch((e) => toast(e.message)));
      $("#cv-del").addEventListener("click", async () => {
        if (!confirmer("Retirer ce CV ?")) return;
        try { J = (await api("cv-suppr", {})).jeune; renderCV(); majJeune(); toast("CV retiré."); } catch (e) { toast(e.message); }
      });
      $("#cv-label-txt").textContent = "Remplacer mon CV";
    } else {
      box.innerHTML = `<div class="cv-vide">Pas encore de CV.</div>`;
      $("#cv-label-txt").textContent = "Déposer mon CV (PDF ou Word)";
    }
  }
  // confirmation simple sans boîte de dialogue bloquante : double clic dans les 4 s
  const confirmer = (() => { let last = 0, lastMsg = ""; return (msg) => {
    if (Date.now() - last < 4000 && lastMsg === msg) { last = 0; return true; }
    last = Date.now(); lastMsg = msg; toast(msg + " Clique encore une fois pour confirmer."); return false;
  }; })();

  // ----- images → PDF (CV en photo / capture d'écran) -----
  const estImage = (f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(f.name);
  async function decoderImage(f) {
    try { const bm = await createImageBitmap(f); return { src: bm, w: bm.width, h: bm.height, fin: () => bm.close && bm.close() }; }
    catch (e) {
      const url = URL.createObjectURL(f);
      try { const img = new Image(); img.src = url; await img.decode(); return { src: img, w: img.naturalWidth, h: img.naturalHeight, fin: () => URL.revokeObjectURL(url) }; }
      catch (e2) { URL.revokeObjectURL(url); throw new Error(/hei[cf]/i.test(f.type + f.name) ? "Photo au format HEIC impossible à ouvrir ici : fais une capture d'écran de la photo, ou règle l'appareil photo sur « Le plus compatible »." : `Je n'arrive pas à ouvrir l'image « ${f.name} ».`); }
    }
  }
  async function imageVersCanvas(f, max) {
    const im = await decoderImage(f);
    const k = Math.min(1, max / Math.max(im.w, im.h));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(im.w * k)); c.height = Math.max(1, Math.round(im.h * k));
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(im.src, 0, 0, c.width, c.height);
    im.fin(); return c;
  }
  function construirePdf(pages) {
    const enc = new TextEncoder(), parts = [], offs = []; let len = 0;
    const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push("\nendobj\n"); };
    push("%PDF-1.4\n");
    const n = pages.length;
    obj(1, () => push("<< /Type /Catalog /Pages 2 0 R >>"));
    obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(" ")}] /Count ${n} >>`));
    pages.forEach((p, i) => {
      const pn = 3 + i * 3, land = p.w > p.h * 1.15, W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89, m = 18;
      const sc = Math.min((W - 2 * m) / p.w, (H - 2 * m) / p.h), dw = p.w * sc, dh = p.h * sc;
      obj(pn, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${pn + 2} 0 R >> >> /Contents ${pn + 1} 0 R >>`));
      const c = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${((W - dw) / 2).toFixed(2)} ${((H - dh) / 2).toFixed(2)} cm /Im${i} Do Q`;
      obj(pn + 1, () => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
      obj(pn + 2, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.bytes.length} >>\nstream\n`); push(p.bytes); push("\nendstream"); });
    });
    const total = 3 + n * 3, xref = len;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let k = 1; k < total; k++) x += String(offs[k]).padStart(10, "0") + " 00000 n \n";
    push(x + `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    return new Blob(parts, { type: "application/pdf" });
  }
  async function imagesVersPdf(files) {
    let q = 0.85, max = 2000;
    for (let essai = 0; essai < 5; essai++) {
      const pages = [];
      for (const f of files) {
        const c = await imageVersCanvas(f, max);
        const b = await new Promise((ok) => c.toBlob(ok, "image/jpeg", q));
        pages.push({ w: c.width, h: c.height, bytes: new Uint8Array(await b.arrayBuffer()) });
      }
      const pdf = construirePdf(pages);
      if (pdf.size <= 2.8 * 1024 * 1024) return pdf;
      q = Math.max(0.5, q - 0.1); max = Math.round(max * 0.82);
    }
    throw new Error("Images trop lourdes, même compressées. Essaie avec moins de pages.");
  }
  const enBase64 = (blob) => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = ko; r.readAsDataURL(blob); });
  const nomFichier = () => (`CV_${J.prenom || ""}_${J.nom || ""}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9_-]+/g, "_").replace(/_+$/, "") + ".pdf";

  $("#cv-input").addEventListener("change", async (ev) => {
    const files = [...ev.target.files];
    ev.target.value = "";
    if (!files.length) return;
    const images = files.filter(estImage);
    if (images.length && images.length !== files.length) { toast("Choisis soit des photos, soit un seul fichier PDF ou Word."); return; }
    if (!images.length && files.length > 1) { toast("Un seul fichier PDF ou Word à la fois."); return; }
    if (images.length > 4) { toast("4 photos maximum (une par page)."); return; }
    const f = files[0];
    try {
      let nom = f.name, type = f.type, blob = f;
      if (images.length) {
        $("#cv-label-txt").textContent = "Création du PDF…";
        blob = await imagesVersPdf(images); nom = nomFichier(); type = "application/pdf";
      } else {
        if (f.size > 3 * 1024 * 1024) { toast("Fichier trop lourd : 3 Mo maximum."); return; }
        if (!type) type = /\.pdf$/i.test(f.name) ? "application/pdf" : /\.docx$/i.test(f.name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : /\.odt$/i.test(f.name) ? "application/vnd.oasis.opendocument.text" : /\.doc$/i.test(f.name) ? "application/msword" : "";
      }
      $("#cv-label-txt").textContent = "Envoi en cours…";
      J = (await api("cv", { nom, type, data: await enBase64(blob) })).jeune;
      renderCV(); majJeune(); toast(images.length ? `CV enregistré en PDF ✓ (${images.length} page${images.length > 1 ? "s" : ""}). Clique sur « Télécharger » pour vérifier.` : "CV enregistré ✓");
    } catch (e) { toast(e.message); renderCV(); }
  });

  function etatLettre() {
    const t = $("#p-lettre").value.trim();
    const tag = $("#lettre-etat");
    if (!t) { tag.textContent = "À compléter"; tag.className = "tag warn"; }
    else if (!/\[\s*entreprise\s*\]/i.test(t)) { tag.textContent = "Astuce : ajoute [Entreprise]"; tag.className = "tag blue"; }
    else { tag.textContent = "Prête ✓"; tag.className = "tag ok"; }
  }
  $("#p-lettre").addEventListener("input", () => { etatLettre(); planifierSave(); });
  $("#p-objet").addEventListener("input", planifierSave);
  $("#btn-insert").addEventListener("click", () => {
    const ta = $("#p-lettre"), s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s;
    ta.value = ta.value.slice(0, s) + "[Entreprise]" + ta.value.slice(e);
    ta.focus(); ta.selectionStart = ta.selectionEnd = s + 12; etatLettre(); planifierSave();
  });
  $("#btn-modele").addEventListener("click", () => {
    const ta = $("#p-lettre");
    if (ta.value.trim() && !confirmer("Remplacer ta lettre par le modèle ?")) return;
    ta.value = modeleLettre(); etatLettre(); planifierSave();
  });
  // ----- import d'une lettre (Word .docx, PDF, .odt, .txt) : le texte devient le corps de l'e-mail -----
  async function inflateRaw(u8) {
    const s = new Blob([u8]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function zipLire(buf, nom) {
    const u8 = new Uint8Array(buf), dv = new DataView(buf);
    let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error("Fichier illisible.");
    let off = dv.getUint32(e + 16, true);
    const n = dv.getUint16(e + 10, true);
    for (let i = 0; i < n; i++) {
      const meth = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      const ln = dv.getUint16(off + 28, true), lx = dv.getUint16(off + 30, true), lc = dv.getUint16(off + 32, true);
      const lo = dv.getUint32(off + 42, true);
      const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + ln));
      if (name === nom) {
        const start = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true);
        const data = u8.subarray(start, start + csize);
        return new TextDecoder().decode(meth === 0 ? data : await inflateRaw(data));
      }
      off += 46 + ln + lx + lc;
    }
    throw new Error("Fichier illisible.");
  }
  function texteXml(xml, para, tab, br, esp) {
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const out = [];
    const walk = (node, acc) => {
      for (const c of node.childNodes) {
        if (c.nodeType === 3) acc.push(c.nodeValue);
        else if (c.nodeType === 1) {
          if (c.nodeName === tab) acc.push("\t");
          else if (c.nodeName === br) acc.push("\n");
          else if (esp && c.nodeName === esp) acc.push(" ".repeat(+c.getAttribute("text:c") || 1));
          else if (c.nodeName === "w:instrText" || c.nodeName === "w:delText") { /* ignorer */ }
          else walk(c, acc);
        }
      }
    };
    for (const p of doc.getElementsByTagName("*")) {
      if (!para.includes(p.nodeName)) continue;
      if (p.parentNode && para.includes(p.parentNode.nodeName)) continue;
      const acc = []; walk(p, acc); out.push(acc.join(""));
    }
    return espacerParagraphes(out);
  }
  // une ligne vide entre les paragraphes, sauf entre lignes courtes (adresse, signature)
  function espacerParagraphes(ps) {
    ps = ps.map((x) => x.replace(/\t+/g, " ").replace(/ {2,}/g, " ").trim());
    let r = "";
    ps.forEach((x, i) => {
      if (i === 0) { r = x; return; }
      const prev = ps[i - 1];
      const ensemble = prev && x && prev.length < 50 && x.length < 50;
      r += (ensemble || !prev || !x ? "\n" : "\n\n") + x;
    });
    return r;
  }
  let pdfjsP = null;
  function chargerPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfjsP = pdfjsP || new Promise((ok, ko) => {
      const sc = document.createElement("script");
      sc.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      sc.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"; ok(window.pdfjsLib); };
      sc.onerror = () => ko(new Error("Lecture des PDF indisponible pour le moment. Essaie avec le fichier Word, ou colle le texte."));
      document.head.appendChild(sc);
    });
  }
  async function textePdf(buf) {
    const lib = await chargerPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
    const lignes = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const tc = await (await pdf.getPage(i)).getTextContent();
      let cur = null;
      for (const it of tc.items) {
        if (!("str" in it)) continue;
        const y = it.transform[5], hgt = Math.abs(it.transform[3]) || 10;
        if (!cur || Math.abs(cur.y - y) > hgt * 0.4) { cur = { y, h: hgt, t: "" }; lignes.push(cur); }
        cur.t += it.str;
        if (it.hasEOL) cur = null;
      }
      lignes.push({ y: null, t: "" });
    }
    const out = [];
    for (let i = 0; i < lignes.length; i++) {
      const l = lignes[i], prev = lignes[i - 1];
      if (prev && prev.y != null && l.y != null && prev.y - l.y > Math.max(prev.h, l.h) * 1.8) out.push("");
      out.push(l.t);
    }
    // recoller les lignes coupées d'un même paragraphe
    const paras = []; let buf2 = "";
    for (const l of out) {
      const t = l.replace(/\s+$/, "");
      if (!t.trim()) { if (buf2) paras.push(buf2); buf2 = ""; paras.push(""); continue; }
      const court = t.length < 55 || /[,.:;!?]$/.test(t) && t.length < 70;
      buf2 = buf2 ? (/[-‐]$/.test(buf2) ? buf2.slice(0, -1) + t.trim() : buf2 + " " + t.trim()) : t.trim();
      if (court) { paras.push(buf2); buf2 = ""; }
    }
    if (buf2) paras.push(buf2);
    return espacerParagraphes(paras);
  }
  // ----- lecture du texte d'une photo (OCR, dans le navigateur) -----
  let tessP = null;
  function chargerTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return tessP = tessP || new Promise((ok, ko) => {
      const sc = document.createElement("script");
      sc.src = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
      sc.onload = () => ok(window.Tesseract);
      sc.onerror = () => { tessP = null; ko(new Error("Lecture des photos indisponible pour le moment. Colle le texte de ta lettre ci-dessous.")); };
      document.head.appendChild(sc);
    });
  }
  async function ocr(canvases, prog) {
    const T = await chargerTesseract();
    let idx = 0;
    prog && prog(0);
    const worker = await T.createWorker("fra", 1, { logger: (m) => { if (prog && m.status === "recognizing text") prog(Math.round((idx + m.progress) / canvases.length * 100)); } });
    const out = [];
    try { for (idx = 0; idx < canvases.length; idx++) out.push((await worker.recognize(canvases[idx])).data.text || ""); }
    finally { worker.terminate(); }
    // recoller les lignes d'un même paragraphe
    const paras = [];
    out.join("\n\n").replace(/\r/g, "").split(/\n\s*\n/).forEach((bloc) => {
      let cur = "";
      bloc.split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => {
        if (!cur) { cur = l; return; }
        const prevCourt = cur.split("\n").pop().length < 45;
        if (prevCourt) { paras.push(cur); cur = l; }
        else cur = /[-‐]$/.test(cur) ? cur.slice(0, -1) + l : cur + " " + l;
      });
      if (cur) paras.push(cur);
      paras.push("");
    });
    return espacerParagraphes(paras.slice(0, -1)).replace(/[|]/g, "I").replace(/\s+([,.])/g, "$1");
  }
  async function pdfVersCanvas(buf) {
    const lib = await chargerPdfJs();
    const pdf = await lib.getDocument({ data: new Uint8Array(buf) }).promise, res = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
      const page = await pdf.getPage(i), vp = page.getViewport({ scale: 2 });
      const c = document.createElement("canvas"); c.width = vp.width; c.height = vp.height;
      await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise; res.push(c);
    }
    return res;
  }
  async function lireFichiersTexte(files, prog) {
    const images = files.filter(estImage);
    if (images.length) {
      if (images.length !== files.length) throw new Error("Choisis soit des photos, soit un seul fichier.");
      if (images.length > 3) throw new Error("3 photos maximum.");
      const cs = []; for (const f of images) cs.push(await imageVersCanvas(f, 2400));
      const t = nettoyerLettre(await ocr(cs, prog));
      if (t.length < 20) throw new Error("Je n'arrive pas à lire le texte de cette photo. Reprends-la bien à plat, nette et éclairée, ou colle le texte.");
      return { t, photo: true };
    }
    try { return { t: await lireFichierTexte(files[0]) }; }
    catch (e) {
      if (!e.scan) throw e;
      const t = nettoyerLettre(await ocr(await pdfVersCanvas(await files[0].arrayBuffer()), prog));
      if (t.length < 20) throw new Error("Je n'arrive pas à lire le texte de ce document. Essaie avec le fichier Word, ou colle le texte.");
      return { t, photo: true };
    }
  }
  function nettoyerLettre(t) {
    return t.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
      .replace(/\[[^\]\n]{0,40}(entreprise|soci[ée]t[ée]|structure|enseigne)[^\]\n]{0,40}\]/gi, "[Entreprise]")
      .replace(/\b(X{3,}|\.{5,}|_{4,})/g, "[Entreprise]").trim();
  }
  async function lireFichierTexte(f) {
    if (f.size > 5 * 1024 * 1024) throw new Error("Fichier trop lourd (5 Mo maximum).");
    const buf = await f.arrayBuffer(), nom = f.name.toLowerCase();
    let t;
    if (/\.docx$/.test(nom)) t = texteXml(await zipLire(buf, "word/document.xml"), ["w:p"], "w:tab", "w:br");
    else if (/\.odt$/.test(nom)) t = texteXml(await zipLire(buf, "content.xml"), ["text:p", "text:h"], "text:tab", "text:line-break", "text:s");
    else if (/\.pdf$/.test(nom)) t = await textePdf(buf);
    else if (/\.txt$/.test(nom)) t = new TextDecoder().decode(buf);
    else if (/\.doc$/.test(nom)) throw new Error("Ancien format Word (.doc) : enregistre le fichier en .docx ou en PDF, puis réessaie.");
    else throw new Error("Format non reconnu : Word (.docx), PDF ou texte.");
    t = nettoyerLettre(t);
    if (t.length < 20) { const e = new Error("Je n'arrive pas à lire le texte de ce fichier (document scanné ?). Essaie avec le fichier Word, ou colle le texte."); e.scan = /\.pdf$/.test(nom); throw e; }
    return t;
  }
  $("#script-input").addEventListener("change", async (ev) => {
    const files = [...ev.target.files]; ev.target.value = "";
    if (!files.length) return;
    const lab = $("#script-label-txt"), txt0 = lab.textContent;
    lab.textContent = "Lecture en cours…";
    try {
      const { t, photo } = await lireFichiersTexte(files, (p) => { lab.textContent = `Lecture de la photo… ${p} %`; });
      $("#p-script").value = t; etatScript(); await sauver();
      toast(photo ? "Texte lu sur la photo ✓ Relis-le bien : la lecture automatique peut faire des erreurs." : "Script importé ✓ Vérifie le texte.");
      $("#p-script").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) { toast(e.message); }
    finally { lab.textContent = txt0; }
  });
  function etatScript() {
    const tag = $("#script-etat"), ok = !!$("#p-script").value.trim();
    tag.textContent = ok ? "Prêt ✓" : "Facultatif"; tag.className = ok ? "tag ok" : "tag";
  }
  $("#p-script").addEventListener("input", () => { etatScript(); planifierSave(); });
  $("#btn-save-script").addEventListener("click", async () => { await sauver(); toast("Script enregistré ✓"); });
  $("#lettre-input").addEventListener("change", async (ev) => {
    const files = [...ev.target.files]; ev.target.value = "";
    if (!files.length) return;
    const lab = $("#lettre-label-txt"), txt0 = lab.textContent;
    lab.textContent = "Lecture en cours…";
    try {
      const { t, photo } = await lireFichiersTexte(files, (p) => { lab.textContent = `Lecture de la photo… ${p} %`; });
      const ta = $("#p-lettre");
      ta.value = t; etatLettre(); await sauver();
      toast(photo ? "Texte lu sur la photo ✓ Relis-le bien (la lecture automatique peut faire des erreurs) et ajoute [Entreprise] si besoin." : /\[Entreprise\]/.test(t) ? "Lettre importée ✓ Vérifie le texte." : "Lettre importée ✓ Vérifie le texte et ajoute [Entreprise] là où va le nom de l'entreprise.");
      ta.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) { toast(e.message); }
    finally { lab.textContent = txt0; }
  });

  function modeleLettre() {
    const f = J.genre === "F";
    return `Madame, Monsieur,

Je m'appelle ${nomComplet()} et je recherche ${article(J.typ)} dans ${domaine(J.metier)}. [Entreprise] est proche de chez moi et correspond à ce que je souhaite apprendre.

Actuellement en formation à l'École de la deuxième chance de ${J.siteNom}, je suis ${f ? "motivée" : "motivé"}, ${f ? "ponctuelle" : "ponctuel"} et ${f ? "prête" : "prêt"} à m'investir. Vous trouverez mon CV en pièce jointe. Je serais ${f ? "heureuse" : "heureux"} de vous rencontrer, ou de vous appeler au moment qui vous convient.

Je vous remercie de votre attention.

Cordialement,
${nomComplet()}`;
  }
  let saveT = null;
  function planifierSave() { $("#save-etat").textContent = "Modifications non enregistrées…"; clearTimeout(saveT); saveT = setTimeout(sauver, 1500); }
  async function sauver() {
    clearTimeout(saveT);
    const genre = ($("input[name=genre]:checked") || {}).value || "";
    try {
      J = (await api("profil", { genre, typ: $("#p-typ").value, metier: $("#p-metier").value, metierLibre: $("#p-libre").value.trim(), lettre: $("#p-lettre").value, objet: $("#p-objet").value, script: $("#p-script").value })).jeune;
      $("#save-etat").textContent = "Enregistré ✓"; majJeune();
      if ($("#p-metier").value) { $("#s-metier").value = $("#p-metier").value; $("#s-libre").value = $("#p-libre").value; $("#s-metier-txt").value = $("#p-metier-txt").value; }
    } catch (e) { $("#save-etat").textContent = "Pas enregistré : " + e.message; }
  }
  $("#btn-save").addEventListener("click", async () => { await sauver(); toast("Dossier enregistré ✓"); });
  $$("input[name=genre]").forEach((r) => r.addEventListener("change", sauver));
  $("#p-typ").addEventListener("change", () => {
    const ancien = $("#p-objet").value, defOld = objetDefaut();
    J.typ = $("#p-typ").value;
    if (!ancien || ancien === defOld || /^Candidature – /.test(ancien)) $("#p-objet").value = objetDefaut();
    sauver();
  });


  function renderPret() {
    const items = [[!!J.cv, "CV déposé"], [!!(J.lettre || "").trim(), "Lettre prête"]];
    $("#pret").innerHTML = `<div class="pret-t">Mon dossier</div>` + items.map(([ok, t]) => `<div class="pret-i ${ok ? "ok" : "ko"}">${ok ? "✓" : "!"} ${t}</div>`).join("")
      + (items.every((i) => i[0]) ? "" : `<button class="btn ghost sm" type="button" id="go-dossier">Compléter mon dossier</button>`);
    const g = $("#go-dossier"); if (g) g.addEventListener("click", () => showSub("dossier"));
  }

  // ----- recherche -----
  let map = null, layer = null;
  $("#f-search").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    lireMetier("s");
    if (!$("#s-metier").value) { toast("Écris ou choisis ton métier."); $("#s-metier-txt").focus(); return; }
    const metier = $("#s-metier").value, rayon = $("#rayon").value;
    if (metier !== J.metier || +rayon !== +J.rayon) api("profil", { metier, rayon }).then((r) => { J = r.jeune; $("#p-metier").value = J.metier; $("#p-metier-txt").value = libelleMetier(J.metier, J.metierLibre); }).catch(() => {});
    const qs = new URLSearchParams({ site: J.site, metier, rayon, sal: $("#sal").checked ? "1" : "0" });
    if (metier === "libre") {
      const mot = $("#s-libre").value.trim();
      if (mot.length < 3) { toast("Écris ton métier (au moins 3 lettres)."); $("#s-metier-txt").focus(); return; }
      qs.set("q", mot);
      if (mot !== J.metierLibre) api("profil", { metierLibre: mot }).then((r) => { J = r.jeune; }).catch(() => {});
    }
    $("#empty").hidden = true; $("#error").hidden = true; $("#res").hidden = true; $("#loading").hidden = false;
    try {
      const r = await fetch("/api/entreprises?" + qs);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erreur");
      let contacts = {};
      try { contacts = (await api("contacts-site", null, { get: true })).contacts || {}; } catch (x) { /* sans info, ordre normal */ }
      const ent = data.entreprises.map((e) => ({ ...e, contact: contacts[e.siret] || null }));
      // les entreprises déjà contactées par un camarade passent en fin de liste
      ent.sort((a, b) => (a.contact ? 1 : 0) - (b.contact ? 1 : 0) || (a.contact && b.contact ? a.contact.derniere.localeCompare(b.contact.derniere) : 0) || a.distance - b.distance);
      S.resultats = ent; S.ouvert = null; S.centre = data.site;
      renderResultats();
      if (window.innerWidth < 900) $("#res").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      $("#error").textContent = e.message || "Le registre des entreprises ne répond pas. Réessaie dans un instant.";
      $("#error").hidden = false;
    } finally { $("#loading").hidden = true; }
  });

  function renderResultats() {
    const res = S.resultats;
    $("#res").hidden = false;
    if (!res.length) {
      $("#res-title").textContent = "Aucune entreprise trouvée";
      $("#liste").innerHTML = `<li class="card empty small"><p>Augmente la distance ou décoche « salariés ».</p></li>`;
      $("#map").hidden = true; return;
    }
    $("#map").hidden = false;
    $("#res-title").textContent = `${res.length} entreprise${res.length > 1 ? "s" : ""} près du site`;
    renderMap(); renderListe();
  }
  function renderMap() {
    if (!window.L) { $("#map").hidden = true; return; }
    if (!map) {
      map = L.map("map", { scrollWheelZoom: false });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    }
    if (layer) layer.remove();
    layer = L.layerGroup().addTo(map);
    const pts = [];
    if (S.centre) {
      L.marker([S.centre.lat, S.centre.lon], { icon: L.divIcon({ className: "pin-site", iconSize: [22, 22] }), title: "Site E2C" }).bindTooltip("Site E2C (approx.)").addTo(layer);
      pts.push([S.centre.lat, S.centre.lon]);
    }
    S.resultats.forEach((e, i) => {
      const m = L.marker([e.lat, e.lon], { icon: L.divIcon({ className: "pin" + (S.ouvert === e.siret ? " on" : ""), html: String(i + 1), iconSize: [26, 26] }) }).bindTooltip(esc(e.nom)).addTo(layer);
      m.on("click", () => ouvrir(e.siret, true));
      pts.push([e.lat, e.lon]);
    });
    map.fitBounds(pts, { padding: [24, 24], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 60);
  }
  function renderListe() {
    const parSiret = new Map(J.envois.map((e) => [e.siret, e]));
    // « terminé » : envoyé par e-mail, ou appel conclu (pas « à rappeler », pas CV à envoyer en attente)
    const fini = (siret) => { const x = parSiret.get(siret); if (!x) return false;
      if (x.statut === "À rappeler") return false;
      if (x.canal === "appel" && x.statut === "Envoyé") return false; // CV promis par e-mail, pas encore envoyé
      return true; };
    const deja = new Set([...parSiret.keys()].filter(fini));
    const premierContact = S.resultats.findIndex((x) => x.contact && !deja.has(x.siret));
    $("#liste").innerHTML = S.resultats.map((e, i) => {
      const q = encodeURIComponent(`${e.nom} ${e.adresse}`);
      const open = S.ouvert === e.siret, sent = deja.has(e.siret);
      return `${i === premierContact && i > 0 ? `<li class="sep-contact">Entreprises déjà contactées récemment par d'autres stagiaires : à tenter en dernier.</li>` : ""}<li class="ent${open ? " open" : ""}${e.contact && !sent ? " contactee" : ""}" id="e-${e.siret}">
        <div class="ent-top">
          <div class="ent-main"><span class="ent-n">${i + 1}</span>
            <div><h3>${esc(e.nom)}</h3><div class="addr">${esc(e.adresse)}</div>
              <div class="chips"><span class="chip dist">${e.distance} km</span>${e.effectif ? `<span class="chip">${esc(e.effectif)}</span>` : ""}${e.contact && !sent ? `<span class="chip deja">Déjà contactée par ${e.contact.n > 1 ? e.contact.n + " stagiaires" : "un stagiaire"} de l'E2C ${quandJour(e.contact.derniere)}</span>` : ""}</div></div>
          </div>
          ${!sent && (J.prepares || []).some((x) => x.siret === e.siret) ? `<span class="chip prep">Préparé · envoyé ?</span>` : ""}
          ${sent ? `<span class="btn done">${/appel/.test((parSiret.get(e.siret) || {}).canal || "") && !/email/.test(parSiret.get(e.siret).canal) ? "Appelé ✓" : "Envoyé ✓"}</span>`
            : `<button class="btn ${open ? "ghost" : "dark"}" data-ecrire="${e.siret}" type="button">${open ? "Fermer" : (parSiret.get(e.siret) || {}).statut === "À rappeler" ? "Rappeler" : (parSiret.get(e.siret) || {}).canal === "appel" ? "Envoyer le CV" : "Contacter"}</button>`}
        </div>
        <div class="links">
          <a class="btn ghost sm maps-btn" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">📍 Google Maps</a>
          <a href="https://www.google.com/maps/dir/?api=1&destination=${q}" target="_blank" rel="noopener">Itinéraire</a>
          <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Trouver le site / contact</a>
          <a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}" target="_blank" rel="noopener">Fiche officielle</a>
        </div>
        ${open && !sent ? panneau(e) : ""}
      </li>`;
    }).join("");
    $$("[data-ecrire]").forEach((b) => b.addEventListener("click", () => ouvrir(b.dataset.ecrire)));
    bindPanneau();
  }

  function corpsPour(e) {
    const l = (J.lettre || "").trim();
    if (!l) return modeleLettre().replace(/\[\s*entreprise\s*\]/gi, e.nom);
    return l.replace(/\[\s*entreprise\s*\]/gi, e.nom).replace(/\[\s*ville\s*\]/gi, e.ville || "");
  }
  function panneau(e) {
    const sansLettre = !(J.lettre || "").trim();
    const modeTel = S.mode === "tel";
    const q = encodeURIComponent(`${e.nom} ${e.adresse}`);
    const script = (J.script || "").replace(/\[\s*entreprise\s*\]/gi, e.nom);
    return `<div class="msg">
      <div class="vues canal" role="tablist" aria-label="Comment contacter">
        <button role="tab" type="button" data-mode="email" class="${modeTel ? "" : "on"}" aria-selected="${!modeTel}">✉️ Par e-mail</button>
        <button role="tab" type="button" data-mode="tel" class="${modeTel ? "on" : ""}" aria-selected="${modeTel}">📞 Par téléphone</button>
      </div>
      <div class="tel-zone" ${modeTel ? "" : "hidden"}>
        <div class="step"><i>1</i>Trouve le numéro</div>
        <a class="btn ghost big" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Voir le numéro sur Google Maps</a>
        <label class="step" for="tel-${e.siret}"><i>✎</i>Numéro trouvé (facultatif)</label>
        <div class="tel-row"><input id="tel-${e.siret}" class="obj" type="tel" inputmode="tel" placeholder="01 23 45 67 89"><a class="btn primary" id="call-${e.siret}" href="#" aria-disabled="true">Appeler</a></div>
        <div class="step"><i>2</i>Ton script d'appel</div>
        ${script.trim() ? `<pre class="script">${esc(script)}</pre>` : `<p class="alert soft">Ton script d'appel n'est pas encore dans ton dossier. Prépare-le avec ton formateur, puis <a href="#" data-go-dossier>ajoute-le</a>.</p>`}
        <div class="step"><i>3</i>Comment s'est passé l'appel ?</div>
        <div class="resultats">
          <button class="btn primary" type="button" data-appel="entretien">Entretien obtenu 🎉</button>
          <button class="btn dark" type="button" data-appel="cv">Envoyer mon CV par e-mail</button>
          <button class="btn ghost" type="button" data-appel="rappeler">Rappeler plus tard</button>
          <button class="btn ghost" type="button" data-appel="refus">Pas intéressé</button>
        </div>
        <p class="hint">« Envoyer mon CV par e-mail » : note l'adresse qu'on te donne, l'onglet e-mail s'ouvre avec ta lettre prête.</p>
      </div>
      <div class="mail-zone" ${modeTel ? "hidden" : ""}>
      ${sansLettre ? `<p class="alert soft">Ta lettre n'est pas encore dans ton dossier : voici un message type. <a href="#" data-go-dossier>Ajouter ma lettre</a></p>` : ""}
      <label class="step" for="obj-${e.siret}"><i>✎</i>Objet</label>
      <input id="obj-${e.siret}" class="obj" value="${esc(J.objet || objetDefaut())}">
      <label class="step" for="txt-${e.siret}"><i>✎</i>Ta lettre pour ${esc(e.nom)} (tu peux la modifier)</label>
      <textarea id="txt-${e.siret}">${esc(corpsPour(e))}</textarea>
      <div class="step"><i>1</i>Copie ta lettre</div>
      <button class="btn primary big" type="button" data-copier="${e.siret}">Copier la lettre</button>
      <div class="step"><i>2</i>Ouvre ta messagerie : l'objet et la lettre sont déjà dedans</div>
      <div class="mail-btns">
        <a class="btn ghost" data-mail="gmail" target="_blank" rel="noopener">Gmail</a>
        <a class="btn ghost" data-mail="outlook" target="_blank" rel="noopener">Outlook</a>
        <a class="btn ghost" data-mail="autre">Autre messagerie</a>
      </div>
      <label class="step" for="to-${e.siret}"><i>@</i>Adresse e-mail de l'entreprise (si tu l'as)</label>
      <input id="to-${e.siret}" class="obj" type="email" inputmode="email" placeholder="contact@entreprise.fr">
      <p class="hint">Si la lettre n'apparaît pas dans ta messagerie, colle-la (Ctrl + V). L'adresse est souvent sur le site de l'entreprise (« Trouver le site / contact ») ; sinon, appelle pour la demander.</p>
      <div class="step"><i>3</i>Joins ton CV au message</div>
      ${J.cv ? `<button class="btn ghost big" type="button" data-cv>Télécharger mon CV (${esc(J.cv.nom)})</button>
        <p class="hint">Dans ta messagerie, clique sur le trombone 📎 et choisis ce fichier (dossier « Téléchargements »).</p>`
        : `<p class="alert soft">Tu n'as pas encore déposé de CV. <a href="#" data-go-dossier>Déposer mon CV</a></p>`}
      <div class="envoi-zone" id="zone-${e.siret}">
        <div class="step"><i>4</i>C'est envoyé ?</div>
        <p class="rappel-clic" hidden>⚠️ N'oublie pas : quand ton e-mail est parti, clique ici. Sinon tu risques d'écrire deux fois à la même entreprise.</p>
        <button class="btn dark big" type="button" data-envoye="${e.siret}">J'ai envoyé ma candidature</button>
      </div>
      </div>
    </div>`;
  }
  function bindPanneau() {
    const e = S.resultats.find((x) => x.siret === S.ouvert);
    if (!e) return;
    const ta = $(`#txt-${e.siret}`), obj = $(`#obj-${e.siret}`);
    if (!ta) return;
    const to = $(`#to-${e.siret}`);
    if (S.emailPour && S.emailPour.siret === e.siret) to.value = S.emailPour.email || "";
    const majLiens = () => { const l = mailLinks(obj.value, ta.value, to.value); $$("[data-mail]").forEach((a) => { a.href = l[a.dataset.mail]; }); };
    majLiens();
    ta.addEventListener("input", majLiens); obj.addEventListener("input", majLiens); to.addEventListener("input", majLiens);
    // onglets e-mail / téléphone
    $$("[data-mode]").forEach((b) => b.addEventListener("click", () => {
      S.mode = b.dataset.mode;
      $$("[data-mode]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", String(x === b)); });
      $(".tel-zone").hidden = S.mode !== "tel"; $(".mail-zone").hidden = S.mode === "tel";
    }));
    const tel = $(`#tel-${e.siret}`), call = $(`#call-${e.siret}`);
    const majTel = () => { const n = tel.value.replace(/[^\d+]/g, ""); call.href = n.length >= 6 ? "tel:" + n : "#"; call.setAttribute("aria-disabled", String(n.length < 6)); call.classList.toggle("off", n.length < 6); };
    tel.addEventListener("input", majTel); majTel();
    call.addEventListener("click", (ev) => { if (call.getAttribute("aria-disabled") === "true") { ev.preventDefault(); toast("Écris d'abord le numéro (sur Google Maps)."); } });
    $$("[data-appel]").forEach((b) => b.addEventListener("click", async () => {
      const r = b.dataset.appel;
      if (r === "cv") {
        ouvrirDlg(`<h2>Envoyer ton CV par e-mail</h2><p class="muted">Quelle adresse t'a-t-on donnée ?</p>
          <label>Adresse e-mail <input id="cv-mail" type="email" inputmode="email" placeholder="contact@entreprise.fr"></label>
          <button class="btn primary big" type="button" id="cv-mail-ok">Préparer l'e-mail</button>`, (root) => {
          $("#cv-mail-ok", root).addEventListener("click", async () => {
            const email = $("#cv-mail", root).value.trim();
            try {
              J = (await api("appel", { siret: e.siret, entreprise: e.nom, adresse: e.adresse, ville: e.ville, resultat: "cv", tel: tel.value })).jeune;
              dlg.close(); S.mode = "email"; S.emailPour = { siret: e.siret, email };
              renderListe(); toast("Appel noté ✓ Prépare maintenant ton e-mail.");
              // réouvrir le panneau de cette entreprise en mode e-mail
              S.ouvert = e.siret; renderListe(); const li = $("#e-" + e.siret); if (li) li.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (x) { toast(x.message); }
          });
        });
        return;
      }
      try {
        J = (await api("appel", { siret: e.siret, entreprise: e.nom, adresse: e.adresse, ville: e.ville, resultat: r, tel: tel.value })).jeune;
        S.ouvert = null; majJeune(); renderListe(); renderMap();
        toast({ entretien: "Bravo ! Entretien noté dans ton suivi 🎉", rappeler: "Noté : on te rappellera de rappeler dans 2 jours.", refus: "Noté. Courage, passe à la suivante !" }[r]);
      } catch (x) { toast(x.message); }
    }));
    $$("[data-go-dossier]").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); showSub("dossier"); }));
    const preparer = () => {
      S.attente = { siret: e.siret, t: Date.now() };
      const z = $("#zone-" + e.siret);
      if (z) { z.classList.add("a-confirmer"); $(".rappel-clic", z).hidden = false; }
      if (!(J.prepares || []).some((x) => x.siret === e.siret)) {
        api("prepare", { siret: e.siret, entreprise: e.nom, adresse: e.adresse, ville: e.ville }).then((r) => { J = r.jeune; }).catch(() => {});
      }
    };
    $$("[data-mail]").forEach((a) => a.addEventListener("click", preparer));
    $(`[data-copier="${e.siret}"]`).addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      preparer();
      const ok = await copier(ta.value);
      btn.textContent = ok ? "Lettre copiée ✓" : "Sélectionne le texte et fais Ctrl + C";
      if (ok) toast("Lettre copiée. Colle-la dans ta messagerie si besoin (Ctrl + V).");
    });
    const cvb = $("[data-cv]");
    if (cvb) cvb.addEventListener("click", () => telecharger("cv-fichier", null, J.cv.nom).then(() => toast("CV téléchargé : joins-le au message.")).catch((x) => toast(x.message)));
    $(`[data-envoye="${e.siret}"]`).addEventListener("click", async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true;
      if (!(await envoyer(e))) btn.disabled = false;
    });
  }
  // confirmation d'envoi (bouton, question au retour, ou bandeau)
  async function envoyer(e) {
    try {
      const toEl = $(`#to-${e.siret}`);
      J = (await api("envoi", { siret: e.siret, entreprise: e.nom, adresse: e.adresse, ville: e.ville, email: toEl ? toEl.value.trim() : "" })).jeune;
      if (S.attente && S.attente.siret === e.siret) S.attente = null;
      if (S.ouvert === e.siret) S.ouvert = null;
      majJeune();
      if (S.resultats.length && !$("#sub-chercher").hidden) { renderListe(); renderMap(); }
      const env = J.envois.find((x) => x.siret === e.siret);
      const li = $("#e-" + e.siret);
      if (li && env) li.insertAdjacentHTML("beforeend", `<div class="rappel-ok"><b>Bravo, c'est noté !</b> Ajoute le rappel de relance dans ton agenda (le ${fr(env.relance)}) : ${liensAgenda(evRelance(env), "relance-" + e.siret)}</div>`);
      toast("C'est noté ✓ Ajouté à « Mon suivi ».");
      return true;
    } catch (x) { toast(x.message); return false; }
  }
  // au retour dans l'onglet après avoir ouvert sa messagerie : « as-tu envoyé ? »
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !J || !S.attente) return;
    if (Date.now() - S.attente.t < 4000 || dlg.open) return;
    const a = S.attente;
    if (J.envois.some((x) => x.siret === a.siret)) { S.attente = null; return; }
    const e = S.resultats.find((x) => x.siret === a.siret) || (() => { const p = (J.prepares || []).find((x) => x.siret === a.siret); return p && { siret: p.siret, nom: p.entreprise, adresse: p.adresse, ville: p.ville }; })();
    if (!e) return;
    ouvrirDlg(`<h2>As-tu envoyé ta candidature ?</h2>
      <p>Entreprise : <b>${esc(e.nom)}</b></p>
      <p class="muted">Si tu l'as envoyée, dis-le maintenant : on la notera dans ton suivi et on te rappellera de relancer dans 7 jours.</p>
      <div class="row-btns"><button class="btn primary big" type="button" id="q-oui">Oui, c'est envoyé</button><button class="btn ghost big" type="button" id="q-non">Pas encore</button></div>`, (root) => {
      $("#q-oui", root).addEventListener("click", async () => { dlg.close(); await envoyer(e); });
      $("#q-non", root).addEventListener("click", () => { dlg.close(); S.attente.t = Date.now(); });
    });
  });
  function ouvrir(siret, depuisCarte) {
    S.ouvert = S.ouvert === siret ? null : siret;
    const x = J.envois.find((y) => y.siret === siret);
    if (S.ouvert && x) S.mode = x.statut === "À rappeler" ? "tel" : "email";
    renderListe(); renderMap();
    const el = $("#e-" + siret);
    if (el && (depuisCarte || S.ouvert)) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ----- suivi -----
  function messageRelance(e) {
    const f = J.genre === "F";
    return `Madame, Monsieur,

Le ${fr(e.envoye)}, je vous ai envoyé ma candidature pour ${article(e.typ || J.typ)} chez ${e.entreprise}. Je me permets de revenir vers vous : je suis toujours très ${f ? "intéressée" : "intéressé"} et ${f ? "disponible" : "disponible"} pour un entretien ou un échange téléphonique.

Je vous remercie par avance pour votre réponse.

Cordialement,
${nomComplet()}`;
  }
  function renderSuivi() {
    const env = J.envois, t = todayIso();
    const rel = env.filter((e) => e.statut === "Envoyé" && e.relance && e.relance <= t && e.canal !== "appel");
    const rappels = env.filter((e) => e.statut === "À rappeler" && e.relance && e.relance <= t);
    $("#k-env").textContent = env.length;
    $("#k-rep").textContent = env.filter((e) => REPONSES.includes(e.statut)).length;
    $("#k-rel").textContent = rel.length + rappels.length;
    $("#suivi-vide").hidden = env.length > 0;
    $("#suivi-table").hidden = env.length === 0;
    const q = evQuotidien();
    $("#rappel-quotidien .rq-liens").innerHTML = `<a class="btn ghost" href="${gcal(q)}" target="_blank" rel="noopener">Google Agenda</a><a class="btn ghost" href="${ics(q)}" download="rappel-candidatures.ics">Autre agenda</a>`;
    $("#suivi-table tbody").innerHTML = env.slice().reverse().map((e) => {
      const arel = ["Envoyé", "À rappeler"].includes(e.statut) && e.relance && e.relance <= t;
      const ic = /appel/.test(e.canal || "") ? (/email/.test(e.canal) ? "📞✉️" : "📞") : "✉️";
      return `<tr>
        <td><span title="${/appel/.test(e.canal || "") ? "Appel" : "E-mail"}">${ic}</span> <b>${esc(e.entreprise)}</b>${e.tel ? ` <a class="sm" href="tel:${esc(e.tel.replace(/[^\d+]/g, ""))}">${esc(e.tel)}</a>` : ""}${e.ville ? `<br><span class="muted sm">${esc(e.ville)}</span>` : ""}${arel ? ` <span class="tag warn">${e.statut === "À rappeler" ? "À rappeler" : "À relancer"}</span>` : ""}</td>
        <td>${fr(e.envoye)}</td>
        <td>${e.relanceFaite ? "Faite le " + fr(e.relanceFaite) : fr(e.relance)}</td>
        <td><select data-statut="${esc(e.siret)}" aria-label="Statut pour ${esc(e.entreprise)}">${STATUTS.map((s) => `<option${s === e.statut ? " selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="sm nowrap">${["Envoyé", "À rappeler"].includes(e.statut) && e.relance ? liensAgenda(evRelance(e), "relance-" + e.siret) : "—"}</td>
      </tr>`;
    }).join("");
    $$("[data-statut]").forEach((s) => s.addEventListener("change", async () => {
      try { J = (await api("statut", { siret: s.dataset.statut, statut: s.value })).jeune; majJeune(); renderSuivi(); toast("Statut mis à jour."); }
      catch (e) { toast(e.message); }
    }));
    $("#relances").hidden = rel.length === 0;
    $("#relances-liste").innerHTML = rel.map((e) => {
      const txt = messageRelance(e);
      const l = mailLinks(`Relance – candidature de ${nomComplet()}`, txt);
      return `<details class="rel"><summary>Relancer ${esc(e.entreprise)}</summary>
        <pre>${esc(txt)}</pre>
        <div class="row"><button class="btn primary" type="button" data-copy-rel="${esc(txt)}">Copier</button>
        <a class="btn ghost" href="${l.gmail}" target="_blank" rel="noopener">Gmail</a>
        <a class="btn ghost" href="${l.outlook}" target="_blank" rel="noopener">Outlook</a>
        <a class="btn ghost" href="${l.autre}">Autre</a>
        <button class="btn dark" type="button" data-relance-faite="${esc(e.siret)}">J'ai relancé</button></div></details>`;
    }).join("");
    $$("[data-copy-rel]").forEach((b) => b.addEventListener("click", async () => { if (await copier(b.dataset.copyRel)) { b.textContent = "Copié ✓"; toast("Relance copiée."); } }));
    $$("[data-relance-faite]").forEach((b) => b.addEventListener("click", async () => {
      try { J = (await api("statut", { siret: b.dataset.relanceFaite, statut: "Relancé" })).jeune; majJeune(); renderSuivi(); toast("Relance notée ✓"); }
      catch (e) { toast(e.message); }
    }));
  }

  // =====================================================================
  // ESPACE ÉQUIPE
  // =====================================================================
  let ME = null;
  const E = { site: "tous", jeunes: [] };
  const siteCourant = () => (E.site === "tous" ? (ME.sites.length === 1 ? ME.sites[0][0] : null) : E.site);

  function startEquipe(me) {
    ME = me; E.filtreInit = false;
    vue("equipe");
    $("#who-txt").textContent = `${ME.nom} · ${ME.roleNom}`;
    $("#e-titre").textContent = ME.sites.length > 1 ? "Les sites en un coup d'œil." : `E2C ${ME.sites[0][1]} : le groupe en un coup d'œil.`;
    $("#e-sous").textContent = "Qui avance, qui relance, qui n'a encore rien envoyé.";
    $("#btn-equipe").hidden = !ME.gere;
    majDemandes();
    E.site = ME.sites.length > 1 ? "tous" : ME.sites[0][0];
    const nav = $("#e-sites");
    nav.hidden = ME.sites.length < 2;
    nav.innerHTML = (ME.sites.length > 1 ? `<button data-site="tous" class="on">Tous les sites</button>` : "") + ME.sites.map(([v, l]) => `<button data-site="${v}">${l}</button>`).join("");
    $$("button", nav).forEach((b) => b.addEventListener("click", () => { E.site = b.dataset.site; $$("button", nav).forEach((x) => x.classList.toggle("on", x === b)); $("#st-groupe").value = ""; chargerJeunes(); if (E.vue === "stats") chargerStats(); }));
    montrerVue("liste");
    chargerJeunes();
  }

  async function chargerJeunes() {
    $("#c-table tbody").innerHTML = `<tr><td colspan="8" class="muted">Chargement…</td></tr>`;
    try {
      const r = await api("jeunes", E.site === "tous" ? {} : { site: E.site }, { get: true });
      E.jeunes = r.jeunes; remplirFiltres(); renderEquipe();
    } catch (e) { $("#c-table tbody").innerHTML = `<tr><td colspan="8">${esc(e.message)}</td></tr>`; }
  }
  const normTxt = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
  const memeNom = (a, b) => { const k = (x) => normTxt(x).split(/[ -]/).filter(Boolean).sort().join(" "); return !!a && k(a) === k(b); };
  function remplirFiltres() {
    const g = $("#f-groupe"), f = $("#f-form"), gv = g.value, fv = f.value;
    const groupes = [...new Set(E.jeunes.map((j) => (j.groupe || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    const forms = [...new Set(E.jeunes.map((j) => (j.formateur || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));
    g.innerHTML = `<option value="">Tous les groupes</option>` + groupes.map((x) => `<option${x === gv ? " selected" : ""}>${esc(x)}</option>`).join("");
    f.innerHTML = `<option value="">Tous les formateurs</option>` + forms.map((x) => `<option${x === fv ? " selected" : ""}>${esc(x)}</option>`).join("");
    if (!E.filtreInit && ME.role === "formateur") { // un formateur voit d'abord ses jeunes
      const mien = forms.find((x) => memeNom(x, ME.nom));
      if (mien) f.value = mien;
      E.filtreInit = true;
    }
  }
  ["#f-q", "#f-groupe", "#f-form"].forEach((sel) => $(sel).addEventListener("input", () => renderEquipe()));
  function jeunesFiltres() {
    const q = normTxt($("#f-q").value), g = $("#f-groupe").value, f = $("#f-form").value;
    return E.jeunes.filter((j) => (!g || (j.groupe || "").trim() === g) && (!f || (j.formateur || "").trim() === f)
      && (!q || normTxt(`${j.prenom} ${j.nom} ${j.ident} ${j.groupe} ${j.formateur} ${j.code}`).includes(q)));
  }
  function renderEquipe() {
    const js = jeunesFiltres(), multi = E.site === "tous" && ME.sites.length > 1;
    const vrais = js.filter((j) => !j.test);
    const sum = (k) => vrais.reduce((a, j) => a + j[k], 0);
    $("#c-jeunes").textContent = vrais.length; $("#c-env").textContent = sum("envois"); $("#c-rep").textContent = sum("reponses"); $("#c-rel").textContent = sum("aRelancer");
    $("#c-table").classList.toggle("sans-site", !multi);
    $("#c-vide").hidden = js.length > 0; $("#c-table").hidden = js.length === 0;
    $("#c-vide p").textContent = E.jeunes.length ? "Aucun jeune ne correspond à ces filtres." : "Aucun jeune pour le moment. Cliquez sur « + Ajouter des jeunes ».";
    const sans = vrais.filter((j) => j.envois === 0);
    $("#c-alerte").hidden = !sans.length || !js.length;
    $("#c-alerte").textContent = sans.length === vrais.length ? "Personne n'a encore envoyé de candidature." : `Pas encore d'envoi : ${sans.map((j) => j.prenom + " " + (j.nom || "").slice(0, 1) + ".").join(", ")} — un coup de main peut être utile.`;
    E.vus = js;
    $("#c-table tbody").innerHTML = js.map((j, i) => `<tr data-i="${i}" tabindex="0" class="${j.envois === 0 && !j.test ? "flag" : ""}">
      <td><b>${esc(j.prenom)} ${esc(j.nom)}</b>${j.test ? ` <span class="tag blue">Compte test</span>` : ""}<br><span class="muted sm">${esc(j.ident)}${j.groupe ? " · gr. " + esc(j.groupe) : ""}${j.formateur ? " · " + esc(j.formateur) : ""}</span></td>
      <td class="col-site">${esc(SITES[j.site])}</td>
      <td>${esc(j.metier === "libre" ? (j.metierLibre || "Autre") : (metierLabel(j.metier) || "—"))}</td>
      <td class="nowrap"><span class="tag ${j.cv ? "ok" : "bad"}">CV</span> <span class="tag ${j.lettre ? "ok" : "bad"}">Lettre</span></td>
      <td class="num">${j.envois}</td><td class="num">${j.reponses}</td>
      <td class="num">${j.envois === 0 ? `<span class="tag bad">Aucun envoi</span>` : j.aRelancer ? `<span class="tag warn">${j.aRelancer}</span>` : "0"}</td>
      <td class="sm">${quand(j.derniere)}</td></tr>`).join("");
    $$("#c-table tbody tr[data-i]").forEach((tr) => {
      const go = () => ouvrirJeune(E.vus[+tr.dataset.i]);
      tr.addEventListener("click", go); tr.addEventListener("keydown", (ev) => { if (ev.key === "Enter") go(); });
    });
  }

  // ----- statistiques -----
  E.vue = "liste";
  $$(".vues button").forEach((b) => b.addEventListener("click", () => montrerVue(b.dataset.vue)));
  function montrerVue(v) {
    E.vue = v;
    $$(".vues button").forEach((b) => { b.classList.toggle("on", b.dataset.vue === v); b.setAttribute("aria-selected", String(b.dataset.vue === v)); });
    $("#e-liste").hidden = v !== "liste"; $("#e-stats").hidden = v !== "stats";
    if (v === "stats") chargerStats();
  }
  $("#st-groupe").addEventListener("change", () => chargerStats());
  $("#st-export").addEventListener("click", () => $("#btn-export").click());
  async function chargerStats() {
    const body = $("#st-body");
    body.innerHTML = `<div class="card empty small"><p>Calcul des statistiques…</p></div>`;
    try {
      const q = {}; if (E.site !== "tous") q.site = E.site; if ($("#st-groupe").value) q.groupe = $("#st-groupe").value;
      const r = await api("stats", q, { get: true });
      remplirGroupesStats();
      renderStats(r.stats, E.site === "tous" && ME.sites.length > 1);
    } catch (e) { body.innerHTML = `<div class="card alert">${esc(e.message)}</div>`; }
  }
  function remplirGroupesStats() {
    const sel = $("#st-groupe"), v = sel.value;
    const gs = [...new Set(E.jeunes.map((j) => (j.groupe || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr", { numeric: true }));
    sel.innerHTML = `<option value="">Tous les groupes</option>` + gs.map((g) => `<option${g === v ? " selected" : ""}>${esc(g)}</option>`).join("");
    sel.hidden = gs.length < 2;
  }
  const P = (x) => (x == null ? "—" : x + " %");
  const JRS = (x) => (x == null ? "—" : x + (x === 1 ? " jour" : " jours"));
  function tile(val, label, part, total, sous, liste) {
    const pc = total ? Math.round((part / total) * 100) : null;
    return `<div class="tile${liste ? " clic" : ""}"${liste ? ` data-liste="${liste}" role="button" tabindex="0" aria-label="${esc(label)} : voir qui"` : ""}><b>${val}${sous ? `<small>${sous}</small>` : ""}</b><span>${label}</span>${pc != null ? `<div class="jauge" role="img" aria-label="${pc} %"><i style="width:${pc}%"></i></div>` : ""}</div>`;
  }
  function barres(titre, sous, data, cle, couleur, unite) {
    const max = Math.max(1, ...data.map((d) => d[cle]));
    const iMax = data.reduce((m, d, i) => (d[cle] > data[m][cle] ? i : m), 0), last = data.length - 1;
    const lab = (d) => new Date(d.semaine + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
    return `<div class="chart"><h3>${titre}</h3><p class="muted">${sous}</p>
      <div class="bars">${data.map((d, i) => `<div class="bar" tabindex="0" aria-label="Semaine du ${lab(d)} : ${d[cle]} ${unite}">
        ${(i === iMax || i === last) && d[cle] ? `<em style="bottom:${(d[cle] / max) * 100}%">${d[cle]}</em>` : ""}
        <i style="height:${(d[cle] / max) * 100}%;background:${couleur}"></i><span class="tip">Semaine du ${lab(d)} : <b>${d[cle]}</b> ${unite}</span></div>`).join("")}</div>
      <div class="axe">${data.map((d) => `<span>${lab(d)}</span>`).join("")}</div></div>`;
  }
  function tableau(titre, cols, rows) {
    if (!rows.length) return "";
    return `<div class="card st-sec"><h2>${titre}</h2><div class="table-wrap"><table class="st-table"><thead><tr>${cols.map((c) => `<th class="${c[2] || ""}">${c[0]}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td class="${c[2] || ""}">${c[1](r)}</td>`).join("")}</tr>`).join("")}</tbody></table></div></div>`;
  }
  const LISTES = {
    connecte: ["Connectés au moins une fois", "Pas encore connectés", (j) => j.connecte],
    dossier: ["Dossier complet", "Dossier incomplet", (j) => j.cv && j.lettre],
    actif7: ["Actifs ces 7 derniers jours", "Pas actifs cette semaine", (j) => j.actif7],
    envoi: ["Ont envoyé au moins une candidature", "Aucune candidature", (j) => j.envois > 0],
    trouve: ["Ont trouvé", "Pas encore", (j) => j.pris > 0],
  };
  function ouvrirListe(cle) {
    const [oui, non, f] = LISTES[cle], g = $("#st-groupe").value;
    const js = E.jeunes.filter((j) => !g || (j.groupe || "").trim() === g);
    const a = js.filter(f), b = js.filter((j) => !f(j));
    const col = (titre, l) => `<div><h3>${titre} <span class="muted">(${l.length})</span></h3>${l.length ? `<ul class="liste-noms">${l.map((j) => `<li><a href="#" data-k="${esc(j.key)}">${esc(j.prenom)} ${esc(j.nom)}</a> <span class="muted sm">${E.site === "tous" && ME.sites.length > 1 ? esc(SITES[j.site]) + " · " : ""}${j.groupe ? "gr. " + esc(j.groupe) : ""}${cle === "dossier" && !f(j) ? " · manque " + [!j.cv && "CV", !j.lettre && "lettre"].filter(Boolean).join(" et ") : ""}</span></li>`).join("")}</ul>` : `<p class="muted">Personne.</p>`}</div>`;
    ouvrirDlg(`<h2>${oui}</h2><div class="deux-col">${col(oui, a)}${col(non, b)}</div>`, (root) => {
      $$("[data-k]", root).forEach((x) => x.addEventListener("click", (ev) => { ev.preventDefault(); const j = E.jeunes.find((y) => y.key === x.dataset.k); if (j) ouvrirJeune(j); }));
    });
  }
  async function chargerActiviteEquipe() {
    const box = $("#st-equipe"); if (!box) return;
    try {
      const r = await api("activite-equipe", null, { get: true });
      const actifs = r.equipe.filter((m) => m.codePerso || m.connecte).length;
      box.innerHTML = `<h2>Utilisation par l'équipe <span class="tag blue">visible par vous seul</span></h2>
        <p class="muted">${actifs} personne(s) sur ${r.equipe.length} se sont déjà connectées ou ont choisi leur code. Les connexions sont comptées depuis le 28/10 ; « Son propre code » indique qui a activé son lien ou changé de code.</p>
        <div class="table-wrap"><table class="st-table"><thead><tr><th>Personne</th><th>Site</th><th>Son propre code</th><th>Dernière connexion</th><th class="num">Jours actifs (7 j)</th><th class="num">Jours actifs (30 j)</th></tr></thead>
        <tbody>${r.equipe.map((m) => `<tr><td><b>${esc(m.nom)}</b><br><span class="muted sm">${esc(m.role)}</span></td><td>${esc(m.site)}</td>
          <td>${m.codePerso ? `<span class="tag ok">Oui</span>` : `<span class="tag warn">Code de la carte</span>`}</td>
          <td>${m.derniere ? quand(m.derniere) : "—"}</td><td class="num">${m.jours7}</td><td class="num">${m.jours30}</td></tr>`).join("")}</tbody></table></div>`;
    } catch (e) { box.innerHTML = `<h2>Utilisation par l'équipe</h2><p class="muted">${esc(e.message)}</p>`; }
  }
  function renderStats(st, multi) {
    const A = st.adoption, C = st.activite, R = st.resultats;
    $("#st-maj").textContent = `Chiffres au ${new Date(st.aujourdhui + "T12:00:00").toLocaleDateString("fr-FR")} · ${multi ? "tous les sites" : "E2C " + (SITES[E.site] || ME.sites[0][1])}${$("#st-groupe").value ? " · groupe " + $("#st-groupe").value : ""}`;
    if (!A.jeunes) {
      $("#st-body").innerHTML = `<div class="card empty small"><p>Aucun jeune dans cette sélection.</p></div>` + (ME.role === "admin" ? `<div class="card st-sec" id="st-equipe"><h2>Utilisation par l'équipe</h2><p class="muted">Chargement…</p></div>` : "");
      if (ME.role === "admin") chargerActiviteEquipe();
      return;
    }
    const grp = (g) => `<b>${esc(g.nom)}</b>`;
    const n = (k) => (r) => r[k];
    const tx = (a, b) => (r) => P(r[b] ? Math.round((r[a] / r[b]) * 100) : null);
    $("#st-body").innerHTML = `
      <div class="card st-sec"><h2>Utilisation</h2><p class="muted">Les jeunes se sont-ils approprié l'outil ?</p>
        <div class="tiles">
          ${tile(A.connectes, "jeunes connectés au moins une fois", A.connectes, A.jeunes, "/ " + A.jeunes, "connecte")}
          ${tile(A.dossier, "dossiers complets (CV + lettre)", A.dossier, A.jeunes, "/ " + A.jeunes, "dossier")}
          ${tile(A.actifs7, "jeunes actifs ces 7 derniers jours", A.actifs7, A.jeunes, "/ " + A.jeunes, "actif7")}
          ${tile(A.avecEnvoi, "jeunes ayant envoyé au moins une candidature", A.avecEnvoi, A.jeunes, "/ " + A.jeunes, "envoi")}
        </div></div>
      <div class="card st-sec"><h2>Recherche</h2><p class="muted">Cherchent-ils plus, et relancent-ils ?</p>
        <div class="tiles">
          ${tile(C.candidatures, "candidatures envoyées")}
          ${tile(C.candidatures7, "candidatures ces 7 derniers jours")}
          ${tile(String(C.parJeuneActif).replace(".", ","), "candidatures par jeune actif")}
          ${tile(P(C.tauxRelance), `relances faites (${C.relancesFaites} sur ${C.relancesDues} dues)`, C.relancesFaites, C.relancesDues)}
        </div></div>
      <div class="card st-sec"><h2>Résultats</h2><p class="muted">Est-ce que ça marche ?</p>
        <div class="tiles">
          ${tile(P(R.tauxReponse), `taux de réponse (${R.reponses} réponses)`, R.reponses, C.candidatures)}
          ${tile(R.entretiens, "entretiens obtenus")}
          ${tile(R.jeunesTrouve, "jeunes ayant trouvé un stage, une alternance ou un emploi", R.jeunesTrouve, A.jeunes, "/ " + A.jeunes, "trouve")}
          ${tile(JRS(R.delaiReponse), "délai médian de réponse")}
        </div>
        ${A.delaiPremiereCandidature != null ? `<p class="muted" style="margin-top:10px">Délai médian entre la première connexion et la première candidature : <b>${JRS(A.delaiPremiereCandidature)}</b>.</p>` : ""}
      </div>
      <div class="card st-sec"><h2>Évolution</h2><p class="muted">Les 8 dernières semaines. Survolez une barre pour le détail.</p>
        <div class="charts">
          ${barres("Candidatures envoyées", "par semaine", st.semaines, "candidatures", "var(--accent)", "candidature(s)")}
          ${barres("Jeunes actifs", "jeunes qui ont utilisé l'outil dans la semaine", st.semaines, "jeunesActifs", "var(--blue)", "jeune(s)")}
        </div>
        <div class="table-wrap" style="margin-top:14px"><table class="st-table"><thead><tr><th>Semaine du</th><th class="num">Candidatures</th><th class="num">Relances</th><th class="num">Entretiens</th><th class="num">Jeunes actifs</th></tr></thead>
          <tbody>${st.semaines.map((w) => `<tr><td>${new Date(w.semaine + "T12:00:00").toLocaleDateString("fr-FR")}</td><td class="num">${w.candidatures}</td><td class="num">${w.relances}</td><td class="num">${w.entretiens}</td><td class="num">${w.jeunesActifs}</td></tr>`).join("")}</tbody></table></div>
      </div>
      ${multi ? tableau("Par site", [["Site", grp], ["Jeunes", n("jeunes"), "num"], ["Connectés", n("connectes"), "num"], ["Dossier complet", n("dossier"), "num"], ["Candidatures", n("candidatures"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Entretiens", n("entretiens"), "num"], ["Trouvés", n("trouves"), "num"]], st.parSite) : ""}
      ${tableau("Par groupe", [["Groupe", grp], ["Jeunes", n("jeunes"), "num"], ["Connectés", n("connectes"), "num"], ["Dossier complet", n("dossier"), "num"], ["Candidatures", n("candidatures"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Entretiens", n("entretiens"), "num"], ["Trouvés", n("trouves"), "num"]], st.parGroupe)}
      ${tableau("Par métier", [["Métier", (m) => `<b>${esc(m.metier)}</b>`], ["Candidatures", n("candidatures"), "num"], ["Réponses", n("reponses"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Réponses positives", n("positives"), "num"]], st.metiers)}
      ${tableau("E-mail ou téléphone", [["Canal", (m) => `<b>${m.canal === "Téléphone" ? "📞 Téléphone" : "✉️ E-mail"}</b>`], ["Contacts", n("candidatures"), "num"], ["Réponses", n("reponses"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Entretiens", n("entretiens"), "num"]], st.canaux || [])}
      ${tableau("Stage, alternance ou emploi", [["Recherche", (m) => `<b>${esc(m.type)}</b>`], ["Candidatures", n("candidatures"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Trouvés", n("trouves"), "num"]], st.types)}
      ${ME.role === "admin" ? `<div class="card st-sec" id="st-equipe"><h2>Utilisation par l'équipe <span class="tag blue">visible par vous seul</span></h2><p class="muted">Chargement…</p></div>` : ""}
      <p class="note">Touchez une case « Utilisation » pour voir qui est concerné. Les réponses et les résultats sont indiqués par les jeunes dans leur suivi : rappelez-leur de mettre à jour le statut quand une entreprise répond. L'export Excel contient tous ces tableaux.</p>`;
    if (ME.role === "admin") chargerActiviteEquipe();
    $$("#st-body [data-liste]").forEach((t) => {
      t.addEventListener("click", () => ouvrirListe(t.dataset.liste));
      t.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); ouvrirListe(t.dataset.liste); } });
    });
  }

  // ----- dialogues -----
  const dlg = $("#dlg");
  function ouvrirDlg(html, onBind) {
    $("#dlg-in").innerHTML = `<button class="dlg-x" type="button" aria-label="Fermer">×</button>` + html;
    $(".dlg-x", dlg).addEventListener("click", () => dlg.close());
    if (onBind) onBind($("#dlg-in"));
    if (!dlg.open) dlg.showModal();
  }
  dlg.addEventListener("click", (ev) => { if (ev.target === dlg) dlg.close(); });

  async function ouvrirJeune(j) {
    ouvrirDlg(`<h2>${esc(j.prenom)} ${esc(j.nom)}</h2><p class="muted">Chargement…</p>`);
    try {
      const r = await api("jeune", { site: j.site, key: j.key }, { get: true });
      const d = r.jeune, t = todayIso();
      ouvrirDlg(`<h2>${esc(d.prenom)} ${esc(d.nom)}</h2>
        <p class="muted">E2C ${esc(SITES[d.site])} · identifiant <b>${esc(d.ident)}</b>${d.code ? " · code E2C " + esc(d.code) : ""} · ${esc(metierLabel(d.metier) || "métier non choisi")}${d.typ ? " · " + article(d.typ) : ""}</p>
        <div class="kpis kpis3 mini"><div class="kpi"><b>${r.resume.envois}</b><span>envoyées</span></div><div class="kpi"><b>${r.resume.reponses}</b><span>réponses</span></div><div class="kpi accent"><b>${r.resume.aRelancer}</b><span>à relancer</span></div></div>
        <div class="dlg-row">
          <div><b>CV</b> : ${d.cv ? `${esc(d.cv.nom)} <button class="btn ghost sm" type="button" id="d-cv">Télécharger</button>` : `<span class="tag bad">pas encore déposé</span>`}</div>
          <div><b>Lettre</b> : ${d.lettre ? `<span class="tag ok">prête</span> <button class="btn ghost sm" type="button" id="d-lettre">Lire</button>` : `<span class="tag bad">pas encore</span>`}</div>
        </div>
        <pre class="lettre-pre" id="d-lettre-txt" hidden>${esc(d.lettre)}</pre>
        <label class="inline">Formateur référent <input id="d-form" value="${esc(d.formateur)}" placeholder="Nom du formateur"><button class="btn ghost sm" type="button" id="d-form-ok">Enregistrer</button></label>
        <h3 class="mt">Candidatures</h3>
        ${d.envois.length ? `<div class="table-wrap"><table><thead><tr><th>Entreprise</th><th>Envoyée</th><th>Relance</th><th>Statut</th></tr></thead><tbody>
          ${d.envois.slice().reverse().map((e) => `<tr><td>${/appel/.test(e.canal || "") ? "📞 " : "✉️ "}<b>${esc(e.entreprise)}</b><br><span class="muted sm">${esc(e.ville)}</span></td><td>${fr(e.envoye)}</td>
          <td>${e.relanceFaite ? "faite le " + fr(e.relanceFaite) : (e.statut === "Envoyé" && e.relance <= t ? `<span class="tag warn">à faire</span>` : fr(e.relance))}</td><td>${esc(e.statut)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">Aucune candidature pour le moment.</p>`}
        <div class="dlg-foot">
          <button class="btn ghost sm" type="button" id="d-carte">Imprimer sa carte</button>
          ${ME.role === "admin" && r.resume.connecte && !d.test ? `<button class="btn ghost sm" type="button" id="d-reset">Effacer sa connexion (test)</button>` : ""}
          ${d.test ? `<button class="btn ghost sm" type="button" id="d-reset-test">Remettre à zéro le compte test</button>` : ""}
          ${ME.gere ? `<button class="btn ghost sm danger" type="button" id="d-suppr">Retirer ce jeune</button>` : ""}
        </div>`, (root) => {
        const cv = $("#d-cv", root); if (cv) cv.addEventListener("click", () => telecharger("cv-fichier", { site: d.site, key: d.key }, d.cv.nom).catch((e) => toast(e.message)));
        const lt = $("#d-lettre", root); if (lt) lt.addEventListener("click", () => { const p = $("#d-lettre-txt", root); p.hidden = !p.hidden; });
        $("#d-form-ok", root).addEventListener("click", async () => {
          try { await api("maj-jeune", { site: d.site, key: d.key, formateur: $("#d-form", root).value }); toast("Enregistré ✓"); chargerJeunes(); } catch (e) { toast(e.message); }
        });
        const rt = $("#d-reset-test", root);
        if (rt) rt.addEventListener("click", async () => {
          if (!confirmer("Vider le compte test (CV, lettre, candidatures) ?")) return;
          try { await api("reset-test", { site: d.site, key: d.key }); toast("Compte test remis à zéro."); dlg.close(); chargerJeunes(); } catch (e) { toast(e.message); }
        });
        const rs = $("#d-reset", root);
        if (rs) rs.addEventListener("click", async () => {
          if (!confirmer("Effacer la trace de connexion de ce jeune ?")) return;
          try { await api("reset-activite", { site: d.site, key: d.key }); toast("Connexion effacée."); dlg.close(); await chargerJeunes(); if (E.vue === "stats") chargerStats(); } catch (e) { toast(e.message); }
        });
        $("#d-carte", root).addEventListener("click", () => imprimerCartes([{ prenom: d.prenom, nom: d.nom, ident: d.ident, site: d.site }]));
        const sp = $("#d-suppr", root);
        if (sp) sp.addEventListener("click", async () => {
          if (!confirmer(`Retirer ${d.prenom} ${d.nom} et ses données ?`)) return;
          try { await api("suppr-jeune", { site: d.site, key: d.key }); dlg.close(); toast("Jeune retiré."); chargerJeunes(); } catch (e) { toast(e.message); }
        });
      });
    } catch (e) { ouvrirDlg(`<p>${esc(e.message)}</p>`); }
  }

  const optionsSites = (sel) => ME.sites.map(([v, l]) => `<option value="${v}"${v === sel ? " selected" : ""}>${l}</option>`).join("");

  // ----- ajout de jeunes -----
  function parseLignes(txt) {
    return txt.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      let p = [];
      for (const sep of [/\t|;/, /,/, /\s+/]) {
        p = l.split(sep).map((x) => x.trim()).filter((x) => x !== "");
        if (p.length >= 2) break;
      }
      if (p.length < 2) return { prenom: p[0] || "", nom: "", code: "" };
      // un dernier élément contenant un chiffre = code E2C (facultatif)
      const code = p.length > 2 && /\d/.test(p[p.length - 1]) ? p.pop() : "";
      return { prenom: p[0], nom: p.slice(1).join(" "), code };
    }).filter((x) => !/^pr[ée]nom$/i.test(x.prenom));
  }
  $("#btn-ajout").addEventListener("click", () => {
    ouvrirDlg(`<h2>Ajouter des jeunes</h2>
      <p class="muted">Une ligne par jeune : <b>Prénom ; Nom</b> (le code E2C peut suivre, facultatif). Vous pouvez coller directement des colonnes copiées depuis Excel ou UP2C. Chaque jeune se connectera avec <b>prénom.nom</b>.</p>
      <label>Site <select id="a-site">${optionsSites(siteCourant() || ME.sites[0][0])}</select></label>
      <label>Formateur référent (facultatif) <input id="a-form" placeholder="ex. Diego"></label>
      <label>Liste des jeunes <textarea id="a-txt" rows="8" placeholder="Léa ; Martin&#10;Karim ; Diallo"></textarea></label>
      <p class="hint" id="a-apercu">0 jeune détecté.</p>
      <button class="btn primary big" type="button" id="a-ok">Ajouter</button>
      <div id="a-res"></div>`, (root) => {
      const ap = () => { const l = parseLignes($("#a-txt", root).value); const ko = l.filter((x) => !x.prenom || !x.nom).length;
        $("#a-apercu", root).textContent = `${l.length} jeune${l.length > 1 ? "s" : ""} détecté${l.length > 1 ? "s" : ""}${ko ? ` (dont ${ko} incomplet${ko > 1 ? "s" : ""})` : ""}.`; };
      $("#a-txt", root).addEventListener("input", ap);
      $("#a-ok", root).addEventListener("click", async (ev) => {
        const lignes = parseLignes($("#a-txt", root).value);
        if (!lignes.length) { toast("Collez au moins une ligne."); return; }
        ev.currentTarget.disabled = true;
        try {
          const r = await api("ajout-jeunes", { site: $("#a-site", root).value, formateur: $("#a-form", root).value, lignes });
          $("#a-res", root).innerHTML = `<div class="rappel-ok"><b>${r.crees.length} jeune${r.crees.length > 1 ? "s" : ""} ajouté${r.crees.length > 1 ? "s" : ""}.</b>
            ${r.existants.length ? `<br>Déjà présents : ${esc(r.existants.join(", "))}.` : ""}
            ${r.erreurs.length ? `<br>Non ajoutés : ${esc(r.erreurs.join(" ; "))}.` : ""}
            ${r.crees.length ? `<br><button class="btn dark sm" type="button" id="a-print">Imprimer leurs cartes</button>` : ""}</div>`;
          const pr = $("#a-print", root); if (pr) pr.addEventListener("click", () => imprimerCartes(r.crees));
          $("#a-txt", root).value = ""; ap();
          chargerJeunes();
        } catch (e) { toast(e.message); }
        finally { ev.currentTarget && (ev.currentTarget.disabled = false); $("#a-ok", root).disabled = false; }
      });
    });
  });

  // ----- impression : cartes et QR du site -----
  const siteUrl = (site) => `${location.origin}/pilote/?site=${site}`;
  function imprimer(html, classe) {
    const z = $("#print-zone");
    z.className = "print-only " + (classe || "");
    z.innerHTML = html;
    if (dlg.open) dlg.close();
    setTimeout(() => { window.print(); }, 150);
  }
  function carteHtml(j) {
    return `<div class="carte">
      <div class="carte-h"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#152238"/><circle cx="16" cy="16" r="8" fill="none" stroke="#ff6b3d" stroke-width="3"/><circle cx="16" cy="16" r="2.5" fill="#ff6b3d"/></svg><span>Kit de prospection</span><em>E2C ${esc(SITES[j.site])}</em></div>
      <div class="carte-b">
        <div class="carte-t">
          <div class="carte-nom">${esc(j.prenom)} ${esc(j.nom)}</div>
          <div class="carte-l">Mon identifiant</div><div class="carte-code">${esc(j.ident)}</div>
          <div class="carte-aide">Scanne le QR code et entre ton identifiant.</div>
        </div>
        <div class="carte-qr">${window.kpQR ? window.kpQR(siteUrl(j.site)) : ""}</div>
      </div>
      <div class="carte-f">${esc(location.host)}/pilote</div>
    </div>`;
  }
  function imprimerCartes(liste) {
    if (!liste.length) { toast("Aucun jeune à imprimer."); return; }
    imprimer(`<div class="cartes">${liste.map(carteHtml).join("")}</div>`, "p-cartes");
  }
  $("#btn-cartes").addEventListener("click", () => {
    const js = jeunesFiltres();
    if (!js.length) { toast("Aucun jeune dans cette sélection."); return; }
    ouvrirDlg(`<h2>Cartes à imprimer</h2>
      <p class="muted">Cochez les jeunes dont vous voulez la carte (format carte de visite, 10 par page A4) : nom, identifiant et QR code du site. Pratique pour un jeune qui a oublié son identifiant.</p>
      <input type="search" id="c-q" class="c-q" placeholder="Rechercher un jeune…" aria-label="Rechercher un jeune">
      <div class="check-list">${js.map((j, i) => `<label class="check" data-n="${esc(normTxt(j.prenom + " " + j.nom + " " + (j.groupe || "")))}"><input type="checkbox" data-c="${i}"> ${esc(j.prenom)} ${esc(j.nom)} <span class="muted sm">${j.groupe ? "gr. " + esc(j.groupe) : ""}${E.site === "tous" && ME.sites.length > 1 ? " · " + esc(SITES[j.site]) : ""}</span></label>`).join("")}</div>
      <div class="row-btns"><button class="btn ghost sm" type="button" id="c-all">Tout cocher (visibles)</button><button class="btn ghost sm" type="button" id="c-none">Tout décocher</button>
      <button class="btn primary" type="button" id="c-go">Imprimer <span id="c-nb">0</span> carte(s)</button></div>`, (root) => {
      const nb = () => { $("#c-nb", root).textContent = $$("[data-c]:checked", root).length; };
      $$("[data-c]", root).forEach((c) => c.addEventListener("change", nb));
      $("#c-q", root).addEventListener("input", (ev) => { const q = normTxt(ev.target.value); $$(".check[data-n]", root).forEach((l) => { l.hidden = !!q && !l.dataset.n.includes(q); }); });
      $("#c-all", root).addEventListener("click", () => { $$(".check[data-n]", root).forEach((l) => { if (!l.hidden) $("input", l).checked = true; }); nb(); });
      $("#c-none", root).addEventListener("click", () => { $$("[data-c]", root).forEach((c) => { c.checked = false; }); nb(); });
      $("#c-go", root).addEventListener("click", () => {
        const l = $$("[data-c]:checked", root).map((c) => js[+c.dataset.c]);
        if (!l.length) { toast("Cochez au moins un jeune."); return; }
        imprimerCartes(l);
      });
    });
  });
  function afficheSite(site) {
    return `<div class="affiche">
      <div class="aff-h"><svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="8" fill="#152238"/><circle cx="16" cy="16" r="8" fill="none" stroke="#ff6b3d" stroke-width="3"/><circle cx="16" cy="16" r="2.5" fill="#ff6b3d"/></svg> Kit de prospection</div>
      <div class="aff-site">E2C ${esc(SITES[site])}</div>
      <h1>Trouve ton stage, ton alternance ou ton emploi.</h1>
      <div class="aff-qr">${window.kpQR ? window.kpQR(siteUrl(site), "Q") : ""}</div>
      <p class="aff-scan">Scanne avec ton téléphone</p>
      <p class="aff-aide">puis entre ton identifiant : <b>prénom.nom</b></p>
      <p class="aff-url">${esc(location.host)}/pilote/?site=${site}</p>
    </div>`;
  }
  $("#btn-qr").addEventListener("click", () => {
    const s = siteCourant();
    if (s) { imprimer(afficheSite(s), "p-affiche"); return; }
    ouvrirDlg(`<h2>QR code du site</h2><p class="muted">Une affiche A4 avec le QR code qui ouvre le Kit directement sur la page du site.</p>
      <div class="row-btns">${ME.sites.map(([v, l]) => `<button class="btn ghost" type="button" data-aff="${v}">${l}</button>`).join("")}
      <button class="btn primary" type="button" data-aff="*">Les 3 affiches</button></div>`, (root) => {
      $$("[data-aff]", root).forEach((b) => b.addEventListener("click", () => {
        const l = b.dataset.aff === "*" ? ME.sites.map((x) => x[0]) : [b.dataset.aff];
        imprimer(l.map(afficheSite).join(""), "p-affiche");
      }));
    });
  });

  // ----- export -----
  $("#btn-export").addEventListener("click", async () => {
    try { await telecharger("export", E.site === "tous" ? {} : { site: E.site }, "kit-prospection.xlsx"); toast("Fichier Excel téléchargé."); }
    catch (e) { toast(e.message); }
  });

  // ----- équipe et accès -----
  $("#btn-equipe").addEventListener("click", ouvrirEquipe);
  async function ouvrirEquipe() {
    ouvrirDlg(`<h2>Équipe et accès</h2><p class="muted">Chargement…</p>`);
    try {
      const r = await api("formateurs", null, { get: true });
      ouvrirDlg(`<h2>Équipe et accès</h2>
        <p class="muted">Chaque personne a son code personnel. Pour donner un accès (ou en cas d'oubli), créez un <b>lien d'activation</b> : la personne choisit elle-même son code. Le lien ne marche qu'une fois et expire au bout de 7 jours ; tant qu'il n'est pas utilisé, l'ancien code reste valable.</p>
        <button class="btn primary" type="button" id="liens-tous">Liens d'activation pour toute mon équipe</button>
        <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Site</th><th></th></tr></thead><tbody>
        ${r.equipe.map((m) => `<tr><td><b>${esc(m.nom)}</b>${m.moi ? ` <span class="tag blue">vous</span>` : ""}</td><td>${esc(m.roleNom)}</td><td>${m.site ? esc(SITES[m.site]) : "Tous"}</td>
          <td class="nowrap">${m.gerable ? `<button class="btn ghost sm" type="button" data-lien="${esc(m.id)}">Lien d'activation</button> <button class="btn ghost sm danger" type="button" data-del="${esc(m.id)}">Désactiver</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <h3 class="mt">Ajouter un formateur</h3>
        <div class="add-form">
          <label>Prénom et nom <input id="f-nom" placeholder="ex. Paul Durand"></label>
          <label>Site <select id="f-site">${optionsSites(siteCourant() || ME.site || ME.sites[0][0])}</select></label>
          <button class="btn primary" type="button" id="f-ok">Créer son accès</button>
        </div>
        <div id="f-res"></div>`, (root) => {
        $$("[data-lien]", root).forEach((b) => b.addEventListener("click", async () => {
          try { const x = await api("lien-activation", { id: b.dataset.lien }); afficherLien($("#f-res", root), x); } catch (e) { toast(e.message); }
        }));
        const tous = $("#liens-tous", root);
        if (tous) tous.addEventListener("click", () => ouvrirLiensEquipe());
        $$("[data-del]", root).forEach((b) => b.addEventListener("click", async () => {
          if (!confirmer("Désactiver cet accès ?")) return;
          try { await api("suppr-formateur", { id: b.dataset.del }); toast("Accès désactivé."); ouvrirEquipe(); } catch (e) { toast(e.message); }
        }));
        $("#f-ok", root).addEventListener("click", async () => {
          const nom = $("#f-nom", root).value.trim();
          if (!nom) { toast("Indiquez le nom."); return; }
          try {
            const x = (await api("ajout-formateur", { nom, site: $("#f-site", root).value })).formateur;
            afficherCode(root, { ...x, roleNom: "Formateur" }, true);
            $("#f-nom", root).value = "";
          } catch (e) { toast(e.message); }
        });
      });
    } catch (e) { ouvrirDlg(`<p>${esc(e.message)}</p>`); }
  }

  const prenomDe = (nom) => String(nom || "").replace(/\s*\(.*\)\s*/g, " ").trim().split(/\s+/)[0] || "";
  const msgActivation = (x) => `Bonjour ${prenomDe(x.nom)},

Voici votre accès personnel au Kit de prospection assistée (E2C 92), pour suivre les stagiaires${x.site ? " du site de " + x.siteNom : " de tous les sites"}.

Cliquez sur ce lien pour activer votre accès et choisir votre code personnel :
${x.lien}

Ce lien est personnel : il ne fonctionne qu'une seule fois et expire dans 7 jours. Ensuite, vous vous connecterez sur https://kit-prospection.vercel.app/pilote/ (cadre « Équipe E2C ») avec le code que vous aurez choisi.

En cas d'oubli, cliquez sur « Code oublié ? » sur la page de connexion.

Bien cordialement,
${ME ? ME.nom.replace(/ \(.*\)/, "") : ""}`;
  const OBJ_ACT = "Votre accès au Kit de prospection assistée";
  const liensMailAct = (x) => { const su = encodeURIComponent(OBJ_ACT), b = encodeURIComponent(msgActivation(x)); return {
    o365: `https://outlook.office.com/mail/deeplink/compose?subject=${su}&body=${b}`,
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${su}&body=${b}`,
    autre: `mailto:?subject=${su}&body=${b}` }; };
  const boutonsMailAct = (x, i) => { const l = liensMailAct(x); return `<a class="btn dark sm" data-mail-i="${i}" href="${l.o365}" target="_blank" rel="noopener">Outlook (web)</a> <a class="btn ghost sm" data-mail-i="${i}" href="${l.gmail}" target="_blank" rel="noopener">Gmail</a>`; };
  function afficherLien(zone, x) {
    zone.innerHTML = `<div class="rappel-ok"><b>Lien d'activation pour ${esc(x.nom)}</b> <span class="muted sm">(${esc(x.roleNom)} · ${esc(x.siteNom)})</span>
      <div class="lien-box"><code>${esc(x.lien)}</code></div>
      <div class="row-btns">${boutonsMailAct(x, 0)}<button class="btn ghost sm" type="button" data-cp="lien">Copier le lien</button><button class="btn ghost sm" type="button" data-cp="msg">Copier le message complet</button></div>
      <p class="sm muted">Envoyez-le à cette personne seulement (e-mail, SMS…). Il ne marche qu'une fois et expire dans 7 jours.</p></div>`;
    $("[data-cp=lien]", zone).addEventListener("click", async () => { if (await copier(x.lien)) toast("Lien copié."); });
    $("[data-cp=msg]", zone).addEventListener("click", async () => { if (await copier(msgActivation(x))) toast("Message copié : collez-le dans un e-mail."); });
    zone.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  async function ouvrirLiensEquipe() {
    ouvrirDlg(`<h2>Liens d'activation</h2><p class="muted">Création des liens…</p>`);
    try {
      const r = await api("liens-equipe", {});
      ouvrirDlg(`<h2>Liens d'activation (${r.liens.length})</h2>
        <p class="muted">Un lien personnel par personne. « Outlook (web) » ou « Gmail » ouvre un nouvel e-mail dans votre navigateur, avec l'objet et le message déjà remplis : ajoutez l'adresse de la personne et envoyez. Sinon, « Copier le message ». Chaque lien ne marche qu'une fois et expire dans 7 jours ; créer de nouveaux liens n'annule pas les anciens codes tant qu'ils ne sont pas utilisés.</p>
        <div class="table-wrap"><table><thead><tr><th>Personne</th><th>Site</th><th></th></tr></thead><tbody>
        ${r.liens.map((x, i) => `<tr><td><b>${esc(x.nom)}</b><br><span class="muted sm">${esc(x.roleNom)}</span></td><td>${esc(x.siteNom)}</td>
          <td class="nowrap">${boutonsMailAct(x, i)} <button class="btn ghost sm" type="button" data-m="${i}">Copier le message</button></td></tr>`).join("")}
        </tbody></table></div>`, (root) => {
        $$("[data-mail-i]", root).forEach((b) => b.addEventListener("click", () => { const tr = b.closest("tr"); if (tr) tr.classList.add("envoye-ok"); }));
        $$("[data-m]", root).forEach((b) => b.addEventListener("click", async () => { if (await copier(msgActivation(r.liens[+b.dataset.m]))) { b.textContent = "Copié ✓"; toast("Message copié : collez-le dans un e-mail."); } }));
        $$("[data-l]", root).forEach((b) => b.addEventListener("click", async () => { if (await copier(r.liens[+b.dataset.l].lien)) { b.textContent = "Copié ✓"; } }));
      });
    } catch (e) { ouvrirDlg(`<p>${esc(e.message)}</p>`); }
  }

  // ----- demandes d'accès (code oublié) -----
  $("#lien-oubli").addEventListener("click", (ev) => {
    ev.preventDefault();
    ouvrirDlg(`<h2>Code oublié</h2>
      <p class="muted">Indiquez qui vous êtes. Votre demande sera vérifiée par votre responsable de site ou par l'administrateur, qui vous enverra un nouveau lien d'activation.</p>
      <label>Prénom et nom <input id="o-nom" autocomplete="name"></label>
      <label>Site <select id="o-site"><option value="">Choisissez…</option><option value="clichy">Clichy</option><option value="bagneux">Bagneux</option><option value="nanterre">Nanterre</option><option value="direction">Direction / tous les sites</option></select></label>
      <label>Comment vous joindre (facultatif) <input id="o-contact" placeholder="téléphone ou e-mail"></label>
      <label>Message (facultatif) <input id="o-msg"></label>
      <button class="btn primary" type="button" id="o-ok">Envoyer la demande</button>
      <p class="form-err" id="o-err" hidden></p>`, (root) => {
      $("#o-ok", root).addEventListener("click", async () => {
        const err = $("#o-err", root); err.hidden = true;
        try {
          await api("demande-acces", { nom: $("#o-nom", root).value, site: $("#o-site", root).value, contact: $("#o-contact", root).value, message: $("#o-msg", root).value });
          $("#dlg-in").innerHTML = `<button class="dlg-x" type="button" aria-label="Fermer">×</button><h2>Demande envoyée</h2><p>Votre demande a été transmise. Vous serez contacté(e) pour vérifier votre identité, puis vous recevrez un nouveau lien d'activation.</p>`;
          $(".dlg-x", dlg).addEventListener("click", () => dlg.close());
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      });
    });
  });
  async function majDemandes() {
    if (!ME || !ME.gere) { $("#btn-demandes").hidden = true; return; }
    try {
      const r = await api("demandes", null, { get: true });
      $("#btn-demandes").hidden = false;
      const p = $("#nb-demandes"); p.textContent = r.enAttente; p.hidden = !r.enAttente;
      return r;
    } catch (e) { return null; }
  }
  $("#btn-demandes").addEventListener("click", ouvrirDemandes);
  async function ouvrirDemandes() {
    ouvrirDlg(`<h2>Demandes d'accès</h2><p class="muted">Chargement…</p>`);
    const [r, eq] = await Promise.all([majDemandes(), api("formateurs", null, { get: true }).catch(() => ({ equipe: [] }))]);
    if (!r) { ouvrirDlg(`<p>Impossible de charger les demandes.</p>`); return; }
    const gerables = eq.equipe.filter((m) => m.gerable);
    const proche = (d) => { const n = normTxt(d.nom).split(" "); const m = gerables.find((x) => n.every((w) => normTxt(x.nom).includes(w))) || gerables.find((x) => n.some((w) => w.length > 2 && normTxt(x.nom).includes(w))); return m ? m.id : ""; };
    const dt = (iso) => new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    ouvrirDlg(`<h2>Demandes d'accès</h2>
      <p class="muted">Vérifiez l'identité de la personne (appel, en personne…) avant de valider. La validation crée un lien d'activation à lui transmettre ; son ancien code reste valable tant que le lien n'est pas utilisé.</p>
      ${r.demandes.length ? r.demandes.map((d) => `<div class="demande${d.statut !== "en attente" ? " faite" : ""}" data-d="${esc(d.id)}">
        <div><b>${esc(d.nom)}</b> · ${esc(d.siteNom)} <span class="muted sm">· ${dt(d.date)}</span>${d.statut !== "en attente" ? ` <span class="tag ${d.statut === "validée" ? "ok" : "bad"}">${esc(d.statut)} par ${esc(d.par)}</span>` : ""}</div>
        ${d.contact ? `<div class="sm">Contact : ${esc(d.contact)}</div>` : ""}${d.message ? `<div class="sm muted">« ${esc(d.message)} »</div>` : ""}
        ${d.statut === "en attente" ? `<div class="demande-actions"><select aria-label="Compte correspondant"><option value="">Compte de cette personne…</option>${gerables.map((m) => `<option value="${esc(m.id)}"${m.id === proche(d) ? " selected" : ""}>${esc(m.nom)} (${m.site ? esc(SITES[m.site]) : "tous"})</option>`).join("")}</select>
          <button class="btn primary sm" type="button" data-ok>Valider</button><button class="btn ghost sm danger" type="button" data-ko>Refuser</button></div><div class="res"></div>` : ""}
      </div>`).join("") : `<p class="muted">Aucune demande.</p>`}`, (root) => {
      $$(".demande[data-d]", root).forEach((box) => {
        const ok = $("[data-ok]", box), ko = $("[data-ko]", box);
        if (ok) ok.addEventListener("click", async () => {
          const membre = $("select", box).value;
          if (!membre) { toast("Choisissez le compte de cette personne."); return; }
          try { const x = await api("traiter-demande", { id: box.dataset.d, action: "valider", membre }); $(".demande-actions", box).remove(); afficherLien($(".res", box), x); majDemandes(); }
          catch (e) { toast(e.message); }
        });
        if (ko) ko.addEventListener("click", async () => {
          if (!confirmer("Refuser cette demande ?")) return;
          try { await api("traiter-demande", { id: box.dataset.d, action: "refuser" }); toast("Demande refusée."); ouvrirDemandes(); } catch (e) { toast(e.message); }
        });
      });
    });
  }

  // ----- page d'activation -----
  async function initActivation(t) {
    vue("activer");
    try {
      const r = await api("activer-info", { t }, { get: true });
      $("#act-sous").textContent = "Bienvenue sur le Kit de prospection assistée.";
      $("#act-nom").textContent = r.nom;
      $("#act-role").textContent = `${r.roleNom} · ${r.siteNom}`;
      $("#f-activer").hidden = false;
      $("#f-activer").onsubmit = async (ev) => {
        ev.preventDefault();
        const a = $("#act-c1").value, b = $("#act-c2").value, err = $("#act-err"); err.hidden = true;
        const n = (x) => x.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (n(a).length < 8) { err.textContent = "Au moins 8 lettres ou chiffres."; err.hidden = false; return; }
        if (n(a) !== n(b)) { err.textContent = "Les deux codes ne sont pas identiques."; err.hidden = false; return; }
        try {
          const x = await api("activer", { t, code: a });
          ls.set(TK, x.token); ls.set(KIND, "s");
          history.replaceState(null, "", "/pilote/");
          startEquipe(x.me); toast("Accès activé ✓ Retenez bien votre code.");
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      };
    } catch (e) {
      $("#act-sous").textContent = "";
      $("#act-ko").innerHTML = `${esc(e.message)}<br><br><a href="/pilote/">Aller à la page de connexion</a>`;
      $("#act-ko").hidden = false;
    }
  }

  function afficherCode(root, x, cree) {
    $("#f-res", root).innerHTML = `<div class="rappel-ok"><b>${cree ? "Accès créé" : "Nouveau code"} pour ${esc(x.nom)}.</b><br>Code : <span class="code-big">${esc(x.code)}</span><br>
      <span class="sm">Notez-le ou imprimez sa carte maintenant : il ne sera plus affiché. ${cree ? "" : "L'ancien code ne marche plus."}</span><br>
      <button class="btn dark sm" type="button" id="f-print">Imprimer sa carte d'accès</button></div>`;
    $("#f-res", root).scrollIntoView({ behavior: "smooth", block: "nearest" });
    $("#f-print", root).addEventListener("click", () => imprimer(`<div class="cartes"><div class="carte">
      <div class="carte-h"><svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#152238"/><circle cx="16" cy="16" r="8" fill="none" stroke="#ff6b3d" stroke-width="3"/><circle cx="16" cy="16" r="2.5" fill="#ff6b3d"/></svg><span>Kit de prospection</span><em>${x.site ? "E2C " + esc(SITES[x.site]) : "E2C 92"}</em></div>
      <div class="carte-b"><div class="carte-t"><div class="carte-nom">${esc(x.nom)}</div><div class="carte-l">${esc(x.roleNom || "")}</div><div class="carte-l">Code d'accès personnel</div><div class="carte-code">${esc(x.code)}</div><div class="carte-aide">Espace équipe. Ne pas partager.</div></div>
      <div class="carte-qr">${window.kpQR ? window.kpQR(location.origin + "/pilote/?equipe") : ""}</div></div>
      <div class="carte-f">${esc(location.host)}/pilote</div></div></div>`, "p-cartes"));
  }

  // ----- changer mon code -----
  $("#btn-moncode").addEventListener("click", () => {
    ouvrirDlg(`<h2>Changer mon code d'accès</h2>
      <p class="muted">Choisissez un code facile à retenir pour vous, mais difficile à deviner : au moins 8 lettres ou chiffres. Les majuscules, espaces et tirets ne comptent pas.</p>
      <label>Nouveau code <input id="m-c1" autocomplete="new-password" spellcheck="false"></label>
      <label>Confirmer le nouveau code <input id="m-c2" autocomplete="new-password" spellcheck="false"></label>
      <button class="btn primary" type="button" id="m-ok">Enregistrer mon nouveau code</button>
      <p class="form-err" id="m-err" hidden></p>`, (root) => {
      $("#m-ok", root).addEventListener("click", async () => {
        const a = $("#m-c1", root).value, b = $("#m-c2", root).value, err = $("#m-err", root);
        err.hidden = true;
        const n = (s) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (n(a).length < 8) { err.textContent = "Au moins 8 lettres ou chiffres."; err.hidden = false; return; }
        if (n(a) !== n(b)) { err.textContent = "Les deux codes ne sont pas identiques."; err.hidden = false; return; }
        try {
          const r = await api("mon-code", { nouveau: a });
          ls.set(TK, r.token);
          dlg.close(); toast("Code modifié ✓ Utilisez-le à votre prochaine connexion.");
        } catch (e) { err.textContent = e.message; err.hidden = false; }
      });
    });
  });

  // =====================================================================
  // DÉMARRAGE
  // =====================================================================
  (async function boot() {
    const act = params.get("activer");
    if (act) return initActivation(act);
    const t = ls.get(TK), k = ls.get(KIND);
    if (!t) return initLogin();
    try {
      if (k === "j") startJeune((await api("moi", {})).jeune);
      else if (k === "s") startEquipe((await api("me-staff", {})).me);
      else initLogin();
    } catch (e) { initLogin(); }
  })();
})();
