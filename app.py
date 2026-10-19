"""Kit de prospection assistée — démo Streamlit.

Entreprises réelles : API Recherche d'entreprises (data.gouv.fr), sans clé.
Rien n'est enregistré : tout vit dans la session du navigateur.
"""
from __future__ import annotations

import math
import urllib.parse
from datetime import date, timedelta

import pandas as pd
import requests
import streamlit as st

# ---------------------------------------------------------------------------
# Configuration — à adapter facilement
# ---------------------------------------------------------------------------

API_URL = "https://recherche-entreprises.api.gouv.fr/near_point"
USER_AGENT = "kit-prospection-demo/1.0 (demo E2C)"

# Coordonnées approximatives (centre-ville). Remplacer par l'adresse exacte de chaque site E2C.
SITES = {
    "Sevran (93)": (48.9386, 2.5275),
    "La Courneuve (93)": (48.9283, 2.3963),
    "Rosny-sous-Bois (93)": (48.8743, 2.4861),
    "Pantin (93)": (48.8944, 2.4092),
    "Bagneux (92)": (48.7960, 2.3090),
    "Nanterre (92)": (48.8924, 2.2071),
    "Clichy (92)": (48.9044, 2.3059),
}

# Métier -> (codes NAF des établissements, domaine utilisé dans le message)
METIERS = {
    "Vente / employé(e) de commerce": (
        ["47.11B", "47.11C", "47.11D", "47.11F", "47.19A", "47.19B", "47.29Z", "47.52A",
         "47.52B", "47.59B", "47.64Z", "47.65Z", "47.71Z", "47.72A"],
        "la vente et le commerce"),
    "Boulangerie / pâtisserie": (["10.71B", "10.71C", "10.71D", "47.24Z"], "la boulangerie-pâtisserie"),
    "Cuisine / restauration": (["56.10A", "56.10C", "56.21Z", "56.29A", "56.29B"], "la cuisine et la restauration"),
    "Mécanique automobile": (["45.20A", "45.20B", "45.32Z"], "la mécanique automobile"),
    "Aide à la personne": (["88.10A", "88.10B", "87.10A", "87.30A"], "l'aide à la personne"),
    "Petite enfance": (["88.91A"], "la petite enfance"),
    "Propreté / entretien": (["81.21Z", "81.22Z", "81.29B"], "la propreté et l'entretien"),
    "Coiffure / esthétique": (["96.02A", "96.02B"], "la coiffure et l'esthétique"),
    "Logistique / magasinage": (["52.10B", "52.29B", "53.20Z"], "la logistique"),
    "Bâtiment (électricité, plomberie, peinture)": (
        ["43.21A", "43.22A", "43.22B", "43.32A", "43.34Z", "43.39Z"], "le bâtiment"),
    "Hôtellerie / accueil": (["55.10Z"], "l'hôtellerie et l'accueil"),
}

EFFECTIFS = {
    "01": "1 à 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés", "11": "10 à 19 salariés",
    "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés",
    "31": "200 à 249 salariés", "32": "250 à 499 salariés", "41": "500 à 999 salariés",
    "42": "1 000 à 1 999 salariés", "51": "2 000 à 4 999 salariés", "52": "5 000 à 9 999 salariés",
    "53": "10 000 salariés et plus",
}

RELANCE_JOURS = 7
STATUTS = ["Envoyé", "Réponse positive", "Entretien obtenu", "Refus"]
FORMES = ("SAS ", "SASU ", "SARL ", "EURL ", "SA ", "SNC ", "SCI ")

# ---------------------------------------------------------------------------
# Logique (testable sans Streamlit)
# ---------------------------------------------------------------------------


def distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def joli_nom(txt: str) -> str:
    t = (txt or "").strip()
    up = t.upper()
    for f in FORMES:
        if up.startswith(f):
            t = t[len(f):]
            break
    if t.isupper():
        t = t.title().replace("'S ", "'s ").replace(" Et ", " et ").replace(" De ", " de ").replace(" Du ", " du ")
    return t


def a_salaries(code: str | None) -> bool:
    return bool(code) and code not in ("NN", "00")


