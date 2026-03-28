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

app.get('*', (req,res) => res.sendFile(path.join(__dirname,'../frontend/public/index.html')));

initDB().then(() => {
  app.listen(PORT, () => console.log(`Server on http://localhost:${PORT}`));
}).catch(err => { console.error('DB init failed:', err); process.exit(1); });
