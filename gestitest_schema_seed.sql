-- ============================================================
--  GestiTest — Extension de la base gesticlasse
--  Tableur Bloc 3 Module 2 — V1-V6 TCLSH + TCS
-- ============================================================

USE gesticlasse;

-- ============================================================
--  TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS modules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nom VARCHAR(100) NOT NULL,
  filiere ENUM('TCL','TCS','ALL') NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS tests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  module_id INT NOT NULL,
  filiere ENUM('TCL','TCS') NOT NULL,
  version TINYINT NOT NULL,
  titre VARCHAR(150),
  contexte VARCHAR(100),
  date_creation DATETIME DEFAULT NOW(),
  actif BOOLEAN DEFAULT TRUE,
  FOREIGN KEY (module_id) REFERENCES modules(id)
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  test_id INT NOT NULL,
  partie ENUM('cours','formules','graphiques') NOT NULL,
  type ENUM('qcm','ouverte','pratique') NOT NULL,
  enonce TEXT NOT NULL,
  options JSON,
  reponse_correcte TEXT,
  bareme DECIMAL(4,2) NOT NULL,
  ordre TINYINT NOT NULL,
  FOREIGN KEY (test_id) REFERENCES tests(id)
);

CREATE TABLE IF NOT EXISTS soumissions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  eleve_id INT NOT NULL,
  test_id INT NOT NULL,
  horodatage DATETIME DEFAULT NOW(),
  statut ENUM('en_cours','soumis','corrige') DEFAULT 'en_cours',
  note_finale DECIMAL(4,2),
  FOREIGN KEY (eleve_id) REFERENCES eleves(id),
  FOREIGN KEY (test_id) REFERENCES tests(id)
);

CREATE TABLE IF NOT EXISTS reponses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  soumission_id INT NOT NULL,
  question_id INT NOT NULL,
  reponse_eleve TEXT,
  note_attribuee DECIMAL(4,2),
  commentaire_correcteur TEXT,
  FOREIGN KEY (soumission_id) REFERENCES soumissions(id),
  FOREIGN KEY (question_id) REFERENCES questions(id)
);

-- ============================================================
--  MODULE
-- ============================================================

INSERT INTO modules (nom, filiere, description) VALUES
('Tableur — Bloc 3 Module 2', 'ALL', 'Notions de tableur : environnement, formules, fonctions, graphiques');

-- ============================================================
--  TESTS (12 versions : V1-V6 × TCLSH + TCS)
-- ============================================================

-- TCLSH
INSERT INTO tests (module_id, filiere, version, titre, contexte) VALUES
(1,'TCL',1,'Tableur V1 — TCLSH','Notes de 5 élèves dans 3 matières'),
(1,'TCL',2,'Tableur V2 — TCLSH','Budget familial mensuel'),
(1,'TCL',3,'Tableur V3 — TCLSH','Résultats sportifs sur 6 matchs'),
(1,'TCL',4,'Tableur V4 — TCLSH','Stock boutique'),
(1,'TCL',5,'Tableur V5 — TCLSH','Températures sur 6 mois'),
(1,'TCL',6,'Tableur V6 — TCLSH','Résultats concours scolaire');

-- TCS
INSERT INTO tests (module_id, filiere, version, titre, contexte) VALUES
(1,'TCS',1,'Tableur V1 — TCS','Notes de 10 élèves + mention SI'),
(1,'TCS',2,'Tableur V2 — TCS','Budget projet scolaire avec pourcentages'),
(1,'TCS',3,'Tableur V3 — TCS','Mesures physique vitesse/temps + graphique XY'),
(1,'TCS',4,'Tableur V4 — TCS','Inventaire avec alerte stock'),
(1,'TCS',5,'Tableur V5 — TCS','Relevé météo + courbe de tendance'),
(1,'TCS',6,'Tableur V6 — TCS','Classement avec NB.SI et SOMME.SI');

-- ============================================================
--  QUESTIONS — TCLSH V1 (test_id=1)
-- ============================================================

-- Partie 1 : cours
INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(1,'cours','ouverte',
 'Qu\'est-ce qu\'un tableur ? Donne deux exemples de logiciels tableurs.',
 NULL,
 'Un tableur est un logiciel permettant de créer des tableaux de calcul, d\'effectuer des calculs automatiques et de créer des graphiques. Exemples : Excel, LibreOffice Calc, WPS Spreadsheets, Google Sheets.',
 1.00, 1),

(1,'cours','ouverte',
 'Dans la feuille de calcul ci-dessous, quelle est l\'adresse de la cellule contenant la note de Yasmine en Mathématiques ?',
 NULL,
 'B3 (la réponse dépend du tableau fourni ; accepter toute adresse correctement formée lettre+chiffre)',
 1.00, 2),

(1,'cours','qcm',
 'Parmi les logiciels suivants, lequel est un tableur ?',
 '["Microsoft Word","Microsoft Excel","Mozilla Firefox","Adobe Photoshop"]',
 'Microsoft Excel',
 1.00, 3),