def extraire(results: list[dict], codes: set[str], lat: float, lon: float, rayon: float,
             salaries_seulement: bool) -> list[dict]:
    """Transforme la réponse de l'API en liste d'établissements ouverts, triés par distance."""
    vus, out = set(), []
    for ent in results:
        eff_ent = ent.get("tranche_effectif_salarie")
        for et in ent.get("matching_etablissements") or []:
            siret = et.get("siret")
            if not siret or siret in vus:
                continue
            if et.get("etat_administratif") != "A" or et.get("activite_principale") not in codes:
                continue
            eff = et.get("tranche_effectif_salarie")
            if salaries_seulement and not (a_salaries(eff) or a_salaries(eff_ent)):
                continue
            try:
                elat, elon = float(et["latitude"]), float(et["longitude"])
            except (KeyError, TypeError, ValueError):
                continue
            d = distance_km(lat, lon, elat, elon)
            if d > rayon:
                continue
            enseignes = et.get("liste_enseignes") or []
            nom = enseignes[0] if enseignes else (et.get("nom_commercial") or ent.get("nom_complet") or "")
            code_eff = eff if a_salaries(eff) else eff_ent
            vus.add(siret)
            out.append({
                "siret": siret,
                "nom": joli_nom(nom),
                "adresse": (et.get("adresse") or "").title(),
                "ville": (et.get("libelle_commune") or "").title(),
                "lat": elat,
                "lon": elon,
                "distance": round(d, 1),
                "effectif": EFFECTIFS.get(code_eff or "", ""),
            })
    out.sort(key=lambda e: e["distance"])
    return out


@st.cache_data(ttl=24 * 3600, show_spinner=False)
def chercher(lat: float, lon: float, rayon: float, codes: tuple[str, ...], salaries_seulement: bool,
             max_pages: int = 3) -> list[dict]:
    results = []
    for page in range(1, max_pages + 1):
        r = requests.get(API_URL, params={
            "lat": lat, "long": lon, "radius": rayon,
            "activite_principale": ",".join(codes),
            "per_page": 25, "page": page,
            "minimal": "true", "include": "matching_etablissements",
            "limite_matching_etablissements": 10,
        }, headers={"User-Agent": USER_AGENT}, timeout=15)
        r.raise_for_status()
        data = r.json()
        results.extend(data.get("results", []))
        if page >= (data.get("total_pages") or 1):
            break
    return extraire(results, set(codes), lat, lon, rayon, salaries_seulement)


def accords(genre: str) -> dict:
    f = genre == "Féminin"
    return {"motive": "motivée" if f else "motivé", "ponctuel": "ponctuelle" if f else "ponctuel",
            "pret": "prête" if f else "prêt", "heureux": "heureuse" if f else "heureux"}


def article_contrat(typ: str) -> str:
    return {"stage": "un stage", "alternance": "une alternance", "emploi": "un emploi"}[typ]


def message_candidature(nom: str, genre: str, typ: str, domaine: str, entreprise: str, ville: str) -> str:
    a = accords(genre)
    lieu = f", à {ville}," if ville else ""
    return (
        "Madame, Monsieur,\n\n"
        f"Je m'appelle {nom} et je recherche {article_contrat(typ)} dans {domaine}. "
        f"Votre entreprise, {entreprise}{lieu} est proche de chez moi et correspond à ce que je souhaite apprendre.\n\n"
        f"Je suis {a['motive']}, {a['ponctuel']} et {a['pret']} à m'investir. "
        "Vous trouverez mon CV en pièce jointe. "
        f"Je serais {a['heureux']} de vous rencontrer, ou de vous appeler au moment qui vous convient.\n\n"
        "Je vous remercie de votre attention.\n\n"
        f"Cordialement,\n{nom}"
    )


def message_relance(nom: str, genre: str, typ: str, entreprise: str, envoye_le: date) -> str:
    interesse = "intéressée" if genre == "Féminin" else "intéressé"
    return (
        "Madame, Monsieur,\n\n"
        f"Le {envoye_le.strftime('%d/%m')}, je vous ai envoyé ma candidature pour {article_contrat(typ)} "
        f"chez {entreprise}. Je me permets de revenir vers vous : je suis toujours très {interesse} "
        "et disponible pour un entretien ou un échange téléphonique.\n\n"
        f"Je vous remercie par avance pour votre réponse.\n\nCordialement,\n{nom}"
    )


def statut_affiche(statut: str, relance_le: date, aujourd_hui: date) -> str:
    if statut == "Envoyé" and aujourd_hui >= relance_le:
        return "À relancer"
    return statut


