const express = require('express');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Page d'accueil : on injecte les balises de partage (Open Graph / Twitter)
// avec l'adresse réelle du site, pour un bel aperçu sur WhatsApp, Instagram,
// Facebook, etc. — quel que soit le domaine final.
const INDEX_HTML = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
function serveIndex(req, res){
  const base = `${req.protocol}://${req.get('host')}`;
  const meta = `
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Nova Lab">
  <meta property="og:title" content="NOVA LAB — Avec nous, l'innovation prend vie">
  <meta property="og:description" content="Réseaux, cybersécurité, développement web & mobile, DevSecOps, marketing et design. Une équipe d'ingénieurs pour concevoir, sécuriser et faire rayonner vos systèmes.">
  <meta property="og:url" content="${base}/">
  <meta property="og:image" content="${base}/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="NOVA LAB — Avec nous, l'innovation prend vie">
  <meta name="twitter:description" content="Ingénierie, sécurité et digital. Une équipe pour concevoir, sécuriser et faire rayonner vos systèmes.">
  <meta name="twitter:image" content="${base}/og.png">
  <meta name="description" content="Nova Lab : réseaux, cybersécurité, développement, DevSecOps, marketing et design. Avec nous, l'innovation prend vie.">
`;
  res.type('html').send(INDEX_HTML.replace('</head>', meta + '</head>'));
}
app.get('/', serveIndex);
app.get('/index.html', serveIndex);

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

// Envoi d'email : actif si EMAIL_USER + EMAIL_PASS sont configurés (Gmail).
// À chaque message reçu, une notification part vers EMAIL_TO (ta boîte).
let mailer = null;
if(process.env.EMAIL_USER && process.env.EMAIL_PASS){
  const nodemailer = require('nodemailer');
  mailer = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
  });
}
const MAIL_TO = process.env.EMAIL_TO || 'labnova48@gmail.com';

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
  const { name, email, need, message, website } = req.body || {};
  // Anti-spam : "website" est un champ piège invisible. Un robot le remplit, pas un humain.
  if(website){ return res.json({ ok: true }); }
  if(!name || !email){
    return res.status(400).json({ error: 'Le nom et l\'email sont requis.' });
  }
  const clean = {
    name: String(name).slice(0, 200),
    email: String(email).slice(0, 200),
    need: String(need || '').slice(0, 200),
    message: String(message || '').slice(0, 5000)
  };
  try{
    if(pool){
      await pool.query(
        'INSERT INTO messages(name, email, need, message) VALUES($1, $2, $3, $4)',
        [clean.name, clean.email, clean.need, clean.message]
      );
    }else{
      console.log('Message reçu (aucune base configurée) :', clean);
    }
    // Notification email (ne bloque pas la réponse au visiteur si l'envoi échoue)
    if(mailer){
      mailer.sendMail({
        from: `"Nova Lab — Site" <${process.env.EMAIL_USER}>`,
        to: MAIL_TO,
        replyTo: clean.email,                       // répondre = répondre au client
        subject: `Nouveau projet — ${clean.need || 'Contact'} (${clean.name})`,
        text: `Nouveau message depuis le site Nova Lab\n\n`
            + `Nom : ${clean.name}\nEmail : ${clean.email}\nBesoin : ${clean.need || '-'}\n\n`
            + `Message :\n${clean.message || '-'}`
      }).catch(err => console.error('Envoi email échoué :', err));
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

// Assistant IA — répond aux visiteurs à propos de Nova Lab.
// Utilise l'API Claude si ANTHROPIC_API_KEY est défini (sinon repli hors-ligne).
const SYSTEM_PROMPT = `Tu es l'assistant virtuel de Nova Lab, une agence d'ingénierie et de communication.
Slogan : « Avec nous, l'innovation prend vie ».
Domaines d'expertise : Réseaux & infrastructure, Cybersécurité, Supervision & maintenance,
Développement web & mobile, Intégration DevSecOps, Community management & contenu,
Marketing d'acquisition, Identité visuelle & design.
Contact : email labnova48@gmail.com, téléphone +229 91 28 71 11, Instagram @nova_lab__, TikTok @nova_lab97.
Réponds en français, de façon professionnelle, chaleureuse et concise (2 à 4 phrases).
Aide le visiteur à cerner son besoin et invite-le à laisser un message via le formulaire de contact
ou à écrire à l'email pour un devis. N'invente jamais de tarifs précis ni de délais fermes.`;

app.post('/api/chat', async (req, res) => {
  const messages = Array.isArray(req.body?.messages) ? req.body.messages.slice(-12) : [];
  if(!messages.length) return res.status(400).json({ error: 'Message vide.' });

  if(!process.env.ANTHROPIC_API_KEY){
    return res.json({
      reply: "L'assistant IA n'est pas encore activé. En attendant, écrivez-nous à labnova48@gmail.com " +
             "ou au +229 91 28 71 11, ou laissez un message via le formulaire de contact — nous répondons sous 48 h."
    });
  }
  try{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: messages.map(m => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: String(m.content || '').slice(0, 2000)
        }))
      })
    });
    const data = await r.json();
    if(!r.ok){
      console.error('Erreur API IA :', data);
      return res.status(502).json({ error: 'Service IA indisponible.' });
    }
    const reply = (data.content || []).map(b => b.text || '').join('').trim();
    res.json({ reply: reply || "Désolé, je n'ai pas de réponse. Contactez-nous à labnova48@gmail.com." });
  }catch(err){
    console.error('Erreur IA :', err);
    res.status(500).json({ error: 'Erreur serveur.' });
  }
});

app.get('/api/health', (req, res) => res.json({
  ok: true, db: Boolean(pool), ai: Boolean(process.env.ANTHROPIC_API_KEY), mail: Boolean(mailer)
}));

const port = process.env.PORT || 3000;
initDb()
  .catch(err => console.error('Initialisation de la base échouée :', err))
  .finally(() => {
    app.listen(port, () => console.log(`NOVA LAB en ligne sur le port ${port} (base : ${pool ? 'PostgreSQL' : 'aucune'}, IA : ${process.env.ANTHROPIC_API_KEY ? 'active' : 'inactive'}, email : ${mailer ? 'actif' : 'inactif'})`));
  });