(1,'cours','ouverte',
 'Par quel signe doit obligatoirement commencer une formule dans un tableur ?',
 NULL,
 '= (signe égal)',
 1.00, 4);

-- Partie 2 : formules
INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(1,'formules','pratique',
 'Le tableau contient les notes de 5 élèves (Arij, Yasmine, Omar, Sara, Anas) en 3 matières (colonnes B, C, D). Écris la formule permettant de calculer la somme des notes d\'Arij (ligne 2) dans la cellule E2.',
 NULL,
 '=SOMME(B2:D2)',
 2.00, 5),

(1,'formules','pratique',
 'Écris la formule permettant de calculer la moyenne des notes de toute la classe en Mathématiques (colonne B, lignes 2 à 6) dans la cellule B8.',
 NULL,
 '=MOYENNE(B2:B6)',
 2.00, 6),

(1,'formules','pratique',
 'Écris la formule permettant d\'afficher la note maximale obtenue en Français (colonne C, lignes 2 à 6) dans la cellule C9.',
 NULL,
 '=MAX(C2:C6)',
 1.00, 7),

(1,'formules','ouverte',
 'La formule =SOMME(B2:D2) est écrite en E2. Lorsqu\'on la recopie vers le bas en E3, qu\'est-ce qui change dans les adresses ? Pourquoi ?',
 NULL,
 'Les numéros de lignes augmentent de 1 : =SOMME(B3:D3). C\'est l\'adressage relatif : les références s\'adaptent automatiquement à la nouvelle position.',
 2.00, 8),

(1,'formules','ouverte',
 'Dans le tableau, quelle est l\'adresse de la cellule qui contient la moyenne de Yasmine si elle se trouve à l\'intersection de la colonne E et de la ligne 3 ?',
 NULL,
 'E3',
 1.00, 9),

(1,'formules','pratique',
 'Écris la formule permettant de compter le nombre d\'élèves ayant une note en Mathématiques (colonne B, lignes 2 à 6) dans la cellule B10.',
 NULL,
 '=NB(B2:B6)',
 2.00, 10);

-- Partie 3 : graphiques
INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(1,'graphiques','ouverte',
 'Quel type de graphique est le plus adapté pour comparer les notes de 5 élèves dans 3 matières ? Justifie ta réponse.',
 NULL,
 'L\'histogramme (graphique en barres groupées) est le plus adapté car il permet de comparer facilement plusieurs valeurs pour plusieurs catégories côte à côte.',
 2.00, 11),

(1,'graphiques','ouverte',
 'Cite les étapes pour créer ce graphique dans Excel ou WPS Spreadsheets.',
 NULL,
 '1. Sélectionner les données (noms + notes). 2. Cliquer sur l\'onglet Insertion. 3. Choisir Graphique. 4. Sélectionner le type Histogramme. 5. Confirmer et insérer.',
 2.00, 12),

(1,'graphiques','ouverte',
 'Nomme deux éléments que tu peux personnaliser sur ce graphique après sa création.',
 NULL,
 'Exemples acceptés : titre du graphique, couleurs des barres, légende, étiquettes de données, axes (titre, graduation), style du graphique.',
 2.00, 13);

-- ============================================================
--  QUESTIONS — TCLSH V2 (test_id=2) — Budget familial
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(2,'cours','ouverte','Qu\'est-ce qu\'un tableur ? Cite deux logiciels tableurs.',NULL,'Un tableur est un logiciel permettant de créer des tableaux, d\'effectuer des calculs automatiques et de visualiser des données sous forme de graphiques. Exemples : Excel, LibreOffice Calc.',1.00,1),
(2,'cours','ouverte','Dans le tableau du budget familial, quelle est l\'adresse de la cellule contenant le montant consacré à l\'alimentation en janvier ?',NULL,'B2 (accepter toute adresse cohérente avec le tableau fourni)',1.00,2),
(2,'cours','qcm','Parmi ces logiciels, lequel est un tableur ?','["Google Docs","WPS Spreadsheets","VLC Media Player","Paint"]','WPS Spreadsheets',1.00,3),
(2,'cours','ouverte','Par quel caractère doit commencer une formule dans un tableur ?',NULL,'= (signe égal)',1.00,4),
(2,'formules','pratique','Le tableau liste les dépenses familiales mensuelles (Alimentation, Loyer, Transport, Loisirs). Écris la formule pour calculer le total des dépenses du mois de Janvier (colonne B, lignes 2 à 5) dans la cellule B6.',NULL,'=SOMME(B2:B5)',2.00,5),
(2,'formules','pratique','Écris la formule pour calculer la moyenne mensuelle des dépenses en Alimentation (ligne 2, colonnes B à G) dans la cellule H2.',NULL,'=MOYENNE(B2:G2)',2.00,6),
(2,'formules','pratique','Écris la formule affichant la dépense maximale sur l\'ensemble de l\'année en Loyer (ligne 3, colonnes B à G) dans la cellule H3.',NULL,'=MAX(B3:G3)',1.00,7),
(2,'formules','ouverte','La formule =SOMME(B2:B5) est en B6. Lorsqu\'on la recopie en C6, qu\'est-ce qui change ? Pourquoi ?',NULL,'Les lettres de colonnes changent : =SOMME(C2:C5). Adressage relatif : les références s\'adaptent à la colonne de destination.',2.00,8),
(2,'formules','ouverte','Quelle est l\'adresse de la cellule qui contient le total des dépenses du mois de Mars ?',NULL,'D6 (ou toute adresse cohérente avec le tableau fourni)',1.00,9),
(2,'formules','pratique','Écris la formule pour compter le nombre de postes de dépenses renseignés dans la colonne A (lignes 2 à 5) dans la cellule A7.',NULL,'=NB(A2:A5) ou =NBVAL(A2:A5)',2.00,10),
(2,'graphiques','ouverte','Quel type de graphique est le plus adapté pour visualiser la répartition du budget familial entre les différents postes ? Justifie.',NULL,'Le camembert (graphique circulaire) est le plus adapté car il montre la proportion de chaque poste par rapport au total.',2.00,11),
(2,'graphiques','ouverte','Cite les étapes pour créer ce graphique dans Excel ou WPS.',NULL,'1. Sélectionner les postes et les montants. 2. Insertion → Graphique. 3. Choisir Secteurs (camembert). 4. Valider et insérer.',2.00,12),
(2,'graphiques','ouverte','Nomme deux éléments personnalisables sur un graphique.',NULL,'Titre, couleurs des secteurs, légende, étiquettes de données, style.',2.00,13);

