// ============================================================
//  GestiTest — Serveur Express v3 (final)
//  Base : gesticlasse | Filières : TCLSH / TCS
// ============================================================
require('dotenv').config();
// Les clés ANTHROPIC_API_KEY et MISTRAL_API_KEY sont maintenant lues
// depuis le fichier .env (non versionné, voir .env.example)

const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = 3001;
// Augmenter la limite de payload pour l'import CSV
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.get('/eleve_passation.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'eleve_passation.html')));
app.get('/enseignant_correction.html', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'enseignant_correction.html')));

// Redirections pour compatibilité
app.get('/eleve', (req, res) => res.redirect('/eleve_passation.html'));
app.get('/correction', (req, res) => res.redirect('/enseignant_correction.html'));

// ── DB ───────────────────────────────────────────────────────
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'gesticlasse',
  charset: 'utf8mb4'
};
async function getDB() { return mysql.createConnection(dbConfig); }
function sendErr(res, code, msg) { return res.status(code).json({ success: false, message: msg }); }

// Assigne une version aléatoire parmi les 6 versions d'un module
async function assignTestAleatoire(db, eleveId, filiere, moduleId) {
  const [tests] = await db.query(
    'SELECT id, version FROM tests WHERE filiere=? AND module_id=? AND actif=1 ORDER BY version',
    [filiere, moduleId]
  );
  if (!tests.length) return null;
  // Aléatoire pur
  return tests[Math.floor(Math.random() * tests.length)];
}

// ============================================================
//  AUTH ENSEIGNANT
// ============================================================
app.post('/api/enseignant/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return sendErr(res, 400, 'Champs manquants');
  const db = await getDB();
  try {
    const [rows] = await db.query(
      'SELECT id, nom, mot_de_passe FROM enseignants WHERE email=?',
      [email.trim().toLowerCase()]
    );
    if (!rows.length) return sendErr(res, 401, 'Email ou mot de passe incorrect');
    const valid = await bcrypt.compare(password, rows[0].mot_de_passe);
    if (!valid) return sendErr(res, 401, 'Email ou mot de passe incorrect');
    res.json({ success: true, nom: rows[0].nom });
  } finally { db.end(); }
});

// ============================================================
//  ROUTES ÉLÈVE
// ============================================================
app.post('/api/test/login', async (req, res) => {
  const { massar, ddn } = req.body;
  if (!massar || !ddn) return sendErr(res, 400, 'Champs manquants');
  const db = await getDB();
  try {
    const [rows] = await db.query(
      `SELECT e.id, e.nom, e.prenom, e.massar, e.points,
              c.nom AS classe, c.filiere
       FROM eleves e JOIN classes c ON e.classe_id=c.id
       WHERE e.massar=? AND DATE(e.date_naissance)=?`,
      [massar.trim().toUpperCase(), ddn]
    );
    if (!rows.length) return sendErr(res, 401, 'Identifiants incorrects. Vérifie ton numéro Massar et ta date de naissance.');
    const eleve = rows[0];

    // Récupérer tous les modules actifs disponibles pour cette filière
    const [modules] = await db.query(
      `SELECT DISTINCT t.module_id FROM tests t
       WHERE t.filiere=? AND t.actif=1 ORDER BY t.module_id`,
      [eleve.filiere]
    );

    const ds_list = [];
    for (const { module_id } of modules) {
      // Chercher une soumission existante pour cet élève + ce module
      const [existing] = await db.query(
        `SELECT s.id, s.test_id, s.statut, s.note_finale, t.version, t.titre
         FROM soumissions s JOIN tests t ON s.test_id=t.id
         WHERE s.eleve_id=? AND t.module_id=?
         ORDER BY s.id DESC LIMIT 1`,
        [eleve.id, module_id]
      );

      let soumission_id, test_id, version, statut, note_finale, titre;

      if (existing.length) {
        // Soumission déjà existante → reprendre
        ({ id: soumission_id, test_id, statut, note_finale, version } = existing[0]);
        titre = existing[0].titre;
      } else {
        // Pas encore de soumission → assigner une version aléatoire
        const test = await assignTestAleatoire(db, eleve.id, eleve.filiere, module_id);
        if (!test) continue; // module sans test disponible → ignorer
        test_id = test.id;
        version = test.version;
        const [[t]] = await db.query('SELECT titre FROM tests WHERE id=?', [test_id]);
        titre = t ? t.titre : `DS${module_id}`;
        const [ins] = await db.query(
          'INSERT INTO soumissions (eleve_id, test_id, statut) VALUES (?,?,?)',
          [eleve.id, test_id, 'en_cours']
        );
        soumission_id = ins.insertId;
        statut = 'en_cours';
        note_finale = null;
      }

      ds_list.push({
        module_id,
        soumission_id,
        test_id,
        version,
        statut,        // 'en_cours' | 'soumis' | 'corrige'
        note_finale,
        titre: titre || `DS${module_id}`
      });
    }

    res.json({
      success: true,
      eleve: { id: eleve.id, nom: eleve.nom, prenom: eleve.prenom, massar: eleve.massar, classe: eleve.classe, filiere: eleve.filiere },
      ds_list
    });
  } finally { db.end(); }
});

app.get('/api/test/get', async (req, res) => {
  const { soumission_id } = req.query;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    const [soumRows] = await db.query(
      `SELECT s.id, s.statut, s.horodatage, s.test_id, s.note_finale,
              t.filiere, t.version, t.titre, t.contexte, t.module_id
       FROM soumissions s JOIN tests t ON s.test_id=t.id WHERE s.id=?`,
      [soumission_id]
    );
    console.log('soumRows:', soumRows);
    if (!soumRows.length) {
      console.log('Aucune soumission trouvée pour id:', soumission_id);
      return sendErr(res, 404, 'Soumission non trouvée');
    }
    if (!soumRows.length) return sendErr(res, 404, 'Soumission non trouvée');
    const soum = soumRows[0];
    const [questions] = await db.query(
      'SELECT id, partie, type, enonce, options, bareme, ordre FROM questions WHERE test_id=? ORDER BY ordre',
      [soum.test_id]
    );
    const [repRows] = await db.query(
      'SELECT question_id, reponse_eleve FROM reponses WHERE soumission_id=?',
      [soumission_id]
    );
    const reponses = {};
    repRows.forEach(r => { reponses[r.question_id] = r.reponse_eleve; });
    res.json({
      test: {
        id: soum.test_id,
        filiere: soum.filiere,
        version: soum.version,
        titre: soum.titre,
        contexte: soum.contexte,
        module_id: soum.module_id
      },
      soumission: { id: soum.id, statut: soum.statut, horodatage: soum.horodatage, note_finale: soum.note_finale },
      questions, reponses
    });
  } finally { db.end(); }
});

app.post('/api/test/save-response', async (req, res) => {
  const { soumission_id, question_id, reponse } = req.body;
  if (!soumission_id || !question_id) return sendErr(res, 400, 'Paramètres manquants');
  const db = await getDB();
  try {
    const [s] = await db.query('SELECT statut FROM soumissions WHERE id=?', [soumission_id]);
    if (!s.length || s[0].statut !== 'en_cours') return sendErr(res, 403, 'Soumission déjà finalisée');
    await db.query(
      `INSERT INTO reponses (soumission_id, question_id, reponse_eleve)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE reponse_eleve=VALUES(reponse_eleve)`,
      [soumission_id, question_id, reponse || '']
    );
    res.json({ success: true });
  } finally { db.end(); }
});

app.post('/api/test/submit', async (req, res) => {
  const { soumission_id } = req.body;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    const [s] = await db.query('SELECT statut FROM soumissions WHERE id=?', [soumission_id]);
    if (!s.length) return sendErr(res, 404, 'Soumission non trouvée');
    if (s[0].statut !== 'en_cours') return sendErr(res, 403, 'Déjà soumis');
    await db.query(`UPDATE soumissions SET statut='soumis', horodatage=NOW() WHERE id=?`, [soumission_id]);
    res.json({ success: true });
  } finally { db.end(); }
});

// Statuts à jour par élève (appelé après soumission pour rafraîchir la liste)
app.get('/api/test/statuts', async (req, res) => {
  const { eleve_id } = req.query;
  if (!eleve_id) return sendErr(res, 400, 'eleve_id requis');
  const db = await getDB();
  try {
    const [rows] = await db.query(
      `SELECT t.module_id, t.id AS test_id, t.version, t.titre, t.filiere,
              s.id AS soumission_id, s.statut, s.note_finale
       FROM soumissions s JOIN tests t ON s.test_id=t.id
       WHERE s.eleve_id=?
       ORDER BY t.module_id, s.id DESC`,
      [eleve_id]
    );
    // Une seule entrée par module (la plus récente)
    const seen = new Set();
    const statuts = rows.filter(r => {
      if (seen.has(r.module_id)) return false;
      seen.add(r.module_id);
      return true;
    });
    res.json({ statuts });
  } finally { db.end(); }
});