def mailto(sujet: str, corps: str) -> str:
    return "mailto:?" + urllib.parse.urlencode({"subject": sujet, "body": corps}, quote_via=urllib.parse.quote)


# ---------------------------------------------------------------------------
# Interface
# ---------------------------------------------------------------------------

def init_state():
    ss = st.session_state
    ss.setdefault("resultats", None)
    ss.setdefault("choix", None)
    ss.setdefault("envois", [])      # dicts: siret, entreprise, ville, envoye_le, statut
    ss.setdefault("decalage", 0)     # jours simulés


def aujourd_hui() -> date:
    return date.today() + timedelta(days=st.session_state.decalage)


def page_preparer():
    ss = st.session_state
    st.subheader("Mon profil")
    c1, c2, c3 = st.columns(3)
    nom = c1.text_input("Prénom et nom", value="Léa Martin", key="nom")
    genre = c2.radio("Accords du message", ["Féminin", "Masculin"], horizontal=True, key="genre")
    typ = c3.selectbox("Je cherche", ["stage", "alternance", "emploi"], index=1, key="typ")
    c4, c5 = st.columns(2)
    site = c4.selectbox("Site E2C", list(SITES), key="site")
    metier = c5.selectbox("Métier recherché", list(METIERS), index=1, key="metier")
    c6, c7 = st.columns(2)
    rayon = c6.slider("Distance maximale (km)", 1, 10, 3, key="rayon")
    sal = c7.checkbox("Seulement les entreprises qui ont des salariés", value=True, key="sal",
                      help="Plus de chances d'être accueilli(e) et encadré(e).")

    if st.button("Chercher les entreprises", type="primary"):
        lat, lon = SITES[site]
        with st.spinner("Recherche dans le registre des entreprises…"):
            try:
                ss.resultats = chercher(lat, lon, float(rayon), tuple(METIERS[metier][0]), sal)
                ss.choix = None
            except requests.RequestException:
                ss.resultats = None
                st.error("Le registre des entreprises ne répond pas pour le moment. Réessayez dans un instant.")

    res = ss.resultats
    if res is None:
        return
    st.divider()
    if not res:
        st.warning("Aucune entreprise trouvée. Augmentez la distance ou décochez « salariés ».")
        return

    deja = {e["siret"] for e in ss.envois}
    st.subheader(f"{len(res)} entreprises proches")
    st.caption("Source : registre public des entreprises (INSEE, data.gouv.fr). "
               "Vérifiez toujours les coordonnées avant d'écrire.")
    st.map(pd.DataFrame(res)[["lat", "lon"]], size=40, zoom=13)

    for i, e in enumerate(res[:25]):
        with st.container(border=True):
            a, b = st.columns([4, 1])
            infos = " · ".join(x for x in [f"{e['distance']} km", e["effectif"]] if x)
            a.markdown(f"**{e['nom']}**  \n{e['adresse']}  \n:gray[{infos}]")
            if e["siret"] in deja:
                b.success("Envoyé")
            elif b.button("Écrire", key=f"w_{e['siret']}", use_container_width=True):
                ss.choix = i
            q = urllib.parse.quote(f"{e['nom']} {e['adresse']}")
            a.markdown(
                f"[Carte](https://www.google.com/maps/search/?api=1&query={q}) · "
                f"[Trouver le site / contact](https://www.google.com/search?q={q}) · "
                f"[Fiche officielle](https://annuaire-entreprises.data.gouv.fr/etablissement/{e['siret']})")
            # Le message s'ouvre directement sous l'entreprise choisie (pas tout en bas de la page)
            if ss.choix == i and e["siret"] not in deja:
                panneau_message(e, nom, genre, typ, metier)


