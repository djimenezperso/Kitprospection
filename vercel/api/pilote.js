// API du pilote E2C 92 : connexions, dossier du jeune (CV, lettre), suivi, vue équipe.
// Données : Vercel Blob privé, région Paris. Aucun mot de passe : code E2C + prénom pour
// les jeunes, code personnel pour l'équipe.
const crypto = require("crypto");
const store = require("../lib/store");

const SECRET = process.env.SESSION_SECRET || "dev-secret";
const SITES = { clichy: "Clichy", bagneux: "Bagneux", nanterre: "Nanterre" };
const ROLES = { admin: "Administrateur", global: "Direction (tous les sites)", responsable: "Responsable de site", formateur: "Formateur" };
const STATUTS = ["Envoyé", "À rappeler", "Relancé", "Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];
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
// Comptes fixes (STAFF_SEED) et comptes en stockage (staff/<empreinte>.json).
// Un compte fixe dont le code a été changé ou qui a été désactivé a un marqueur remplace/<id>.json.
const marqueur = (id) => store.getJSON(`remplace/${id}.json`);
const estFixe = (id) => seedStaff().some((x) => x.id === id);
async function findStaffByCode(code) {
  const h = sha(normCode(code));
  const rec = await store.getJSON(`staff/${h}.json`);
  if (rec) return { ...rec, source: "blob" };
  let seed = seedStaff().find((s) => s.hash === h);
  if (!seed) { // caractères qui se confondent à la lecture : S/5, Z/2, B/8, G/6, O/0, I/1
    const alt = { S: "5", 5: "S", Z: "2", 2: "Z", B: "8", 8: "B", G: "6", 6: "G", O: "0", 0: "O", I: "1", 1: "I", L: "1" };
    const n = normCode(code), pos = [...n].map((c, i) => (alt[c] ? i : -1)).filter((i) => i >= 0).slice(0, 10);
    const hashes = new Map(seedStaff().map((x) => [x.hash, x]));
    for (let m = 1; m < 1 << pos.length && !seed; m++) {
      const t = [...n];
      pos.forEach((i, k) => { if (m & (1 << k)) t[i] = alt[t[i]]; });
      seed = hashes.get(sha(t.join("")));
    }
    if (!seed) { // même tolérance pour les codes en stockage, mais limitée (lectures coûteuses)
      const pos2 = pos.slice(0, 4);
      for (let m = 1; m < 1 << pos2.length; m++) {
        const t = [...n];
        pos2.forEach((i, k) => { if (m & (1 << k)) t[i] = alt[t[i]]; });
        const r = await store.getJSON(`staff/${sha(t.join(""))}.json`);
        if (r) return { ...r, source: "blob", hashReel: sha(t.join("")) };
      }
    }
  }
  if (seed && !(await marqueur(seed.id))) return { ...seed, source: "seed" };
  return null;
}
async function fichiersStaff() {
  const paths = (await store.list("staff/")).filter((p) => p.endsWith(".json"));
  const recs = await Promise.all(paths.map((p) => store.getJSON(p)));
  return paths.map((p, i) => ({ p, rec: recs[i] })).filter((x) => x.rec);
}
async function membre(id) {
  const f = (await fichiersStaff()).find((x) => x.rec.id === id);
  if (f) return f.rec;
  const sd = seedStaff().find((x) => x.id === id);
  if (sd && !((await marqueur(id)) || {}).desactive) return sd;
  return null;
}
function peutGerer(me, m) {
  if (!m || m.id === me.id) return false;
  if (me.role === "admin") return true;
  if (me.role === "global") return m.role !== "admin";
  if (me.role === "responsable") return m.role === "formateur" && m.site === me.site;
  return false;
}
async function poserCode(m, code) {
  const n = normCode(code);
  if (n.length < 8) fail(400, "Le code doit contenir au moins 8 lettres ou chiffres.");
  const h = sha(n);
  if (seedStaff().some((x) => x.hash === h) || (await store.getJSON(`staff/${h}.json`))) fail(400, "Ce code n'est pas disponible. Choisissez-en un autre.");
  for (const f of await fichiersStaff()) if (f.rec.id === m.id) await store.remove(f.p);
  await store.putJSON(`staff/${h}.json`, { id: m.id, nom: m.nom, role: m.role, site: m.site || "", fixe: estFixe(m.id), cree: m.cree || now(), maj: now() });
  if (estFixe(m.id)) await store.putJSON(`remplace/${m.id}.json`, { date: now() });
  return h;
}
const sitesVisibles = (me) => (me.role === "admin" || me.role === "global") ? Object.keys(SITES) : [me.site];
const peutGererFormateurs = (me) => ["admin", "global", "responsable"].includes(me.role);

function genCode(prefix) {
  const abc = "ACDEFHJKMNPQRTUVWXY3479"; // sans S/5, Z/2, B/8, G/6, O/0, I/1/L
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
    site: j.site, siteNom: SITES[j.site], prenom: j.prenom, nom: j.nom, ident: j.ident, test: !!j.test, genre: j.genre || "",
    typ: j.typ || "", metier: j.metier || "", metierLibre: j.metierLibre || "", rayon: j.rayon || 3, lettre: j.lettre || "", objet: j.objet || "", script: j.script || "",
    cv: j.cv ? { nom: j.cv.nom, taille: j.cv.taille, date: j.cv.date } : null,
    envois: j.envois || [],
    prepares: (j.prepares || []).filter((x) => !(j.envois || []).some((e) => e.siret === x.siret)),
  };
}
function resume(j) {
  const env = j.envois || [];
  const t = todayParis();
  const aRelancer = env.filter((e) => ["Envoyé", "À rappeler"].includes(e.statut) && e.relance && e.relance <= t).length;
  const reponses = env.filter((e) => !["Envoyé", "Relancé"].includes(e.statut)).length;
  return {
    key: j.key, site: j.site, prenom: j.prenom, nom: j.nom, ident: j.ident, test: !!j.test, code: j.code || "", groupe: j.groupe || "", formateur: j.formateur || "",
    metier: j.metier || "", metierLibre: j.metierLibre || "", typ: j.typ || "", cv: !!j.cv, lettre: !!(j.lettre && j.lettre.trim()),
    envois: env.length, relances: env.filter((e) => e.relanceFaite || e.statut === "Relancé").length,
    reponses, entretiens: env.filter((e) => e.statut === "Entretien obtenu").length,
    pris: env.filter((e) => e.statut === "Pris(e)").length, aRelancer,
    prepares: (j.prepares || []).filter((x) => !env.some((e) => e.siret === x.siret)).length,
    derniere: j.vu || "", cree: j.cree || "",
    connecte: !!(j.premiere || j.vu),
    actif7: (j.jours || []).some((d) => d >= ajouterJours(t, -6)) || (j.vu || "").slice(0, 10) >= ajouterJours(t, -6),
  };
}
function relanceDate(iso) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 7);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// trace d'activité : première connexion et jours d'utilisation (pour les statistiques)
function activite(j) {
  const t = todayParis();
  j.vu = now();
  if (!j.premiere) j.premiere = j.vu;
  j.jours = j.jours || [];
  if (j.jours[j.jours.length - 1] !== t) { j.jours.push(t); if (j.jours.length > 200) j.jours = j.jours.slice(-200); }
}
async function loadJeune(site, key) {
  if (!SITES[site] || !/^[a-f0-9]{32}$/.test(key || "")) fail(404, "Jeune introuvable.");
  const j = await store.getJSON(jeunePath(site, key));
  if (!j) fail(404, "Jeune introuvable.");
  return j;
}
const saveJeune = (j) => store.putJSON(jeunePath(j.site, j.key), j);

