const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || "change-me";
const JWT_TTL = '1h';
const COOKIE_NAME = 'JWT';

const app = express();

app.use(express.json());
app.use(cookieParser());

const publicDir = path.join(__dirname, 'public');
app.use('/public', express.static(publicDir));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use('/uploads', express.static(uploadDir)); 

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 10 * 1024 * 1024, files: 8 }
});

let tasks = [];
let nextId = 1;

const users = new Map();
(async () => {
  const hash = await bcrypt.hash('admin', 10);
  users.set('admin', { id: '1', username: 'admin', passwordHash: hash });
  users.set('john', { id: '2', username: 'john', passwordHash: hash });
})();

const ALLOWED_STATUS = new Set(['todo', 'inprogress', 'done']);
const OK_FILTER = new Set(['all', ...ALLOWED_STATUS]);

function issueTokenCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    samesite: 'lax',
    maxAge: 60 * 60 * 1000,
  });
}

const toFileMeta = (f) => ({
  id: f.filename,                       
  originalname: f.originalname,         
  filename: f.filename,                 
  path: `/uploads/${f.filename}`,       
  mimetype: f.mimetype,
  size: f.size
});

function authRequired(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch(e) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

const findTask = (id) => tasks.find(t => t.id === id);

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!(username && password)) return res.status(400).json({ error: 'Missing credentials' });

  const user = users.get(username);
  if(!(await bcrypt.compare(password, user?.passwordHash))) return res.status(401).json({ error: 'Invalid credentials' });

  issueTokenCookie(res, { sub: user.id, username: user.username });
  return res.status(204).end()
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: false, sameSite: 'lax' });
  return res.status(204).end();
})

app.use('/api/tasks', authRequired);

app.get('/api/tasks', (req, res) => {
  const raw = (req.query.status || 'all').toLowerCase();
  const filter = OK_FILTER.has(raw) ? raw : 'all';
  const list = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
  res.status(200).json(list);
});

app.get('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = findTask(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  res.status(200).json(task);
});

app.post('/api/tasks', upload.array('files'), (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const status = ALLOWED_STATUS.has(req.body.status) ? req.body.status : 'todo';
  const dueDate = typeof req.body.dueDate === 'string' ? req.body.dueDate.trim() : '';

  const files = (req.files ?? []).map(toFileMeta);

  const task = { id: nextId++, title, status, dueDate, files };
  tasks.push(task);

  res.set('Location', `/api/tasks/${task.id}`);
  res.status(201).json(task); // 201 Created
});

// PUT /api/tasks/:id — update (JSON)
app.put('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = findTask(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, status, dueDate } = req.body || {};
  if (typeof title === 'string' && title.trim()) task.title = title.trim();
  if (typeof status === 'string' && ALLOWED_STATUS.has(status)) task.status = status;
  if (typeof dueDate === 'string') task.dueDate = dueDate.trim();

  res.status(200).json(task);
});

// DELETE /api/tasks/:id — delete
app.delete('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const exists = tasks.some(t => t.id === id);
  if (!exists) return res.status(404).json({ error: 'Task not found' });
  tasks = tasks.filter(t => t.id !== id);
  res.status(204).end(); // No Content
});

// POST /api/tasks/:id/files — attach files (multipart)
app.post('/api/tasks/:id/files', upload.array('files'), (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = findTask(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const more = (req.files ?? []).map(toFileMeta);
  task.files = task.files || [];
  task.files.push(...more);

  res.status(200).json({ files: task.files });
});

app.get('/api/tasks/:id/files/:fileId/download', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = findTask(id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const f = (task.files || []).find(x => x.id === req.params.fileId);
  if (!f) return res.status(404).json({ error: 'File not found' });

  res.download(path.join(uploadDir, f.filename), f.originalname);
});

//app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
//app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
