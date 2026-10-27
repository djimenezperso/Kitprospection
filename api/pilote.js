// API du pilote E2C 92 : connexions, dossier du jeune (CV, lettre), suivi, vue équipe.
// Données : Vercel Blob privé, région Paris. Aucun mot de passe : code E2C + prénom pour
// les jeunes, code personnel pour l'équipe.
const crypto = require("crypto");
const store = require("../lib/store");

const SECRET = process.env.SESSION_SECRET || "dev-secret";
const SITES = { clichy: "Clichy", bagneux: "Bagneux", nanterre: "Nanterre" };
const ROLES = { admin: "Administrateur", global: "Direction (tous les sites)", responsable: "Responsable de site", formateur: "Formateur" };
const STATUTS = ["Envoyé", "Relancé", "Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];
const CV_MAX = 3 * 1024 * 1024;
const CV_TYPES = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/msword": "doc",
  "application/vnd.oasis.opendocument.text": "odt",
};

// ---------- utilitaires ----------
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");
const hmac = (s) => crypto.createHmac("sha256", SECRET).update(s).digest("hex");
const b64u = (b) => Buffer.from(b).toString("base64url");
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const normCode = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const clean = (s, max) => String(s == null ? "" : s).replace(/\u0000/g, "").slice(0, max || 200).trim();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const now = () => new Date().toISOString();
const todayParis = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(new Date());

function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  return body + "." + crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, sig] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig || ""), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    return p.exp > Date.now() ? p : null;
  } catch (e) { return null; }
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };

// ---------- équipe ----------
function seedStaff() {
  try { return JSON.parse(process.env.STAFF_SEED || "[]"); } catch (e) { return []; }
}
async function findStaffByCode(code) {
  const h = sha(normCode(code));
  const seed = seedStaff().find((s) => s.hash === h);
  if (seed) return { ...seed, id: seed.id || h.slice(0, 16), source: "seed" };
  const rec = await store.getJSON(`staff/${h}.json`);
  return rec ? { ...rec, source: "blob" } : null;
}
const sitesVisibles = (me) => (me.role === "admin" || me.role === "global") ? Object.keys(SITES) : [me.site];
const peutGererFormateurs = (me) => ["admin", "global", "responsable"].includes(me.role);

function genCode(prefix) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += abc[bytes[i] % abc.length];
  return `${prefix}-${s.slice(0, 4)}-${s.slice(4)}`;
}

// ---------- jeunes ----------
// identifiant de connexion : prenom.nom, sans accents, espaces, tirets ni majuscules
const simple = (s) => norm(s).replace(/[^a-z0-9]/g, "");
const identDe = (prenom, nom) => simple(prenom) + "." + simple(nom);
const normIdent = (s) => { const t = norm(s).split("."); return t.length < 2 ? simple(s) : simple(t[0]) + "." + simple(t.slice(1).join("")); };
const jeuneKey = (site, ident) => hmac(site + ":" + normIdent(ident)).slice(0, 32);
const jeunePath = (site, key) => `jeunes/${site}/${key}.json`;
function vueJeune(j) {
  return {
    site: j.site, siteNom: SITES[j.site], prenom: j.prenom, nom: j.nom, ident: j.ident, genre: j.genre || "",
    typ: j.typ || "", metier: j.metier || "", rayon: j.rayon || 3, lettre: j.lettre || "", objet: j.objet || "",
    cv: j.cv ? { nom: j.cv.nom, taille: j.cv.taille, date: j.cv.date } : null,
    envois: j.envois || [],
  };
}
function resume(j) {
  const env = j.envois || [];
  const t = todayParis();
  const aRelancer = env.filter((e) => e.statut === "Envoyé" && e.relance && e.relance <= t).length;
  const reponses = env.filter((e) => !["Envoyé", "Relancé"].includes(e.statut)).length;
  return {
    key: j.key, site: j.site, prenom: j.prenom, nom: j.nom, ident: j.ident, code: j.code || "", formateur: j.formateur || "",
    metier: j.metier || "", typ: j.typ || "", cv: !!j.cv, lettre: !!(j.lettre && j.lettre.trim()),
    envois: env.length, relances: env.filter((e) => e.relanceFaite || e.statut === "Relancé").length,
    reponses, entretiens: env.filter((e) => e.statut === "Entretien obtenu").length,
    pris: env.filter((e) => e.statut === "Pris(e)").length, aRelancer,
    derniere: j.vu || "", cree: j.cree || "",
  };
}
function relanceDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function loadJeune(site, key) {
  if (!SITES[site] || !/^[a-f0-9]{32}$/.test(key || "")) fail(404, "Jeune introuvable.");
  const j = await store.getJSON(jeunePath(site, key));
  if (!j) fail(404, "Jeune introuvable.");
  return j;
}
const saveJeune = (j) => store.putJSON(jeunePath(j.site, j.key), j);