// ============================================================
//  ROUTES CORRECTION
// ============================================================
app.get('/api/correction/stats', async (req, res) => {
  const db = await getDB();
  try {
    // Totaux globaux
    const [[totals]] = await db.query(`
      SELECT COUNT(*) AS total,
             SUM(statut='soumis')  AS pending,
             SUM(statut='corrige') AS done,
             ROUND(AVG(CASE WHEN note_finale IS NOT NULL THEN note_finale END),2) AS avg,
             ROUND(MIN(CASE WHEN note_finale IS NOT NULL THEN note_finale END),2) AS min,
             ROUND(MAX(CASE WHEN note_finale IS NOT NULL THEN note_finale END),2) AS max
      FROM soumissions WHERE statut != 'en_cours'
    `);
    // Totaux par DS (module)
    const [parDS] = await db.query(`
      SELECT t.module_id,
             m.nom AS nom_module,
             COUNT(s.id) AS total,
             SUM(s.statut='soumis')  AS pending,
             SUM(s.statut='corrige') AS done,
             ROUND(AVG(CASE WHEN s.note_finale IS NOT NULL THEN s.note_finale END),2) AS avg,
             ROUND(MIN(CASE WHEN s.note_finale IS NOT NULL THEN s.note_finale END),2) AS min,
             ROUND(MAX(CASE WHEN s.note_finale IS NOT NULL THEN s.note_finale END),2) AS max
      FROM soumissions s
      JOIN tests t ON s.test_id=t.id
      LEFT JOIN modules m ON m.id=t.module_id
      WHERE s.statut != 'en_cours'
      GROUP BY t.module_id ORDER BY t.module_id
    `);
    // Stats par classe et par DS
    const [classes] = await db.query(`
      SELECT c.nom AS classe, t.filiere, t.module_id,
             COUNT(s.id) AS nb_soumissions,
             SUM(s.statut='corrige') AS nb_corriges,
             ROUND(AVG(CASE WHEN s.note_finale IS NOT NULL THEN s.note_finale END),2) AS avg,
             MIN(s.note_finale) AS min, MAX(s.note_finale) AS max
      FROM soumissions s
      JOIN eleves e ON s.eleve_id=e.id
      JOIN classes c ON e.classe_id=c.id
      JOIN tests t ON s.test_id=t.id
      WHERE s.statut != 'en_cours'
      GROUP BY c.id, t.filiere, t.module_id ORDER BY t.module_id, c.nom
    `);
    res.json({ ...totals, parDS, classes });
  } finally { db.end(); }
});

app.get('/api/correction/soumissions', async (req, res) => {
  const db = await getDB();
  try {
    const [soumissions] = await db.query(`
      SELECT s.id, s.statut, s.horodatage, s.note_finale, s.auto_corrige, s.valide_par_enseignant,
             e.nom, e.prenom, e.massar,
             c.nom AS classe, t.filiere, t.version, t.module_id, t.titre,
             (SELECT COUNT(*) FROM reponses r WHERE r.soumission_id=s.id AND r.note_attribuee IS NOT NULL) AS nb_notes,
             (SELECT COUNT(*) FROM reponses r WHERE r.soumission_id=s.id) AS nb_questions,
             (SELECT COUNT(*) FROM reponses r WHERE r.soumission_id=s.id
                AND (
                  r.reponse_eleve LIKE '%pas répéter%' OR
                  r.reponse_eleve LIKE '%pas repeter%' OR
                  r.reponse_eleve LIKE '%déjà passé%' OR
                  r.reponse_eleve LIKE '%deja passe%' OR
                  r.reponse_eleve LIKE '%sur papier%' OR
                  r.reponse_eleve LIKE '%papier%' OR
                  r.reponse_eleve LIKE '%pas refaire%' OR
                  r.reponse_eleve LIKE '%ne veux pas%' OR
                  r.reponse_eleve LIKE '%déjà fait%' OR
                  r.reponse_eleve LIKE '%deja fait%'
                )
             ) AS refus_papier_signal
      FROM soumissions s
      JOIN eleves e ON s.eleve_id=e.id
      JOIN classes c ON e.classe_id=c.id
      JOIN tests t ON s.test_id=t.id
      WHERE s.statut != 'en_cours'
      ORDER BY s.horodatage DESC
    `);
    res.json({ soumissions });
  } finally { db.end(); }
});

app.get('/api/correction/soumission', async (req, res) => {
  const { id } = req.query;
  if (!id) return sendErr(res, 400, 'id requis');
  const db = await getDB();
  try {
    const [[soumission]] = await db.query(
      `SELECT s.*, t.filiere, t.version, t.titre
       FROM soumissions s JOIN tests t ON s.test_id=t.id WHERE s.id=?`, [id]
    );
    if (!soumission) return sendErr(res, 404, 'Soumission non trouvée');

    const [[eleve]] = await db.query(
      `SELECT e.id, e.nom, e.prenom, e.massar, e.points, c.nom AS classe, c.filiere
       FROM eleves e JOIN classes c ON e.classe_id=c.id WHERE e.id=?`,
      [soumission.eleve_id]
    );
    const [questions] = await db.query('SELECT * FROM questions WHERE test_id=? ORDER BY ordre', [soumission.test_id]);
    const [reponses] = await db.query('SELECT * FROM reponses WHERE soumission_id=?', [id]);

    let profil_gesticlasse = { comportement: parseFloat(eleve.points) || 20, cahier_ok: null, remarques: '', proprete: '' };
    try {
      const [c] = await db.query('SELECT exercices, proprete FROM cahiers WHERE eleve_id=? ORDER BY id DESC LIMIT 1', [eleve.id]);
      if (c.length) { profil_gesticlasse.cahier_ok = c[0].exercices === 'oui'; profil_gesticlasse.proprete = c[0].proprete; }
    } catch (e) { }
    try {
      const [r] = await db.query('SELECT texte FROM remarques WHERE eleve_id=? ORDER BY id DESC LIMIT 3', [eleve.id]);
      if (r.length) profil_gesticlasse.remarques = r.map(x => x.texte).join(' | ');
    } catch (e) { }

    res.json({ soumission, eleve, questions, reponses, profil_gesticlasse });
  } finally { db.end(); }
});

app.post('/api/correction/save', async (req, res) => {
  const { soumission_id, corrections, note_finale } = req.body;
  if (!soumission_id || !corrections) return sendErr(res, 400, 'Paramètres manquants');
  const db = await getDB();
  try {
    for (const c of corrections) {
      await db.query(
        `INSERT INTO reponses (soumission_id, question_id, note_attribuee, commentaire_correcteur, corrige_par)
         VALUES (?,?,?,?,'manuel') ON DUPLICATE KEY UPDATE
           note_attribuee=VALUES(note_attribuee),
           commentaire_correcteur=VALUES(commentaire_correcteur),
           corrige_par='manuel'`,
        [soumission_id, c.question_id, c.note, c.commentaire || '']
      );
    }
    await db.query(
      `UPDATE soumissions SET statut='corrige', note_finale=?, auto_corrige=0, valide_par_enseignant=1 WHERE id=?`,
      [Math.round(note_finale * 100) / 100, soumission_id]
    );
    res.json({ success: true });
  } finally { db.end(); }
});

app.post('/api/correction/reset', async (req, res) => {
  const { soumission_id } = req.body;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    await db.query('DELETE FROM reponses WHERE soumission_id=?', [soumission_id]);
    await db.query(`UPDATE soumissions SET statut='en_cours', note_finale=NULL, horodatage=NOW() WHERE id=?`, [soumission_id]);
    res.json({ success: true });
  } finally { db.end(); }
});

// Forcer la soumission d'un élève qui n'a pas cliqué Soumettre
app.post('/api/correction/force-submit', async (req, res) => {
  const { soumission_id } = req.body;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    const [[s]] = await db.query('SELECT statut FROM soumissions WHERE id=?', [soumission_id]);
    if (!s) return sendErr(res, 404, 'Soumission non trouvée');
    if (s.statut !== 'en_cours') return sendErr(res, 400, 'Statut actuel : ' + s.statut);
    await db.query(`UPDATE soumissions SET statut='soumis', horodatage=NOW() WHERE id=?`, [soumission_id]);
    res.json({ success: true });
  } finally { db.end(); }
});

// Élèves sans aucune soumission pour un module
app.get('/api/correction/absents', async (req, res) => {
  const { module_id } = req.query;
  if (!module_id) return sendErr(res, 400, 'module_id requis');
  const db = await getDB();
  try {
    const [absents] = await db.query(`
      SELECT e.id, e.nom, e.prenom, e.massar, c.nom AS classe, c.filiere
      FROM eleves e
      JOIN classes c ON e.classe_id = c.id
      WHERE e.id NOT IN (
        SELECT DISTINCT s.eleve_id FROM soumissions s
        JOIN tests t ON s.test_id = t.id WHERE t.module_id = ?
      )
      ORDER BY c.nom, e.nom, e.prenom
    `, [module_id]);
    res.json({ absents, total: absents.length });
  } finally { db.end(); }
});

// Élèves avec soumission en_cours (ont commencé mais pas soumis)
app.get('/api/correction/encours', async (req, res) => {
  const { module_id } = req.query;
  if (!module_id) return sendErr(res, 400, 'module_id requis');
  const db = await getDB();
  try {
    const [encours] = await db.query(`
      SELECT s.id AS soumission_id, s.horodatage,
             e.nom, e.prenom, e.massar,
             c.nom AS classe, c.filiere, t.version
      FROM soumissions s
      JOIN tests t ON s.test_id = t.id
      JOIN eleves e ON s.eleve_id = e.id
      JOIN classes c ON e.classe_id = c.id
      WHERE t.module_id = ? AND s.statut = 'en_cours'
      ORDER BY c.nom, e.nom, e.prenom
    `, [module_id]);
    res.json({ encours, total: encours.length });
  } finally { db.end(); }
});

