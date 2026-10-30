/* Kit de prospection assistée — démo (Vercel) */
(function () {
  "use strict";

  const SITES = [
    ["clichy", "Clichy (92)"], ["bagneux", "Bagneux (92)"], ["nanterre", "Nanterre (92)"],
    ["sevran", "Sevran (93)"], ["la-courneuve", "La Courneuve (93)"],
    ["rosny", "Rosny-sous-Bois (93)"], ["pantin", "Pantin (93)"],
  ];
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
  ];
  const STATUTS = ["Envoyé", "Réponse positive", "Entretien obtenu", "Refus"];
  const RELANCE = 7;
  const GROUPE = [
    ["Lucas B.", "Boulangerie / pâtisserie", 12, 3, 4],
    ["Inès K.", "Aide à la personne", 9, 2, 3],
    ["Karim D.", "Mécanique automobile", 3, 0, 3],
    ["Chloé R.", "Vente / employé(e) de commerce", 14, 4, 2],
    ["Mehdi S.", "Propreté / entretien", 0, 0, 0],
    ["Sarah L.", "Vente / employé(e) de commerce", 8, 1, 5],
    ["Tom P.", "Cuisine / restauration", 10, 2, 3],
  ];

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- state (onglet seulement) ----------
  const store = {
    get(k, d) { try { const v = sessionStorage.getItem("kp_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { sessionStorage.setItem("kp_" + k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  const S = { resultats: [], ouvert: null, envois: store.get("envois", []), decalage: store.get("decalage", 0) };
  const save = () => { store.set("envois", S.envois); store.set("decalage", S.decalage); };

  const jour = (offset) => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + (offset || 0)); return d; };
  const today = () => jour(S.decalage);
  const iso = (d) => d.toISOString().slice(0, 10);
  const fromIso = (s) => new Date(s + "T12:00:00");
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const fr = (d) => d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });

  // ---------- profile ----------
  const profil = () => ({
    nom: $("#nom").value.trim() || "Prénom Nom",
    genre: ($("input[name=genre]:checked") || {}).value || "F",
    typ: $("#typ").value,
    site: $("#site").value,
    metier: $("#metier").value,
  });
  const article = (t) => ({ stage: "un stage", alternance: "une alternance", emploi: "un emploi" }[t]);
  const domaine = (id) => (METIERS.find((m) => m[0] === id) || [, , "ce métier"])[2];
  const metierLabel = (id) => (METIERS.find((m) => m[0] === id) || [, ""])[1];

  function messageCandidature(p, e) {
    const f = p.genre === "F";
    const lieu = e.ville ? `, à ${e.ville},` : "";
    return `Madame, Monsieur,

Je m'appelle ${p.nom} et je recherche ${article(p.typ)} dans ${domaine(p.metier)}. Votre entreprise, ${e.nom}${lieu} est proche de chez moi et correspond à ce que je souhaite apprendre.

Je suis ${f ? "motivée" : "motivé"}, ${f ? "ponctuelle" : "ponctuel"} et ${f ? "prête" : "prêt"} à m'investir. Vous trouverez mon CV en pièce jointe. Je serais ${f ? "heureuse" : "heureux"} de vous rencontrer, ou de vous appeler au moment qui vous convient.

Je vous remercie de votre attention.

Cordialement,
${p.nom}`;
  }

  function messageRelance(p, e) {
    const f = p.genre === "F";
    return `Madame, Monsieur,

Le ${fr(fromIso(e.envoye))}, je vous ai envoyé ma candidature pour ${article(e.typ || p.typ)} chez ${e.entreprise}. Je me permets de revenir vers vous : je suis toujours très ${f ? "intéressée" : "intéressé"} et disponible pour un entretien ou un échange téléphonique.

Je vous remercie par avance pour votre réponse.

Cordialement,
${p.nom}`;
  }

  // ---------- helpers ----------
  function toast(t) {
    const el = $("#toast"); el.textContent = t; el.classList.add("on");
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove("on"), 2600);
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
  // ---------- rappels agenda (rien n'est stocké : l'événement va dans l'agenda du jeune) ----------
  const APP_URL = "https://kit-prospection.vercel.app";
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
  const stampUTC = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
  function evDates(day, h, m, dur) {
    const a = new Date(day); a.setHours(h, m, 0, 0);
    const b = new Date(a.getTime() + dur * 60000);
    return [a, b];
  }
  function gcal(ev) {
    const [a, b] = evDates(ev.day, ev.h, ev.m, ev.dur);
    let u = "https://calendar.google.com/calendar/render?action=TEMPLATE"
      + "&text=" + encodeURIComponent(ev.title) + "&dates=" + stamp(a) + "/" + stamp(b)
      + "&ctz=Europe/Paris&details=" + encodeURIComponent(ev.details);
    if (ev.rrule) u += "&recur=" + encodeURIComponent("RRULE:" + ev.rrule);
    return u;
  }
  function ics(ev) {
    const [a, b] = evDates(ev.day, ev.h, ev.m, ev.dur);
    const escTxt = (t) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kit de prospection//FR", "CALSCALE:GREGORIAN", "BEGIN:VEVENT",
      "UID:" + Date.now() + Math.random().toString(36).slice(2) + "@kit-prospection", "DTSTAMP:" + stampUTC(new Date()),
      "DTSTART:" + stampUTC(a), "DTEND:" + stampUTC(b),
      "SUMMARY:" + escTxt(ev.title), "DESCRIPTION:" + escTxt(ev.details), "URL:" + APP_URL];
    if (ev.rrule) lines.push("RRULE:" + ev.rrule);
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + escTxt(ev.title), "TRIGGER:-PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(lines.join("\r\n"));
  }
  const prochainJourOuvre = (d) => { const x = new Date(d); x.setDate(x.getDate() + 1); while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1); return x; };
  function evRelance(e) {
    let jour = addDays(fromIso(e.envoye), RELANCE);
    while (jour.getDay() === 0 || jour.getDay() === 6) jour.setDate(jour.getDate() + 1);
    return { title: "Relancer " + e.entreprise, day: jour, h: 10, m: 0, dur: 15,
      details: "Pas de réponse de " + e.entreprise + " ? C'est le moment de relancer.\nOuvre le Kit de prospection, onglet « Mon suivi » : le message de relance est prêt à copier.\n" + APP_URL };
  }
  const evQuotidien = () => ({ title: "Mes candidatures (15 min)", day: prochainJourOuvre(jour(0)), h: 9, m: 0, dur: 15,
    rrule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;COUNT=15",
    details: "15 minutes pour ma recherche : 2 candidatures et les relances du jour.\n" + APP_URL });
  const liensAgenda = (ev, nom) => `<a href="${gcal(ev)}" target="_blank" rel="noopener">Google Agenda</a> · <a href="${ics(ev)}" download="${nom}.ics">Autre agenda</a>`;

  const statutAffiche = (e) => (e.statut === "Envoyé" && today() >= addDays(fromIso(e.envoye), RELANCE)) ? "À relancer" : e.statut;

  // ---------- navigation ----------
  $$(".seg button").forEach((b) => b.addEventListener("click", () => {
    $$(".seg button").forEach((x) => x.setAttribute("aria-selected", String(x === b)));
    const e = b.dataset.espace;
    $("#espace-jeune").hidden = e !== "jeune";
    $("#espace-conseiller").hidden = e !== "conseiller";
    if (e === "conseiller") renderConseiller();
    window.scrollTo({ top: 0 });
  }));
  $$(".subtabs button").forEach((b) => b.addEventListener("click", () => showSub(b.dataset.sub)));
  function showSub(name) {
    $$(".subtabs button").forEach((x) => x.classList.toggle("on", x.dataset.sub === name));
    $("#sub-chercher").hidden = name !== "chercher";
    $("#sub-suivi").hidden = name !== "suivi";
    if (name === "suivi") renderSuivi();
    if (name === "chercher" && map) setTimeout(() => map.invalidateSize(), 50);
  }

  // ---------- form init ----------
  $("#site").innerHTML = SITES.map(([v, l]) => `<option value="${v}">${l}</option>`).join("");
  $("#metier").innerHTML = METIERS.map(([v, l]) => `<option value="${v}"${v === "boulangerie" ? " selected" : ""}>${l}</option>`).join("");
  $("#rayon").addEventListener("input", (e) => { $("#rayon-out").textContent = e.target.value + " km"; });

  // ---------- search ----------
  let map = null, layer = null;
  $("#profil").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const p = profil();
    const qs = new URLSearchParams({ site: p.site, metier: p.metier, rayon: $("#rayon").value, sal: $("#sal").checked ? "1" : "0" });
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
      $("#map").hidden = true;
      return;
    }
    $("#map").hidden = false;
    $("#res-title").textContent = `${res.length} entreprise${res.length > 1 ? "s" : ""} près du site`;
    renderMap();
    renderListe();
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
      L.marker([S.centre.lat, S.centre.lon], { icon: L.divIcon({ className: "pin-site", iconSize: [22, 22] }), title: "Site E2C" })
        .bindTooltip("Site E2C (approx.)").addTo(layer);
      pts.push([S.centre.lat, S.centre.lon]);
    }
    S.resultats.forEach((e, i) => {
      const m = L.marker([e.lat, e.lon], { icon: L.divIcon({ className: "pin" + (S.ouvert === e.siret ? " on" : ""), html: String(i + 1), iconSize: [26, 26] }) })
        .bindTooltip(esc(e.nom)).addTo(layer);
      m.on("click", () => ouvrir(e.siret, true));
      pts.push([e.lat, e.lon]);
    });
    map.fitBounds(pts, { padding: [24, 24], maxZoom: 15 });
    setTimeout(() => map.invalidateSize(), 60);
  }

  function renderListe() {
    const p = profil();
    const deja = new Set(S.envois.map((e) => e.siret));
    $("#liste").innerHTML = S.resultats.map((e, i) => {
      const q = encodeURIComponent(`${e.nom} ${e.adresse}`);
      const open = S.ouvert === e.siret;
      const sent = deja.has(e.siret);
      return `<li class="ent${open ? " open" : ""}" id="e-${e.siret}">
        <div class="ent-top">
          <div class="ent-main">
            <span class="ent-n">${i + 1}</span>
            <div>
              <h3>${esc(e.nom)}</h3>
              <div class="addr">${esc(e.adresse)}</div>
              <div class="chips"><span class="chip dist">${e.distance} km</span>${e.effectif ? `<span class="chip">${esc(e.effectif)}</span>` : ""}</div>
            </div>
          </div>
          ${sent ? `<span class="btn done">Envoyé ✓</span>` : `<button class="btn ${open ? "ghost" : "dark"}" data-ecrire="${e.siret}" type="button">${open ? "Fermer" : "Écrire"}</button>`}
        </div>
        <div class="links">
          <a href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener">Carte</a>
          <a href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Trouver le site / contact</a>
          <a href="https://annuaire-entreprises.data.gouv.fr/etablissement/${e.siret}" target="_blank" rel="noopener">Fiche officielle</a>
        </div>
        ${open && !sent ? panneau(p, e) : ""}
      </li>`;
    }).join("");
    $$("[data-ecrire]").forEach((b) => b.addEventListener("click", () => ouvrir(b.dataset.ecrire)));
    bindPanneau();
  }

  function panneau(p, e) {
    return `<div class="msg">
      <label class="step" for="txt-${e.siret}"><i>✎</i>Ton message (tu peux le modifier)</label>
      <textarea id="txt-${e.siret}">${esc(messageCandidature(p, e))}</textarea>
      <div class="step"><i>1</i>Copie le message</div>
      <button class="btn primary big" type="button" data-copier="${e.siret}">Copier le message</button>
      <div class="step"><i>2</i>Ouvre ta messagerie, colle le message, ajoute l'adresse de l'entreprise et ton CV</div>
      <div class="mail-btns">
        <a class="btn ghost" data-mail="gmail" target="_blank" rel="noopener">Gmail</a>
        <a class="btn ghost" data-mail="outlook" target="_blank" rel="noopener">Outlook</a>
        <a class="btn ghost" data-mail="autre">Autre messagerie</a>
      </div>
      <p class="hint">L'adresse e-mail de l'entreprise se trouve sur son site (lien « Trouver le site / contact »), ou appelle pour la demander.</p>
      <div class="step"><i>3</i>C'est envoyé ?</div>
      <button class="btn dark big" type="button" data-envoye="${e.siret}">J'ai envoyé ma candidature</button>
    </div>`;
  }

  function bindPanneau() {
    const e = S.resultats.find((x) => x.siret === S.ouvert);
    if (!e) return;
    const p = profil();
    const ta = $(`#txt-${e.siret}`);
    if (!ta) return;
    const sujet = `Candidature ${article(p.typ)} – ${p.nom}`;
    const majLiens = () => {
      const l = mailLinks(sujet, ta.value);
      $$("[data-mail]").forEach((a) => { a.href = l[a.dataset.mail]; });
    };
    majLiens();
    ta.addEventListener("input", majLiens);
    $(`[data-copier="${e.siret}"]`).addEventListener("click", async (ev) => {
      const btn = ev.currentTarget;
      const ok = await copier(ta.value);
      btn.textContent = ok ? "Message copié ✓" : "Sélectionne le texte et fais Ctrl + C";
      if (ok) toast("Message copié. Colle-le dans ta messagerie (Ctrl + V).");
    });
    $(`[data-envoye="${e.siret}"]`).addEventListener("click", () => {
      S.envois.push({ siret: e.siret, entreprise: e.nom, ville: e.ville, envoye: iso(today()), statut: "Envoyé", typ: p.typ });
      S.ouvert = null; save(); majBadge(); renderListe(); renderMap();
      const ev = evRelance(S.envois[S.envois.length - 1]);
      const li = $("#e-" + e.siret);
      if (li) li.insertAdjacentHTML("beforeend", `<div class="rappel-ok" style="margin-top:12px;background:var(--ok-soft);border-radius:12px;padding:10px 14px;font-size:.92rem"><b>Envoyé !</b> Ajoute le rappel de relance dans ton agenda (le ${fr(ev.day)}) : ${liensAgenda(ev, "relance-" + e.siret)}</div>`);
      toast("Ajouté à « Mon suivi ».");
    });
  }

  function ouvrir(siret, depuisCarte) {
    S.ouvert = S.ouvert === siret ? null : siret;
    renderListe(); renderMap();
    const el = $("#e-" + siret);
    if (el && (depuisCarte || S.ouvert)) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- suivi ----------
  const majBadge = () => { $("#nb-envois").textContent = S.envois.length; };

  function renderSuivi() {
    const p = profil();
    const env = S.envois;
    const rel = env.filter((e) => statutAffiche(e) === "À relancer");
    $("#k-env").textContent = env.length;
    $("#k-rep").textContent = env.filter((e) => e.statut !== "Envoyé").length;
    $("#k-rel").textContent = rel.length;
    $("#suivi-vide").hidden = env.length > 0;
    $("#suivi-table").hidden = env.length === 0;
    $("#date-sim").hidden = !S.decalage; $("#btn-today").hidden = !S.decalage;
    $("#date-sim").textContent = "Date simulée : " + today().toLocaleDateString("fr-FR");
    const th = $("#suivi-table thead tr");
    if (th && th.children.length === 4) th.insertAdjacentHTML("beforeend", "<th>Rappel</th>");
    let carte = $("#rappel-quotidien");
    if (!carte) {
      $("#suivi-vide").insertAdjacentHTML("beforebegin", `<div id="rappel-quotidien" style="display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;background:var(--blue-soft);border-radius:12px;padding:12px 14px;margin:0 0 14px"><div><b>Un rappel chaque matin sur ton téléphone</b><br><span style="font-size:.88rem;color:var(--ink-2)">15 minutes à 9 h, du lundi au vendredi, pendant 3 semaines.</span></div><div class="rq-liens" style="display:flex;gap:8px;flex-wrap:wrap"></div></div>`);
      carte = $("#rappel-quotidien");
    }
    const q = evQuotidien();
    carte.querySelector(".rq-liens").innerHTML = `<a class="btn ghost" href="${gcal(q)}" target="_blank" rel="noopener">Google Agenda</a><a class="btn ghost" href="${ics(q)}" download="rappel-candidatures.ics">Autre agenda</a>`;
    $("#suivi-table tbody").innerHTML = env.map((e, i) => {
      const st = statutAffiche(e);
      return `<tr>
        <td><b>${esc(e.entreprise)}</b>${st === "À relancer" ? ` <span class="tag warn">À relancer</span>` : ""}</td>
        <td>${fr(fromIso(e.envoye))}</td>
        <td>${fr(addDays(fromIso(e.envoye), RELANCE))}</td>
        <td><label class="sr"><select data-statut="${i}" aria-label="Statut pour ${esc(e.entreprise)}">${STATUTS.map((s) => `<option${s === e.statut ? " selected" : ""}>${s}</option>`).join("")}</select></label></td>
        <td style="font-size:.86rem;white-space:nowrap">${e.statut === "Envoyé" ? liensAgenda(evRelance(e), "relance-" + e.siret) : "—"}</td>
      </tr>`;
    }).join("");
    $$("[data-statut]").forEach((s) => s.addEventListener("change", () => { S.envois[+s.dataset.statut].statut = s.value; save(); renderSuivi(); }));

    $("#relances").hidden = rel.length === 0;
    $("#relances-liste").innerHTML = rel.map((e) => {
      const txt = messageRelance(p, e);
      const l = mailLinks(`Relance – candidature ${p.nom}`, txt);
      return `<details class="rel"><summary>Relancer ${esc(e.entreprise)}</summary>
        <pre>${esc(txt)}</pre>
        <div class="row"><button class="btn primary" type="button" data-copy-rel="${esc(txt)}">Copier</button>
        <a class="btn ghost" href="${l.gmail}" target="_blank" rel="noopener">Gmail</a>
        <a class="btn ghost" href="${l.outlook}" target="_blank" rel="noopener">Outlook</a>
        <a class="btn ghost" href="${l.autre}">Autre</a></div></details>`;
    }).join("");
    $$("[data-copy-rel]").forEach((b) => b.addEventListener("click", async () => {
      if (await copier(b.dataset.copyRel)) { b.textContent = "Copié ✓"; toast("Relance copiée."); }
    }));
  }
  $("#btn-sim").addEventListener("click", () => { S.decalage += 8; save(); renderSuivi(); });
  $("#btn-today").addEventListener("click", () => { S.decalage = 0; save(); renderSuivi(); });

  // ---------- conseiller ----------
  function renderConseiller() {
    const p = profil();
    const env = S.envois;
    const live = [`${p.nom} (démo en direct)`, metierLabel(p.metier), env.length,
      env.filter((e) => e.statut !== "Envoyé").length, env.filter((e) => statutAffiche(e) === "À relancer").length];
    const rows = [live, ...GROUPE];
    const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
    $("#c-jeunes").textContent = rows.length;
    $("#c-env").textContent = sum(2); $("#c-rep").textContent = sum(3); $("#c-rel").textContent = sum(4);
    const sans = rows.filter((r) => r[2] === 0).map((r) => r[0]);
    $("#c-alerte").hidden = !sans.length;
    $("#c-alerte").textContent = `Pas encore d'envoi : ${sans.join(", ")} — un coup de main peut être utile.`;
    $("#c-table tbody").innerHTML = rows.map((r, i) => `<tr class="${i === 0 ? "live" : r[2] === 0 ? "flag" : ""}">
      <td><b>${esc(r[0])}</b></td><td>${esc(r[1])}</td><td class="num">${r[2]}</td><td class="num">${r[3]}</td>
      <td class="num">${r[2] === 0 ? `<span class="tag bad">Aucun envoi</span>` : r[4]}</td></tr>`).join("");
  }

  majBadge();
})();