def bouton_copier(texte: str, cle: str):
    """Vrai bouton « Copier » (presse-papiers), avec repli si le navigateur bloque."""
    import json
    import streamlit.components.v1 as components
    components.html(f"""
<div style="font-family:sans-serif">
<textarea id="t" style="position:absolute;left:-9999px">{texte.replace('<', '&lt;')}</textarea>
<button id="b" style="width:100%;min-height:44px;border:0;border-radius:8px;background:#1f5fbf;
color:#fff;font-size:16px;font-weight:600;cursor:pointer">1. Copier le message</button>
<div id="m" style="font-size:13px;color:#1d7a4a;margin-top:4px;min-height:16px"></div>
</div>
<script>
const txt = {json.dumps(texte).replace('</', '<\\/')};
const b = document.getElementById('b'), m = document.getElementById('m');
b.onclick = async () => {{
  try {{ await navigator.clipboard.writeText(txt); }}
  catch (e) {{ const t = document.getElementById('t'); t.value = txt; t.select(); document.execCommand('copy'); }}
  m.textContent = 'Message copié ! Collez-le dans votre messagerie (Ctrl + V).';
}};
</script>""", height=78)


def panneau_message(e: dict, nom: str, genre: str, typ: str, metier: str):
    ss = st.session_state
    domaine = METIERS[metier][1]
    st.markdown(f"#### Message pour {e['nom']}")
    texte = st.text_area("Modifiable avant l'envoi", height=280, key=f"msg_{e['siret']}",
                         value=message_candidature(nom, genre, typ, domaine, e["nom"], e["ville"]))
    sujet = f"Candidature {article_contrat(typ)} – {nom}"
    bouton_copier(texte, e["siret"])
    st.markdown("**2. Ouvrir ma messagerie**, coller le message, ajouter l'adresse de l'entreprise et mon CV :")
    s, c = urllib.parse.quote(sujet), urllib.parse.quote(texte)
    m1, m2, m3 = st.columns(3)
    m1.link_button("Gmail", f"https://mail.google.com/mail/?view=cm&fs=1&su={s}&body={c}",
                   use_container_width=True)
    m2.link_button("Outlook", f"https://outlook.live.com/mail/0/deeplink/compose?subject={s}&body={c}",
                   use_container_width=True)
    m3.link_button("Autre messagerie", mailto(sujet, texte), use_container_width=True)
    st.caption("L'adresse e-mail de l'entreprise se trouve sur son site (lien « Trouver le site / contact »), "
               "ou appelez pour la demander.")
    if st.button("3. J'ai envoyé ma candidature", type="primary", use_container_width=True,
                 key=f"env_{e['siret']}"):
        ss.envois.append({"siret": e["siret"], "entreprise": e["nom"], "ville": e["ville"],
                          "envoye_le": aujourd_hui(), "statut": "Envoyé"})
        ss.choix = None
        st.toast("Ajouté à « Mon suivi ».")
        st.rerun()


def page_suivi():
    ss = st.session_state
    auj = aujourd_hui()
    st.subheader(f"Mon suivi — {ss.get('nom', '')}")
    if not ss.envois:
        st.info("Aucun envoi pour le moment. Écrivez à une entreprise dans « 1. Préparer ».")
        return

    rows = []
    for e in ss.envois:
        rel = e["envoye_le"] + timedelta(days=RELANCE_JOURS)
        rows.append({"Entreprise": e["entreprise"], "Envoyé le": e["envoye_le"], "Relance le": rel,
                     "Statut": e["statut"], "À faire": "Relancer" if statut_affiche(e["statut"], rel, auj) == "À relancer" else ""})
    df = pd.DataFrame(rows)
    a_relancer = (df["À faire"] == "Relancer").sum()
    reponses = df["Statut"].isin(["Réponse positive", "Entretien obtenu", "Refus"]).sum()
    m1, m2, m3 = st.columns(3)
    m1.metric("Candidatures envoyées", len(df))
    m2.metric("Réponses", int(reponses))
    m3.metric("À relancer", int(a_relancer))

    edit = st.data_editor(
        df, hide_index=True, use_container_width=True, key=f"editeur_{len(ss.envois)}_{ss.decalage}",
        disabled=["Entreprise", "Envoyé le", "Relance le", "À faire"],
        column_config={
            "Statut": st.column_config.SelectboxColumn(options=STATUTS, required=True),
            "Envoyé le": st.column_config.DateColumn(format="DD/MM"),
            "Relance le": st.column_config.DateColumn(format="DD/MM"),
        })
    changed = False
    for i, s in enumerate(edit["Statut"]):
        if ss.envois[i]["statut"] != s:
            ss.envois[i]["statut"] = s
            changed = True
    if changed:
        st.rerun()

    st.caption(f"Relance conseillée {RELANCE_JOURS} jours après l'envoi. Changez le statut quand une entreprise répond.")
    c1, c2 = st.columns(2)
    if c1.button("Simuler : 8 jours plus tard", use_container_width=True):
        ss.decalage += 8
        st.rerun()
    if ss.decalage and c2.button("Revenir à aujourd'hui", use_container_width=True):
        ss.decalage = 0
        st.rerun()
    if ss.decalage:
        st.caption(f":orange[Date simulée : {auj.strftime('%d/%m/%Y')}]")

    if a_relancer:
        st.subheader("Messages de relance")
        for e in ss.envois:
            rel = e["envoye_le"] + timedelta(days=RELANCE_JOURS)
            if statut_affiche(e["statut"], rel, auj) == "À relancer":
                with st.expander(f"Relancer {e['entreprise']}"):
                    txt = message_relance(ss.get("nom", ""), ss.get("genre", "Féminin"), ss.get("typ", "stage"), e["entreprise"], e["envoye_le"])
                    st.code(txt, language=None, wrap_lines=True)
                    st.link_button("Ouvrir dans ma messagerie",
                                   mailto(f"Relance – candidature {ss.get('nom', '')}", txt))


