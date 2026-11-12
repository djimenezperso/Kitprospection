// Grandes entreprises (50 salariés et plus) autour d'un site E2C, pour l'espace Relations entreprises.
// Source : API Recherche d'entreprises (data.gouv.fr), publique et sans clé. Aucune donnée personnelle :
// seulement l'établissement, son activité et sa tranche d'effectif.
const { joliNom } = require("./entreprises");

const API_URL = "https://recherche-entreprises.api.gouv.fr/near_point";
const SITES = {
  sevran: [48.9386, 2.5275],
  "la-courneuve": [48.9283, 2.3963],
  rosny: [48.8743, 2.4861],
  pantin: [48.8944, 2.4092],
};
// tranche → [libellé, effectif retenu pour l'estimation (bas de la tranche, prudent)]
const TRANCHES = {
  "21": ["50 à 99 salariés", 50], "22": ["100 à 199 salariés", 100], "31": ["200 à 249 salariés", 200],
  "32": ["250 à 499 salariés", 250], "41": ["500 à 999 salariés", 500], "42": ["1 000 à 1 999 salariés", 1000],
  "51": ["2 000 à 4 999 salariés", 2000], "52": ["5 000 à 9 999 salariés", 5000], "53": ["10 000 salariés et plus", 10000],
};
// Exclus : administrations, holdings, sièges, associations sans activité marchande
const EXCLUS = /^(84\.|64\.20|70\.10|94\.|99\.|85\.31|85\.32|85\.41|85\.42|86\.10)/;
const SALAIRE_MOYEN = 38000; // € brut annuel, hypothèse prudente
const TAUX_SOLDE = 0.0009;   // solde de la taxe d'apprentissage : 0,09 % de la masse salariale

function titre(s) {
  return (s || "").toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());
}
function distanceKm(a, b, c, d) {
  const r = 6371, rad = Math.PI / 180, dp = (c - a) * rad, dl = (d - b) * rad;
  const x = Math.sin(dp / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}

async function handler(req, res) {
  const q = req.query || {};
  const cle = String(q.site || "la-courneuve");
  const site = SITES[cle];
  if (!site) { res.status(400).json({ error: "Site inconnu." }); return; }
  const rayon = 5;
  try {
    const vus = new Set(), out = [];
    for (let page = 1; page <= 6 && out.length < 60; page++) {
      const params = new URLSearchParams({
        lat: site[0], long: site[1], radius: rayon, per_page: 25, page, minimal: "true",
        include: "matching_etablissements", limite_matching_etablissements: 10,
        tranche_effectif_salarie: Object.keys(TRANCHES).join(","),
      });
      let r = await fetch(`${API_URL}?${params}`, { headers: { "User-Agent": "kit-prospection-demo/1.0" } });
      if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 1200)); r = await fetch(`${API_URL}?${params}`, { headers: { "User-Agent": "kit-prospection-demo/1.0" } }); }
      if (!r.ok) throw new Error(`registre ${r.status}`);
      const j = await r.json();
      for (const ent of j.results || []) {
        for (const et of ent.matching_etablissements || []) {
          const t = TRANCHES[et.tranche_effectif_salarie];
          if (!t || !et.siret || vus.has(et.siret) || et.etat_administratif !== "A") continue;
          if (EXCLUS.test(et.activite_principale || "")) continue;
          if (/^[12]/.test(ent.siren || et.siret)) continue; // secteur public (collectivités, État)
          const lat = parseFloat(et.latitude), lon = parseFloat(et.longitude);
          if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
          const d = distanceKm(site[0], site[1], lat, lon);
          if (d > rayon) continue;
          vus.add(et.siret);
          const ens = et.liste_enseignes || [];
          out.push({
            siret: et.siret,
            nom: joliNom(ens.length ? ens[0] : (et.nom_commercial || ent.nom_complet || "")),
            groupe: joliNom(ent.nom_complet || ""),
            ville: titre(et.libelle_commune),
            naf: et.activite_principale || "",
            effectif: t[0],
            solde: Math.round(t[1] * SALAIRE_MOYEN * TAUX_SOLDE / 50) * 50,
            distance: Math.round(d * 10) / 10,
            siege: !!et.est_siege,
          });
        }
      }
      if (!j.results || j.results.length < 25) break;
    }
    out.sort((a, b) => (b.siege - a.siege) || b.solde - a.solde || a.distance - b.distance);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");
    res.status(200).json({ site: cle, rayon, hypothese: { salaire: SALAIRE_MOYEN, taux: TAUX_SOLDE }, entreprises: out.slice(0, 50) });
  } catch (e) {
    res.status(502).json({ error: "Le registre des entreprises ne répond pas pour le moment.", detail: String(e && e.message || e).slice(0, 200) });
  }
}
module.exports = handler;
