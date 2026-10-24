// Beyond the Banner - backend (Express + JSON file storage)
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'admin';          // change before sharing the link!
const DB_FILE = path.join(__dirname, 'data', 'db.json');

// ---------- tiny JSON "database" ----------
   fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
let db = { participants: {} };
if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
   const save = () => {
     try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
     catch (e) { console.error('save failed:', e.message); }
   };
const get = (id) => db.participants[id];

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(express.text({ type: 'text/plain', limit: '100kb' }));   // for navigator.sendBeacon
app.use(express.static(path.join(__dirname, 'public')));

// ---------- 1. start a session ----------
app.post('/api/start', (req, res) => {
  const cohort = ['technical', 'general'].includes(req.body.cohort) ? req.body.cohort : null;
  if (!cohort) return res.status(400).json({ error: 'cohort required' });
  const id = crypto.randomBytes(6).toString('hex');
  db.participants[id] = { id, cohort, createdAt: new Date().toISOString(), traces: [] };
  save();
  res.json({ id });
});

// ---------- 2. the "silent trackers" ----------
// Each tracker script on the article page reports here. We store exactly what it
// collected so we can show participants the proof afterwards.
function logTrace(id, tracker, data, req) {
  const p = get(id);
  if (!p) return false;
  p.traces.push({
    tracker,
    at: new Date().toISOString(),
    ip: (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString().replace('::ffff:', ''),
    userAgent: req.headers['user-agent'],
    ...data
  });
  save();
  return true;
}

app.post('/api/track/:tracker', (req, res) => {
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body;
  const { id, ...data } = body;
  const allowed = ['analytics', 'fingerprint'];
  if (!allowed.includes(req.params.tracker)) return res.sendStatus(404);
  logTrace(id, req.params.tracker, data, req) ? res.sendStatus(204) : res.sendStatus(400);
});

// tracking pixel (1x1 gif)
const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
app.get('/t/pixel.gif', (req, res) => {
  logTrace(req.query.id, 'pixel', { referrer: req.headers.referer || '' }, req);
  res.set('Content-Type', 'image/gif').set('Cache-Control', 'no-store').send(GIF);
});

// ---------- 3. task result ----------
app.post('/api/task', (req, res) => {
  const p = get(req.body.id);
  if (!p) return res.sendStatus(400);
  p.task = { choice: String(req.body.choice || '').slice(0, 50), seconds: Number(req.body.seconds) || 0, finishedAt: new Date().toISOString() };
  save();
  res.sendStatus(204);
});

// ---------- 4. survey ----------
app.post('/api/survey/perception', (req, res) => {
  const p = get(req.body.id);
  if (!p) return res.sendStatus(400);
  const { q1, q2, q3 } = req.body;           // q1 permission, q2 recorded, q3 meaning of no banner
  p.perception = { q1, q2, q3, at: new Date().toISOString() };
  save();
  res.sendStatus(204);
});

// reveal: the ground truth, taken from what the server really received
app.get('/api/trace/:id', (req, res) => {
  const p = get(req.params.id);
  if (!p) return res.sendStatus(404);
  const byTracker = {};
  p.traces.forEach(t => { (byTracker[t.tracker] = byTracker[t.tracker] || []).push(t); });
  const summary = Object.entries(byTracker).map(([name, list]) => ({
    name,
    hits: list.length,
    firstSeen: list[0].at,
    collected: Object.fromEntries(
      Object.entries(list[list.length - 1]).filter(([k]) => !['tracker', 'at'].includes(k))
    )
  }));
  res.json({ count: summary.length, trackers: summary });
});

app.post('/api/survey/impact', (req, res) => {
  const p = get(req.body.id);
  if (!p) return res.sendStatus(400);
  const { surprise, concern, protection, feedback } = req.body;
  p.impact = {
    surprise: Number(surprise), concern: Number(concern), protection,
    feedback: String(feedback || '').slice(0, 2000), at: new Date().toISOString()
  };
  save();
  res.sendStatus(204);
});

// ---------- 5. researcher dashboard ----------
const guard = (req, res, next) => (req.query.key === ADMIN_KEY ? next() : res.sendStatus(401));
const avg = (a) => (a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : null);
const pct = (n, d) => (d ? +((100 * n) / d).toFixed(1) : null);

app.get('/api/admin/results', guard, (req, res) => {
  const done = Object.values(db.participants).filter(p => p.perception && p.impact);
  const block = (list) => ({
    n: list.length,
    misconceptionRate: pct(list.filter(p => p.perception.q3 === 'safe').length, list.length),
    thoughtNotRecorded: pct(list.filter(p => p.perception.q2 === 'no').length, list.length),
    assumedProtection: pct(list.filter(p => p.impact.protection === 'yes').length, list.length),
    avgSurprise: avg(list.map(p => p.impact.surprise)),
    avgConcern: avg(list.map(p => p.impact.concern))
  });
  res.json({
    started: Object.keys(db.participants).length,
    completed: done.length,
    overall: block(done),
    technical: block(done.filter(p => p.cohort === 'technical')),
    general: block(done.filter(p => p.cohort === 'general')),
    q3Distribution: done.reduce((o, p) => ((o[p.perception.q3] = (o[p.perception.q3] || 0) + 1), o), {}),
    quotes: done.filter(p => p.impact.feedback.trim()).map(p => ({ cohort: p.cohort, text: p.impact.feedback }))
  });
});

app.get('/api/admin/export.csv', guard, (req, res) => {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['id', 'cohort', 'choice', 'seconds', 'q1_permission', 'q2_recorded', 'q3_no_banner_means', 'surprise', 'concern', 'assumed_protection', 'feedback', 'trackers_fired']];
  Object.values(db.participants).forEach(p => rows.push([
    p.id, p.cohort, p.task?.choice, p.task?.seconds, p.perception?.q1, p.perception?.q2, p.perception?.q3,
    p.impact?.surprise, p.impact?.concern, p.impact?.protection, p.impact?.feedback,
    [...new Set(p.traces.map(t => t.tracker))].join('|')
  ]));
  res.type('text/csv').attachment('responses.csv').send(rows.map(r => r.map(esc).join(',')).join('\n'));
});

   app.use((err, req, res, next) => {
     console.error('request error:', err);
     res.status(500).json({ error: err.message });
   });

app.listen(PORT, () => console.log(`Beyond the Banner running at http://localhost:${PORT}  (admin: /admin.html?key=${ADMIN_KEY})`));