app.post('/api/correction/change-version', async (req, res) => {
  const { soumission_id, version } = req.body;
  if (!soumission_id || !version) return sendErr(res, 400, 'Paramètres manquants');
  const db = await getDB();
  try {
    const [[soum]] = await db.query(
      `SELECT c.filiere FROM soumissions s
       JOIN eleves e ON s.eleve_id=e.id JOIN classes c ON e.classe_id=c.id WHERE s.id=?`,
      [soumission_id]
    );
    if (!soum) return sendErr(res, 404, 'Soumission non trouvée');
    const [[test]] = await db.query('SELECT id FROM tests WHERE filiere=? AND version=? AND actif=1', [soum.filiere, version]);
    if (!test) return sendErr(res, 404, `Aucun test V${version} pour la filière ${soum.filiere}`);
    await db.query('DELETE FROM reponses WHERE soumission_id=?', [soumission_id]);
    await db.query(
      `UPDATE soumissions SET test_id=?, statut='en_cours', note_finale=NULL, horodatage=NOW() WHERE id=?`,
      [test.id, soumission_id]
    );
    res.json({ success: true });
  } finally { db.end(); }
});

// ============================================================
//  SUGGESTIONS IA
// ============================================================
app.post('/api/correction/suggest', async (req, res) => {
  const { soumission_id } = req.body;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    const [rows] = await db.query(`
      SELECT q.id, q.enonce, q.reponse_correcte, q.bareme, q.type, r.reponse_eleve
      FROM reponses r JOIN questions q ON r.question_id=q.id
      WHERE r.soumission_id=? AND q.type != 'qcm'
    `, [soumission_id]);

    if (!rows.length) return res.json({ suggestions: {} });

    const suggestions = {};
    for (const q of rows) {
      if (!q.reponse_eleve || q.reponse_eleve.trim() === '') {
        suggestions[q.id] = { note: 0, similarite: 0, justification: 'Pas de réponse.' };
        continue;
      }
      try {
        const prompt = `Tu es un enseignant correcteur en informatique niveau lycée Maroc.
Évalue la réponse d'un élève. Retourne UNIQUEMENT un objet JSON valide, sans texte avant ou après, sans backticks.

Important : pour les raccourcis clavier et termes techniques, accepte les équivalents linguistiques courants comme corrects (ex: "Ctrl+Fin" = "Ctrl+End", "Suppr" = "Delete" = "Del", "Échap" = "Echap" = "Esc", "Entrée" = "Enter", "Retour" = "Backspace"). Ne penalise pas une réponse juste parce qu'elle est en français au lieu d'anglais ou vice-versa, si la touche/fonction désignée est la même.

Question : ${q.enonce}
Réponse attendue : ${q.reponse_correcte}
Réponse de l'élève : ${q.reponse_eleve}
Barème : ${q.bareme} point(s)

JSON attendu :
{"note": <0 à ${q.bareme} par pas de 0.25>, "similarite": <0 à 100>, "justification": "<max 15 mots en français>"}`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 150, messages: [{ role: 'user', content: prompt }] })
        });
        const data = await response.json();
        const text = data.content?.[0]?.text || '{}';
        const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
        suggestions[q.id] = {
          note: Math.min(Math.max(parseFloat(parsed.note) || 0, 0), parseFloat(q.bareme)),
          similarite: Math.min(Math.max(parseInt(parsed.similarite) || 0, 0), 100),
          justification: parsed.justification || ''
        };
      } catch (e) {
        suggestions[q.id] = { note: null, similarite: null, justification: 'Erreur analyse.' };
      }
    }
    res.json({ suggestions });
  } finally { db.end(); }
});