-- ============================================================
--  QUESTIONS — TCLSH V3 (test_id=3) — Résultats sportifs
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(3,'cours','ouverte','Définis un tableur et donne deux exemples.',NULL,'Logiciel de création de tableaux et de calculs automatiques. Ex : Excel, Google Sheets.',1.00,1),
(3,'cours','ouverte','Dans le tableau des résultats sportifs, quelle est l\'adresse de la cellule contenant les buts marqués lors du match 1 ?',NULL,'B2 (accepter adresse cohérente)',1.00,2),
(3,'cours','qcm','Lequel de ces logiciels est un tableur ?','["Microsoft PowerPoint","LibreOffice Calc","Google Chrome","Notepad"]','LibreOffice Calc',1.00,3),
(3,'cours','ouverte','Quel signe commence obligatoirement une formule dans un tableur ?',NULL,'=',1.00,4),
(3,'formules','pratique','Le tableau contient les buts marqués et encaissés lors de 6 matchs. Écris la formule pour calculer le total de buts marqués (colonne B, lignes 2 à 7) dans la cellule B8.',NULL,'=SOMME(B2:B7)',2.00,5),
(3,'formules','pratique','Écris la formule pour calculer la moyenne de buts encaissés sur les 6 matchs (colonne C, lignes 2 à 7) dans la cellule C9.',NULL,'=MOYENNE(C2:C7)',2.00,6),
(3,'formules','pratique','Écris la formule affichant le nombre minimal de buts marqués sur les 6 matchs dans la cellule B10.',NULL,'=MIN(B2:B7)',1.00,7),
(3,'formules','ouverte','Si =SOMME(B2:C2) est écrite en D2 et qu\'on la recopie en D3, que devient-elle ? Explique.',NULL,'=SOMME(B3:C3). Le numéro de ligne passe de 2 à 3 car l\'adressage est relatif.',2.00,8),
(3,'formules','ouverte','Dans quel type de cellule le résultat commence-t-il obligatoirement par = ?',NULL,'Dans une cellule contenant une formule.',1.00,9),
(3,'formules','pratique','Écris la formule pour compter le nombre de matchs renseignés dans la colonne B (lignes 2 à 7).',NULL,'=NB(B2:B7)',2.00,10),
(3,'graphiques','ouverte','Quel type de graphique est adapté pour suivre l\'évolution des buts sur 6 matchs consécutifs ? Justifie.',NULL,'La courbe (graphique en lignes) car elle montre l\'évolution d\'une valeur dans le temps ou sur une série.',2.00,11),
(3,'graphiques','ouverte','Cite les étapes de création de ce graphique dans Excel.',NULL,'1. Sélectionner les données. 2. Insertion → Graphique. 3. Choisir Courbes. 4. Insérer.',2.00,12),
(3,'graphiques','ouverte','Nomme deux éléments à personnaliser sur ce graphique.',NULL,'Titre, couleur de la courbe, légende, axes, étiquettes.',2.00,13);