GROUPE_EXEMPLE = [
    ("Lucas B.", "Boulangerie / pâtisserie", 12, 3, 4),
    ("Inès K.", "Aide à la personne", 9, 2, 3),
    ("Karim D.", "Mécanique automobile", 3, 0, 3),
    ("Chloé R.", "Vente / employé(e) de commerce", 14, 4, 2),
    ("Mehdi S.", "Propreté / entretien", 0, 0, 0),
    ("Sarah L.", "Vente / employé(e) de commerce", 8, 1, 5),
    ("Tom P.", "Cuisine / restauration", 10, 2, 3),
]


def page_conseiller():
    ss = st.session_state
    auj = aujourd_hui()
    st.subheader("Synthèse du groupe")
    nom = ss.get("nom") or "Jeune (vous)"
    envoyees = len(ss.envois)
    reponses = sum(e["statut"] != "Envoyé" for e in ss.envois)
    relances = sum(statut_affiche(e["statut"], e["envoye_le"] + timedelta(days=RELANCE_JOURS), auj) == "À relancer"
                   for e in ss.envois)
    lignes = [(f"{nom} (démo en direct)", ss.get("metier", ""), envoyees, reponses, relances)] + GROUPE_EXEMPLE
    df = pd.DataFrame(lignes, columns=["Jeune", "Métier", "Envoyées", "Réponses", "À relancer"])

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("Jeunes", len(df))
    m2.metric("Candidatures envoyées", int(df["Envoyées"].sum()))
    m3.metric("Réponses", int(df["Réponses"].sum()))
    m4.metric("À relancer", int(df["À relancer"].sum()))

    sans = df[df["Envoyées"] == 0]["Jeune"].tolist()
    if sans:
        st.warning("Pas encore d'envoi : " + ", ".join(sans) + " — un coup de main peut être utile.")

    def surligne(row):
        return ["background-color: #fde6e4" if row["Envoyées"] == 0 else ""] * len(row)

    st.dataframe(df.style.apply(surligne, axis=1), hide_index=True, use_container_width=True)
    st.caption("La première ligne reprend ce que vous avez fait dans l'espace jeune. "
               "Les autres jeunes sont des exemples fictifs.")


def main():
    st.set_page_config(page_title="Kit de prospection assistée", page_icon="📮", layout="centered")
    init_state()
    st.title("Kit de prospection assistée")
    st.caption("Stage, alternance ou emploi : trouver des entreprises proches, écrire, relancer, suivre.")
    st.info("**Démo.** Les entreprises sont réelles (registre public). L'outil n'envoie aucun message "
            "et n'enregistre rien : tout s'efface quand vous fermez la page.")

    espace = st.sidebar.radio("Espace", ["Espace jeune", "Espace conseiller"])
    st.sidebar.divider()
    st.sidebar.caption("Le jeune prépare et suit ses candidatures. "
                       "Le conseiller voit l'avancement de tout le groupe.")

    if espace == "Espace jeune":
        t1, t2 = st.tabs(["1. Préparer", "2. Mon suivi"])
        with t1:
            page_preparer()
        with t2:
            page_suivi()
    else:
        page_conseiller()


if __name__ == "__main__":
    main()