// ============================================================
//  CORRECTION AUTOMATIQUE EN LOT (SSE)
// ============================================================
// ============================================================
//  CORRECTION PAR SIMILARITÉ TEXTUELLE (fallback, sans IA)
// ============================================================
function normaliser(txt) {
  return (txt || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s=():;,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function extraireMotsCles(txt) {
  const stopwords = new Set(['le','la','les','de','du','des','un','une','et','ou','est','sont',
    'dans','pour','que','qui','avec','sur','par','ce','cette','ces','il','elle','on','nous','vous']);
  return normaliser(txt).split(' ').filter(w => w.length > 1 && !stopwords.has(w));
}
function extraireFormule(txt) {
  const matches = (txt || '').match(/[A-Za-zÀ-ÿ]+\s*\([^)]*\)/g) || [];
  return matches.map(m => normaliser(m).replace(/\s/g, ''));
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}
function scoreSimilariteTexte(reponseEleve, reponseCorrecte, bareme) {
  if (!reponseEleve || reponseEleve.trim() === '') return { note: 0, commentaire: 'Absent' };
  if (!reponseCorrecte || reponseCorrecte.trim() === '') return { note: 0, commentaire: 'Pas de corrigé' };

  const eleveNorm = normaliser(reponseEleve);
  const correctNorm = normaliser(reponseCorrecte);
  if (eleveNorm === correctNorm) return { note: bareme, commentaire: 'Correspondance exacte' };

  const formulesEleve = extraireFormule(reponseEleve);
  const formulesCorrectes = extraireFormule(reponseCorrecte);
  let scoreFormule = 0;
  for (const fc of formulesCorrectes) {
    const fnCorrecte = fc.split('(')[0];
    for (const fe of formulesEleve) {
      const fnEleve = fe.split('(')[0];
      if (fnEleve === fnCorrecte) {
        scoreFormule = Math.max(scoreFormule, 0.6);
        const rangeCorrecte = fc.match(/[a-z]\d+:[a-z]\d+/i);
        const rangeEleve = fe.match(/[a-z]\d+:[a-z]\d+/i);
        if (rangeCorrecte && rangeEleve && rangeCorrecte[0] === rangeEleve[0]) scoreFormule = Math.max(scoreFormule, 0.9);
        else if (rangeCorrecte && rangeEleve) scoreFormule = Math.max(scoreFormule, 0.7);
      }
    }
  }

  const motsEleve = new Set(extraireMotsCles(reponseEleve));
  const motsCorrects = new Set(extraireMotsCles(reponseCorrecte));
  let scoreMots = 0;
  if (motsCorrects.size > 0) {
    let intersection = 0;
    for (const m of motsCorrects) if (motsEleve.has(m)) intersection++;
    scoreMots = intersection / motsCorrects.size;
  }

  let scoreLevenshtein = 0;
  if (correctNorm.length < 40) {
    const dist = levenshtein(eleveNorm, correctNorm);
    const maxLen = Math.max(eleveNorm.length, correctNorm.length, 1);
    scoreLevenshtein = Math.max(0, 1 - dist / maxLen);
  }

  const scoreFinal = Math.max(scoreFormule, scoreMots, scoreLevenshtein * 0.8);
  let note, niveau;
  if (scoreFinal >= 0.85) { note = bareme; niveau = 'Très bonne réponse'; }
  else if (scoreFinal >= 0.65) { note = bareme * 0.75; niveau = 'Bonne réponse'; }
  else if (scoreFinal >= 0.45) { note = bareme * 0.5; niveau = 'Réponse partielle'; }
  else if (scoreFinal >= 0.25) { note = bareme * 0.25; niveau = 'Réponse faible'; }
  else { note = 0; niveau = 'Hors sujet'; }

  note = Math.round(note * 4) / 4;
  return { note, commentaire: niveau + ' (' + Math.round(scoreFinal*100) + '%)' };
}

app.get('/api/correction/auto-batch', async (req, res) => {
  const { module_id, classe, filiere } = req.query;
  if (!module_id) return sendErr(res, 400, 'module_id requis');

  // SSE headers pour progression temps réel
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data) => res.write('data: ' + JSON.stringify(data) + '\n\n');

  const db = await getDB();
  try {
    // Récupérer toutes les soumissions soumises du module
    let where = ['t.module_id = ?', "s.statut = 'soumis'"];
    const params = [module_id];
    if (classe)  { where.push('c.nom = ?');      params.push(classe); }
    if (filiere) { where.push('c.filiere = ?');  params.push(filiere); }

    const [soumissions] = await db.query(`
      SELECT s.id, e.nom, e.prenom, e.massar, c.nom AS classe, e.points AS comportement, e.suspect_triche
      FROM soumissions s
      JOIN eleves e ON s.eleve_id = e.id
      JOIN classes c ON e.classe_id = c.id
      JOIN tests t ON s.test_id = t.id
      WHERE ${where.join(' AND ')}
      ORDER BY c.nom, e.nom
    `, params);

    if (!soumissions.length) {
      send({ type: 'done', total: 0, corrigees: 0, message: 'Aucune soumission à corriger' });
      return res.end();
    }

    send({ type: 'start', total: soumissions.length });

    let corrigees = 0;
    let erreurs = 0;

    for (const soum of soumissions) {
      send({ type: 'progress', soumission_id: soum.id, eleve: soum.prenom + ' ' + soum.nom, classe: soum.classe, corrigees, total: soumissions.length });

      try {
        // Récupérer les questions + réponses
        const [rows] = await db.query(`
          SELECT q.id, q.enonce, q.reponse_correcte, q.bareme, q.type, r.reponse_eleve
          FROM reponses r JOIN questions q ON r.question_id = q.id
          WHERE r.soumission_id = ?
        `, [soum.id]);

        // Multiplicateur léger basé sur le comportement (GestiClasse)
        // Comportement haut → bonus léger ; comportement bas → pénalité légère
        // Ne s'applique qu'aux questions ouvertes/pratiques évaluées par IA, jamais aux QCM
        const comportement = parseFloat(soum.comportement) ?? 20;
        let multiplicateurComportement = 1.0;
        if (comportement >= 16) multiplicateurComportement = 1.10;
        else if (comportement < 10) multiplicateurComportement = 0.90;

        // Élève flagué suspect de triche par l'enseignant (GestiClasse) :
        // jamais de bonus, et un mode de correction plus sceptique côté IA
        const estSuspect = !!soum.suspect_triche;
        if (estSuspect) multiplicateurComportement = Math.min(multiplicateurComportement, 0.90);

        // QCM : correction directe
        // Ouvertes/pratiques : via IA
        let noteFinale = 0;

        for (const q of rows) {
          let note = 0;
          let corrigePar = 'auto';
          let commentaire = '';

          if (q.type === 'qcm') {
            // Correction QCM automatique
            const repEleve = (q.reponse_eleve || '').trim().toLowerCase();
            const repCorrecte = (q.reponse_correcte || '').trim().toLowerCase();
            note = repEleve === repCorrecte ? parseFloat(q.bareme) : 0;
            commentaire = repEleve === repCorrecte ? '✓ Correct' : '✗ Incorrect';
          } else if (!q.reponse_eleve || q.reponse_eleve.trim() === '') {
            note = 0;
            commentaire = 'Absent';
          } else {
            // Correction via Mistral AI (gratuit) pour questions ouvertes et pratiques
            let aiOk = false;
            if (process.env.MISTRAL_API_KEY) {
              try {
                const consigneSuspect = estSuspect
                  ? `\nATTENTION — cet élève est signalé par l'enseignant comme suspect de triche (réponses possiblement générées par IA ou copiées).
Sois strict et sceptique : n'accorde le maximum de points que si la réponse est précisément ciblée sur ce qui est demandé, sans détours, sans vocabulaire ou structure trop avancés pour un lycéen. En cas de doute sur l'authenticité, donne une note plus basse plutôt qu'un bénéfice du doute.`
                  : '';

                const prompt = `Tu es un enseignant correcteur en informatique niveau lycée Maroc.
Évalue la réponse d'un élève. Retourne UNIQUEMENT un objet JSON valide, sans texte avant ou après, sans backticks.${consigneSuspect}

Important : pour les raccourcis clavier et termes techniques, accepte les équivalents linguistiques courants comme corrects (ex: "Ctrl+Fin" = "Ctrl+End", "Suppr" = "Delete" = "Del", "Échap" = "Echap" = "Esc", "Entrée" = "Enter", "Retour" = "Backspace"). Ne penalise pas une réponse juste parce qu'elle est en français au lieu d'anglais ou vice-versa, si la touche/fonction désignée est la même.

Question : ${q.enonce}
Réponse attendue : ${q.reponse_correcte}
Réponse de l'élève : ${q.reponse_eleve}
Barème : ${q.bareme} point(s)

JSON attendu :
{"note": <0 à ${q.bareme} par pas de 0.25>, "similarite": <0 à 100>, "justification": "<max 15 mots en français>"}`;

                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + process.env.MISTRAL_API_KEY
                  },
                  body: JSON.stringify({
                    model: 'mistral-small-latest',
                    max_tokens: 150,
                    temperature: 0.2,
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' }
                  })
                });
                const data = await response.json();
                if (data.error || !data.choices) throw new Error(data.error?.message || 'Erreur Mistral');
                const text = data.choices[0].message.content;
                const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
                note = Math.min(Math.max(parseFloat(parsed.note) || 0, 0), parseFloat(q.bareme));
                commentaire = '🌬️ ' + (parsed.justification || '');
                aiOk = true;
              } catch(e) {
                aiOk = false;
              }
            }

            if (!aiOk) {
              const result = scoreSimilariteTexte(q.reponse_eleve, q.reponse_correcte, parseFloat(q.bareme));
              note = result.note;
              commentaire = '📊 ' + result.commentaire;
            }

            // Appliquer le multiplicateur de comportement (jamais sur QCM, jamais au-delà du barème)
            if (multiplicateurComportement !== 1.0 && note > 0) {
              const noteAjustee = Math.min(parseFloat(q.bareme), Math.round(note * multiplicateurComportement * 4) / 4);
              if (noteAjustee !== note) {
                commentaire += multiplicateurComportement > 1
                  ? ' (+ajusté comport.)'
                  : ' (-ajusté comport.)';
              }
              note = noteAjustee;
            }
          }

          noteFinale += note;

          // Sauvegarder la note
          await db.query(
            'UPDATE reponses SET note_attribuee = ?, commentaire_correcteur = ?, corrige_par = ? WHERE soumission_id = ? AND question_id = ?',
            [note, commentaire, corrigePar, soum.id, q.id]
          );
        }

        // Mettre à jour la soumission
        await db.query(
          "UPDATE soumissions SET statut = 'corrige', note_finale = ?, auto_corrige = 1 WHERE id = ?",
          [Math.round(noteFinale * 100) / 100, soum.id]
        );

        corrigees++;
        send({ type: 'corrige', soumission_id: soum.id, eleve: soum.prenom + ' ' + soum.nom, note: Math.round(noteFinale * 100) / 100, suspect: estSuspect, corrigees, total: soumissions.length });

      } catch(e) {
        erreurs++;
        send({ type: 'erreur', soumission_id: soum.id, eleve: soum.prenom + ' ' + soum.nom, message: e.message });
      }
    }

    send({ type: 'done', total: soumissions.length, corrigees, erreurs });
    res.end();
  } catch(e) {
    send({ type: 'erreur_fatal', message: e.message });
    res.end();
  } finally { db.end(); }
});
app.get('/api/correction/export-csv', async (req, res) => {
  const { classe } = req.query;
  const db = await getDB();
  try {
    let query = `
      SELECT e.nom, e.prenom, e.massar, c.nom AS classe, t.filiere, t.version,
             s.note_finale, r1.n AS note_p1, r2.n AS note_p2, r3.n AS note_p3, s.horodatage
      FROM soumissions s
      JOIN eleves e ON s.eleve_id=e.id JOIN classes c ON e.classe_id=c.id JOIN tests t ON s.test_id=t.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='cours'      GROUP BY soumission_id) r1 ON r1.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='formules'   GROUP BY soumission_id) r2 ON r2.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='graphiques' GROUP BY soumission_id) r3 ON r3.soumission_id=s.id
      WHERE s.statut='corrige'`;
    const params = [];
    if (classe) { query += ' AND c.nom=?'; params.push(classe); }
    query += ' ORDER BY c.nom, e.nom, e.prenom';
    const [rows] = await db.query(query, params);
    const lines = [
      ['Nom', 'Prénom', 'Massar', 'Classe', 'Filière', 'Version', 'P1 /4', 'P2 /10', 'P3 /6', 'Note /20', 'Date'].join(';'),
      ...rows.map(r => [
        r.nom, r.prenom, r.massar, r.classe, r.filiere, 'V' + r.version,
        r.note_p1 !== null ? parseFloat(r.note_p1).toFixed(2) : '',
        r.note_p2 !== null ? parseFloat(r.note_p2).toFixed(2) : '',
        r.note_p3 !== null ? parseFloat(r.note_p3).toFixed(2) : '',
        r.note_finale !== null ? parseFloat(r.note_finale).toFixed(2) : '',
        r.horodatage ? new Date(r.horodatage).toLocaleString('fr-FR') : ''
      ].join(';'))
    ];
    const filename = `notes_tableur${classe ? '_' + classe : ''}_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + lines.join('\r\n'));
  } finally { db.end(); }
});

// ============================================================
//  EXPORT POUR DASHBOARD STATISTIQUES (site externe)
// ============================================================
app.get('/api/correction/export-stats-dashboard', async (req, res) => {
  const db = await getDB();
  try {
    const [rows] = await db.query(`
      SELECT e.massar, e.nom, e.prenom, e.points AS comportement,
             c.nom AS classe, c.filiere,
             t.module_id, s.note_finale, s.statut
      FROM eleves e
      JOIN classes c ON e.classe_id = c.id
      LEFT JOIN soumissions s ON s.eleve_id = e.id
      LEFT JOIN tests t ON s.test_id = t.id
      ORDER BY c.nom, e.nom, e.prenom
    `);

    const [modules] = await db.query('SELECT id, nom FROM modules ORDER BY id');
    const moduleNames = {};
    modules.forEach(m => { moduleNames['ds' + m.id] = m.nom; });

    // Regrouper par élève
    const eleveMap = {};
    rows.forEach(r => {
      if (!eleveMap[r.massar]) {
        eleveMap[r.massar] = {
          massar: r.massar, nom: r.nom, prenom: r.prenom,
          classe: r.classe, filiere: r.filiere,
          comportement: parseFloat(r.comportement) || 20,
          ds1: null, ds2: null, ds3: null, ds4: null
        };
      }
      if (r.module_id && r.statut === 'corrige' && r.note_finale !== null) {
        eleveMap[r.massar]['ds' + r.module_id] = parseFloat(r.note_finale);
      }
    });

    const eleves = Object.values(eleveMap);

    res.json({
      generated_at: new Date().toISOString(),
      module_names: moduleNames,
      eleves
    });
  } finally { db.end(); }
});

app.get('/api/correction/export-complet', async (req, res) => {
  const { classe } = req.query;
  const db = await getDB();
  try {
    const params = [];
    let whereClause = '';
    if (classe) { whereClause = ' AND c.nom=?'; params.push(classe); }

    const [eleves] = await db.query(
      `SELECT e.nom, e.prenom, e.massar, e.points AS comportement,
              c.nom AS classe, t.filiere, t.version, t.module_id, t.titre,
              s.id AS soumission_id, s.statut, s.note_finale, s.horodatage,
              COALESCE(s.alertes_triche, 0) AS alertes_triche,
              r1.n AS note_p1, r2.n AS note_p2, r3.n AS note_p3,
              r1.max AS max_p1, r2.max AS max_p2, r3.max AS max_p3
       FROM soumissions s
       JOIN eleves e ON s.eleve_id=e.id
       JOIN classes c ON e.classe_id=c.id
       JOIN tests t ON s.test_id=t.id
       LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n, ROUND(SUM(q.bareme),2) AS max
                  FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='cours'
                  GROUP BY soumission_id) r1 ON r1.soumission_id=s.id
       LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n, ROUND(SUM(q.bareme),2) AS max
                  FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='formules'
                  GROUP BY soumission_id) r2 ON r2.soumission_id=s.id
       LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n, ROUND(SUM(q.bareme),2) AS max
                  FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='graphiques'
                  GROUP BY soumission_id) r3 ON r3.soumission_id=s.id
       WHERE s.statut IN ('soumis','corrige')${whereClause}
       ORDER BY t.module_id, c.nom, e.nom, e.prenom`.replace('${whereClause}', whereClause),
      params
    );

    if (!eleves.length) return sendErr(res, 404, 'Aucune soumission trouvee');

    const allData = [];
    for (const eleve of eleves) {
      const [questions] = await db.query(
        'SELECT id, partie, ordre, type, enonce, reponse_correcte, bareme FROM questions WHERE test_id=(SELECT test_id FROM soumissions WHERE id=?) ORDER BY ordre',
        [eleve.soumission_id]
      );
      const [repRows] = await db.query(
        'SELECT question_id, reponse_eleve, note_attribuee, commentaire_correcteur FROM reponses WHERE soumission_id=?',
        [eleve.soumission_id]
      );
      const repMap = {};
      repRows.forEach(r => { repMap[r.question_id] = r; });
      const reponses = questions.map(q => ({
        ...q,
        reponse_eleve: repMap[q.id]?.reponse_eleve || '',
        note_attribuee: repMap[q.id]?.note_attribuee ?? null,
        commentaire_correcteur: repMap[q.id]?.commentaire_correcteur || ''
      }));
      allData.push({ eleve, reponses });
    }

    const sep = ';';
    const q = (str) => '"' + String(str || '').replace(/"/g, '""') + '"';

    let csv = 'GESTITEST - EXPORT COMPLET POUR CORRECTION\n';
    csv += 'Genere le ' + new Date().toLocaleString('fr-FR') + '\n';
    if (classe) csv += 'Classe : ' + classe + '\n';
    csv += '\n';

    const modules = [...new Set(allData.map(d => d.eleve.module_id))].sort((a,b) => a-b);

    for (const moduleId of modules) {
      const moduleData = allData.filter(d => d.eleve.module_id === moduleId);
      const moduleTitre = 'DS' + moduleId;

      const maxP1 = moduleData[0].eleve.max_p1 || 0;
      const maxP2 = moduleData[0].eleve.max_p2 || 0;
      const maxP3 = moduleData[0].eleve.max_p3 || 0;
      const hasP3 = maxP3 > 0;

      csv += '===============================================================\n';
      csv += 'DS' + moduleId + ' - ' + moduleTitre + '\n';
      csv += '===============================================================\n\n';

      csv += '-- RECAPITULATIF DS' + moduleId + ' ------------------------------------\n';
      const recapHeaders = [
        'Nom', 'Prenom', 'Massar', 'Classe', 'Filiere', 'Version', 'Statut',
        'P1 /' + maxP1, 'P2 /' + maxP2,
        ...(hasP3 ? ['P3 /' + maxP3] : []),
        'Note /20', 'Comportement /20',
        'Date soumission', 'Nb alertes'
      ];
      csv += recapHeaders.join(sep) + '\n';

      for (const { eleve } of moduleData) {
        const note = eleve.note_finale !== null ? parseFloat(eleve.note_finale).toFixed(2) : '';
        const row = [
          eleve.nom, eleve.prenom, eleve.massar, eleve.classe, eleve.filiere, 'V' + eleve.version,
          eleve.statut === 'corrige' ? 'Corrige' : 'A corriger',
          eleve.note_p1 !== null ? parseFloat(eleve.note_p1).toFixed(2) : '',
          eleve.note_p2 !== null ? parseFloat(eleve.note_p2).toFixed(2) : '',
          ...(hasP3 ? [eleve.note_p3 !== null ? parseFloat(eleve.note_p3).toFixed(2) : ''] : []),
          note,
          parseFloat(eleve.comportement) || 20,
          eleve.horodatage ? new Date(eleve.horodatage).toLocaleString('fr-FR') : '',
          eleve.alertes_triche || 0
        ];
        csv += row.join(sep) + '\n';
      }

      const notes = moduleData.filter(d => d.eleve.note_finale !== null).map(d => parseFloat(d.eleve.note_finale));
      if (notes.length) {
        const avg = (notes.reduce((a,b) => a+b, 0) / notes.length).toFixed(2);
        const max = Math.max(...notes).toFixed(2);
        const min = Math.min(...notes).toFixed(2);
        const nbAdmis = notes.filter(n => n >= 10).length;
        csv += '\nMoyenne DS' + moduleId + ';' + avg + '\n';
        csv += 'Max DS' + moduleId + ';' + max + '\n';
        csv += 'Min DS' + moduleId + ';' + min + '\n';
        csv += 'Admis DS' + moduleId + ';' + nbAdmis + ' / ' + moduleData.length + '\n';
      }
      csv += '\n';

      csv += '-- COPIES POUR CORRECTION DS' + moduleId + ' --------------------------\n';
      csv += '>>> Remplissez la colonne Note_attribuee puis importez ce fichier\n\n';
      csv += ['Nom', 'Prenom', 'Massar', 'Classe', 'DS', 'Version', 'Partie',
        'N Q', 'Type', 'Enonce', 'Reponse eleve', 'Reponse correcte',
        'Note attribuee', 'Bareme', 'Commentaire'].join(sep) + '\n';

      for (const { eleve, reponses } of moduleData) {
        for (const r of reponses) {
          csv += [
            eleve.nom, eleve.prenom, eleve.massar, eleve.classe,
            'DS' + moduleId, 'V' + eleve.version, r.partie, r.ordre, r.type,
            q(r.enonce), q(r.reponse_eleve), q(r.reponse_correcte),
            r.note_attribuee !== null ? parseFloat(r.note_attribuee).toFixed(2) : '',
            r.bareme, q(r.commentaire_correcteur)
          ].join(sep) + '\n';
        }
        csv += sep.repeat(14) + '\n';
      }
      csv += '\n';
    }

    const toutesNotes = allData.filter(d => d.eleve.note_finale !== null).map(d => parseFloat(d.eleve.note_finale));
    if (toutesNotes.length) {
      csv += '===============================================================\n';
      csv += 'STATISTIQUES GLOBALES\n';
      csv += '===============================================================\n';
      csv += 'Total copies;' + allData.length + '\n';
      csv += 'Copies corrigees;' + toutesNotes.length + '\n';
      csv += 'Moyenne generale;' + (toutesNotes.reduce((a,b) => a+b,0)/toutesNotes.length).toFixed(2) + '\n';
      csv += 'Note maximale;' + Math.max(...toutesNotes).toFixed(2) + '\n';
      csv += 'Note minimale;' + Math.min(...toutesNotes).toFixed(2) + '\n';
      csv += 'Admis (>=10);' + toutesNotes.filter(n => n >= 10).length + ' / ' + allData.length + '\n';
    }

    const filename = 'gestitest_complet' + (classe ? '_' + classe : '') + '_' + new Date().toISOString().split('T')[0] + '.csv';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
    res.send('\uFEFF' + csv);
  } finally { db.end(); }
});

// ============================================================
//  PDF
// ============================================================
let puppeteer;
try { puppeteer = require('puppeteer'); } catch (e) { puppeteer = null; }
function requirePuppeteer(req, res, next) {
  if (!puppeteer) return sendErr(res, 500, 'puppeteer non installé');
  next();
}

app.get('/api/pdf/sujet', requirePuppeteer, async (req, res) => {
  const { filiere, version } = req.query;
  const db = await getDB();
  try {
    const [[test]] = await db.query('SELECT * FROM tests WHERE filiere=? AND version=? AND actif=1', [filiere, version]);
    if (!test) return sendErr(res, 404, 'Test non trouvé');
    const [qs] = await db.query('SELECT * FROM questions WHERE test_id=? ORDER BY ordre', [test.id]);
    const p = { cours: [], formules: [], graphiques: [] };
    qs.forEach(q => p[q.partie] && p[q.partie].push(q));
    const b = {};
    Object.keys(p).forEach(k => { b[k] = p[k].reduce((s, q) => s + parseFloat(q.bareme), 0); });
    const fl = test.filiere === 'TCLSH' ? 'TCLSH (Sciences Humaines)' : 'TCS (Tronc Commun)';
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${PDF_STYLE}</head><body>
      <div class="header"><h1>Lycée Secondaire Ezzaytoun — El Aioun Sidi Mellouk</h1>
      <p>Informatique — Module 2 Bloc 3 : Tableur | ${fl} | Version ${test.version} | 2024–2025</p></div>
      <table style="margin-bottom:10px;font-size:11px">
        <tr><th>Nom</th><td style="width:180px">  </td><th>Prénom</th><td style="width:180px">    </tr>
        <tr><th>Classe</th><td>     </tr>
      </table>
      <h2>Partie 1 — Questions de cours (${b.cours} pts)</h2>`;
    p.cours.forEach((q, i) => {
      html += `<div class="question"><b>Q${i + 1}</b><span class="q-bareme">${q.bareme}pt</span><div style="margin-top:3px">${q.enonce}</div>`;
      if (q.type === 'qcm') JSON.parse(q.options || '[]').forEach((o, j) => { html += `<div style="margin:2px 0">☐ ${String.fromCharCode(65 + j)}) ${o}</div>`; });
      else html += `<div class="answer-line"></div><div class="answer-line"></div>`;
      html += `</div>`;
    });
    html += `<h2>Partie 2 — Tableau & Formules (${b.formules} pts)</h2>
      <p style="font-size:10px;color:#555;margin-bottom:6px">Contexte : <em>${test.contexte || ''}</em></p>
      <table>
        <tr><th colspan="5" style="background:#e8f0fe">Tableau de données — Complète les cellules marquées "…"</th></tr>
        <tr><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th></tr>
        ${Array(7).fill(0).map((_, i) => `<tr>${Array(5).fill(0).map((_, j) => `<td style="${(i + j) % 3 === 0 ? 'background:#fff8e1' : ''}">${(i + j) % 3 === 0 ? '…' : ''}</td>`).join('')}</tr>`).join('')}
      </table>`;
    p.formules.forEach((q, i) => {
      html += `<div class="question"><b>Q${i + 1}</b><span class="q-bareme">${q.bareme}pt</span><div style="margin-top:3px">${q.enonce}</div><div class="answer-line"></div>${q.type === 'ouverte' ? '<div class="answer-line"></div>' : ''}</div>`;
    });
    html += `<h2>Partie 3 — Graphiques (${b.graphiques} pts)</h2>`;
    p.graphiques.forEach((q, i) => {
      html += `<div class="question"><b>Q${i + 1}</b><span class="q-bareme">${q.bareme}pt</span><div style="margin-top:3px">${q.enonce}</div><div class="answer-line"></div><div class="answer-line"></div></div>`;
    });
    html += `<div class="footer">Durée : 1h — Documents non autorisés — Barème sur 20</div></body></html>`;
    const pdf = await renderPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="sujet_${filiere}_V${version}.pdf"`);
    res.send(pdf);
  } finally { db.end(); }
});

app.get('/api/pdf/fiches', requirePuppeteer, async (req, res) => {
  const { classe } = req.query;
  const db = await getDB();
  try {
    let q = `
      SELECT s.id AS soumission_id, s.note_finale, s.horodatage,
             e.nom, e.prenom, e.massar, e.points,
             c.nom AS classe, t.filiere, t.version,
             r1.n AS note_p1, r2.n AS note_p2, r3.n AS note_p3
      FROM soumissions s
      JOIN eleves e ON s.eleve_id=e.id JOIN classes c ON e.classe_id=c.id JOIN tests t ON s.test_id=t.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='cours'      GROUP BY soumission_id) r1 ON r1.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='formules'   GROUP BY soumission_id) r2 ON r2.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id, ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='graphiques' GROUP BY soumission_id) r3 ON r3.soumission_id=s.id
      WHERE s.statut='corrige'`;
    const p = [];
    if (classe) { q += ' AND c.nom=?'; p.push(classe); }
    q += ' ORDER BY c.nom, e.nom';
    const [rows] = await db.query(q, p);

    for (const row of rows) {
      const [reponses] = await db.query(`
        SELECT q.partie, q.ordre, q.enonce, q.reponse_correcte, q.bareme, q.type,
               r.reponse_eleve, r.note_attribuee, r.commentaire_correcteur
        FROM reponses r JOIN questions q ON r.question_id=q.id
        WHERE r.soumission_id=? ORDER BY q.ordre
      `, [row.soumission_id]);
      row.reponses = reponses;
    }

    const partieLabel = { cours: '📖 Partie 1 — Questions de cours', formules: '📊 Partie 2 — Tableau & Formules', graphiques: '📈 Partie 3 — Graphiques' };

    const pages = rows.map((r, idx) => {
      const note = r.note_finale !== null ? parseFloat(r.note_finale).toFixed(1) : '—';
      const admis = r.note_finale !== null && parseFloat(r.note_finale) >= 10;
      const comp = parseFloat(r.points) || 20;

      const reponsesHTML = ['cours', 'formules', 'graphiques'].map(partie => {
        const qs = (r.reponses || []).filter(q => q.partie === partie);
        if (!qs.length) return '';
        return `
          <div style="margin-bottom:8px;">
            <div style="font-weight:bold;font-size:10px;background:#f0f0f0;padding:3px 6px;border-radius:3px;margin-bottom:3px;">${partieLabel[partie]}</div>
            <table>
              <thead>
                <tr>
                  <th style="width:25px">N°</th>
                  <th style="text-align:left;width:35%">Réponse élève</th>
                  <th style="text-align:left;width:35%">Réponse attendue</th>
                  <th style="width:45px">Note</th>
                  <th style="width:35px">/ Pts</th>
                </tr>
              </thead>
              <tbody>
                ${qs.map((q, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td style="text-align:left;${!q.reponse_eleve ? 'color:#999;font-style:italic' : ''}">
                      ${q.reponse_eleve || 'Sans réponse'}
                    </td>
                    <td style="text-align:left;color:#2d7a2d;font-size:9px">${q.reponse_correcte || ''}</td>
                    <td style="font-weight:bold;color:${parseFloat(q.note_attribuee || 0) > 0 ? '#2d7a2d' : '#c0392b'}">
                      ${q.note_attribuee !== null ? parseFloat(q.note_attribuee).toFixed(2) : '—'}
                    </td>
                    <td style="color:#888">${q.bareme}</td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>`;
      }).join('');

      return `
        ${idx > 0 ? '<div class="page-break"></div>' : ''}
        <div class="header">
          <h1>Lycée Secondaire Ezzaytoun — El Aioun Sidi Mellouk</h1>
          <p>Fiche de résultats — Informatique — DS${t.module_id} — Année 2024–2025</p>
        </div>

        <table style="margin-bottom:8px;">
          <tr>
            <th style="width:60px">Nom</th><td>${r.nom}</td>
            <th style="width:60px">Prénom</th><td>${r.prenom}</td>
            <th style="width:60px">Massar</th><td>${r.massar}</td>
           </tr>
          <tr>
            <th>Classe</th><td>${r.classe}</td>
            <th>Filière</th><td>${r.filiere}</td>
            <th>Version</th><td>V${r.version}</td>
           </tr>
        </table>

        <table style="margin-bottom:8px;">
          <thead>
            <tr>
              <th>P1 Cours /4</th>
              <th>P2 Formules /10</th>
              <th>P3 Graphiques /6</th>
              <th style="background:#e8f0fe">Note finale /20</th>
              <th>Comportement /20</th>
              <th style="background:${admis ? '#e8f8e8' : '#fce8e8'}">Statut</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${r.note_p1 !== null ? parseFloat(r.note_p1).toFixed(1) : '—'}</td>
              <td>${r.note_p2 !== null ? parseFloat(r.note_p2).toFixed(1) : '—'}</td>
              <td>${r.note_p3 !== null ? parseFloat(r.note_p3).toFixed(1) : '—'}</td>
              <td style="font-size:14px;font-weight:bold" class="${admis ? 'badge-admis' : 'badge-revoir'}">${note}</td>
              <td>${comp}/20</td>
              <td class="${admis ? 'badge-admis' : 'badge-revoir'}">${admis ? 'ADMIS' : 'À REVOIR'}</td>
             </tr>
          </tbody>
        </table>

        ${reponsesHTML}

        <div style="border:1px solid #ddd;border-radius:3px;padding:6px;margin-top:6px;">
          <div style="font-size:9px;font-weight:bold;margin-bottom:4px;">Commentaire enseignant :</div>
          <div style="border-bottom:1px solid #eee;height:16px;"></div>
          <div style="border-bottom:1px solid #eee;height:16px;margin-top:3px;"></div>
        </div>

        <div style="margin-top:6px;text-align:right;font-size:8px;color:#999;">
          Soumis le ${r.horodatage ? new Date(r.horodatage).toLocaleString('fr-FR') : '—'} — GestiTest v3
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${PDF_STYLE}</head><body>${pages}</body></html>`;
    const pdf = await renderPDF(html);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="fiches_resultats.pdf"');
    res.send(pdf);
  } finally { db.end(); }
});

app.get('/api/pdf/recap', requirePuppeteer, async (req, res) => {
  const { classe } = req.query;
  const db = await getDB();
  try {
    let q = `
      SELECT s.note_finale, e.nom, e.prenom, e.massar, e.points,
             c.nom AS classe, t.filiere, t.version,
             r1.n AS p1, r2.n AS p2, r3.n AS p3
      FROM soumissions s
      JOIN eleves e ON s.eleve_id=e.id JOIN classes c ON e.classe_id=c.id JOIN tests t ON s.test_id=t.id
      LEFT JOIN (SELECT soumission_id,ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='cours'      GROUP BY soumission_id) r1 ON r1.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id,ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='formules'   GROUP BY soumission_id) r2 ON r2.soumission_id=s.id
      LEFT JOIN (SELECT soumission_id,ROUND(SUM(note_attribuee),2) AS n FROM reponses r JOIN questions q ON r.question_id=q.id WHERE q.partie='graphiques' GROUP BY soumission_id) r3 ON r3.soumission_id=s.id
      WHERE s.statut='corrige'`;
    const p = [];
    if (classe) { q += ' AND c.nom=?'; p.push(classe); }
    q += ' ORDER BY c.nom, s.note_finale DESC';
    const [rows] = await db.query(q, p);
    const notes = rows.filter(r => r.note_finale !== null).map(r => parseFloat(r.note_finale));
    const avg = notes.length ? (notes.reduce((a, b) => a + b, 0) / notes.length).toFixed(1) : '—';
    const max = notes.length ? Math.max(...notes).toFixed(1) : '—';
    const min = notes.length ? Math.min(...notes).toFixed(1) : '—';
    const nbAdmis = notes.filter(n => n >= 10).length;
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">${PDF_STYLE}</head><body>
      <div class="header"><h1>Tableau récapitulatif — Informatique</h1>
      <p>Lycée Ezzaytoun — ${classe ? 'Classe : ' + classe : 'Toutes classes'} — 2024–2025</p></div>
      <table>
        <thead><tr><th>Nom</th><th>Prénom</th><th>Classe</th><th>Filière</th><th>Version</th>
          <th>P1/4</th><th>P2/10</th><th>P3/6</th><th>Note/20</th><th>Comport.</th><th>Statut</th></tr></thead>
        <tbody>${rows.map(r => {
      const note = r.note_finale !== null ? parseFloat(r.note_finale).toFixed(1) : '—';
      const admis = r.note_finale !== null && parseFloat(r.note_finale) >= 10;
      return `<tr>
            <td class="lc">${r.nom}</td><td class="lc">${r.prenom}</td>
            <td>${r.classe}</td><td>${r.filiere}</td><td>V${r.version}</td>
            <td>${r.p1 !== null ? parseFloat(r.p1).toFixed(1) : '—'}</td>
            <td>${r.p2 !== null ? parseFloat(r.p2).toFixed(1) : '—'}</td>
            <td>${r.p3 !== null ? parseFloat(r.p3).toFixed(1) : '—'}</td>
            <td class="${admis ? 'badge-admis' : 'badge-revoir'}">${note}</td>
            <td>${parseFloat(r.points) || 20}/20</td>
            <td class="${admis ? 'badge-admis' : 'badge-revoir'}">${admis ? 'Admis' : 'À revoir'}</td>
           </tr>`;
    }).join('')}</tbody>
        <tfoot><tr style="background:#f0f0f0;font-weight:bold">
          <td colspan="8" style="text-align:right">Statistiques :</td>
          <td>Moy: ${avg}</td>
          <td colspan="2">Max: ${max} | Min: ${min} | Admis: ${nbAdmis}/${rows.length}</td>
         </tr></tfoot>
      </table>
    </body></html>`;
    const pdf = await renderPDF(html, true);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="recap.pdf"');
    res.send(pdf);
  } finally { db.end(); }
});

