import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import TaskItem from "./TaskItem";

const apiServer = "http://localhost:3001";

export default function App() {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [needLogin, setNeedLogin] = useState(true);
  const [sessionToken, setSessionToken] = useState(
    () => localStorage.getItem("sessionToken") || null
  );

  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState("");
  const createFilesRef = useRef(null);

  const [error, setError] = useState("");

  // ---- init socket.io connection ----
  useEffect(() => {
    const s = io(apiServer, {});

    s.on("connect", () => {
      setConnected(true);
      setError("");

      // если есть сохранённая сессия — пытаемся восстановить
      const stored = localStorage.getItem("sessionToken");
      if (stored) {
        s.emit("auth:resume", { token: stored }, (res) => {
          if (res?.ok) {
            setCurrentUser(res.user);
            setNeedLogin(false);
            loadTasks("all");
          } else {
            // если не получилось, просто очищаем токен
            localStorage.removeItem("sessionToken");
            setSessionToken(null);
          }
        });
      }
    });

    s.on("disconnect", () => {
      setConnected(false);
    });

    s.on("connect_error", (err) => {
      console.error("WS connect_error", err);
      setError(err?.message || "WebSocket connection error");
    });

    // сервер пушит новое состояние задач
    s.on("tasks:updated", (payload) => {
      setTasks(payload?.tasks || []);
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, []);

  // ---- helpers ----
  function ensureSocket() {
    if (!socket) {
      setError("Socket is not connected");
      return false;
    }
    return true;
  }

  function loadTasks(currentFilter = filter) {
    if (!ensureSocket() || !currentUser) return;
    socket.emit("tasks:list", { filter: currentFilter }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Failed to load tasks");
        return;
      }
      setTasks(res.tasks || []);
    });
  }

  useEffect(() => {
    if (socket && connected && currentUser) {
      loadTasks(filter);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, socket, connected, currentUser]);

  // ---- AUTH via WebSocket ----

  function doLogin(e) {
    e.preventDefault();
    setError("");
    if (!ensureSocket()) return;

    socket.emit("auth:login", { username, password }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Login failed");
        return;
      }
      setCurrentUser(res.user);
      setNeedLogin(false);
      setUsername("");
      setPassword("");

      if (res.token) {
        setSessionToken(res.token);
        localStorage.setItem("sessionToken", res.token);
      }

      loadTasks("all");
    });
  }

  function doRegister(e) {
    e.preventDefault();
    setError("");
    if (!ensureSocket()) return;

    socket.emit("auth:register", { username, password }, (res) => {
      if (!res?.ok) {
        setError(res?.error || "Register failed");
        return;
      }
      setCurrentUser(res.user);
      setNeedLogin(false);
      setUsername("");
      setPassword("");

      if (res.token) {
        setSessionToken(res.token);
        localStorage.setItem("sessionToken", res.token);
      }

      loadTasks("all");
    });
  }

  function doLogout() {
    setError("");
    if (!ensureSocket()) return;

    socket.emit("auth:logout", (res) => {
      if (!res?.ok) {
        setError(res?.error || "Logout failed");
      }
      setCurrentUser(null);
      setNeedLogin(true);
      setTasks([]);
      setSessionToken(null);
      localStorage.removeItem("sessionToken"); 
    });
  }

  // ---- TASKS via WebSocket ----

  function wsCreateTask(e) {
    e.preventDefault();
    setError("");
    if (!ensureSocket() || !currentUser) return;

    const payload = {
      title,
      status,
      dueDate: dueDate || null,
    };

    socket.emit("tasks:create", payload, async (res) => {
      if (!res?.ok) {
        setError(res?.error || "Failed to create task");
        return;
      }

      const created = res.task;
      const input = createFilesRef.current;
      const files = input?.files || [];

      if (files.length > 0 && created?.id) {
        try {
          await uploadFiles(created.id, files);
        } catch (err) {
          console.error(err);
          setError(err.message || "Failed to upload files");
        }
        if (input) input.value = "";
      }

      setTitle("");
      setStatus("todo");
      setDueDate("");
    });
  }

  function wsUpdateTask(id, update) {
    if (!ensureSocket() || !currentUser) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit("tasks:update", { id, update }, (res) => {
        if (!res?.ok) {
          setError(res?.error || "Failed to update task");
          reject(res?.error);
          return;
        }
        resolve();
      });
    });
  }

  function wsDeleteTask(id) {
    if (!ensureSocket() || !currentUser) return Promise.resolve();

    return new Promise((resolve, reject) => {
      socket.emit("tasks:delete", { id }, (res) => {
        if (!res?.ok) {
          setError(res?.error || "Failed to delete task");
          reject(res?.error);
          return;
        }
        resolve();
      });
    });
  }

  async function uploadFiles(taskId, fileList) {
    const fd = new FormData();
    Array.from(fileList).forEach((f) => fd.append("files", f));

    // достаём токен сессии
    const tokenFromState = sessionToken;
    const tokenFromStorage = localStorage.getItem("sessionToken");
    const token = tokenFromState || tokenFromStorage;

    const url = token
      ? `${apiServer}/api/tasks/${taskId}/files?token=${encodeURIComponent(token)}`
      : `${apiServer}/api/tasks/${taskId}/files`;

    const res = await fetch(url, {
      method: "POST",
      body: fd,
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || res.statusText || "File upload failed");
    }
  }


  // ---- RENDER ----

  return (
    <>
      <h1>SPA Tasks (React + WebSocket)</h1>

      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      <p>WS status: {connected ? "connected" : "disconnected"}</p>

      {needLogin ? (
        <form onSubmit={doLogin} className="card">
          <h2>Login</h2>
          <label>
            Username:
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Password:
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button type="submit" disabled={!connected}>
              Login
            </button>
            <button type="button" onClick={doRegister} disabled={!connected}>
              Register
            </button>
          </div>
        </form>
      ) : (
        <div>
          <div style={{ marginBottom: "1rem" }}>
            <span>Logged in as: {currentUser?.username}</span>{" "}
            <button onClick={doLogout}>Logout</button>
          </div>

          <form className="card" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="flt">Filter by status:&nbsp;</label>
            <select
              id="flt"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="todo">To do</option>
              <option value="inprogress">In progress</option>
              <option value="done">Done</option>
            </select>
          </form>

          <form
            className="card"
            onSubmit={wsCreateTask}
            encType="multipart/form-data"
          >
            <h2>Add task</h2>

            <label>
              Title:
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </label>

            <label>
              Status:
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="todo">To do</option>
                <option value="inprogress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label>
              Due date:
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </label>

            <label>
              Files:
              <input type="file" multiple ref={createFilesRef} />
            </label>

            <button type="submit" disabled={!connected || !currentUser}>
              Create
            </button>
          </form>

          <div className="list">
            {tasks.length === 0 ? (
              <p className="card">No tasks for the selected filter.</p>
            ) : (
              tasks.map((t) => (
                <TaskItem
                  key={t.id}
                  task={t}
                  onUpdate={(payload) => wsUpdateTask(t.id, payload)}
                  onDelete={() => wsDeleteTask(t.id)}
                  onAttach={(files) => uploadFiles(t.id, files)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