-- ============================================================
--  QUESTIONS — TCLSH V4 (test_id=4) — Stock boutique
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(4,'cours','ouverte','Qu\'est-ce qu\'un tableur ? Donne deux exemples de logiciels.',NULL,'Logiciel permettant de saisir des données en tableau, d\'effectuer des calculs automatiques et de créer des graphiques. Ex : Excel, WPS.',1.00,1),
(4,'cours','ouverte','Dans le tableau de stock, quelle est l\'adresse de la cellule contenant le prix unitaire du premier produit ?',NULL,'C2 (accepter adresse cohérente)',1.00,2),
(4,'cours','qcm','Quel logiciel est un tableur ?','["Word","Excel","Outlook","Access"]','Excel',1.00,3),
(4,'cours','ouverte','Par quel signe commence une formule dans un tableur ?',NULL,'=',1.00,4),
(4,'formules','pratique','Le tableau liste des produits avec quantité (col B) et prix unitaire (col C). Écris la formule du total pour le produit 1 (ligne 2) dans la cellule D2.',NULL,'=B2*C2',2.00,5),
(4,'formules','pratique','Écris la formule pour calculer la somme totale de la colonne D (lignes 2 à 6) dans la cellule D7.',NULL,'=SOMME(D2:D6)',2.00,6),
(4,'formules','pratique','Écris la formule affichant la quantité maximale en stock (colonne B, lignes 2 à 6).',NULL,'=MAX(B2:B6)',1.00,7),
(4,'formules','ouverte','La formule =B2*C2 est en D2. Lorsqu\'on la recopie en D3, que devient-elle ? Explique.',NULL,'=B3*C3. Les références relatives s\'adaptent à la nouvelle ligne.',2.00,8),
(4,'formules','ouverte','Quelle est l\'adresse de la cellule contenant le total du produit 3 si les produits sont en lignes 2 à 6 ?',NULL,'D4',1.00,9),
(4,'formules','pratique','Écris la formule pour calculer la moyenne des prix unitaires (colonne C, lignes 2 à 6).',NULL,'=MOYENNE(C2:C6)',2.00,10),
(4,'graphiques','ouverte','Quel type de graphique permet de comparer les quantités en stock de différents produits ? Justifie.',NULL,'L\'histogramme (barres) car il permet de comparer des valeurs discrètes pour différentes catégories.',2.00,11),
(4,'graphiques','ouverte','Cite les étapes de création d\'un histogramme dans Excel.',NULL,'1. Sélectionner produits et quantités. 2. Insertion → Graphique → Histogramme. 3. Insérer.',2.00,12),
(4,'graphiques','ouverte','Nomme deux éléments que tu peux personnaliser sur ce graphique.',NULL,'Titre, couleur des barres, étiquettes de données, légende, axes.',2.00,13);

-- ============================================================
--  QUESTIONS — TCLSH V5 (test_id=5) — Températures
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(5,'cours','ouverte','Définis un tableur et donne deux exemples de logiciels.',NULL,'Logiciel permettant de créer des tableaux, effectuer des calculs et créer des graphiques. Ex : Excel, LibreOffice Calc.',1.00,1),
(5,'cours','ouverte','Dans le tableau des températures, quelle est l\'adresse de la cellule contenant la température maximale du mois de Janvier ?',NULL,'B2 (accepter adresse cohérente)',1.00,2),
(5,'cours','qcm','Lequel est un tableur ?','["Firefox","Excel","Word","Photoshop"]','Excel',1.00,3),
(5,'cours','ouverte','Par quel signe doit commencer une formule ?',NULL,'=',1.00,4),
(5,'formules','pratique','Le tableau contient les températures min et max sur 6 mois. Écris la formule calculant la moyenne des températures maximales (col B, lignes 2 à 7) dans B8.',NULL,'=MOYENNE(B2:B7)',2.00,5),
(5,'formules','pratique','Écris la formule affichant la température minimale la plus basse sur 6 mois (col C, lignes 2 à 7) dans C9.',NULL,'=MIN(C2:C7)',2.00,6),
(5,'formules','pratique','Écris la formule pour la température maximale la plus élevée (col B, lignes 2 à 7).',NULL,'=MAX(B2:B7)',1.00,7),
(5,'formules','ouverte','La formule =MOYENNE(B2:C2) est en D2. Lorsqu\'on la recopie en D3, que devient-elle ? Explique.',NULL,'=MOYENNE(B3:C3). Les lignes s\'incrémentent par adressage relatif.',2.00,8),
(5,'formules','ouverte','Comment appelle-t-on une plage de cellules allant de A1 à C6 ?',NULL,'A1:C6 — c\'est une plage de cellules.',1.00,9),
(5,'formules','pratique','Écris la formule calculant la somme de toutes les températures max sur 6 mois (col B, lignes 2 à 7).',NULL,'=SOMME(B2:B7)',2.00,10),
(5,'graphiques','ouverte','Quel graphique représente le mieux l\'évolution des températures sur 6 mois ? Justifie.',NULL,'La courbe (graphique en lignes) car elle visualise l\'évolution d\'une valeur dans le temps.',2.00,11),
(5,'graphiques','ouverte','Cite les étapes de création de ce graphique.',NULL,'1. Sélectionner mois et températures. 2. Insertion → Graphique → Courbes. 3. Insérer.',2.00,12),
(5,'graphiques','ouverte','Nomme deux éléments personnalisables sur ce graphique.',NULL,'Titre, couleur des courbes, axes, légende, étiquettes.',2.00,13);