app.get('/api/pdf/copie', requirePuppeteer, async (req, res) => {
  const { soumission_id } = req.query;
  if (!soumission_id) return sendErr(res, 400, 'soumission_id requis');
  const db = await getDB();
  try {
    const [[soumission]] = await db.query(
      'SELECT s.*, t.filiere, t.version, t.module_id, t.titre FROM soumissions s JOIN tests t ON s.test_id=t.id WHERE s.id=?',
      [soumission_id]
    );
    if (!soumission) return sendErr(res, 404, 'Soumission non trouvée');
    const [[eleve]] = await db.query(
      'SELECT e.nom, e.prenom, e.massar, e.points, c.nom AS classe, c.filiere FROM eleves e JOIN classes c ON e.classe_id=c.id WHERE e.id=?',
      [soumission.eleve_id]
    );
    const nbAlertes = parseInt(soumission.alertes_triche) || 0;

    const [questions] = await db.query(
      'SELECT id, partie, ordre, type, enonce, reponse_correcte, bareme FROM questions WHERE test_id=? ORDER BY ordre',
      [soumission.test_id]
    );
    const [repRows] = await db.query(
      'SELECT question_id, reponse_eleve, note_attribuee, commentaire_correcteur FROM reponses WHERE soumission_id=?',
      [soumission_id]
    );
    const repMap = {};
    repRows.forEach(r => { repMap[r.question_id] = r; });
    const reponses = questions.map(q => ({
      ...q,
      reponse_eleve: repMap[q.id]?.reponse_eleve || '',
      note_attribuee: repMap[q.id]?.note_attribuee ?? null,
      commentaire_correcteur: repMap[q.id]?.commentaire_correcteur || ''
    }));

    const estCorrige = soumission.statut === 'corrige';
    const note = soumission.note_finale !== null ? parseFloat(soumission.note_finale).toFixed(1) : null;
    const admis = note !== null && parseFloat(note) >= 10;
    const dateStr = new Date(soumission.horodatage).toLocaleString('fr-FR');
    const np1 = reponses.filter(r => r.partie === 'cours').reduce((s, r) => s + (parseFloat(r.note_attribuee) || 0), 0).toFixed(1);
    const np2 = reponses.filter(r => r.partie === 'formules').reduce((s, r) => s + (parseFloat(r.note_attribuee) || 0), 0).toFixed(1);
    const np3 = reponses.filter(r => r.partie === 'graphiques').reduce((s, r) => s + (parseFloat(r.note_attribuee) || 0), 0).toFixed(1);

    // Barèmes dynamiques selon les questions réelles
    const maxP1 = reponses.filter(r => r.partie === 'cours').reduce((s, r) => s + (parseFloat(r.bareme) || 0), 0);
    const maxP2 = reponses.filter(r => r.partie === 'formules').reduce((s, r) => s + (parseFloat(r.bareme) || 0), 0);
    const maxP3 = reponses.filter(r => r.partie === 'graphiques').reduce((s, r) => s + (parseFloat(r.bareme) || 0), 0);
    const hasP3 = maxP3 > 0;

    // Nom du module dynamique
    const nomModule = soumission.titre || `DS${soumission.module_id}`;
    const moduleLabel = `Informatique — ${nomModule} — Année 2024–2025`;

    const pBg = { cours: '#fffdf0', formules: '#f0f8ff', graphiques: '#f0fff4' };
    const pNm = { cours: 'P1', formules: 'P2', graphiques: 'P3' };

    const lignes = reponses.map((q, i) => {
      const rep = q.reponse_eleve || '';
      const repTxt = rep.length > 180 ? rep.substring(0, 180) + '...' : (rep || '');
      const vide = !rep;
      const nA = q.note_attribuee !== null ? parseFloat(q.note_attribuee).toFixed(2) : '-';
      const nc = parseFloat(q.note_attribuee || 0) > 0 ? '#2d7a2d' : '#c0392b';
      const enonce = (q.enonce || '').length > 160 ? q.enonce.substring(0, 160) + '...' : (q.enonce || '');
      const corrTxt = estCorrige && q.reponse_correcte
        ? (q.reponse_correcte.length > 160 ? q.reponse_correcte.substring(0,160)+'...' : q.reponse_correcte) : '';
      return '<tr style="background:' + pBg[q.partie] + '">' +
        '<td class="cn">' + (i + 1) + '</td>' +
        '<td class="cp">' + pNm[q.partie] + '</td>' +
        '<td style="text-align:left;font-size:6.5px;">' +
          '<div style="color:#555;font-style:italic;border-bottom:1px dotted #ddd;padding-bottom:1px;margin-bottom:1px;">' + enonce + '</div>' +
          '<div style="font-weight:bold;color:' + (vide ? '#bbb' : '#111') + ';' + (vide ? 'font-style:italic;' : '') + '">' +
            (vide ? '— Sans réponse —' : repTxt) +
          '</div>' +
          (corrTxt ? '<div style="color:#2d7a2d;font-size:6px;margin-top:2px;">✓ ' + corrTxt + '</div>' : '') +
        '</td>' +
        (estCorrige
          ? '<td class="cn" style="color:' + nc + ';font-weight:bold">' + nA + '</td><td class="cn" style="color:#888">' + q.bareme + '</td>'
          : '<td class="cn" style="color:#888">' + q.bareme + '</td>') +
        '</tr>';
    }).join('');

    const bilanHTML = estCorrige
      ? '<div class="bilan">P1:' + np1 + '/' + maxP1 + ' &nbsp;|&nbsp; P2:' + np2 + '/' + maxP2 + (hasP3 ? ' &nbsp;|&nbsp; P3:' + np3 + '/' + maxP3 : '') +
      ' &nbsp;&#8594;&nbsp; <span style="font-size:14px;font-weight:bold;color:' + (admis ? '#2d7a2d' : '#c0392b') + '">' + note + '/20</span>' +
      ' <span style="font-weight:bold;color:' + (admis ? '#2d7a2d' : '#c0392b') + '">' + (admis ? '&#10003; ADMIS' : '&#10007; A REVOIR') + '</span></div>'
      : '';

    const thExtra = estCorrige ? '<th class="cn">Note</th><th class="cn">/Pts</th>' : '<th class="cn">/Pts</th>';

    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
      '<style>' +
      '@page{size:A4 portrait;margin:0;}' +
      '*{box-sizing:border-box;margin:0;padding:0;}' +
      'body{font-family:Arial,sans-serif;font-size:7.5px;color:#111;width:210mm;height:297mm;overflow:hidden;padding:8mm 10mm;}' +
      '.hdr{text-align:center;border-bottom:2px solid #333;padding-bottom:2px;margin-bottom:3px;}' +
      '.hdr h1{font-size:9.5px;font-weight:bold;}.hdr p{font-size:6.5px;color:#444;margin-top:1px;}' +
      '.id{display:flex;flex-wrap:wrap;gap:1px 8px;background:#f5f5f5;border:1px solid #ccc;padding:2px 5px;margin-bottom:2px;font-size:7px;}' +
      '.id span{white-space:nowrap;}' +
      '.leg{font-size:5.5px;color:#888;margin-bottom:2px;display:flex;gap:5px;flex-wrap:wrap;}' +
      '.leg span{padding:0 3px;border:1px solid #ddd;}' +
      'table{width:100%;border-collapse:collapse;}' +
      'th{background:#e0e0e0;padding:1.5px 3px;border:1px solid #bbb;font-size:6.5px;text-align:center;}' +
      'td{padding:1.5px 3px;border:1px solid #eee;vertical-align:middle;}' +
      'td.cn{text-align:center;font-size:7px;width:22px;}' +
      'td.cp{text-align:center;font-size:6px;color:#666;width:20px;}' +
      'td.cr{text-align:left;font-size:7px;}' +
      'td.vide{color:#bbb;font-style:italic;}' +
      '.bilan{background:#e8f0fe;border:1px solid #c0d4f5;border-radius:2px;padding:3px 6px;margin-top:3px;font-size:7.5px;font-weight:bold;}' +
      '.ft{margin-top:3px;border-top:1px solid #ccc;padding-top:2px;font-size:5.5px;color:#999;display:flex;justify-content:space-between;}' +
      '</style></head><body>' +
      '<div class="hdr"><h1>Lycée Secondaire Ezzaytoun — El Aioun Sidi Mellouk</h1>' +
      '<p>Copie élève — ' + moduleLabel + ' — GestiTest</p></div>' +
      '<div class="id">' +
      '<span><b>Nom:</b> ' + eleve.nom + '</span>' +
      '<span><b>Prénom:</b> ' + eleve.prenom + '</span>' +
      '<span><b>Massar:</b> ' + eleve.massar + '</span>' +
      '<span><b>Classe:</b> ' + eleve.classe + '</span>' +
      '<span><b>Filière:</b> ' + eleve.filiere + '</span>' +
      '<span><b>Version:</b> V' + soumission.version + '</span>' +
      '<span><b>Soumis:</b> ' + dateStr + '</span>' +
      '<span style="margin-left:auto;font-weight:bold;color:' + (estCorrige ? '#2d7a2d' : '#e67e22') + '">' +
      (estCorrige ? '✓ Corrigé' : '⏳ En attente') + '</span>' +
      (nbAlertes > 0 ? '<span style="color:#c0392b;font-weight:bold;background:#fdecea;padding:1px 6px;border-radius:3px;margin-left:6px">&#9888; ' + nbAlertes + ' alerte' + (nbAlertes > 1 ? 's' : '') + ' anti-triche</span>' : '') +
      '</div>' +
      '<div class="leg">' +
      '<span style="background:#fffdf0">P1=Cours /' + maxP1 + 'pts</span>' +
      '<span style="background:#f0f8ff">P2=Formules /' + maxP2 + 'pts</span>' +
      (hasP3 ? '<span style="background:#f0fff4">P3=Graphiques /' + maxP3 + 'pts</span>' : '') +
      '<span style="margin-left:auto">Q = numéros du sujet V' + soumission.version + '</span>' +
      '</div>' +
      '<table><thead><tr>' +
      '<th class="cn">Q</th><th class="cp">Prt</th>' +
      '<th style="text-align:left">Réponse élève</th>' + thExtra +
      '</tr></thead><tbody>' + lignes + '</tbody>' +
      '</table>' +
      bilanHTML +
      '<div class="ft">' +
      '<span>Document officiel GestiTest — preuve administrative</span>' +
      '<span>Généré le ' + new Date().toLocaleString('fr-FR') + '</span>' +
      '</div></body></html>';

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4', landscape: false, printBackground: true,
      margin: { top: '0', bottom: '0', left: '0', right: '0' }
    });
    await browser.close();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="copie_' + eleve.massar + '_V' + soumission.version + '.pdf"');
    res.send(pdf);
  } finally { db.end(); }
});