// Variantes acceptées pour un prénom ou un nom composé : le tout collé, chaque mot,
// et les débuts (« boisnoir » et « boisnoirgonzaga » pour « Boisnoir Gonzaga »).
function variantes(txt) {
  const mots = norm(txt).split(/[\s\-']+/).map(simple).filter(Boolean);
  const v = new Set(mots);
  for (let i = 1; i <= mots.length; i++) v.add(mots.slice(0, i).join(""));
  v.add(simple(txt));
  return v;
}
async function rechercheTolerante(site, p, n) {
  const paths = (await store.list(`jeunes/${site}/`)).filter((x) => x.endsWith(".json"));
  const recs = (await Promise.all(paths.map((x) => store.getJSON(x)))).filter(Boolean);
  const trouve = (pp, nn) => recs.filter((j) => variantes(j.prenom).has(pp) && variantes(j.nom).has(nn));
  let c = trouve(p, n);
  if (!c.length) c = trouve(n, p); // nom.prénom
  if (c.length > 1) fail(401, "Plusieurs jeunes correspondent : écris ton prénom et ton nom en entier (ex. " + c[0].ident + ").");
  return c[0] || null;
}

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
  if (s.src === "blob") { // code changé ou accès désactivé → session coupée
    const rec = await store.getJSON(`staff/${s.h}.json`);
    if (!rec || rec.id !== s.id) fail(401, "Votre code d'accès a changé ou a été désactivé. Reconnectez-vous.");
  } else if (await marqueur(s.id)) fail(401, "Votre code d'accès a changé ou a été désactivé. Reconnectez-vous.");
  return s;
}
function needSite(me, site) {
  if (!SITES[site]) fail(400, "Site inconnu.");
  if (!sitesVisibles(me).includes(site)) fail(403, "Ce site ne fait pas partie de vos accès.");
}

// ---------- entreprises déjà contactées par le site (pour répartir les candidatures) ----------
const CONTACT_JOURS = 60;
async function noterContact(site, siret, key) {
  try {
    const p = `contacts/${site}.json`, t = todayParis(), lim = ajouterJours(t, -CONTACT_JOURS);
    const c = (await store.getJSON(p)) || {};
    for (const k of Object.keys(c)) { c[k] = c[k].filter((x) => x.d >= lim); if (!c[k].length) delete c[k]; }
    c[siret] = (c[siret] || []).filter((x) => x.k !== key).concat([{ d: t, k: key }]);
    await store.putJSON(p, c);
  } catch (e) { /* non bloquant */ }
}

// ---------- activité de l'équipe (visible par l'administrateur seulement) ----------
async function traceEquipe(m, evt) {
  try {
    const p = `activite-equipe/${m.id}.json`, t = todayParis();
    const a = (await store.getJSON(p)) || { id: m.id, jours: [] };
    const nouveau = a.jours[a.jours.length - 1] !== t;
    if (!nouveau && !evt) return;
    Object.assign(a, { nom: m.nom, role: m.role, site: m.site || "", derniere: now() });
    if (!a.premiere) a.premiere = a.derniere;
    if (evt === "activation") a.active = a.derniere;
    if (nouveau) { a.jours.push(t); a.jours = a.jours.slice(-120); }
    await store.putJSON(p, a);
  } catch (e) { /* ne bloque jamais la connexion */ }
}

// ---------- liens d'activation (usage unique, 7 jours) et demandes d'accès ----------
const BASE_URL = process.env.PUBLIC_URL || "https://kit-prospection.vercel.app";
async function creerLien(m, me) {
  const t = crypto.randomBytes(24).toString("base64url");
  await store.putJSON(`invites/${sha(t)}.json`, { id: m.id, exp: Date.now() + 7 * 24 * 3600 * 1000, par: me.nom, cree: now() });
  return `${BASE_URL}/pilote/?activer=${t}`;
}
async function lireLien(t) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(t || ""))) fail(400, "Lien invalide.");
  const p = `invites/${sha(t)}.json`;
  const inv = await store.getJSON(p);
  if (!inv) fail(410, "Ce lien a déjà été utilisé ou n'existe pas. Demandez-en un nouveau.");
  if (inv.exp < Date.now()) { await store.remove(p); fail(410, "Ce lien a expiré. Demandez-en un nouveau."); }
  const m = await membre(inv.id);
  if (!m) fail(410, "Ce compte n'existe plus.");
  return { p, inv, m };
}
const voitDemande = (me, d) => me.role === "admin" || me.role === "global" || (me.role === "responsable" && d.site === me.site);
async function toutesDemandes() {
  const paths = (await store.list("demandes/")).filter((x) => x.endsWith(".json"));
  const recs = await Promise.all(paths.map((x) => store.getJSON(x)));
  return paths.map((p, i) => ({ p, d: recs[i] })).filter((x) => x.d);
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
    // « prénom.nom », ou « prénom nom » ; tolère un seul prénom / un seul mot du nom
    const brut = norm(b.ident).replace(/@.*$/, "");
    let [p, ...n] = brut.includes(".") ? brut.split(".") : brut.split(" ");
    p = simple(p); n = simple(n.join(""));
    if (!p || !n) fail(400, "Écris ton identifiant sous la forme prénom.nom");
    let j = await store.getJSON(jeunePath(site, jeuneKey(site, p + "." + n)));
    if (!j && p === "test" && n === simple(site)) { // compte de démonstration du site, créé à la première connexion
      const ident = "test." + simple(site);
      j = { key: jeuneKey(site, ident), site, prenom: "Test", nom: SITES[site], ident, test: true, groupe: "Démo équipe", envois: [], cree: now() };
    }
    if (!j) j = await rechercheTolerante(site, p, n);
    if (!j) { await sleep(500); fail(401, "Identifiant inconnu sur ce site. Vérifie le site et l'orthographe, ou demande à ton formateur."); }
    const key = j.key;
    activite(j); await saveJeune(j);
    const token = sign({ k: "j", site, key, exp: Date.now() + 60 * 24 * 3600 * 1000 });
    return { token, jeune: vueJeune(j) };
  },
  async "login-staff"(req, b) {
    const me = await findStaffByCode(b.code || "");
    if (!me) { await sleep(600); fail(401, "Code d'accès incorrect."); }
    const token = sign({ k: "s", id: me.id, nom: me.nom, role: me.role, site: me.site || "", src: me.source, h: me.hashReel || sha(normCode(b.code)), exp: Date.now() + 14 * 24 * 3600 * 1000 });
    await traceEquipe(me);
    return { token, me: { nom: me.nom, role: me.role, roleNom: ROLES[me.role], site: me.site || "", sites: sitesVisibles(me).map((s) => [s, SITES[s]]), gere: peutGererFormateurs(me) } };
  },
  async "me-staff"(req, b, s) {
    const me = await needStaff(s);
    await traceEquipe(me);
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
    if (b.metierLibre !== undefined) j.metierLibre = clean(b.metierLibre, 60);
    if (b.rayon !== undefined) j.rayon = Math.min(Math.max(+b.rayon || 3, 1), 10);
    if (b.lettre !== undefined) j.lettre = clean(b.lettre, 8000);
    if (b.objet !== undefined) j.objet = clean(b.objet, 200);
    if (b.script !== undefined) j.script = clean(b.script, 6000);
    activite(j);
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
    activite(j);
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
    const ex = j.envois.find((e) => e.siret === siret);
    if (!ex) {
      const d = todayParis();
      j.envois.push({
        siret, entreprise: clean(b.entreprise, 160), adresse: clean(b.adresse, 200), ville: clean(b.ville, 80),
        metier: j.metier || "", typ: j.typ || "", envoye: d, relance: relanceDate(d), statut: "Envoyé",
        relanceFaite: "", maj: now(), canal: "email", email: clean(b.email, 120),
      });
    } else if (ex.canal === "appel") { // CV envoyé par e-mail après un appel
      const d = todayParis();
      Object.assign(ex, { canal: "appel+email", statut: ex.statut === "À rappeler" ? "Envoyé" : ex.statut, relance: relanceDate(d), email: clean(b.email, 120) || ex.email || "", maj: now() });
    }
    j.prepares = (j.prepares || []).filter((x) => x.siret !== siret);
    if (!j.test) await noterContact(j.site, siret, j.key);
    activite(j); await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  // message préparé (lettre copiée ou messagerie ouverte) mais pas encore confirmé comme envoyé
  async "contacts-site"(req, b, s) {
    needJeune(s);
    const c = (await store.getJSON(`contacts/${s.site}.json`)) || {};
    const lim = ajouterJours(todayParis(), -CONTACT_JOURS), out = {};
    for (const [siret, l] of Object.entries(c)) {
      const autres = l.filter((x) => x.k !== s.key && x.d >= lim);
      if (autres.length) out[siret] = { n: autres.length, derniere: autres.map((x) => x.d).sort().pop() };
    }
    return { contacts: out };
  },
  async prepare(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    const siret = clean(b.siret, 20);
    if (!siret) fail(400, "Entreprise manquante.");
    j.prepares = j.prepares || [];
    if (!(j.envois || []).some((e) => e.siret === siret) && !j.prepares.some((x) => x.siret === siret)) {
      j.prepares.push({ siret, entreprise: clean(b.entreprise, 160), adresse: clean(b.adresse, 200), ville: clean(b.ville, 80), date: todayParis() });
      j.prepares = j.prepares.slice(-30);
      activite(j); await saveJeune(j);
    }
    return { jeune: vueJeune(j) };
  },
  async "annule-prepare"(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    j.prepares = (j.prepares || []).filter((x) => x.siret !== b.siret);
    await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  // appel téléphonique : resultat = entretien | cv | rappeler | refus
  async appel(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    j.envois = j.envois || [];
    const siret = clean(b.siret, 20);
    if (!siret) fail(400, "Entreprise manquante.");
    const res = { entretien: "Entretien obtenu", cv: "Envoyé", rappeler: "À rappeler", refus: "Refus" }[b.resultat];
    if (!res) fail(400, "Résultat inconnu.");
    const d = todayParis();
    let e = j.envois.find((x) => x.siret === siret);
    if (!e) {
      e = { siret, entreprise: clean(b.entreprise, 160), adresse: clean(b.adresse, 200), ville: clean(b.ville, 80),
        metier: j.metier || "", typ: j.typ || "", envoye: d, relance: "", statut: "", relanceFaite: "", canal: "appel", dates: {} };
      j.envois.push(e);
      if (!j.test) await noterContact(j.site, siret, j.key);
    } else if (e.canal === "email") e.canal = "email+appel";
    e.tel = clean(b.tel, 30) || e.tel || "";
    e.appels = (e.appels || []).concat([{ d, r: b.resultat }]).slice(-10);
    e.statut = res;
    e.dates = e.dates || {};
    if (res !== "Envoyé" && !e.dates[res]) e.dates[res] = d;
    if (res === "À rappeler") { const x = new Date(d + "T12:00:00Z"); let n = 0; while (n < 2) { x.setUTCDate(x.getUTCDate() + 1); if (x.getUTCDay() % 6) n++; } e.relance = x.toISOString().slice(0, 10); }
    else if (res === "Envoyé") e.relance = relanceDate(d);
    e.maj = now();
    j.prepares = (j.prepares || []).filter((x) => x.siret !== siret);
    activite(j); await saveJeune(j);
    return { jeune: vueJeune(j) };
  },
  async statut(req, b, s) {
    needJeune(s);
    const j = await loadJeune(s.site, s.key);
    const e = (j.envois || []).find((x) => x.siret === b.siret);
    if (!e) fail(404, "Envoi introuvable.");
    if (b.statut !== undefined) {
      if (!STATUTS.includes(b.statut)) fail(400, "Statut inconnu.");
      if (e.statut !== b.statut) {
        e.statut = b.statut;
        e.dates = e.dates || {};
        if (!e.dates[b.statut]) e.dates[b.statut] = todayParis();
        e.hist = (e.hist || []).concat([{ d: todayParis(), s: b.statut }]).slice(-20);
      }
      if (b.statut === "Relancé" && !e.relanceFaite) e.relanceFaite = todayParis();
    }
    if (b.suppr) j.envois = j.envois.filter((x) => x.siret !== b.siret);
    e.maj = now(); activite(j);
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
  async stats(req, b, s) {
    const me = await needStaff(s);
    const sites = b.site && b.site !== "tous" ? [b.site] : sitesVisibles(me);
    sites.forEach((x) => needSite(me, x));
    let js = (await jeunesDe(sites)).filter((j) => !j.test);
    if (b.groupe) js = js.filter((j) => (j.groupe || "") === b.groupe);
    return { sites: sites.map((x) => [x, SITES[x]]), stats: calculerStats(js) };
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
      const j = { key, site: b.site, prenom, nom, ident, code, groupe: clean(l.groupe, 40), formateur: clean(b.formateur || l.formateur, 80),
        envois: [], cree: now(), creePar: me.nom };
      await saveJeune(j);
      crees.push({ prenom, nom, ident, code, site: b.site });
    }
    return { crees, existants, erreurs };
  },
  async "activite-equipe"(req, b, s) {
    const me = await needStaff(s);
    if (me.role !== "admin") fail(403, "Réservé à l'administrateur.");
    const paths = (await store.list("activite-equipe/")).filter((x) => x.endsWith(".json"));
    const acts = new Map((await Promise.all(paths.map((x) => store.getJSON(x)))).filter(Boolean).map((a) => [a.id, a]));
    const fichiers = (await fichiersStaff()).map((f) => f.rec);
    const ids = new Set(fichiers.map((x) => x.id));
    const marq = await Promise.all(seedStaff().map((x) => marqueur(x.id)));
    const tous = [...seedStaff().filter((x, i) => !ids.has(x.id) && !(marq[i] || {}).desactive), ...fichiers].filter((x) => x.id !== me.id);
    const t = todayParis(), il7 = ajouterJours(t, -6), il30 = ajouterJours(t, -29);
    const invites = (await store.list("invites/")).length;
    const lignes = tous.map((m) => { const a = acts.get(m.id) || { jours: [] };
      return { nom: m.nom, role: ROLES[m.role], site: SITES[m.site] || "Tous", connecte: !!a.premiere, codePerso: fichiers.some((f) => f.id === m.id && f.maj),
        premiere: a.premiere || "", derniere: a.derniere || "", jours7: a.jours.filter((d) => d >= il7).length, jours30: a.jours.filter((d) => d >= il30).length }; })
      .sort((a, c) => (c.derniere || "").localeCompare(a.derniere || "") || a.nom.localeCompare(c.nom));
    return { equipe: lignes, liensEnAttente: invites };
  },
  async "reset-test"(req, b, s) {
    const me = await needStaff(s);
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    if (!j.test) fail(400, "Réservé aux comptes de test.");
    if (j.cv && j.cv.path) await store.remove(j.cv.path);
    Object.assign(j, { envois: [], prepares: [], cv: null, lettre: "", objet: "", metier: "", typ: "", genre: "", jours: [] });
    delete j.premiere; delete j.vu;
    await saveJeune(j);
    return { ok: true };
  },
  async "reset-activite"(req, b, s) {
    const me = await needStaff(s);
    if (me.role !== "admin") fail(403, "Réservé à l'administrateur.");
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    delete j.premiere; delete j.vu; delete j.jours;
    await saveJeune(j);
    return { ok: true };
  },
  // le formateur confirme (ou non) un e-mail préparé que le jeune n'a pas marqué comme envoyé
  async "confirmer-envoi"(req, b, s) {
    const me = await needStaff(s);
    needSite(me, b.site);
    const j = await loadJeune(b.site, b.key);
    const p = (j.prepares || []).find((x) => x.siret === b.siret);
    if (!p) fail(404, "Candidature préparée introuvable.");
    j.prepares = j.prepares.filter((x) => x.siret !== b.siret);
    j.envois = j.envois || [];
    if (b.envoye && !j.envois.some((e) => e.siret === p.siret)) {
      const d = todayParis();
      j.envois.push({ siret: p.siret, entreprise: p.entreprise, adresse: p.adresse, ville: p.ville, metier: j.metier || "", typ: j.typ || "",
        envoye: p.date || d, relance: relanceDate(p.date || d), statut: "Envoyé", relanceFaite: "", maj: now(), canal: "email", email: "", confirmePar: clean(me.nom, 80) });
      if (!j.test) await noterContact(j.site, p.siret, j.key);
    }
    await saveJeune(j);
    return { ok: true };
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
    const visible = (x) => x.role !== "admin" && (x.role === "global" || sites.includes(x.site));
    const fichiers = (await fichiersStaff()).map((f) => f.rec);
    const ids = new Set(fichiers.map((x) => x.id));
    const marq = await Promise.all(seedStaff().map((x) => marqueur(x.id)));
    const seed = seedStaff().filter((x, i) => !ids.has(x.id) && !(marq[i] || {}).desactive);
    const tous = [...seed, ...fichiers].filter(visible);
    const ordre = { global: 0, responsable: 1, formateur: 2 };
    tous.sort((a, b) => (ordre[a.role] - ordre[b.role]) || (a.site || "").localeCompare(b.site || "") || a.nom.localeCompare(b.nom));
    return { equipe: tous.map((x) => ({ id: x.id, nom: x.nom, role: x.role, roleNom: ROLES[x.role], site: x.site || "", moi: x.id === me.id, gerable: peutGerer(me, x) })) };
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
    const m = await membre(String(b.id || ""));
    if (!m) fail(404, "Compte introuvable.");
    if (!peutGerer(me, m)) fail(403, "Vous ne pouvez pas désactiver ce compte.");
    for (const f of await fichiersStaff()) if (f.rec.id === m.id) await store.remove(f.p);
    if (estFixe(m.id)) await store.putJSON(`remplace/${m.id}.json`, { date: now(), desactive: true, par: me.nom });
    return { ok: true };
  },
  async "lien-activation"(req, b, s) {
    const me = await needStaff(s);
    const m = await membre(String(b.id || ""));
    if (!m) fail(404, "Compte introuvable.");
    if (!peutGerer(me, m)) fail(403, "Vous ne pouvez pas gérer ce compte.");
    return { nom: m.nom, roleNom: ROLES[m.role], site: m.site || "", siteNom: SITES[m.site] || "Tous les sites", lien: await creerLien(m, me) };
  },
  async "liens-equipe"(req, b, s) { // tous les comptes que je gère
    const me = await needStaff(s);
    if (!peutGererFormateurs(me)) fail(403, "Réservé aux responsables.");
    const fichiers = (await fichiersStaff()).map((f) => f.rec);
    const ids = new Set(fichiers.map((x) => x.id));
    const marq = await Promise.all(seedStaff().map((x) => marqueur(x.id)));
    const tous = [...seedStaff().filter((x, i) => !ids.has(x.id) && !(marq[i] || {}).desactive), ...fichiers]
      .filter((m) => peutGerer(me, m) && (!b.site || m.site === b.site));
    const out = [];
    for (const m of tous) out.push({ nom: m.nom, roleNom: ROLES[m.role], site: m.site || "", siteNom: SITES[m.site] || "Tous les sites", lien: await creerLien(m, me) });
    const ordre = { global: 0, responsable: 1, formateur: 2 };
    out.sort((a, c) => (a.site || "").localeCompare(c.site || "") || a.nom.localeCompare(c.nom));
    return { liens: out };
  },
  async "activer-info"(req, b) {
    const { m, inv } = await lireLien(b.t);
    return { nom: m.nom, roleNom: ROLES[m.role], siteNom: SITES[m.site] || "Tous les sites", expire: new Date(inv.exp).toISOString() };
  },
  async activer(req, b) {
    const { p, m } = await lireLien(b.t);
    const h = await poserCode(m, b.code);
    await store.remove(p);
    await traceEquipe(m, "activation");
    const token = sign({ k: "s", id: m.id, nom: m.nom, role: m.role, site: m.site || "", src: "blob", h, exp: Date.now() + 14 * 24 * 3600 * 1000 });
    return { token, me: { nom: m.nom, role: m.role, roleNom: ROLES[m.role], site: m.site || "", sites: sitesVisibles(m).map((x) => [x, SITES[x]]), gere: peutGererFormateurs(m) } };
  },
  async "demande-acces"(req, b) {
    const nom = clean(b.nom, 80), site = SITES[b.site] ? b.site : (b.site === "direction" ? "direction" : "");
    if (nom.length < 3 || !site) fail(400, "Indiquez votre nom et votre site.");
    const recentes = (await toutesDemandes()).filter((x) => x.d.statut === "en attente");
    if (recentes.length > 50) fail(429, "Trop de demandes en attente. Contactez directement votre responsable.");
    const id = Date.now().toString(36) + crypto.randomBytes(4).toString("hex");
    await store.putJSON(`demandes/${id}.json`, { id, nom, site, contact: clean(b.contact, 120), message: clean(b.message, 400), date: now(), statut: "en attente" });
    return { ok: true };
  },
  async demandes(req, b, s) {
    const me = await needStaff(s);
    if (!peutGererFormateurs(me)) return { demandes: [], enAttente: 0 };
    const ds = (await toutesDemandes()).map((x) => x.d).filter((d) => voitDemande(me, d))
      .sort((a, c) => (a.statut === "en attente" ? 0 : 1) - (c.statut === "en attente" ? 0 : 1) || c.date.localeCompare(a.date)).slice(0, 60);
    return { demandes: ds.map((d) => ({ ...d, siteNom: SITES[d.site] || "Direction / tous les sites" })), enAttente: ds.filter((d) => d.statut === "en attente").length };
  },
  async "traiter-demande"(req, b, s) {
    const me = await needStaff(s);
    const f = (await toutesDemandes()).find((x) => x.d.id === b.id);
    if (!f || !voitDemande(me, f.d)) fail(404, "Demande introuvable.");
    if (f.d.statut !== "en attente") fail(400, "Cette demande a déjà été traitée.");
    const d = f.d;
    if (b.action === "refuser") {
      Object.assign(d, { statut: "refusée", par: me.nom, traitee: now() });
      await store.putJSON(f.p, d);
      return { ok: true };
    }
    const m = await membre(String(b.membre || ""));
    if (!m) fail(400, "Choisissez le compte de cette personne.");
    if (!peutGerer(me, m)) fail(403, "Vous ne pouvez pas gérer ce compte.");
    const lien = await creerLien(m, me);
    Object.assign(d, { statut: "validée", par: me.nom, traitee: now(), compte: m.nom });
    await store.putJSON(f.p, d);
    return { nom: m.nom, roleNom: ROLES[m.role], siteNom: SITES[m.site] || "Tous les sites", lien };
  },
  async "mon-code"(req, b, s) {
    const me = await needStaff(s);
    const m = await membre(me.id);
    if (!m) fail(401, "Compte introuvable.");
    const h = await poserCode(m, b.nouveau);
    const token = sign({ k: "s", id: m.id, nom: m.nom, role: m.role, site: m.site || "", src: "blob", h, exp: Date.now() + 14 * 24 * 3600 * 1000 });
    return { ok: true, token };
  },
  async "reset-code"(req, b, s) {
    const me = await needStaff(s);
    const m = await membre(String(b.id || ""));
    if (!m) fail(404, "Compte introuvable.");
    if (!peutGerer(me, m)) fail(403, "Vous ne pouvez pas modifier ce compte.");
    const code = genCode((m.site || "e2c").slice(0, 3).toUpperCase());
    await poserCode(m, code);
    return { nom: m.nom, site: m.site, siteNom: SITES[m.site] || "Tous les sites", roleNom: ROLES[m.role], code };
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

// ---------- statistiques ----------
const REPONSES = ["Réponse positive", "Entretien obtenu", "Refus", "Pris(e)"];
const POSITIVES = ["Réponse positive", "Entretien obtenu", "Pris(e)"];
const ajouterJours = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lundi = (iso) => { const d = new Date(iso + "T12:00:00Z"); const k = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - k); return d.toISOString().slice(0, 10); };
const ecart = (a, b) => Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);
const mediane = (xs) => { if (!xs.length) return null; const v = xs.slice().sort((a, b) => a - b), m = v.length >> 1; return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2); };
const dateStatut = (e, liste) => { const d = liste.map((x) => (e.dates || {})[x]).filter(Boolean).sort()[0]; return d || (liste.includes(e.statut) ? (e.maj || "").slice(0, 10) : ""); };

