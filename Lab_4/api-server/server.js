const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { findUserByUsername, findUserByUserId, createUser } = require('./users.repo');
const { createTask, getTaskOwned, updateTask, deleteTask, addFiles, listFiles, getFileOwned, listTasks } = require('./tasks.repo');
const { type } = require('os');

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

let nextId = 1;

const users = new Map();

const ALLOWED_STATUS = new Set(['todo', 'inprogress', 'done']);
const OK_FILTER = new Set(['all', ...ALLOWED_STATUS]);

function issueTokenCookie(res, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: false,
    samesite: 'lax',
    maxAge: 60 * 60 * 1000,
    path: '/',
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
    const payload = jwt.verify(token, JWT_SECRET);
    user = findUserByUserId(payload.sub);
    if(!user) return res.status(401).json({ error: "Session invalid. Please login again." });
    console.log('Authenticated user:', user);
    req.user = { id: user.id, username: user.username };
    next();
  } catch(e) {
    console.log(e);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true
}));

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!(username && password)) return res.status(400).json({ error: 'Missing credentials' });
  try {
    const user = findUserByUsername(username);
    issueTokenCookie(res, { sub: user.id, username: user.username });
    return res.status(204).end()
  } catch(e) {
    console.log(e)
    return res.status(401).json({ error: 'Wrong credentials' })
  }
})

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: false, sameSite: 'lax' });
  return res.status(204).end();
})

app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!(username && password)) return res.status(400).json({ error: 'Missing credentials' });
  if (findUserByUsername(username)) return res.status(409).json({ error: 'User already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const uid = 'u_' + Date.now();
  const user = createUser(uid, username, passwordHash)
  issueTokenCookie(res, { sub: user.id, username: user.username });
  return res.status(201).end();
});

app.get('/api/auth/me', authRequired, (req, res) => {
  res.status(200).json({ id: req.user.sub, username: req.user.username });
});

app.use('/api/tasks', authRequired);

app.get('/api/tasks', (req, res) => {
  const raw = (req.query.status || 'all').toLowerCase();
  const filter = OK_FILTER.has(raw) ? raw : 'all';
  const list = listTasks(req.user.id, filter)
  const withFiles = list.map(t => {
    return {
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.due_date || null,
      files: listFiles(t.id)
    }
  })
  res.status(200).json(withFiles);
});

app.get('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = getTaskOwned(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  const files = listFiles(id);
  res.status(200).json({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.due_date || null,
    files
  });
});

app.post('/api/tasks', upload.array('files'), (req, res) => {
  const title = (req.body.title || '').trim();
  if (!title) return res.status(400).json({ error: 'title is required' });

  const status = ALLOWED_STATUS.has(req.body.status) ? req.body.status : 'todo';
  const dueDate = typeof req.body.dueDate === 'string' ? req.body.dueDate.trim() : null;
  console.log(dueDate);
  const task = createTask(req.user.id, { title: title, status: status, duedate: dueDate });
  console.log('Task is :');
  console.log(task);
  const files = (req.files ?? []).map(f => ({
    id: f.filename,
    originalname: f.originalname,
    filename: f.filename,
    path: `/uploads/${f.filename}`,
    mimetype: f.mimetype,
    size: f.size
  }));
  if (files.length) addFiles(task.id, files);
  const attached = listFiles(task.id);
  res.set('Location', `/api/tasks/${task.id}`);
  res.status(201).json({
    id: task.id,
    title: task.title,
    status: task.status,
    dueDate: task.due_date || null,
    files: attached
  });
});

app.put('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = getTaskOwned(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const { title, status, dueDate } = req.body || {};
  const safeStatus = (typeof status === 'string' && ALLOWED_STATUS.has(status)) ? status : undefined;
  const safeTitle = (typeof title === 'string' && title.trim()) ? title.trim() : undefined;
  const safeDate = (typeof dueDate === 'string' && dueDate.trim()) ? dueDate.trim() : undefined;

  const updated = updateTask(id, req.user.id, { title: safeTitle, status: safeStatus, dueDate: safeDate });

  res.status(200).json(updated);
});

// DELETE /api/tasks/:id — delete
app.delete('/api/tasks/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const ok = deleteTask(id, req.user.id);
  if (!ok) return res.status(404).json({ error: 'Task not found' });
  res.status(204).end(); // No Content
});

// POST /api/tasks/:id/files — attach files (multipart)
app.post('/api/tasks/:id/files', upload.array('files'), (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const task = getTaskOwned(id, req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const more = (req.files ?? []).map(f => ({
    id: f.filename,
    originalname: f.originalname,
    filename: f.filename,
    path: `/uploads/&{f.filename}`,
    mimetype: f.mimetype,
    size: f.size
  }));
  const files = addFiles(id, more);
  res.status(200).json({ files: files });
});

app.get('/api/tasks/:id/files/:fileId/download', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const fileId = req.params.fileId;
  const file = getFileOwned(fileId, id, req.user.id);
  if (!file) return res.status(404).json({ error: 'File not found' });

  res.download(path.join(uploadDir, file.filename), file.originalname);
});

//app.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
//app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
