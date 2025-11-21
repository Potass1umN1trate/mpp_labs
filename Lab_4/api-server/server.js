const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const { findUserByUsername, findUserByUserId, createUser } = require('./users.repo');
const {
  createTask,
  listTasks,
  getTaskOwned,
  updateTask,
  deleteTask,
  addFiles,
  listFiles,
  getFileOwned,
} = require('./tasks.repo');

const app = express();
const httpServer = http.createServer(app);

const sessions = new Map(); 
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 час

const { Server } = require('socket.io');
const io = new Server(httpServer, {
  cors: {
    origin: 'http://localhost:5173',
  },
});


function getValidSessionUserId(token) {
  if (!token) return null;

  const record = sessions.get(token);
  if (!record) return null;

  if (Date.now() > record.expiresAt) {
    sessions.delete(token);
    return null;
  }
  return record.userId;
}

// ---------- UPLOADS ----------
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, uploadDir);
  },
  filename(req, file, cb) {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// ---------- EXPRESS MIDDLEWARE ----------
app.use(
  cors({
    origin: 'http://localhost:5173',
  }),
);
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// ---------- FILES HTTP API (оставили через HTTP ради простоты) ----------

// загрузка файлов к задаче
app.post('/api/tasks/:id/files', upload.array('files'), (req, res) => {
  const taskId = Number.parseInt(req.params.id, 10);
  const token = req.query.token;

  const userId = getValidSessionUserId(token);
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized (invalid or expired session)' });
  }

  // 2) Проверяем, что задача принадлежит этому пользователю
  const task = getTaskOwned(taskId, userId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found or not owned by user' });
  }

  // 3) Сохраняем файлы
  const toSave = (req.files || []).map((f) => ({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    originalname: f.originalname,
    filename: f.filename,
    path: `/uploads/${f.filename}`,
    mimetype: f.mimetype,
    size: f.size,
  }));

  const saved = addFiles(taskId, toSave);

  // 4) Пушим свежий список задач этому пользователю по WebSocket
  const tasks = buildTasksForUser(userId, 'all');
  io.to(userId).emit('tasks:updated', { tasks });

  // 5) Отдаём HTTP-ответ (чисто формальность)
  return res.status(201).json(saved);
});


// скачивание файла 
app.get('/api/tasks/:id/files/:fileId/download', (req, res) => {
  const taskId = Number.parseInt(req.params.id, 10);
  const fileId = req.params.fileId;

  // В упрощённом варианте ЛР не проверяем владельца файла,
  // просто ищем файл среди файлов задачи.
  const files = listFiles(taskId);
  const file = files.find((f) => String(f.id) === String(fileId));

  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.download(path.join(uploadDir, file.filename), file.originalname);
});

// ---------- HELPERS FOR TASKS ----------
const ALLOWED_FILTERS = new Set(['all', 'todo', 'inprogress', 'done']);

function buildTasksForUser(userId, filter = 'all') {
  const f = (filter || 'all').toLowerCase();
  const realFilter = ALLOWED_FILTERS.has(f) ? f : 'all';

  const rows = listTasks(userId, realFilter);
  return rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    dueDate: t.due_date,
    files: listFiles(t.id),
  }));
}

// ---------- SOCKET.IO ----------

