import { useState, useEffect, useRef } from "react";
import TaskItem from "./TaskItem";

const apiServer = "http://localhost:3001";

async function api(url, opts = {}) {
  const res = await fetch(url, { credentials : 'include', ...opts });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText || "Request failed");
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export default function App() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");

  const [needLogin, setNeedLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState("");
  const createFilesRef = useRef(null);

  async function safeCall(fn) {
    try {
      return await fn();
    } catch (err) {
      if (err.status === 401) {
        setNeedLogin(true);
      } else {
        console.error(err);
        setError(err.message || "Error occurred");
      }
      throw err;
    }
  }

  async function loadTasks() {
    const qs = encodeURIComponent(filter);
    const list = await safeCall(async () => api(`${apiServer}/api/tasks?status=${qs}`));
    setTasks(list);
  }
  useEffect(() => { loadTasks().catch(console.error); }, [filter]);

  async function doLogin(e) {
    e.preventDefault();
    setError("");
    try {
      await api(`${apiServer}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      setNeedLogin(false);
      setUsername("");
      setPassword("");
      await loadTasks();
    } catch (err) {
      setError(err.message || "Login failed");
    }
  }

  async function createTask(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("title", title);
    fd.append("status", status);
    fd.append("dueDate", dueDate);
    const files = createFilesRef.current?.files || [];
    for (const f of files) fd.append("files", f);

    await api(`${apiServer}/api/tasks`, { method: "POST", body: fd });
    setTitle(""); setStatus("todo"); setDueDate("");
    if (createFilesRef.current) createFilesRef.current.value = "";
    await loadTasks();
  }

  async function updateTask(id, update) {
    await api(`${apiServer}/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    });
    await loadTasks();
  }

  async function deleteTask(id) {
    await api(`${apiServer}/api/tasks/${id}`, { method: "DELETE" });
    await loadTasks();
  }

  async function attachFiles(id, fileList) {
    const fd = new FormData();
    for (const f of fileList) fd.append("files", f);
    await api(`${apiServer}/api/tasks/${id}/files`, { method: "POST", body: fd });
    await loadTasks();
  }

  return (
    <>
      <h1>SPA Tasks (React + REST)</h1>
      {error && <p>Error: {error}</p>}

      {needLogin ? 
        <form onSubmit={doLogin}>
          <h2>Login</h2>
          <label> Username: <input value={username} onChange={(e) => setUsername(e.target.value)} /> 
          </label>
          <label> Password: <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <button type="submit">Login</button>
        </form>
       : 
        <div>
          <div>
            <button onClick={async () => {
              await api(`${apiServer}/api/auth/logout`, { method: "POST" });
              setNeedLogin(true);
            }}>
              Logout
            </button>
          </div>
          <form className="card" onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="flt">Filter by status:&nbsp;</label>
            <select id="flt" value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="all">All</option>
              <option value="todo">To do</option>
              <option value="inprogress">In progress</option>
              <option value="done">Done</option>
            </select>
          </form>

          <form className="card" onSubmit={createTask} encType="multipart/form-data">
            <h2>Add task</h2>

            <label>Title:
              <input value={title} onChange={(e) => setTitle(e.target.value)} required />
            </label>

            <label>Status:
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="todo">To do</option>
                <option value="inprogress">In progress</option>
                <option value="done">Done</option>
              </select>
            </label>

            <label>Due date:
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </label>

            <label>Files:
              <input type="file" multiple ref={createFilesRef} />
            </label>

            <button type="submit">Create</button>
          </form>

          <div className="list">
            {tasks.length === 0 ? (
              <p className="card">No tasks for the selected filter.</p>
            ) : tasks.map((t) => (
              <TaskItem
                key={t.id}
                task={t}
                onUpdate={(payload) => updateTask(t.id, payload)}
                onDelete={() => deleteTask(t.id)}
                onAttach={(files) => attachFiles(t.id, files)}
              />
            ))}
          </div>
        </div>
      }
    </>
  );
}