-- ============================================================
--  QUESTIONS — TCLSH V6 (test_id=6) — Concours scolaire
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(6,'cours','ouverte','Qu\'est-ce qu\'un tableur ? Donne deux exemples.',NULL,'Logiciel de calcul en tableaux et de création de graphiques. Ex : Excel, Google Sheets.',1.00,1),
(6,'cours','ouverte','Dans le tableau du concours, quelle est l\'adresse de la cellule contenant le score du premier participant ?',NULL,'B2 (accepter adresse cohérente)',1.00,2),
(6,'cours','qcm','Quel logiciel est un tableur ?','["Google Slides","LibreOffice Calc","VLC","GIMP"]','LibreOffice Calc',1.00,3),
(6,'cours','ouverte','Par quel signe commence une formule dans un tableur ?',NULL,'=',1.00,4),
(6,'formules','pratique','Le tableau liste 6 participants avec leurs scores. Écris la formule calculant le total des scores (col B, lignes 2 à 7) dans B8.',NULL,'=SOMME(B2:B7)',2.00,5),
(6,'formules','pratique','Écris la formule pour la moyenne des scores dans B9.',NULL,'=MOYENNE(B2:B7)',2.00,6),
(6,'formules','pratique','Écris la formule affichant le score maximum dans B10.',NULL,'=MAX(B2:B7)',1.00,7),
(6,'formules','ouverte','La formule =B2*2 est en C2. Si on la recopie en C3, que devient-elle ? Explique.',NULL,'=B3*2. Le numéro de ligne s\'adapte par adressage relatif. Le 2 reste fixe car c\'est une constante.',2.00,8),
(6,'formules','ouverte','Quelle est l\'adresse de la cellule contenant le score du 4ème participant si les données commencent en B2 ?',NULL,'B5',1.00,9),
(6,'formules','pratique','Écris la formule pour calculer le score minimum (col B, lignes 2 à 7).',NULL,'=MIN(B2:B7)',2.00,10),
(6,'graphiques','ouverte','Quel graphique représente le mieux le classement des participants par score ? Justifie.',NULL,'L\'histogramme (barres) permet de comparer les scores visuellement et de distinguer le classement.',2.00,11),
(6,'graphiques','ouverte','Cite les étapes de création de ce graphique dans Excel.',NULL,'1. Sélectionner noms et scores. 2. Insertion → Graphique → Histogramme. 3. Insérer.',2.00,12),
(6,'graphiques','ouverte','Nomme deux éléments à personnaliser sur ce graphique.',NULL,'Titre, couleurs, axes, légende, étiquettes de données.',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V1 (test_id=7) — Notes + SI
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(7,'cours','ouverte','Quelle est la différence entre une adresse relative et une adresse absolue dans un tableur ?',NULL,'Relative (ex: B2) : s\'adapte lors de la recopie. Absolue (ex: $B$2) : reste fixe lors de la recopie.',1.00,1),
(7,'cours','ouverte','Donne le résultat de la formule : =SI(15>=10 ; "Admis" ; "Refusé")',NULL,'Admis (car 15 >= 10 est vrai)',1.00,2),
(7,'cours','qcm','Parmi ces logiciels, lequel est un tableur ?','["Microsoft Word","Microsoft Excel","Mozilla Firefox","Adobe Photoshop"]','Microsoft Excel',1.00,3),
(7,'cours','ouverte','Par quel signe commence obligatoirement une formule dans un tableur ?',NULL,'=',1.00,4),
(7,'formules','pratique','Le tableau contient les notes de 10 élèves dans 3 matières (colonnes B, C, D). Écris la formule SOMME pour calculer la somme des notes d\'un élève en ligne 2.',NULL,'=SOMME(B2:D2)',2.00,5),
(7,'formules','pratique','Écris la formule calculant la moyenne générale de la classe en Mathématiques (colonne B, lignes 2 à 11) dans B12.',NULL,'=MOYENNE(B2:B11)',2.00,6),
(7,'formules','pratique','Écris la formule pour la note maximale en Français (colonne C, lignes 2 à 11).',NULL,'=MAX(C2:C11)',1.00,7),
(7,'formules','pratique','Le coefficient de Mathématiques est en cellule G1 ($G$1). Écris la formule calculant la note pondérée de l\'élève en ligne 2 (note en B2).',NULL,'=B2*$G$1',1.00,8),
(7,'formules','pratique','Écris une formule SI qui affiche "Admis" si la moyenne (en E2) est >= 10, sinon "Refusé".',NULL,'=SI(E2>=10;"Admis";"Refusé")',1.00,9),
(7,'formules','ouverte','La formule =B2*$G$1 est en F2. Lorsqu\'on la recopie en F3, que devient-elle ? Explique le rôle du $ .',NULL,'=B3*$G$1. B2 devient B3 (relatif, s\'adapte). $G$1 reste fixe (absolu, $ bloque ligne et colonne).',3.00,10),
(7,'graphiques','ouverte','Quel type de graphique est adapté pour comparer les moyennes de 10 élèves ? Justifie.',NULL,'L\'histogramme (barres) pour comparer les valeurs de différents individus côte à côte.',2.00,11),
(7,'graphiques','ouverte','Cite les étapes de création de ce graphique dans Excel.',NULL,'1. Sélectionner noms et moyennes. 2. Insertion → Graphique → Histogramme. 3. Insérer.',2.00,12),
(7,'graphiques','ouverte','À quoi sert une courbe de tendance ? Dans quel type de graphique l\'utilise-t-on ?',NULL,'Elle montre la tendance générale d\'une série de données (progression, régression). On l\'utilise dans les graphiques en nuage de points (XY) ou courbes.',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V2 (test_id=8) — Budget projet
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(8,'cours','ouverte','Quelle est la différence entre une adresse relative et une adresse absolue ?',NULL,'Relative (B2) : s\'adapte à la recopie. Absolue ($B$2) : reste fixe.',1.00,1),
(8,'cours','ouverte','Quel est le résultat de =SI(500>300;"Dépassé";"OK") ?',NULL,'Dépassé (car 500 > 300 est vrai)',1.00,2),
(8,'cours','qcm','Lequel est un tableur ?','["Google Docs","WPS Spreadsheets","VLC","Paint"]','WPS Spreadsheets',1.00,3),
(8,'cours','ouverte','Par quel signe commence une formule ?',NULL,'=',1.00,4),
(8,'formules','pratique','Écris la formule calculant le total du budget (col B, lignes 2 à 5) dans B6.',NULL,'=SOMME(B2:B5)',2.00,5),
(8,'formules','pratique','Écris la formule pour la moyenne des postes budgétaires (col B, lignes 2 à 5) dans B7.',NULL,'=MOYENNE(B2:B5)',2.00,6),
(8,'formules','pratique','Écris la formule pour le poste le plus coûteux (col B, lignes 2 à 5).',NULL,'=MAX(B2:B5)',1.00,7),
(8,'formules','pratique','Le budget total est en $B$6. Écris la formule calculant le pourcentage du poste en B2 par rapport au total.',NULL,'=B2/$B$6*100',1.00,8),
(8,'formules','pratique','Écris une formule SI qui affiche "Alerte" si le montant en B2 dépasse 1000, sinon "Normal".',NULL,'=SI(B2>1000;"Alerte";"Normal")',1.00,9),
(8,'formules','ouverte','La formule =B2/$B$6*100 est en C2. Lorsqu\'on la recopie en C3, que devient-elle ? Explique.',NULL,'=B3/$B$6*100. B2 devient B3 (relatif). $B$6 reste fixe (absolu) pour que le total ne change pas.',3.00,10),
(8,'graphiques','ouverte','Quel graphique visualise le mieux la répartition du budget par poste ? Justifie.',NULL,'Le camembert (secteurs) car il montre la proportion de chaque poste par rapport au total.',2.00,11),
(8,'graphiques','ouverte','Cite les étapes de création de ce graphique.',NULL,'1. Sélectionner postes et montants. 2. Insertion → Graphique → Secteurs. 3. Insérer.',2.00,12),
(8,'graphiques','ouverte','À quoi sert une courbe de tendance ? Dans quel type de graphique l\'utilise-t-on ?',NULL,'Montre la direction générale des données. Utilisée dans les graphiques nuage de points XY.',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V3 (test_id=9) — Physique XY
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(9,'cours','ouverte','Quelle est la différence entre une adresse relative et une adresse absolue ?',NULL,'Relative s\'adapte lors de la recopie ; absolue (avec $) reste fixe.',1.00,1),
(9,'cours','ouverte','Quel est le résultat de =SI(RACINE(16)=4;"Correct";"Incorrect") ?',NULL,'Correct (car RACINE(16)=4 est vrai)',1.00,2),
(9,'cours','qcm','Lequel est un tableur ?','["PowerPoint","LibreOffice Calc","Word","Chrome"]','LibreOffice Calc',1.00,3),
(9,'cours','ouverte','Par quel signe commence une formule ?',NULL,'=',1.00,4),
(9,'formules','pratique','Le tableau contient des mesures de temps (col A) et de vitesse (col B). Écris la formule pour la vitesse moyenne (lignes 2 à 7) dans B8.',NULL,'=MOYENNE(B2:B7)',2.00,5),
(9,'formules','pratique','Écris la formule calculant la distance parcourue (distance = vitesse × temps) pour la ligne 2, sachant que le temps est en A2 et la vitesse en B2.',NULL,'=A2*B2',2.00,6),
(9,'formules','pratique','Écris la formule affichant la vitesse maximale (col B, lignes 2 à 7).',NULL,'=MAX(B2:B7)',1.00,7),
(9,'formules','pratique','L\'accélération de référence est en $D$1. Écris la formule calculant la force pour l\'objet en ligne 2 (masse en C2) : F = m × a.',NULL,'=C2*$D$1',1.00,8),
(9,'formules','pratique','Écris une formule SI qui affiche "Rapide" si la vitesse en B2 dépasse 100, sinon "Lent".',NULL,'=SI(B2>100;"Rapide";"Lent")',1.00,9),
(9,'formules','ouverte','La formule =C2*$D$1 est en E2. Lorsqu\'on la recopie en E3, que devient-elle ? Explique.',NULL,'=C3*$D$1. C2 devient C3 (relatif). $D$1 reste fixe (absolu, accélération constante).',3.00,10),
(9,'graphiques','ouverte','Pour représenter la relation entre temps et vitesse, quel graphique est le plus adapté ? Justifie.',NULL,'Le nuage de points XY (Scatter) car il représente la relation entre deux variables numériques continues.',2.00,11),
(9,'graphiques','ouverte','Cite les étapes de création d\'un graphique nuage de points XY dans Excel.',NULL,'1. Sélectionner les deux colonnes de données. 2. Insertion → Graphique → Nuage de points. 3. Insérer.',2.00,12),
(9,'graphiques','ouverte','À quoi sert une courbe de tendance ? Comment l\'ajouter et à quoi sert R² ?',NULL,'Elle montre la tendance générale (linéaire, exponentielle...). On l\'ajoute en cliquant droit sur les points → Ajouter une courbe de tendance. R² mesure la qualité de l\'ajustement (proche de 1 = bon).',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V4 (test_id=10) — Inventaire + SI
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(10,'cours','ouverte','Quelle est la différence entre adresse relative et absolue ?',NULL,'Relative s\'adapte à la recopie ; absolue reste fixe avec $.',1.00,1),
(10,'cours','ouverte','Quel est le résultat de =SI(5<3;"Vrai";"Faux") ?',NULL,'Faux (car 5<3 est faux)',1.00,2),
(10,'cours','qcm','Lequel est un tableur ?','["Word","Excel","Outlook","Access"]','Excel',1.00,3),
(10,'cours','ouverte','Par quel signe commence une formule ?',NULL,'=',1.00,4),
(10,'formules','pratique','Écris la formule calculant le total de la valeur du stock (qté × prix) pour le produit en ligne 2 (qté en B2, prix en C2).',NULL,'=B2*C2',2.00,5),
(10,'formules','pratique','Écris la formule pour la somme totale de la colonne D (lignes 2 à 6).',NULL,'=SOMME(D2:D6)',2.00,6),
(10,'formules','pratique','Écris la formule pour la quantité maximale en stock (col B, lignes 2 à 6).',NULL,'=MAX(B2:B6)',1.00,7),
(10,'formules','pratique','Le seuil d\'alerte est en $F$1. Écris la formule SI en E2 qui affiche "Alerte stock" si B2 < $F$1, sinon "OK".',NULL,'=SI(B2<$F$1;"Alerte stock";"OK")',1.00,8),
(10,'formules','pratique','Écris une formule NB.SI pour compter le nombre de produits en alerte stock dans la plage E2:E6 (valeur = "Alerte stock").',NULL,'=NB.SI(E2:E6;"Alerte stock")',1.00,9),
(10,'formules','ouverte','La formule =SI(B2<$F$1;"Alerte stock";"OK") est en E2. Lorsqu\'on la recopie en E3, que devient-elle ? Explique le rôle de $F$1.',NULL,'=SI(B3<$F$1;"Alerte stock";"OK"). B2 devient B3 (relatif). $F$1 reste fixe car c\'est le seuil commun à tous les produits (adresse absolue).',3.00,10),
(10,'graphiques','ouverte','Quel graphique compare le mieux les quantités en stock de différents produits ? Justifie.',NULL,'L\'histogramme (barres) pour comparer visuellement des valeurs de catégories différentes.',2.00,11),
(10,'graphiques','ouverte','Cite les étapes de création de ce graphique dans Excel.',NULL,'1. Sélectionner produits et quantités. 2. Insertion → Histogramme. 3. Insérer.',2.00,12),
(10,'graphiques','ouverte','À quoi sert une courbe de tendance et dans quel graphique l\'utilise-t-on ?',NULL,'Montre la tendance générale des données. Utilisée dans les nuages de points XY ou courbes.',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V5 (test_id=11) — Météo + tendance
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(11,'cours','ouverte','Quelle est la différence entre adresse relative et absolue ?',NULL,'Relative s\'adapte ; absolue ($) reste fixe à la recopie.',1.00,1),
(11,'cours','ouverte','Quel est le résultat de =SI(MOYENNE(10;12;14)>=12;"Bien";"Passable") ?',NULL,'Bien (MOYENNE=12, condition 12>=12 est vraie)',1.00,2),
(11,'cours','qcm','Lequel est un tableur ?','["Firefox","Excel","Word","Photoshop"]','Excel',1.00,3),
(11,'cours','ouverte','Par quel signe commence une formule ?',NULL,'=',1.00,4),
(11,'formules','pratique','Le tableau contient les relevés de température max (col B) et min (col C) sur 6 mois. Calcule la température moyenne max (col B, lignes 2 à 7) dans B8.',NULL,'=MOYENNE(B2:B7)',2.00,5),
(11,'formules','pratique','Écris la formule calculant l\'amplitude thermique (max - min) pour le mois 1 (B2 et C2) dans D2.',NULL,'=B2-C2',2.00,6),
(11,'formules','pratique','Écris la formule affichant la température minimale la plus basse (col C, lignes 2 à 7).',NULL,'=MIN(C2:C7)',1.00,7),
(11,'formules','pratique','La normale climatique (référence) est en $E$1. Écris la formule en E2 qui affiche "Chaud" si B2 > $E$1, sinon "Normal".',NULL,'=SI(B2>$E$1;"Chaud";"Normal")',1.00,8),
(11,'formules','pratique','Écris une formule NB.SI pour compter le nombre de mois "Chauds" dans la plage E2:E7.',NULL,'=NB.SI(E2:E7;"Chaud")',1.00,9),
(11,'formules','ouverte','La formule =B2-C2 est en D2. Lorsqu\'on la recopie en D3 puis D4, que devient-elle successivement ? Explique.',NULL,'D3: =B3-C3 ; D4: =B4-C4. Les numéros de lignes s\'incrémentent automatiquement (adressage relatif).',3.00,10),
(11,'graphiques','ouverte','Quel graphique représente le mieux l\'évolution des températures sur 6 mois ? Justifie.',NULL,'La courbe (graphique en lignes) car elle montre l\'évolution dans le temps.',2.00,11),
(11,'graphiques','ouverte','Cite les étapes de création de ce graphique.',NULL,'1. Sélectionner mois et températures. 2. Insertion → Courbes. 3. Insérer.',2.00,12),
(11,'graphiques','ouverte','À quoi sert une courbe de tendance ? Comment l\'interpréter grâce à R² ?',NULL,'Elle modélise la tendance (hausse, baisse) d\'une série. R² proche de 1 indique un bon ajustement du modèle aux données.',2.00,13);

-- ============================================================
--  QUESTIONS — TCS V6 (test_id=12) — NB.SI + SOMME.SI
-- ============================================================

INSERT INTO questions (test_id,partie,type,enonce,options,reponse_correcte,bareme,ordre) VALUES
(12,'cours','ouverte','Quelle est la différence entre adresse relative et absolue ?',NULL,'Relative s\'adapte à la recopie ; absolue (avec $) reste fixe.',1.00,1),
(12,'cours','ouverte','Quel est le résultat de =SI(NB.SI(A1:A5;"Admis")>2;"Majorité admis";"Minorité") si 3 cellules contiennent "Admis" ?',NULL,'Majorité admis (NB.SI=3, 3>2 est vrai)',1.00,2),
(12,'cours','qcm','Lequel est un tableur ?','["Google Slides","LibreOffice Calc","VLC","GIMP"]','LibreOffice Calc',1.00,3),
(12,'cours','ouverte','Par quel signe commence une formule ?',NULL,'=',1.00,4),
(12,'formules','pratique','Écris la formule calculant la somme des scores de tous les participants (col B, lignes 2 à 11) dans B12.',NULL,'=SOMME(B2:B11)',2.00,5),
(12,'formules','pratique','Écris la formule pour la moyenne des scores dans B13.',NULL,'=MOYENNE(B2:B11)',2.00,6),
(12,'formules','pratique','Écris la formule affichant le score maximum (col B, lignes 2 à 11).',NULL,'=MAX(B2:B11)',1.00,7),
(12,'formules','pratique','Écris la formule NB.SI pour compter les participants ayant la mention "Admis" dans la plage C2:C11.',NULL,'=NB.SI(C2:C11;"Admis")',1.00,8),
(12,'formules','pratique','Écris la formule SOMME.SI pour calculer la somme des scores des participants "Admis" (statut en col C, scores en col B).',NULL,'=SOMME.SI(C2:C11;"Admis";B2:B11)',1.00,9),
(12,'formules','ouverte','Explique la syntaxe de SOMME.SI : ses 3 arguments et leur rôle.',NULL,'=SOMME.SI(plage_critère ; critère ; plage_somme). 1er : plage où chercher la condition. 2ème : la valeur à rechercher. 3ème : plage des valeurs à additionner.',3.00,10),
(12,'graphiques','ouverte','Quel graphique compare le mieux les scores des participants dans un classement ? Justifie.',NULL,'L\'histogramme (barres) trié par ordre décroissant pour visualiser le classement.',2.00,11),
(12,'graphiques','ouverte','Cite les étapes de création de ce graphique.',NULL,'1. Sélectionner noms et scores. 2. Insertion → Histogramme. 3. Trier données si nécessaire.',2.00,12),
(12,'graphiques','ouverte','À quoi sert une courbe de tendance et dans quel graphique l\'utilise-t-on ?',NULL,'Modélise la tendance d\'évolution des données. Utilisée dans les nuages de points XY.',2.00,13);

-- ============================================================
--  FIN DU SEED
-- ============================================================
SELECT CONCAT('Seed complet : ', COUNT(*), ' questions insérées') AS status FROM questions;