// ---------- handler ----------
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return {};
}
function auth(req) {
  const h = req.headers.authorization || "";
  return verify(h.replace(/^Bearer\s+/i, ""));
}
function needJeune(s) { if (!s || s.k !== "j") fail(401, "Session expirée. Reconnecte-toi."); return s; }
async function needStaff(s) {
  if (!s || s.k !== "s") fail(401, "Session expirée. Reconnectez-vous.");
  if (s.src === "blob") { // formateur supprimé → accès coupé
    const rec = await store.getJSON(`staff/${s.h}.json`);
    if (!rec) fail(401, "Accès désactivé.");
  }
  return s;
}
function needSite(me, site) {
  if (!SITES[site]) fail(400, "Site inconnu.");
  if (!sitesVisibles(me).includes(site)) fail(403, "Ce site ne fait pas partie de vos accès.");
}

const actions = {
  // vérification technique du stockage (écriture + lecture), sans données personnelles
  async sante() {
    const t = now();
    await store.putJSON("sante/test.json", { t });
    const r = await store.getJSON("sante/test.json");
    return { ok: !!r && r.t === t, stockage: process.env.LOCAL_STORE ? "local" : "blob", region: process.env.VERCEL_REGION || "" };
  },
  // ----- connexions -----
  async "login-jeune"(req, b) {
    const site = String(b.site || "");
    if (!SITES[site]) fail(400, "Choisis ton site.");
    const ident = normIdent(b.ident);
    if (ident.indexOf(".") < 1) fail(400, "Écris ton identifiant sous la forme prénom.nom");
    const j = await store.getJSON(jeunePath(site, jeuneKey(site, ident)));
    if (!j) { await sleep(500); fail(401, "Identifiant inconnu sur ce site. Vérifie le site et l'orthographe, ou demande à ton formateur."); }
    const key = j.key;
    j.vu = now(); await saveJeune(j);
    const token = sign({ k: "j", site, key, exp: Date.now() + 60 * 24 * 3600 * 1000 });
    return { token, jeune: vueJeune(j) };
  },
  async "login-staff"(req, b) {
    const me = await findStaffByCode(b.code || "");
    if (!me) { await sleep(600); fail(401, "Code d'accès incorrect."); }
    const token = sign({ k: "s", id: me.id, nom: me.nom, role: me.role, site: me.site || "", src: me.source, h: sha(normCode(b.code)), exp: Date.now() + 14 * 24 * 3600 * 1000 });
    return { token, me: { nom: me.nom, role: me.role, roleNom: ROLES[me.role], site: me.site || "", sites: sitesVisibles(me).map((s) => [s, SITES[s]]), gere: peutGererFormateurs(me) } };
  },
  async "me-staff"(req, b, s) {
    const me = await needStaff(s);
    return { me: { nom: me.nom, role: me.role, roleNom: ROLES[me.role], site: me.site || "", sites: sitesVisibles(me).map((x) => [x, SITES[x]]), gere: peutGererFormateurs(me) } };
  },

  // ----- espace jeune -----
  async moi(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    return { jeune: vueJeune(j) };
  },
  async profil(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    if (b.genre !== undefined) j.genre = ["F", "M"].includes(b.genre) ? b.genre : "";
    if (b.typ !== undefined) j.typ = ["stage", "alternance", "emploi"].includes(b.typ) ? b.typ : "";
    if (b.metier !== undefined) j.metier = clean(b.metier, 40);
    if (b.rayon !== undefined) j.rayon = Math.min(Math.max(+b.rayon || 3, 1), 10);
    if (b.lettre !== undefined) j.lettre = clean(b.lettre, 8000);
    if (b.objet !== undefined) j.objet = clean(b.objet, 200);
    j.vu = now();
    await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  async cv(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    const ext = CV_TYPES[b.type];
    if (!ext) fail(400, "Format accepté : PDF ou Word.");
    const buf = Buffer.from(String(b.data || ""), "base64");
    if (!buf.length) fail(400, "Fichier vide.");
    if (buf.length > CV_MAX) fail(400, "Fichier trop lourd (3 Mo maximum).");
    const p = `cv/${j.site}/${j.key}-${crypto.randomBytes(6).toString("hex")}.${ext}`;
    await store.putBuffer(p, buf, b.type);
    if (j.cv && j.cv.path) await store.remove(j.cv.path);
    j.cv = { path: p, nom: clean(b.nom, 120) || `CV.${ext}`, type: b.type, taille: buf.length, date: now() };
    j.vu = now();
    await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  async "cv-suppr"(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    if (j.cv && j.cv.path) await store.remove(j.cv.path);
    j.cv = null; await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  async envoi(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    j.envois = j.envois || [];
    const siret = clean(b.siret, 20);
    if (!siret) fail(400, "Entreprise manquante.");
    if (!j.envois.find((e) => e.siret === siret)) {
      const d = todayParis();
      j.envois.push({
        siret, entreprise: clean(b.entreprise, 160), adresse: clean(b.adresse, 200), ville: clean(b.ville, 80),
        metier: j.metier || "", typ: j.typ || "", envoye: d, relance: relanceDate(d), statut: "Envoyé",
        relanceFaite: "", maj: now(),
      });
    }
    j.vu = now(); await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  async statut(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    const e = (j.envois || []).find((x) => x.siret === b.siret);
    if (!e) fail(404, "Envoi introuvable.");
    if (b.statut !== undefined) {
      if (!STATUTS.includes(b.statut)) fail(400, "Statut inconnu.");
      e.statut = b.statut;
      if (b.statut === "Relancé" && !e.relanceFaite) e.relanceFaite = todayParis();
    }
    if (b.suppr) j.envois = j.envois.filter((x) => x.siret !== b.siret);
    e.maj = now(); j.vu = now();
    await saveJeune(j);
    return { jeune: vueJeune(j) };
  },

  // ----- espace équipe -----
  async jeunes(req, b, s) {
    const me = await needStaff(s);
    const sites = b.site && b.site !== "tous" ? [b.site] : sitesVisibles(me);
    sites.forEach((x) => needSite(me, x));
    const out = [];
    for (const site of sites) {
      const paths = (await store.list(`jeunes/${site}/`)).filter((p) => p.endsWith(".json"));
      const recs = await Promise.all(paths.map((p) => store.getJSON(p)));
      recs.filter(Boolean).forEach((j) => out.push(resume(j)));
    }
    out.sort((a, c) => a.site.localeCompare(c.site) || a.nom.localeCompare(c.nom) || a.prenom.localeCompare(c.prenom));
    return { jeunes: out, aujourdhui: todayParis() };
  },
  async jeune(req, b, s) {
    const me = await needStaff(s);
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    return { jeune: { ...vueJeune(j), code: j.code || "", formateur: j.formateur || "", key: j.key }, resume: resume(j) };
  },
  async "ajout-jeunes"(req, b, s) {
    const me = await needStaff(s);
    needSite(me, b.site);
    const lignes = Array.isArray(b.lignes) ? b.lignes.slice(0, 200) : [];
    const crees = [], existants = [], erreurs = [];
    for (const l of lignes) {
      const prenom = clean(l.prenom, 60), nom = clean(l.nom, 80), code = normCode(l.code).slice(0, 20);
      if (!simple(prenom) || !simple(nom)) { erreurs.push(`${prenom || "?"} ${nom || "?"} : prénom ou nom manquant`); continue; }
      const ident = identDe(prenom, nom);
      const key = jeuneKey(b.site, ident);
      const deja = await store.getJSON(jeunePath(b.site, key));
      if (deja) { existants.push(`${deja.prenom} ${deja.nom}`); continue; }
      const j = { key, site: b.site, prenom, nom, ident, code, formateur: clean(b.formateur || l.formateur, 80),
        envois: [], cree: now(), creePar: me.nom };
      await saveJeune(j);
      crees.push({ prenom, nom, ident, code, site: b.site });
    }
    return { crees, existants, erreurs };
  },
  async "maj-jeune"(req, b, s) {
    const me = await needStaff(s);
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    if (b.formateur !== undefined) j.formateur = clean(b.formateur, 80);
    if (b.code !== undefined) j.code = normCode(b.code).slice(0, 20);
    await saveJeune(j);
    return { ok: true };
  },
  async "suppr-jeune"(req, b, s) {
    const me = await needStaff(s);
    if (!peutGererFormateurs(me)) fail(403, "Réservé aux responsables.");
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    if (j.cv && j.cv.path) await store.remove(j.cv.path);
    await store.remove(jeunePath(b.site, b.key));
    return { ok: true };
  },
  async formateurs(req, b, s) {
    const me = await needStaff(s);
    const sites = sitesVisibles(me);
    const seed = seedStaff().filter((x) => x.role !== "admin" && (x.role === "global" || sites.includes(x.site)))
      .map((x) => ({ nom: x.nom, role: x.role, roleNom: ROLES[x.role], site: x.site || "", fixe: true }));
    const paths = (await store.list("staff/")).filter((p) => p.endsWith(".json"));
    const recs = (await Promise.all(paths.map((p) => store.getJSON(p)))).filter(Boolean)
      .filter((x) => sites.includes(x.site))
      .map((x) => ({ id: x.id, nom: x.nom, role: x.role, roleNom: ROLES[x.role], site: x.site, cree: x.cree, fixe: false }));
    return { equipe: [...seed, ...recs] };
  },
  async "ajout-formateur"(req, b, s) {
    const me = await needStaff(s);
    if (!peutGererFormateurs(me)) fail(403, "Réservé aux responsables.");
    needSite(me, b.site);
    const nom = clean(b.nom, 80);
    if (!nom) fail(400, "Nom manquant.");
    const code = genCode(b.site.slice(0, 3).toUpperCase());
    const h = sha(normCode(code));
    const rec = { id: h.slice(0, 16), nom, role: "formateur", site: b.site, cree: now(), creePar: me.nom };
    await store.putJSON(`staff/${h}.json`, rec);
    return { formateur: { nom, site: b.site, siteNom: SITES[b.site], code } };
  },
  async "suppr-formateur"(req, b, s) {
    const me = await needStaff(s);
    if (!peutGererFormateurs(me)) fail(403, "Réservé aux responsables.");
    const paths = (await store.list("staff/")).filter((p) => p.endsWith(".json"));
    for (const p of paths) {
      const r = await store.getJSON(p);
      if (r && r.id === b.id) { needSite(me, r.site); await store.remove(p); return { ok: true }; }
    }
    fail(404, "Formateur introuvable.");
  },
};

async function telechargerCV(req, res, s) {
  const q = req.query || {};
  let site, key;
  if (s && s.k === "j") { site = s.site; key = s.key; }
  else { const me = await needStaff(s); needSite(me, q.site); site = q.site; key = q.key; }
  const j = await loadJeune(site, key);
  if (!j.cv) fail(404, "Pas de CV.");
  const f = await store.getBuffer(j.cv.path);
  if (!f) fail(404, "CV introuvable.");
  const nom = (j.cv.nom || "CV").replace(/[^\w.\- ]+/g, "_");
  res.setHeader("Content-Type", j.cv.type || f.type);
  res.setHeader("Content-Disposition", `attachment; filename="${nom}"; filename*=UTF-8''${encodeURIComponent(j.cv.nom || "CV")}`);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(f.buf);
}

const METIER_NOMS = { vente: "Vente / commerce", boulangerie: "Boulangerie / pâtisserie", restauration: "Cuisine / restauration",
  mecanique: "Mécanique automobile", aide: "Aide à la personne", enfance: "Petite enfance", proprete: "Propreté / entretien",
  coiffure: "Coiffure / esthétique", logistique: "Logistique", batiment: "Bâtiment", hotellerie: "Hôtellerie / accueil" };
const frDate = (iso) => (iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "");

async function exporter(req, res, s) {
  const me = await needStaff(s);
  const q = req.query || {};
  const sites = q.site && q.site !== "tous" ? [q.site] : sitesVisibles(me);
  sites.forEach((x) => needSite(me, x));
  const tous = [];
  for (const site of sites) {
    const paths = (await store.list(`jeunes/${site}/`)).filter((p) => p.endsWith(".json"));
    (await Promise.all(paths.map((p) => store.getJSON(p)))).filter(Boolean).forEach((j) => tous.push(j));
  }
  tous.sort((a, c) => a.site.localeCompare(c.site) || a.nom.localeCompare(c.nom));
  const R = tous.map((j) => [j, resume(j)]);
  const synth = [["Site", "Jeunes", "Jeunes ayant envoyé au moins 1 candidature", "Candidatures envoyées", "Moyenne par jeune", "Relances faites", "Réponses", "Entretiens", "Stages / contrats trouvés"]];
  for (const site of sites) {
    const rs = R.filter(([j]) => j.site === site).map(([, r]) => r);
    const env = rs.reduce((a, r) => a + r.envois, 0);
    synth.push([SITES[site], rs.length, rs.filter((r) => r.envois > 0).length, env, rs.length ? Math.round((env / rs.length) * 10) / 10 : 0,
      rs.reduce((a, r) => a + r.relances, 0), rs.reduce((a, r) => a + r.reponses, 0), rs.reduce((a, r) => a + r.entretiens, 0), rs.reduce((a, r) => a + r.pris, 0)]);
  }
  if (sites.length > 1) {
    const t = synth.slice(1);
    const sum = (i) => t.reduce((a, r) => a + r[i], 0);
    synth.push(["Total", sum(1), sum(2), sum(3), sum(1) ? Math.round((sum(3) / sum(1)) * 10) / 10 : 0, sum(5), sum(6), sum(7), sum(8)]);
  }
  const jeunes = [["Site", "Prénom", "Nom", "Identifiant", "Code E2C", "Formateur", "Métier", "Recherche", "CV déposé", "Lettre prête", "Candidatures", "Relances", "Réponses", "Entretiens", "Trouvé", "À relancer", "Dernière connexion"]];
  R.forEach(([j, r]) => jeunes.push([SITES[j.site], j.prenom, j.nom, j.ident, j.code || "", j.formateur || "", METIER_NOMS[j.metier] || "", j.typ || "",
    r.cv ? "Oui" : "Non", r.lettre ? "Oui" : "Non", r.envois, r.relances, r.reponses, r.entretiens, r.pris, r.aRelancer, frDate((j.vu || "").slice(0, 10))]));
  const cands = [["Site", "Jeune", "Entreprise", "Ville", "SIRET", "Envoyée le", "Relance prévue le", "Relancée le", "Statut"]];
  R.forEach(([j]) => (j.envois || []).forEach((e) => cands.push([SITES[j.site], `${j.prenom} ${j.nom}`, e.entreprise, e.ville, e.siret,
    frDate(e.envoye), frDate(e.relance), frDate(e.relanceFaite), e.statut])));
  const buf = require("../lib/xlsx").workbook([
    { name: "Synthèse", rows: synth, widths: [14, 9, 22, 14, 12, 12, 10, 11, 16] },
    { name: "Jeunes", rows: jeunes, widths: [11, 14, 16, 22, 12, 18, 22, 11, 10, 11, 12, 9, 9, 10, 8, 10, 16] },
    { name: "Candidatures", rows: cands, widths: [11, 22, 30, 16, 16, 12, 15, 12, 16] },
  ]);
  const nom = `kit-prospection-${sites.length > 1 ? "e2c92" : sites[0]}-${todayParis()}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nom}"`);
  res.status(200).send(buf);
}

async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const q = req.query || {};
    const a = q.a || "";
    if (a === "export") return await exporter(req, res, auth(req));
    if (a === "cv-fichier") {
      return await telechargerCV(req, res, auth(req));
    }
    const fn = actions[a];
    if (!fn) fail(404, "Action inconnue.");
    const b = req.method === "GET" ? q : await body(req);
    const out = await fn(req, b, auth(req));
    res.status(200).json(out);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error("pilote", e);
    res.status(status).json({ error: status === 500 ? "Erreur du serveur. Réessayez dans un instant." : e.message });
  }
}

module.exports = handler;
module.exports.config = { api: { bodyParser: { sizeLimit: "4.5mb" } } };
module.exports._t = { sign, verify, jeuneKey, relanceDate, sha, normCode, genCode, normIdent, identDe };