io.on('connection', (socket) => {
  console.log('Client connected', socket.id);

  // --- AUTH: register ---
  socket.on('auth:register', async (payload, cb) => {
    try {
      const { username, password } = payload || {};
      if (!username || !password) {
        return cb && cb({ ok: false, error: 'username and password required' });
      }

      if (findUserByUsername(username)) {
        return cb && cb({ ok: false, error: 'user already exists' });
      }

      const id = `u_${Date.now()}`;
      const passwordHash = await bcrypt.hash(password, 10);
      const user = createUser(id, username, passwordHash);

      socket.user = { id: user.id, username: user.username };
      socket.join(user.id);

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });

      cb && cb({
        ok: true,
        user: { id: user.id, username: user.username },
        token: sessionId,
      });

      const tasks = buildTasksForUser(user.id, 'all');
      socket.emit('tasks:updated', { tasks });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'register failed' });
    }
  });

  // --- AUTH: login ---
  socket.on('auth:login', async (payload, cb) => {
    try {
      const { username, password } = payload || {};
      if (!username || !password) {
        return cb && cb({ ok: false, error: 'username and password required' });
      }

      const user = findUserByUsername(username);
      if (!user) {
        return cb && cb({ ok: false, error: 'invalid username or password' });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) {
        return cb && cb({ ok: false, error: 'invalid username or password' });
      }

      socket.user = { id: user.id, username: user.username };
      socket.join(user.id);

      const sessionId = crypto.randomUUID();
      sessions.set(sessionId, {
        userId: user.id,
        expiresAt: Date.now() + SESSION_TTL_MS,
      });

      cb && cb({
        ok: true,
        user: { id: user.id, username: user.username },
        token: sessionId,
      });

      const tasks = buildTasksForUser(user.id, 'all');
      socket.emit('tasks:updated', { tasks });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'login failed' });
    }
  });

  socket.on('auth:resume', (payload, cb) => {
  try {
    const { token } = payload || {};
    if (!token) return cb && cb({ ok: false, error: 'no token' });

    const userId = getValidSessionUserId(token);
    if (!userId) {
      return cb && cb({ ok: false, error: 'invalid or expired session' });
    }

    const user = findUserByUserId(userId);
    if (!user) return cb && cb({ ok: false, error: 'user not found' });

    socket.user = { id: user.id, username: user.username };
    socket.join(user.id);

    cb && cb({
      ok: true,
      user: { id: user.id, username: user.username },
    });

    const tasks = buildTasksForUser(user.id, 'all');
    socket.emit('tasks:updated', { tasks });
  } catch (err) {
    console.error(err);
    cb && cb({ ok: false, error: 'resume failed' });
  }
});

  // --- AUTH: logout ---
  socket.on('auth:logout', (cb) => {
    if (socket.user) {
      socket.leave(socket.user.id);
      socket.user = null;
    }
    cb && cb({ ok: true });
  });

  // --- TASKS:list ---
  socket.on('tasks:list', (payload, cb) => {
    try {
      if (!socket.user) {
        return cb && cb({ ok: false, error: 'unauthorized' });
      }
      const filter = payload?.filter || 'all';
      const tasks = buildTasksForUser(socket.user.id, filter);
      cb && cb({ ok: true, tasks });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'failed to load tasks' });
    }
  });

  // --- TASKS:create ---
  socket.on('tasks:create', (payload, cb) => {
    try {
      if (!socket.user) {
        return cb && cb({ ok: false, error: 'unauthorized' });
      }
      const { title, status = 'todo', dueDate = null } = payload || {};
      if (!title) {
        return cb && cb({ ok: false, error: 'title is required' });
      }

      const task = createTask(socket.user.id, {
        title,
        status,
        duedate: dueDate || null,
      });

      const tasks = buildTasksForUser(socket.user.id, 'all');
      io.to(socket.user.id).emit('tasks:updated', { tasks });

      cb && cb({ ok: true, task });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'failed to create task' });
    }
  });

  // --- TASKS:update ---
  socket.on('tasks:update', (payload, cb) => {
    try {
      if (!socket.user) {
        return cb && cb({ ok: false, error: 'unauthorized' });
      }
      const { id, update } = payload || {};
      if (!id) {
        return cb && cb({ ok: false, error: 'task id is required' });
      }

      const taskId = Number.parseInt(id, 10);
      const existing = getTaskOwned(taskId, socket.user.id);
      if (!existing) {
        return cb && cb({ ok: false, error: 'task not found' });
      }

      const patch = {
        title: update?.title ?? null,
        status: update?.status ?? null,
        dueDate: update?.dueDate ?? null,
      };

      updateTask(taskId, socket.user.id, patch);

      const tasks = buildTasksForUser(socket.user.id, 'all');
      io.to(socket.user.id).emit('tasks:updated', { tasks });

      cb && cb({ ok: true });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'failed to update task' });
    }
  });

  // --- TASKS:delete ---
  socket.on('tasks:delete', (payload, cb) => {
    try {
      if (!socket.user) {
        return cb && cb({ ok: false, error: 'unauthorized' });
      }
      const { id } = payload || {};
      if (!id) {
        return cb && cb({ ok: false, error: 'task id is required' });
      }

      const taskId = Number.parseInt(id, 10);
      const existing = getTaskOwned(taskId, socket.user.id);
      if (!existing) {
        return cb && cb({ ok: false, error: 'task not found' });
      }

      deleteTask(taskId, socket.user.id);

      const tasks = buildTasksForUser(socket.user.id, 'all');
      io.to(socket.user.id).emit('tasks:updated', { tasks });

      cb && cb({ ok: true });
    } catch (err) {
      console.error(err);
      cb && cb({ ok: false, error: 'failed to delete task' });
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('Client disconnected', socket.id, reason);
  });
});

// ---------- START ----------
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`HTTP + WebSocket server running on http://localhost:${PORT}`);
});
