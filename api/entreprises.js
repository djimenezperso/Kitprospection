// Recherche d'établissements réels autour d'un site E2C
// Source : API Recherche d'entreprises (data.gouv.fr), publique et sans clé.

const API_URL = "https://recherche-entreprises.api.gouv.fr/near_point";
const SEARCH_URL = "https://recherche-entreprises.api.gouv.fr/search";

// Coordonnées approximatives (centre-ville) — à remplacer par l'adresse exacte de chaque site.
const SITES = {
  sevran: [48.9386, 2.5275],
  "la-courneuve": [48.9283, 2.3963],
  rosny: [48.8743, 2.4861],
  pantin: [48.8944, 2.4092],
  bagneux: [48.796, 2.309],
  nanterre: [48.8924, 2.2071],
  clichy: [48.9044, 2.3059],
};

const METIERS = {
  vente: ["47.11B", "47.11C", "47.11D", "47.11F", "47.19A", "47.19B", "47.29Z", "47.52A", "47.52B",
    "47.59B", "47.64Z", "47.65Z", "47.71Z", "47.72A"],
  boulangerie: ["10.71B", "10.71C", "10.71D", "47.24Z"],
  restauration: ["56.10A", "56.10C", "56.21Z", "56.29A", "56.29B"],
  mecanique: ["45.20A", "45.20B", "45.32Z"],
  aide: ["88.10A", "88.10B", "87.10A", "87.30A"],
  enfance: ["88.91A"],
  proprete: ["81.21Z", "81.22Z", "81.29B"],
  coiffure: ["96.02A", "96.02B"],
  logistique: ["52.10B", "52.29B", "53.20Z"],
  batiment: ["43.21A", "43.22A", "43.22B", "43.32A", "43.34Z", "43.39Z"],
  hotellerie: ["55.10Z"],
  maintenance: ["33.11Z", "33.12Z", "33.13Z", "33.14Z", "33.19Z", "33.20A", "33.20B", "33.20C", "33.20D", "43.22B", "81.10Z"],
  securite: ["80.10Z", "80.20Z"],
  transport: ["49.41A", "49.41B", "49.42Z", "52.29A", "53.20Z"],
  informatique: ["62.01Z", "62.02A", "62.03Z", "62.09Z", "95.11Z", "95.12Z"],
  espacesverts: ["81.30Z"],
  administratif: ["82.11Z", "82.19Z", "69.10Z", "69.20Z", "78.10Z", "78.20Z"],
  sport: ["93.11Z", "93.12Z", "93.13Z", "93.19Z", "85.51Z"],
  automobile: ["45.11Z", "45.19Z", "45.31Z", "45.32Z", "45.40Z"],
};

const EFFECTIFS = {
  "01": "1 à 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés", "11": "10 à 19 salariés",
  "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés",
  "31": "200 à 249 salariés", "32": "250 à 499 salariés", "41": "500 à 999 salariés",
  "42": "1 000 à 1 999 salariés", "51": "2 000 à 4 999 salariés", "52": "5 000 à 9 999 salariés",
  "53": "10 000 salariés et plus",
};
const FORMES = ["SAS ", "SASU ", "SARL ", "EURL ", "SA ", "SNC ", "SCI "];