function calculerStats(jeunes) {
  const t = todayParis(), il7 = ajouterJours(t, -6);
  const env = [];
  jeunes.forEach((j) => (j.envois || []).forEach((e) => env.push({ j, e })));
  const actif = (j) => (j.jours || []).some((d) => d >= il7) || (j.vu || "").slice(0, 10) >= il7;
  const dues = env.filter(({ e }) => e.relance && e.relance <= t && (["Envoyé", "Relancé"].includes(e.statut) || e.relanceFaite));
  const faites = dues.filter(({ e }) => e.relanceFaite || e.statut === "Relancé");
  const rep = env.filter(({ e }) => REPONSES.includes(e.statut));
  const delaisRep = rep.map(({ e }) => { const d = dateStatut(e, REPONSES); return d && e.envoye ? ecart(e.envoye, d) : null; }).filter((x) => x != null && x >= 0);
  const premiere = jeunes.map((j) => { const d = (j.envois || []).map((e) => e.envoye).filter(Boolean).sort()[0]; const dep = j.entree || (j.premiere || "").slice(0, 10); return d && dep ? ecart(dep, d) : null; }).filter((x) => x != null && x >= 0);
  const adoption = {
    jeunes: jeunes.length,
    connectes: jeunes.filter((j) => j.premiere || j.vu).length,
    dossier: jeunes.filter((j) => j.cv && (j.lettre || "").trim()).length,
    actifs7: jeunes.filter(actif).length,
    avecEnvoi: jeunes.filter((j) => (j.envois || []).length).length,
    delaiPremiereCandidature: mediane(premiere),
  };
  const activiteS = {
    candidatures: env.length,
    parJeune: jeunes.length ? Math.round((env.length / jeunes.length) * 10) / 10 : 0,
    parJeuneActif: adoption.avecEnvoi ? Math.round((env.length / adoption.avecEnvoi) * 10) / 10 : 0,
    candidatures7: env.filter(({ e }) => e.envoye >= il7).length,
    relancesDues: dues.length, relancesFaites: faites.length, tauxRelance: pct(faites.length, dues.length),
  };
  const resultats = {
    reponses: rep.length, tauxReponse: pct(rep.length, env.length),
    positives: env.filter(({ e }) => POSITIVES.includes(e.statut)).length,
    entretiens: env.filter(({ e }) => e.statut === "Entretien obtenu" || e.statut === "Pris(e)" || (e.dates || {})["Entretien obtenu"]).length,
    refus: env.filter(({ e }) => e.statut === "Refus").length,
    trouves: env.filter(({ e }) => e.statut === "Pris(e)").length,
    jeunesTrouve: jeunes.filter((j) => (j.envois || []).some((e) => e.statut === "Pris(e)")).length,
    delaiReponse: mediane(delaisRep),
  };
  // 8 dernières semaines
  const debut = lundi(ajouterJours(t, -7 * 7));
  const semaines = [];
  for (let k = 0; k < 8; k++) {
    const d = ajouterJours(debut, 7 * k), f = ajouterJours(d, 6);
    const dans = (x) => x && x >= d && x <= f;
    semaines.push({
      semaine: d,
      candidatures: env.filter(({ e }) => dans(e.envoye)).length,
      relances: env.filter(({ e }) => dans(e.relanceFaite)).length,
      entretiens: env.filter(({ e }) => dans(dateStatut(e, ["Entretien obtenu", "Pris(e)"]))).length,
      jeunesActifs: jeunes.filter((j) => (j.jours || []).some(dans)).length,
    });
  }
  const groupe = (cle) => {
    const m = new Map();
    jeunes.forEach((j) => { const k = cle(j); if (!m.has(k)) m.set(k, []); m.get(k).push(j); });
    return [...m.entries()].map(([k, js]) => {
      const e = js.flatMap((j) => j.envois || []);
      return { nom: k, jeunes: js.length, connectes: js.filter((j) => j.premiere || j.vu).length, dossier: js.filter((j) => j.cv && (j.lettre || "").trim()).length,
        candidatures: e.length, reponses: e.filter((x) => REPONSES.includes(x.statut)).length,
        entretiens: e.filter((x) => x.statut === "Entretien obtenu" || x.statut === "Pris(e)").length, trouves: e.filter((x) => x.statut === "Pris(e)").length };
    }).sort((a, b) => String(a.nom).localeCompare(String(b.nom), "fr", { numeric: true }));
  };
  const metiers = new Map();
  env.forEach(({ e, j }) => { const k = e.metier || j.metier || "?"; const r = metiers.get(k) || { metier: METIER_NOMS[k] || "Non précisé", candidatures: 0, reponses: 0, positives: 0 };
    r.candidatures++; if (REPONSES.includes(e.statut)) r.reponses++; if (POSITIVES.includes(e.statut)) r.positives++; metiers.set(k, r); });
  const canaux = new Map();
  env.forEach(({ e }) => { const k = /appel/.test(e.canal || "") ? "Téléphone" : "E-mail"; const r = canaux.get(k) || { canal: k, candidatures: 0, reponses: 0, entretiens: 0 };
    r.candidatures++; if (REPONSES.includes(e.statut)) r.reponses++; if (e.statut === "Entretien obtenu" || e.statut === "Pris(e)") r.entretiens++; canaux.set(k, r); });
  const types = new Map();
  env.forEach(({ e, j }) => { const k = e.typ || j.typ || "?"; const r = types.get(k) || { type: { stage: "Stage", alternance: "Alternance", emploi: "Emploi" }[k] || "Non précisé", candidatures: 0, reponses: 0, trouves: 0 };
    r.candidatures++; if (REPONSES.includes(e.statut)) r.reponses++; if (e.statut === "Pris(e)") r.trouves++; types.set(k, r); });
  return {
    aujourdhui: t, adoption, activite: activiteS, resultats, semaines,
    parSite: groupe((j) => SITES[j.site]),
    parGroupe: groupe((j) => `${SITES[j.site]} · ${j.groupe || "sans groupe"}`),
    metiers: [...metiers.values()].sort((a, b) => b.candidatures - a.candidatures),
    types: [...types.values()].sort((a, b) => b.candidatures - a.candidatures),
    canaux: [...canaux.values()].sort((a, b) => b.candidatures - a.candidatures),
  };
}
async function jeunesDe(sites) {
  const tous = [];
  for (const site of sites) {
    const paths = (await store.list(`jeunes/${site}/`)).filter((p) => p.endsWith(".json"));
    (await Promise.all(paths.map((p) => store.getJSON(p)))).filter(Boolean).forEach((j) => tous.push(j));
  }
  return tous;
}