app.post('/api/correction/import-notes', async (req, res) => {
  const { notes } = req.body;
  if (!notes || !Array.isArray(notes)) return sendErr(res, 400, 'Format invalide');
  const db = await getDB();
  try {
    let updated = 0;
    for (const n of notes) {
      const [rows] = await db.query(
        "SELECT s.id FROM soumissions s JOIN eleves e ON s.eleve_id=e.id JOIN tests t ON s.test_id=t.id WHERE e.massar=? AND t.version=? AND s.statut IN ('soumis','corrige') ORDER BY s.id DESC LIMIT 1",
        [n.massar, n.version]
      );
      if (!rows.length) continue;
      const sid = rows[0].id;

      if (n.corrections && Array.isArray(n.corrections)) {
        for (const c of n.corrections) {
          let qid = c.question_id;
          const ordre = c.question_ordre || c.qordre;
          if (!qid && ordre) {
            const [[q]] = await db.query(
              "SELECT q.id FROM questions q JOIN soumissions s ON s.test_id=q.test_id WHERE s.id=? AND q.ordre=? LIMIT 1",
              [sid, ordre]
            );
            if (q) qid = q.id;
          }
          if (!qid) continue;
          await db.query(
            "INSERT INTO reponses (soumission_id, question_id, note_attribuee, commentaire_correcteur) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE note_attribuee=VALUES(note_attribuee), commentaire_correcteur=VALUES(commentaire_correcteur)",
            [sid, qid, c.note || 0, c.commentaire || '']
          );
        }
      }

      const [[totals]] = await db.query(
        "SELECT ROUND(SUM(note_attribuee),2) AS total FROM reponses WHERE soumission_id=?",
        [sid]
      );
      const noteFin = (n.note_finale != null)
        ? parseFloat(n.note_finale)
        : (totals.total || 0);

      await db.query(
        "UPDATE soumissions SET statut='corrige', note_finale=? WHERE id=?",
        [Math.round(noteFin * 100) / 100, sid]
      );
      updated++;
    }
    res.json({ success: true, updated });
  } finally { db.end(); }
});