function distanceKm(lat1, lon1, lat2, lon2) {
  const r = 6371, rad = Math.PI / 180;
  const dp = (lat2 - lat1) * rad, dl = (lon2 - lon1) * rad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

function titre(s) {
  return s.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (m, p, c) => p + c.toUpperCase())
    .replace(/ (De|Du|Des|Et|La|Le|Les|Sur|En) /g, (m) => m.toLowerCase())
    .replace(/(^|\s)(D|L)'/g, (m, p, c) => p + c.toLowerCase() + "'");
}

function joliNom(txt) {
  let t = (txt || "").trim();
  const up = t.toUpperCase();
  for (const f of FORMES) if (up.startsWith(f)) { t = t.slice(f.length); break; }
  return t === t.toUpperCase() ? titre(t) : t;
}

const aSalaries = (c) => !!c && c !== "NN" && c !== "00";

function extraire(results, codes, lat, lon, rayon, salariesSeulement) { // codes = null : toutes activités (recherche libre)
  const vus = new Set(), out = [];
  for (const ent of results) {
    const effEnt = ent.tranche_effectif_salarie;
    for (const et of ent.matching_etablissements || []) {
      const siret = et.siret;
      if (!siret || vus.has(siret)) continue;
      if (et.etat_administratif !== "A" || (codes && !codes.has(et.activite_principale))) continue;
      const eff = et.tranche_effectif_salarie;
      if (salariesSeulement && !(aSalaries(eff) || aSalaries(effEnt))) continue;
      const elat = parseFloat(et.latitude), elon = parseFloat(et.longitude);
      if (Number.isNaN(elat) || Number.isNaN(elon)) continue;
      const d = distanceKm(lat, lon, elat, elon);
      if (d > rayon) continue;
      const ens = et.liste_enseignes || [];
      const nom = ens.length ? ens[0] : (et.nom_commercial || ent.nom_complet || "");
      vus.add(siret);
      out.push({
        siret,
        nom: joliNom(nom),
        adresse: titre(et.adresse || ""),
        ville: titre(et.libelle_commune || ""),
        lat: elat, lon: elon,
        distance: Math.round(d * 10) / 10,
        effectif: EFFECTIFS[aSalaries(eff) ? eff : effEnt] || "",
      });
    }
  }
  return out.sort((a, b) => a.distance - b.distance);
}

async function handler(req, res) {
  const q = req.query || {};
  const site = SITES[q.site];
  const libre = q.metier === "libre";
  const motcle = String(q.q || "").trim().slice(0, 60);
  const codesList = libre ? [] : METIERS[q.metier];
  const rayon = Math.min(Math.max(parseFloat(q.rayon) || 3, 0.5), 15);
  const sal = q.sal !== "0";
  if (!site || !codesList) {
    res.status(400).json({ error: "Site ou métier inconnu." });
    return;
  }
  if (libre && motcle.length < 3) {
    res.status(400).json({ error: "Écris au moins 3 lettres pour ton métier." });
    return;
  }
  try {
    const results = [];
    for (let page = 1; page <= 3; page++) {
      // recherche libre : mot-clé dans le nom des entreprises, départements autour des sites, puis filtre par distance
      const params = libre ? new URLSearchParams({
        q: motcle, departement: "75,78,92,93,94,95", etat_administratif: "A",
        per_page: 25, page, minimal: "true", include: "matching_etablissements", limite_matching_etablissements: 10,
      }) : new URLSearchParams({
        lat: site[0], long: site[1], radius: rayon, activite_principale: codesList.join(","),
        per_page: 25, page, minimal: "true", include: "matching_etablissements",
        limite_matching_etablissements: 10,
      });
      const url = libre ? `${SEARCH_URL}?${params}` : `${API_URL}?${params}`;
      let r = await fetch(url, { headers: { "User-Agent": "kit-prospection-demo/1.0" } });
      if (r.status === 429) {
        await new Promise((ok) => setTimeout(ok, 1200));
        r = await fetch(url, { headers: { "User-Agent": "kit-prospection-demo/1.0" } });
      }
      if (!r.ok) throw new Error(`registre ${r.status}`);
      const data = await r.json();
      results.push(...(data.results || []));
      if (page >= (data.total_pages || 1)) break;
    }
    const list = extraire(results, libre ? null : new Set(codesList), site[0], site[1], rayon, sal);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=3600");
    res.status(200).json({ site: { lat: site[0], lon: site[1] }, entreprises: list.slice(0, 40) });
  } catch (e) {
    res.status(502).json({ error: "Le registre des entreprises ne répond pas pour le moment." });
  }
}

module.exports = handler;
module.exports.extraire = extraire;
module.exports.joliNom = joliNom;