const METIER_NOMS = { vente: "Vente / commerce", boulangerie: "Boulangerie / pâtisserie", restauration: "Cuisine / restauration",
  mecanique: "Mécanique automobile", aide: "Aide à la personne", enfance: "Petite enfance", proprete: "Propreté / entretien",
  coiffure: "Coiffure / esthétique", logistique: "Logistique", batiment: "Bâtiment", hotellerie: "Hôtellerie / accueil",
  maintenance: "Maintenance industrielle", securite: "Sécurité", transport: "Transport / livraison", informatique: "Informatique",
  espacesverts: "Espaces verts", administratif: "Administratif", sport: "Sport / animation", automobile: "Commerce automobile", rh: "Ressources humaines", libre: "Autre métier" };
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
  for (let i = tous.length - 1; i >= 0; i--) if (tous[i].test) tous.splice(i, 1);
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
  const jeunes = [["Site", "Groupe", "Prénom", "Nom", "Identifiant", "Code E2C", "Formateur", "Métier", "Recherche", "CV déposé", "Lettre prête", "Candidatures", "Relances", "Réponses", "Entretiens", "Trouvé", "À relancer", "Dernière connexion"]];
  R.forEach(([j, r]) => jeunes.push([SITES[j.site], j.groupe || "", j.prenom, j.nom, j.ident, j.code || "", j.formateur || "", METIER_NOMS[j.metier] || "", j.typ || "",
    r.cv ? "Oui" : "Non", r.lettre ? "Oui" : "Non", r.envois, r.relances, r.reponses, r.entretiens, r.pris, r.aRelancer, frDate((j.vu || "").slice(0, 10))]));
  const cands = [["Site", "Jeune", "Entreprise", "Ville", "SIRET", "Envoyée le", "Relance prévue le", "Relancée le", "Statut"]];
  R.forEach(([j]) => (j.envois || []).forEach((e) => cands.push([SITES[j.site], `${j.prenom} ${j.nom}`, e.entreprise, e.ville, e.siret,
    frDate(e.envoye), frDate(e.relance), frDate(e.relanceFaite), e.statut])));
  const st = calculerStats(tous), A = st.adoption, C = st.activite, Rr = st.resultats;
  const p = (x) => (x == null ? "—" : x + " %"), jr = (x) => (x == null ? "—" : x + " j");
  const indic = [["Indicateur", "Valeur"],
    ["Jeunes inscrits", A.jeunes], ["Jeunes connectés au moins une fois", A.connectes], ["Dossier complet (CV + lettre)", A.dossier],
    ["Jeunes actifs sur les 7 derniers jours", A.actifs7], ["Jeunes ayant envoyé au moins une candidature", A.avecEnvoi],
    ["Délai médian avant la 1re candidature", jr(A.delaiPremiereCandidature)],
    ["Candidatures envoyées", C.candidatures], ["Candidatures sur les 7 derniers jours", C.candidatures7],
    ["Candidatures par jeune (tous)", C.parJeune], ["Candidatures par jeune (ceux qui ont envoyé)", C.parJeuneActif],
    ["Relances dues", C.relancesDues], ["Relances faites", C.relancesFaites], ["Taux de relance", p(C.tauxRelance)],
    ["Réponses reçues", Rr.reponses], ["Taux de réponse", p(Rr.tauxReponse)], ["Réponses positives", Rr.positives],
    ["Entretiens", Rr.entretiens], ["Refus", Rr.refus], ["Stages / contrats trouvés", Rr.trouves], ["Jeunes ayant trouvé", Rr.jeunesTrouve],
    ["Délai médian de réponse", jr(Rr.delaiReponse)], ["Date du calcul", frDate(st.aujourdhui)]];
  const sem = [["Semaine du", "Candidatures", "Relances", "Entretiens", "Jeunes actifs"], ...st.semaines.map((w) => [frDate(w.semaine), w.candidatures, w.relances, w.entretiens, w.jeunesActifs])];
  const grp = [["Groupe", "Jeunes", "Connectés", "Dossier complet", "Candidatures", "Réponses", "Entretiens", "Trouvés"], ...st.parGroupe.map((g) => [g.nom, g.jeunes, g.connectes, g.dossier, g.candidatures, g.reponses, g.entretiens, g.trouves])];
  const met = [["Métier", "Candidatures", "Réponses", "Taux de réponse", "Réponses positives"], ...st.metiers.map((m) => [m.metier, m.candidatures, m.reponses, p(pct(m.reponses, m.candidatures)), m.positives])];
  const buf = require("../lib/xlsx").workbook([
    { name: "Indicateurs", rows: indic, widths: [46, 14] },
    { name: "Par semaine", rows: sem, widths: [14, 14, 11, 12, 14] },
    { name: "Synthèse", rows: synth, widths: [14, 9, 22, 14, 12, 12, 10, 11, 16] },
    { name: "Par groupe", rows: grp, widths: [30, 9, 11, 15, 13, 10, 11, 9] },
    { name: "Par métier", rows: met, widths: [28, 13, 10, 15, 18] },
    { name: "Jeunes", rows: jeunes, widths: [11, 12, 14, 16, 22, 12, 20, 22, 11, 10, 11, 12, 9, 9, 10, 8, 10, 16] },
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