// ============================================================
//  REALTIME — Élèves en cours + alertes triche
// ============================================================

const activeStudents = new Map();
const sseClients = new Set();

app.get('/api/realtime/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.flushHeaders();

  const data = JSON.stringify([...activeStudents.values()]);
  res.write('data: ' + data + '\n\n');

  sseClients.add(res);

  req.on('close', () => {
    sseClients.delete(res);
  });
});

function broadcastRealtime() {
  const data = 'data: ' + JSON.stringify([...activeStudents.values()]) + '\n\n';
  sseClients.forEach(client => {
    try { client.write(data); } catch (e) { sseClients.delete(client); }
  });
}

setInterval(() => {
  sseClients.forEach(client => {
    try { client.write(': ping\n\n'); } catch (e) { sseClients.delete(client); }
  });
}, 20000);

app.post('/api/realtime/ping', async (req, res) => {
  const { soumission_id, eleve_nom, eleve_prenom, massar, classe, version } = req.body;
  if (!soumission_id || !massar) return res.json({ success: false });

  // Clé = massar pour éviter les doublons quand l'élève change de DS
  const key = massar.trim().toUpperCase();

  const existing = activeStudents.get(key) || {
    massar: key,
    eleve_nom, eleve_prenom, classe, version,
    debut: new Date().toISOString(),
    alertes: [],
    nb_alertes: 0
  };

  existing.soumission_id = soumission_id;  // mis à jour à chaque DS
  existing.derniere_activite = new Date().toISOString();
  existing.eleve_nom = eleve_nom || existing.eleve_nom;
  existing.eleve_prenom = eleve_prenom || existing.eleve_prenom;
  existing.classe = classe || existing.classe;
  existing.version = version || existing.version;
  existing.statut = 'en_cours';
  activeStudents.set(key, existing);

  broadcastRealtime();
  res.json({ success: true });
});

