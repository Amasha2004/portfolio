const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'portfolio.db');

let db;

async function initDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL, email TEXT NOT NULL, subject TEXT,
      message TEXT NOT NULL, read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT DEFAULT '/', referrer TEXT, user_agent TEXT, ip TEXT,
      visited_at DATETIME DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL, description TEXT, icon TEXT DEFAULT '🚀',
      techs TEXT DEFAULT '[]', status TEXT DEFAULT 'wip', tags TEXT DEFAULT '',
      github_url TEXT, demo_url TEXT, sort_order INTEGER DEFAULT 0, visible INTEGER DEFAULT 1
    );
  `);

  const count = dbGet('SELECT COUNT(*) as c FROM projects');
  if (!count || count.c === 0) {
    dbRun('INSERT INTO projects (title,description,icon,techs,status,tags,sort_order) VALUES (?,?,?,?,?,?,?)',['My Portfolio','Personal portfolio with animated hero, smooth scroll, and responsive layout.','🌐',JSON.stringify(['HTML','CSS','GSAP']),'live','web',1]);
    dbRun('INSERT INTO projects (title,description,icon,techs,status,tags,sort_order) VALUES (?,?,?,?,?,?,?)',['Calculator App','Fully-functional calculator with keyboard support and history log.','🧮',JSON.stringify(['JavaScript','CSS3']),'wip','web tools',2]);
    dbRun('INSERT INTO projects (title,description,icon,techs,status,tags,sort_order) VALUES (?,?,?,?,?,?,?)',['ML Classifier','Image classification model using CNN trained on a custom dataset.','🤖',JSON.stringify(['Python','TensorFlow','NumPy']),'wip','python',3]);
    dbRun('INSERT INTO projects (title,description,icon,techs,status,tags,sort_order) VALUES (?,?,?,?,?,?,?)',['Data Dashboard','Interactive data visualization dashboard with real-time charts.','📊',JSON.stringify(['React','Python','Chart.js']),'live','web python',4]);
  }
  console.log('Database ready');
}

function dbRun(sql, params=[]) { db.run(sql, params); saveDB(); }
function dbGet(sql, params=[]) {
  const stmt = db.prepare(sql); stmt.bind(params);
  const row = stmt.step() ? stmt.getAsObject() : null;
  stmt.free(); return row;
}
function dbAll(sql, params=[]) {
  const stmt = db.prepare(sql); stmt.bind(params);
  const rows = []; while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free(); return rows;
}
function saveDB() { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); }

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'amasha2025';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend/public')));

app.use((req, res, next) => {
  if (!req.path.startsWith('/api') && !req.path.includes('.')) {
    try { dbRun('INSERT INTO visits (page,referrer,user_agent,ip) VALUES (?,?,?,?)',[req.path,req.headers['referer']||'',req.headers['user-agent']||'',req.headers['x-forwarded-for']||'']); } catch {}
  }
  next();
});

app.post('/api/contact', (req, res) => {
  const { name, email, subject, message } = req.body;
  if (!name||!email||!message) return res.status(400).json({error:'Name, email, and message are required.'});
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:'Invalid email.'});
  dbRun('INSERT INTO messages (name,email,subject,message) VALUES (?,?,?,?)',[name,email,subject||'',message]);
  res.json({success:true,message:"Message received! I'll get back to you soon."});
});

app.get('/api/projects', (req, res) => {
  res.json(dbAll('SELECT * FROM projects WHERE visible=1 ORDER BY sort_order').map(p=>({...p,techs:JSON.parse(p.techs||'[]')})));
});

function requireAuth(req,res,next){
  if(req.headers['x-admin-password']!==ADMIN_PASSWORD) return res.status(401).json({error:'Unauthorized'});
  next();
}

app.get('/api/admin/messages', requireAuth, (req,res) => res.json(dbAll('SELECT * FROM messages ORDER BY created_at DESC')));
app.patch('/api/admin/messages/:id/read', requireAuth, (req,res) => { dbRun('UPDATE messages SET read=1 WHERE id=?',[req.params.id]); res.json({success:true}); });
app.delete('/api/admin/messages/:id', requireAuth, (req,res) => { dbRun('DELETE FROM messages WHERE id=?',[req.params.id]); res.json({success:true}); });

app.get('/api/admin/analytics', requireAuth, (req,res) => {
  res.json({
    totalVisits: dbGet('SELECT COUNT(*) as c FROM visits').c,
    todayVisits: dbGet("SELECT COUNT(*) as c FROM visits WHERE date(visited_at)=date('now')").c,
    unreadMessages: dbGet('SELECT COUNT(*) as c FROM messages WHERE read=0').c,
    recentVisits: dbAll('SELECT page, COUNT(*) as hits FROM visits GROUP BY page ORDER BY hits DESC LIMIT 10'),
    visitsByDay: dbAll("SELECT date(visited_at) as day, COUNT(*) as visits FROM visits WHERE visited_at >= date('now','-7 days') GROUP BY day ORDER BY day")
  });
});

app.post('/api/admin/projects', requireAuth, (req,res) => {
  const {title,description,icon,techs,status,tags,github_url,demo_url,sort_order} = req.body;
  dbRun('INSERT INTO projects (title,description,icon,techs,status,tags,github_url,demo_url,sort_order) VALUES (?,?,?,?,?,?,?,?,?)',
    [title,description,icon||'🚀',JSON.stringify(techs||[]),status||'wip',tags||'',github_url||'',demo_url||'',sort_order||99]);
  res.json({success:true});
});
app.put('/api/admin/projects/:id', requireAuth, (req,res) => {
  const {title,description,icon,techs,status,tags,github_url,demo_url,sort_order,visible} = req.body;
  dbRun('UPDATE projects SET title=?,description=?,icon=?,techs=?,status=?,tags=?,github_url=?,demo_url=?,sort_order=?,visible=? WHERE id=?',
    [title,description,icon,JSON.stringify(techs||[]),status,tags,github_url,demo_url,sort_order,visible??1,req.params.id]);
  res.json({success:true});
});
app.delete('/api/admin/projects/:id', requireAuth, (req,res) => { dbRun('DELETE FROM projects WHERE id=?',[req.params.id]); res.json({success:true}); });

// ── API: AI CHAT ──
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

  if (!ANTHROPIC_KEY) {
    // Smart keyword fallback when no API key configured
    const msg = message.toLowerCase();
    let reply = "I'm Amasha's portfolio assistant! Feel free to contact Amasha directly via the contact form below.";
    if (msg.includes('skill') || msg.includes('know') || msg.includes('tech'))
      reply = "Amasha is skilled in Python (90%), Java (85%), JavaScript (75%), and C++. On the web side: React, Node.js, Express, HTML5, and Tailwind CSS!";
    else if (msg.includes('project'))
      reply = "Amasha has built a personal portfolio site, a calculator app, an ML image classifier using TensorFlow, and a data dashboard with React and Python!";
    else if (msg.includes('contact') || msg.includes('email') || msg.includes('reach'))
      reply = "You can reach Amasha via the contact form on this page, or via the email and LinkedIn links in the Contact section!";
    else if (msg.includes('available') || msg.includes('hire') || msg.includes('intern') || msg.includes('job'))
      reply = "Amasha is actively looking for internships and collaborations! Send a message through the contact form and she'll get back within 24 hours.";
    else if (msg.includes('gpa') || msg.includes('grade') || msg.includes('study') || msg.includes('university'))
      reply = "Amasha is a third-year Computer Science student (2023-2026) with a 3.9/4.0 GPA, with strong foundations in algorithms and software engineering!";
    else if (msg.includes('hello') || msg.includes('hi') || msg.includes('hey'))
      reply = "Hi there! I'm an assistant for Amasha's portfolio. Ask me about her skills, projects, or how to get in touch!";
    return res.json({ reply });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: 'You are an AI assistant for Amasha Jayasinghe portfolio. Answer warmly and concisely (2-3 sentences). Facts: Third-year CS student 2023-2026, GPA 3.9/4.0, Python/Java/JavaScript/C++, React+Node.js, projects: portfolio, calculator, ML classifier, data dashboard. Available for internships.',
        messages: [{ role: 'user', content: message }]
      })
    });
    const data = await response.json();
    res.json({ reply: data.content?.[0]?.text || "Please contact Amasha directly via the form!" });
  } catch {
    res.json({ reply: "Having a moment! Please reach out via the contact form below." });
  }
});

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'../frontend/public/index.html')));

initDB().then(() => {
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
