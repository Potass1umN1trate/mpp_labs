const { useState, useEffect, useRef } = React;

async function api(url, opts = {}) {
  const res = await fetch(url, opts);
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

function App() {
  const [tasks, setTasks] = useState([]);
  const [filter, setFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("todo");
  const [dueDate, setDueDate] = useState("");
  const createFilesRef = useRef(null);

  async function loadTasks() {
    const qs = encodeURIComponent(filter);
    const list = await api(`/api/tasks?status=${qs}`);
    setTasks(list);
  }
  useEffect(() => { loadTasks().catch(console.error); }, [filter]);

  async function createTask(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append("title", title);
    fd.append("status", status);
    fd.append("dueDate", dueDate);
    const files = createFilesRef.current?.files || [];
    for (const f of files) fd.append("files", f);

    await api("/api/tasks", { method: "POST", body: fd });
    setTitle(""); setStatus("todo"); setDueDate("");
    if (createFilesRef.current) createFilesRef.current.value = "";
    await loadTasks();
  }

  async function updateTask(id, update) {
    await api(`/api/tasks/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(update)
    });
    await loadTasks();
  }

  async function deleteTask(id) {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    await loadTasks();
  }

  async function attachFiles(id, fileList) {
    const fd = new FormData();
    for (const f of fileList) fd.append("files", f);
    await api(`/api/tasks/${id}/files`, { method: "POST", body: fd });
    await loadTasks();
  }

  return (
    <>
      <h1>SPA Tasks (React + REST)</h1>

      {/* filter (no reloads) */}
      <form className="card" onSubmit={(e) => e.preventDefault()}>
        <label htmlFor="flt">Filter by status:&nbsp;</label>
        <select id="flt" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">All</option>
          <option value="todo">To do</option>
          <option value="inprogress">In progress</option>
          <option value="done">Done</option>
        </select>
      </form>

      {/* create task */}
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

      {/* task list */}
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
    </>
  );
}

/* mount the app */
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
