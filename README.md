# GestiTest — Application de tests en ligne
## Intégration avec GestiClasse | Tableur Module 2

---

## Structure du projet

```
gestitest/
├── server.js                   ← Serveur Express (toutes les routes API)
├── package.json
├── gestitest_schema_seed.sql   ← Schéma BDD + seed des 12 versions
└── public/
    ├── eleve.html              ← Interface passation élève
    └── correction.html         ← Dashboard correction enseignant
```

---

## Installation

### 1. Prérequis
- XAMPP démarré (Apache + MySQL)
- Node.js installé (v18+)
- Base `gesticlasse` existante avec tables `eleves` et `classes`

### 2. Base de données
Ouvrir phpMyAdmin → Sélectionner `gesticlasse` → Onglet SQL → Coller et exécuter `gestitest_schema_seed.sql`

### 3. Adapter la table `eleves`
GestiTest attend ces colonnes dans `eleves` :
```sql
-- Colonnes requises (probablement déjà présentes dans GestiClasse)
massar VARCHAR(20)
date_naissance DATE
nom VARCHAR(100)
prenom VARCHAR(100)
classe_id INT (FK → classes.id)

-- Colonnes optionnelles (profil GestiClasse dans la correction)
points_comportement TINYINT DEFAULT 20
cahier_ok TINYINT(1) DEFAULT 1
remarques TEXT
```

La table `classes` doit avoir :
```sql
id INT PK
nom VARCHAR(50)          -- ex: 'TCF1', 'TCLSH1'
filiere ENUM('TCL','TCS')  -- IMPORTANT pour l'assignation des tests
```

### 4. Installer les dépendances
```bash
cd gestitest
npm install
```

> **Note** : `puppeteer` télécharge Chromium (~170 Mo). Si connexion lente :
> ```bash
> npm install --ignore-scripts puppeteer   # sans téléchargement auto
> ```
> Puis utiliser PDFKit à la place (voir section alternative).

### 5. Lancer le serveur
```bash
node server.js
```

Accès :
- Élèves    → http://localhost:3001/eleve.html
- Enseignant → http://localhost:3001/correction.html

### 6. Copier les fichiers HTML dans public/
```
public/eleve.html       ← contenu de eleve_passation.html
public/correction.html  ← contenu de enseignant_correction.html
```

---

## Logique d'assignation des versions

L'assignation est automatique à la connexion :
```
version = ((eleve.id - 1) % 6) + 1
```
→ Distribution équilibrée V1–V6 sur l'ensemble des élèves d'une même filière.

Chaque élève reçoit exactement une version, déterminée par son ID.

---

## Fonctionnement côté élève

1. Connexion avec **N° Massar + date de naissance**
2. Test assigné automatiquement selon filière (TCLSH → TCL, TCF → TCS)
3. 3 parties avec sauvegarde automatique des réponses
4. Soumission unique avec horodatage
5. Impossible de soumettre deux fois

---

## Fonctionnement côté enseignant

URL : http://localhost:3001/correction.html

- **Dashboard** : stats globales + par classe
- **Soumissions** : filtres classe/statut/filière + recherche
- **Correction** :
  - QCM corrigé automatiquement (0 ou barème complet)
  - Questions ouvertes : saisie note + commentaire + boutons preset
  - Profil GestiClasse visible en parallèle
  - Note totale calculée en temps réel
- **Export CSV** : notes avec décomposition par partie, BOM UTF-8 pour Excel
- **PDF** : sujet / fiches individuelles / tableau récap A4 paysage

---

## Vérification des colonnes GestiClasse

Si GestiClasse utilise des noms de colonnes différents, adapter dans `server.js` :

```javascript
// Ligne ~120 — ajuster la requête de login
'SELECT e.*, c.nom AS classe, c.filiere
 FROM eleves e JOIN classes c ON e.classe_id = c.id
 WHERE e.massar = ? AND DATE(e.date_naissance) = ?'

// Ligne ~210 — ajuster le profil comportemental
'SELECT
   COALESCE(points_comportement, 20) AS comportement,
   COALESCE(cahier_ok, 1) AS cahier_ok,
   COALESCE(remarques, "") AS remarques
 FROM eleves WHERE id=?'
```

---

## Prochaine étape

Pour intégrer les PDF dans la chaîne administrative complète, la génération côté serveur
utilise Puppeteer (Chromium headless). Alternative sans Puppeteer : PDFKit.

```bash
npm install pdfkit  # si puppeteer pose problème
```
