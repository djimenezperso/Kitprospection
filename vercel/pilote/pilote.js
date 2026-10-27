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
  ];
  const STATUTS = ["Envoyé", "Relancé", "Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];
  const REPONSES = ["Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const metierLabel = (id) => (METIERS.find((m) => m[0] === id) || [, ""])[1];
  const domaine = (id) => (METIERS.find((m) => m[0] === id) || [, , "ce métier"])[2];
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
  const mailLinks = (sujet, corps) => {
    const s = encodeURIComponent(sujet), c = encodeURIComponent(corps);
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&su=${s}&body=${c}`,
      outlook: `https://outlook.live.com/mail/0/deeplink/compose?subject=${s}&body=${c}`,
      autre: `mailto:?subject=${s}&body=${c}`,
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
  const VUES = ["login", "jeune", "equipe"];
  function vue(n) {
    VUES.forEach((v) => { $("#v-" + v).hidden = v !== n; });
    $("#who").hidden = n === "login";
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
    const site = params.get("site");
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
      ls.set(TK, r.token); ls.set(KIND, "j");
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

  $("#p-metier").innerHTML = `<option value="">Choisis…</option>` + METIERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("#s-metier").innerHTML = METIERS.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("#rayon").addEventListener("input", (e) => { $("#rayon-out").textContent = e.target.value + " km"; });

  function startJeune(j) {
    J = j;
    vue("jeune");
    $("#who-txt").textContent = `${J.prenom} · E2C ${J.siteNom}`;
    $("#j-hello").textContent = `Bonjour ${J.prenom} !`;
    $("#j-sous").textContent = `E2C ${J.siteNom}. Prépare ton dossier, cherche, envoie, relance.`;
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
    const rel = J.envois.filter((e) => e.statut === "Envoyé" && e.relance <= t);
    const b = $("#j-banner");
    if (rel.length) {
      b.hidden = false;
      b.innerHTML = `<span><b>${rel.length === 1 ? "1 relance à faire" : rel.length + " relances à faire"} aujourd'hui</b> : ${rel.map((e) => esc(e.entreprise)).join(", ")}.</span> <button class="btn dark sm" type="button" id="go-suivi">Voir les messages</button>`;
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

  // ----- dossier -----
  function remplirDossier() {
    $$("input[name=genre]").forEach((r) => { r.checked = r.value === J.genre; });
    $("#p-typ").value = J.typ || "stage";
    $("#p-metier").value = J.metier || "";
    $("#s-metier").value = J.metier || "vente";
    $("#rayon").value = J.rayon || 3; $("#rayon-out").textContent = (J.rayon || 3) + " km";
    $("#p-objet").value = J.objet || objetDefaut();
    $("#p-lettre").value = J.lettre || "";
    renderCV(); etatLettre();
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

  $("#cv-input").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    if (f.size > 3 * 1024 * 1024) { toast("Fichier trop lourd : 3 Mo maximum."); return; }
    let type = f.type;
    if (!type) type = /\.pdf$/i.test(f.name) ? "application/pdf" : /\.docx$/i.test(f.name) ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : /\.odt$/i.test(f.name) ? "application/vnd.oasis.opendocument.text" : /\.doc$/i.test(f.name) ? "application/msword" : "";
    $("#cv-label-txt").textContent = "Envoi en cours…";
    try {
      const data = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = ko; r.readAsDataURL(f); });
      J = (await api("cv", { nom: f.name, type, data })).jeune;
      renderCV(); majJeune(); toast("CV enregistré ✓");
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
  function nettoyerLettre(t) {
    return t.replace(/\r/g, "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n")
      .replace(/\[[^\]\n]{0,40}(entreprise|soci[ée]t[ée]|structure|enseigne)[^\]\n]{0,40}\]/gi, "[Entreprise]")
      .replace(/\b(X{3,}|\.{5,}|_{4,})/g, "[Entreprise]").trim();
  }
  $("#lettre-input").addEventListener("change", async (ev) => {
    const f = ev.target.files[0]; ev.target.value = "";
    if (!f) return;
    const lab = $("#lettre-label-txt"), txt0 = lab.textContent;
    if (f.size > 5 * 1024 * 1024) { toast("Fichier trop lourd (5 Mo maximum)."); return; }
    lab.textContent = "Lecture en cours…";
    try {
      const buf = await f.arrayBuffer(), nom = f.name.toLowerCase();
      let t;
      if (/\.docx$/.test(nom)) t = texteXml(await zipLire(buf, "word/document.xml"), ["w:p"], "w:tab", "w:br");
      else if (/\.odt$/.test(nom)) t = texteXml(await zipLire(buf, "content.xml"), ["text:p", "text:h"], "text:tab", "text:line-break", "text:s");
      else if (/\.pdf$/.test(nom)) t = await textePdf(buf);
      else if (/\.txt$/.test(nom)) t = new TextDecoder().decode(buf);
      else if (/\.doc$/.test(nom)) throw new Error("Ancien format Word (.doc) : enregistre ta lettre en .docx ou en PDF, puis réessaie.");
      else throw new Error("Format non reconnu : Word (.docx), PDF ou texte.");
      t = nettoyerLettre(t);
      if (t.length < 40) throw new Error("Je n'arrive pas à lire le texte de ce fichier (lettre scannée ?). Essaie avec le fichier Word, ou colle le texte.");
      const ta = $("#p-lettre");
      ta.value = t; etatLettre(); await sauver();
      toast(/\[Entreprise\]/.test(t) ? "Lettre importée ✓ Vérifie le texte." : "Lettre importée ✓ Vérifie le texte et ajoute [Entreprise] là où va le nom de l'entreprise.");
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
      J = (await api("profil", { genre, typ: $("#p-typ").value, metier: $("#p-metier").value, lettre: $("#p-lettre").value, objet: $("#p-objet").value })).jeune;
      $("#save-etat").textContent = "Enregistré ✓"; majJeune();
      if ($("#p-metier").value) $("#s-metier").value = $("#p-metier").value;
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
  $("#p-metier").addEventListener("change", sauver);

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
    const metier = $("#s-metier").value, rayon = $("#rayon").value;
    if (metier !== J.metier || +rayon !== +J.rayon) api("profil", { metier, rayon }).then((r) => { J = r.jeune; $("#p-metier").value = J.metier; }).catch(() => {});
    const qs = new URLSearchParams({ site: J.site, metier, rayon, sal: $("#sal").checked ? "1" : "0" });
    $("#empty").hidden = true; $("#error").hidden = true; $("#res").hidden = true; $("#loading").hidden = false;
    try {
      const r = await fetch("/api/entreprises?" + qs);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Erreur");
      S.resultats = data.entreprises; S.ouvert = null; S.centre = data.site;
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
    const deja = new Set(J.envois.map((e) => e.siret));
    $("#liste").innerHTML = S.resultats.map((e, i) => {
      const q = encodeURIComponent(`${e.nom} ${e.adresse}`);
      const open = S.ouvert === e.siret, sent = deja.has(e.siret);
      return `<li class="ent${open ? " open" : ""}" id="e-${e.siret}">
        <div class="ent-top">
          <div class="ent-main"><span class="ent-n">${i + 1}</span>
            <div><h3>${esc(e.nom)}</h3><div class="addr">${esc(e.adresse)}</div>
              <div class="chips"><span class="chip dist">${e.distance} km</span>${e.effectif ? `<span class="chip">${esc(e.effectif)}</span>` : ""}</div></div>
          </div>
          ${sent ? `<span class="btn done">Envoyé ✓</span>` : `<button class="btn ${open ? "ghost" : "dark"}" data-ecrire="${e.siret}" type="button">${open ? "Fermer" : "Écrire"}</button>`}
        </div>
        <div class="links">
          <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Carte</a>
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
    return `<div class="msg">
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
      <p class="hint">Si la lettre n'apparaît pas, colle-la (Ctrl + V). Ajoute l'adresse e-mail de l'entreprise : elle est sur son site (« Trouver le site / contact »), sinon appelle pour la demander.</p>
      <div class="step"><i>3</i>Joins ton CV au message</div>
      ${J.cv ? `<button class="btn ghost big" type="button" data-cv>Télécharger mon CV (${esc(J.cv.nom)})</button>
        <p class="hint">Dans ta messagerie, clique sur le trombone 📎 et choisis ce fichier (dossier « Téléchargements »).</p>`
        : `<p class="alert soft">Tu n'as pas encore déposé de CV. <a href="#" data-go-dossier>Déposer mon CV</a></p>`}
      <div class="step"><i>4</i>C'est envoyé ?</div>
      <button class="btn dark big" type="button" data-envoye="${e.siret}">J'ai envoyé ma candidature</button>
    </div>`;
  }
  function bindPanneau() {
    const e = S.resultats.find((x) => x.siret === S.ouvert);
    if (!e) return;
    const ta = $(`#txt-${e.siret}`), obj = $(`#obj-${e.siret}`);
    if (!ta) return;
    const majLiens = () => { const l = mailLinks(obj.value, ta.value); $$("[data-mail]").forEach((a) => { a.href = l[a.dataset.mail]; }); };
    majLiens();
    ta.addEventListener("input", majLiens); obj.addEventListener("input", majLiens);
    $$("[data-go-dossier]").forEach((a) => a.addEventListener("click", (ev) => { ev.preventDefault(); showSub("dossier"); }));
    $(`[data-copier="${e.siret}"]`).addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      const ok = await copier(ta.value);
      btn.textContent = ok ? "Lettre copiée ✓" : "Sélectionne le texte et fais Ctrl + C";
      if (ok) toast("Lettre copiée. Colle-la dans ta messagerie si besoin (Ctrl + V).");
    });
    const cvb = $("[data-cv]");
    if (cvb) cvb.addEventListener("click", () => telecharger("cv-fichier", null, J.cv.nom).then(() => toast("CV téléchargé : joins-le au message.")).catch((x) => toast(x.message)));
    $(`[data-envoye="${e.siret}"]`).addEventListener("click", async (ev) => {
      const btn = ev.currentTarget; btn.disabled = true;
      try {
        J = (await api("envoi", { siret: e.siret, entreprise: e.nom, adresse: e.adresse, ville: e.ville })).jeune;
        S.ouvert = null; majJeune(); renderListe(); renderMap();
        const env = J.envois.find((x) => x.siret === e.siret);
        const li = $("#e-" + e.siret);
        if (li && env) li.insertAdjacentHTML("beforeend", `<div class="rappel-ok"><b>Bravo, c'est noté !</b> Ajoute le rappel de relance dans ton agenda (le ${fr(env.relance)}) : ${liensAgenda(evRelance(env), "relance-" + e.siret)}</div>`);
        toast("Ajouté à « Mon suivi ».");
      } catch (x) { toast(x.message); btn.disabled = false; }
    });
  }
  function ouvrir(siret, depuisCarte) {
    S.ouvert = S.ouvert === siret ? null : siret;
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
    const rel = env.filter((e) => e.statut === "Envoyé" && e.relance <= t);
    $("#k-env").textContent = env.length;
    $("#k-rep").textContent = env.filter((e) => REPONSES.includes(e.statut)).length;
    $("#k-rel").textContent = rel.length;
    $("#suivi-vide").hidden = env.length > 0;
    $("#suivi-table").hidden = env.length === 0;
    const q = evQuotidien();
    $("#rappel-quotidien .rq-liens").innerHTML = `<a class="btn ghost" href="${gcal(q)}" target="_blank" rel="noopener">Google Agenda</a><a class="btn ghost" href="${ics(q)}" download="rappel-candidatures.ics">Autre agenda</a>`;
    $("#suivi-table tbody").innerHTML = env.slice().reverse().map((e) => {
      const arel = e.statut === "Envoyé" && e.relance <= t;
      return `<tr>
        <td><b>${esc(e.entreprise)}</b>${e.ville ? `<br><span class="muted sm">${esc(e.ville)}</span>` : ""}${arel ? ` <span class="tag warn">À relancer</span>` : ""}</td>
        <td>${fr(e.envoye)}</td>
        <td>${e.relanceFaite ? "Faite le " + fr(e.relanceFaite) : fr(e.relance)}</td>
        <td><select data-statut="${esc(e.siret)}" aria-label="Statut pour ${esc(e.entreprise)}">${STATUTS.map((s) => `<option${s === e.statut ? " selected" : ""}>${s}</option>`).join("")}</select></td>
        <td class="sm nowrap">${e.statut === "Envoyé" ? liensAgenda(evRelance(e), "relance-" + e.siret) : "—"}</td>
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
    const sum = (k) => js.reduce((a, j) => a + j[k], 0);
    $("#c-jeunes").textContent = js.length; $("#c-env").textContent = sum("envois"); $("#c-rep").textContent = sum("reponses"); $("#c-rel").textContent = sum("aRelancer");
    $("#c-table").classList.toggle("sans-site", !multi);
    $("#c-vide").hidden = js.length > 0; $("#c-table").hidden = js.length === 0;
    $("#c-vide p").textContent = E.jeunes.length ? "Aucun jeune ne correspond à ces filtres." : "Aucun jeune pour le moment. Cliquez sur « + Ajouter des jeunes ».";
    const sans = js.filter((j) => j.envois === 0);
    $("#c-alerte").hidden = !sans.length || !js.length;
    $("#c-alerte").textContent = sans.length === js.length ? "Personne n'a encore envoyé de candidature." : `Pas encore d'envoi : ${sans.map((j) => j.prenom + " " + (j.nom || "").slice(0, 1) + ".").join(", ")} — un coup de main peut être utile.`;
    E.vus = js;
    $("#c-table tbody").innerHTML = js.map((j, i) => `<tr data-i="${i}" tabindex="0" class="${j.envois === 0 ? "flag" : ""}">
      <td><b>${esc(j.prenom)} ${esc(j.nom)}</b><br><span class="muted sm">${esc(j.ident)}${j.groupe ? " · gr. " + esc(j.groupe) : ""}${j.formateur ? " · " + esc(j.formateur) : ""}</span></td>
      <td class="col-site">${esc(SITES[j.site])}</td>
      <td>${esc(metierLabel(j.metier) || "—")}</td>
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
  function tile(val, label, part, total, sous) {
    const pc = total ? Math.round((part / total) * 100) : null;
    return `<div class="tile"><b>${val}${sous ? `<small>${sous}</small>` : ""}</b><span>${label}</span>${pc != null ? `<div class="jauge" role="img" aria-label="${pc} %"><i style="width:${pc}%"></i></div>` : ""}</div>`;
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
  function renderStats(st, multi) {
    const A = st.adoption, C = st.activite, R = st.resultats;
    $("#st-maj").textContent = `Chiffres au ${new Date(st.aujourdhui + "T12:00:00").toLocaleDateString("fr-FR")} · ${multi ? "tous les sites" : "E2C " + (SITES[E.site] || ME.sites[0][1])}${$("#st-groupe").value ? " · groupe " + $("#st-groupe").value : ""}`;
    if (!A.jeunes) { $("#st-body").innerHTML = `<div class="card empty small"><p>Aucun jeune dans cette sélection.</p></div>`; return; }
    const grp = (g) => `<b>${esc(g.nom)}</b>`;
    const n = (k) => (r) => r[k];
    const tx = (a, b) => (r) => P(r[b] ? Math.round((r[a] / r[b]) * 100) : null);
    $("#st-body").innerHTML = `
      <div class="card st-sec"><h2>Utilisation</h2><p class="muted">Les jeunes se sont-ils approprié l'outil ?</p>
        <div class="tiles">
          ${tile(A.connectes, "jeunes connectés au moins une fois", A.connectes, A.jeunes, "/ " + A.jeunes)}
          ${tile(A.dossier, "dossiers complets (CV + lettre)", A.dossier, A.jeunes, "/ " + A.jeunes)}
          ${tile(A.actifs7, "jeunes actifs ces 7 derniers jours", A.actifs7, A.jeunes, "/ " + A.jeunes)}
          ${tile(A.avecEnvoi, "jeunes ayant envoyé au moins une candidature", A.avecEnvoi, A.jeunes, "/ " + A.jeunes)}
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
          ${tile(R.jeunesTrouve, "jeunes ayant trouvé un stage, une alternance ou un emploi", R.jeunesTrouve, A.jeunes, "/ " + A.jeunes)}
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
      ${tableau("Stage, alternance ou emploi", [["Recherche", (m) => `<b>${esc(m.type)}</b>`], ["Candidatures", n("candidatures"), "num"], ["Taux de réponse", tx("reponses", "candidatures"), "num"], ["Trouvés", n("trouves"), "num"]], st.types)}
      <p class="note">Les réponses et les résultats sont indiqués par les jeunes dans leur suivi : rappelez-leur de mettre à jour le statut quand une entreprise répond. L'export Excel contient tous ces tableaux.</p>`;
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
          ${d.envois.slice().reverse().map((e) => `<tr><td><b>${esc(e.entreprise)}</b><br><span class="muted sm">${esc(e.ville)}</span></td><td>${fr(e.envoye)}</td>
          <td>${e.relanceFaite ? "faite le " + fr(e.relanceFaite) : (e.statut === "Envoyé" && e.relance <= t ? `<span class="tag warn">à faire</span>` : fr(e.relance))}</td><td>${esc(e.statut)}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">Aucune candidature pour le moment.</p>`}
        <div class="dlg-foot">
          <button class="btn ghost sm" type="button" id="d-carte">Imprimer sa carte</button>
          ${ME.gere ? `<button class="btn ghost sm danger" type="button" id="d-suppr">Retirer ce jeune</button>` : ""}
        </div>`, (root) => {
        const cv = $("#d-cv", root); if (cv) cv.addEventListener("click", () => telecharger("cv-fichier", { site: d.site, key: d.key }, d.cv.nom).catch((e) => toast(e.message)));
        const lt = $("#d-lettre", root); if (lt) lt.addEventListener("click", () => { const p = $("#d-lettre-txt", root); p.hidden = !p.hidden; });
        $("#d-form-ok", root).addEventListener("click", async () => {
          try { await api("maj-jeune", { site: d.site, key: d.key, formateur: $("#d-form", root).value }); toast("Enregistré ✓"); chargerJeunes(); } catch (e) { toast(e.message); }
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
    if (!js.length) { toast("Ajoutez d'abord des jeunes."); return; }
    ouvrirDlg(`<h2>Cartes à imprimer</h2>
      <p class="muted">Une carte par jeune (format carte de visite, 10 par page A4), avec son identifiant et le QR code de son site. La liste suit les filtres choisis (groupe, formateur).</p>
      <div class="check-list">${js.map((j, i) => `<label class="check"><input type="checkbox" data-c="${i}" checked> ${esc(j.prenom)} ${esc(j.nom)} <span class="muted sm">(${esc(SITES[j.site])})</span></label>`).join("")}</div>
      <div class="row-btns"><button class="btn ghost sm" type="button" id="c-none">Tout décocher</button><button class="btn primary" type="button" id="c-go">Imprimer</button></div>`, (root) => {
      $("#c-none", root).addEventListener("click", () => $$("[data-c]", root).forEach((c) => { c.checked = false; }));
      $("#c-go", root).addEventListener("click", () => imprimerCartes($$("[data-c]", root).filter((c) => c.checked).map((c) => js[+c.dataset.c])));
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
        <p class="muted">Chaque formateur a son code personnel : il voit tous les jeunes de son site. Un code oublié ? « Nouveau code » en crée un autre (l'ancien ne marche plus). Chacun peut aussi choisir son propre code avec « Changer mon code », en haut de la page.</p>
        <div class="table-wrap"><table><thead><tr><th>Nom</th><th>Rôle</th><th>Site</th><th></th></tr></thead><tbody>
        ${r.equipe.map((m) => `<tr><td><b>${esc(m.nom)}</b>${m.moi ? ` <span class="tag blue">vous</span>` : ""}</td><td>${esc(m.roleNom)}</td><td>${m.site ? esc(SITES[m.site]) : "Tous"}</td>
          <td class="nowrap">${m.gerable ? `<button class="btn ghost sm" type="button" data-reset="${esc(m.id)}">Nouveau code</button> <button class="btn ghost sm danger" type="button" data-del="${esc(m.id)}">Désactiver</button>` : ""}</td></tr>`).join("")}
        </tbody></table></div>
        <h3 class="mt">Ajouter un formateur</h3>
        <div class="add-form">
          <label>Prénom et nom <input id="f-nom" placeholder="ex. Paul Durand"></label>
          <label>Site <select id="f-site">${optionsSites(siteCourant() || ME.site || ME.sites[0][0])}</select></label>
          <button class="btn primary" type="button" id="f-ok">Créer son accès</button>
        </div>
        <div id="f-res"></div>`, (root) => {
        $$("[data-reset]", root).forEach((b) => b.addEventListener("click", async () => {
          if (!confirmer("Créer un nouveau code ? L'ancien ne marchera plus.")) return;
          try { const x = await api("reset-code", { id: b.dataset.reset }); afficherCode(root, x); } catch (e) { toast(e.message); }
        }));
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
    const t = ls.get(TK), k = ls.get(KIND);
    if (!t) return initLogin();
    try {
      if (k === "j") startJeune((await api("moi", {})).jeune);
      else if (k === "s") startEquipe((await api("me-staff", {})).me);
      else initLogin();
    } catch (e) { initLogin(); }
  })();
})();
