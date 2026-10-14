# Kit de prospection assistée — démo

Démo pour les Écoles de la deuxième chance : aider chaque jeune à trouver des entreprises proches
du site (stage, alternance, emploi), écrire un message personnalisé, relancer au bon moment,
et donner au conseiller une vue de tout le groupe.

- **Espace jeune** : profil, entreprises réelles autour du site, message modifiable, suivi des envois et relances.
- **Espace conseiller** : synthèse du groupe (la première ligne reprend la démo en direct, les autres jeunes sont fictifs).

## Données

Les entreprises viennent de l'[API Recherche d'entreprises](https://recherche-entreprises.api.gouv.fr)
(registre public, data.gouv.fr, sans clé). L'outil n'envoie aucun message et n'enregistre rien :
tout est effacé à la fermeture de la page.

## Lancer en local

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Adapter

En haut de `app.py` :
- `SITES` : coordonnées de chaque site (aujourd'hui le centre-ville, à remplacer par l'adresse exacte du site E2C) ;
- `METIERS` : métiers proposés et codes NAF associés ;
- `RELANCE_JOURS` : délai avant relance (7 jours).
