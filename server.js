const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Railway fournit DATABASE_URL quand on ajoute une base PostgreSQL au projet.
// Sans base configurée, le site fonctionne quand même : les messages sont
// simplement journalisés dans les logs du serveur.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    })
  : null;

async function initDb(){
  if(!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages(
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      need TEXT,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

// Réception du formulaire de contact
app.post('/api/contact', async (req, res) => {
  const { name, email, need, message } = req.body || {};
  if(!name || !email){
    return res.status(400).json({ error: 'Le nom et l\'email sont requis.' });
  }
  try{
    if(pool){
      await pool.query(
        'INSERT INTO messages(name, email, need, message) VALUES($1, $2, $3, $4)',
        [String(name).slice(0, 200), String(email).slice(0, 200),
         String(need || '').slice(0, 200), String(message || '').slice(0, 5000)]
      );
    }else{
      console.log('Message reçu (aucune base configurée) :', { name, email, need, message });
    }
    res.json({ ok: true });
  }catch(err){
    console.error('Erreur d\'enregistrement :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// Consultation des messages reçus, protégée par la variable ADMIN_KEY
// Exemple : curl -H "x-admin-key: VOTRE_CLE" https://votre-domaine/api/messages
app.get('/api/messages', async (req, res) => {
  if(!process.env.ADMIN_KEY || req.headers['x-admin-key'] !== process.env.ADMIN_KEY){
    return res.status(401).json({ error: 'Non autorisé.' });
  }
  if(!pool) return res.json([]);
  const { rows } = await pool.query(
    'SELECT * FROM messages ORDER BY created_at DESC LIMIT 200'
  );
  res.json(rows);
});

app.get('/api/health', (req, res) => res.json({ ok: true, db: Boolean(pool) }));

const port = process.env.PORT || 3000;
initDb()
  .catch(err => console.error('Initialisation de la base échouée :', err))
  .finally(() => {
    app.listen(port, () => console.log(`NOVA 360 en ligne sur le port ${port} (base : ${pool ? 'PostgreSQL' : 'aucune'})`));
  });