app.post('/api/realtime/alerte', async (req, res) => {
  const { soumission_id, type_alerte, details } = req.body;
  if (!soumission_id) return res.json({ success: false });

  // Chercher l'élève par soumission_id dans les valeurs
  let student = null;
  let studentKey = null;
  for (const [key, s] of activeStudents.entries()) {
    if (s.soumission_id == soumission_id) { student = s; studentKey = key; break; }
  }
  if (!student) return res.json({ success: false });

  const alerte = {
    type: type_alerte || 'inconnu',
    details: details || '',
    horodatage: new Date().toISOString()
  };

  student.alertes = student.alertes || [];
  student.alertes.push(alerte);
  student.nb_alertes = student.alertes.length;
  activeStudents.set(studentKey, student);

  const db = await getDB();
  try {
    await db.query(
      "UPDATE soumissions SET alertes_triche = COALESCE(alertes_triche, 0) + 1 WHERE id=?",
      [soumission_id]
    ).catch(() => { });
  } finally { db.end(); }

  broadcastRealtime();
  res.json({ success: true });
});

app.post('/api/realtime/soumis', (req, res) => {
  const { soumission_id } = req.body;
  if (soumission_id) {
    let studentKey = null;
    for (const [key, s] of activeStudents.entries()) {
      if (s.soumission_id == soumission_id) { studentKey = key; break; }
    }
    if (studentKey) {
      const student = activeStudents.get(studentKey);
      student.statut = 'soumis';
      student.soumis_le = new Date().toISOString();
      activeStudents.set(studentKey, student);
      broadcastRealtime();
      setTimeout(() => {
        activeStudents.delete(studentKey);
        broadcastRealtime();
      }, 5 * 60 * 1000);
    }
  }
  res.json({ success: true });
});

setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, student] of activeStudents.entries()) {
    if (student.statut === 'soumis') continue;
    const lastActivity = new Date(student.derniere_activite || student.debut).getTime();
    if (now - lastActivity > 10 * 60 * 1000) {
      activeStudents.delete(id);
      changed = true;
    }
  }
  if (changed) broadcastRealtime();
}, 60 * 1000);

app.get('/api/realtime/alertes', (req, res) => {
  const result = [...activeStudents.values()].map(s => ({
    soumission_id: s.soumission_id,
    massar: s.massar,
    nb_alertes: s.nb_alertes || 0,
    alertes: s.alertes || []
  }));
  res.json({ alertes: result });
});

// ── START ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎓 GestiTest sur http://localhost:${PORT}`);
  console.log(`   Élèves     → http://localhost:${PORT}/eleve_passation.html`);
  console.log(`   Enseignant → http://localhost:${PORT}/enseignant_correction.html\n`);
});