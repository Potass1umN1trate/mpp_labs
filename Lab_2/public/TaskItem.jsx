/* TaskItem component: expects props { task, onUpdate, onDelete, onAttach } */

function TaskItem({ task, onUpdate, onDelete, onAttach }) {
  const [status, setStatus] = React.useState(task.status);
  const [dueDate, setDueDate] = React.useState(task.dueDate || "");
  const attachRef = React.useRef(null);

  async function save(e) {
    e.preventDefault();
    await onUpdate({ status, dueDate });
  }

  async function attach(e) {
    e.preventDefault();
    const files = attachRef.current?.files || [];
    if (files.length === 0) return;
    await onAttach(files);
    attachRef.current.value = "";
  }

  return (
    <div className="task card">
      <div className="task-main">
        <h3>#{task.id} {task.title}</h3>
        <div className="row"><strong>Status:</strong>&nbsp;{labelStatus(task.status)}</div>
        <div className="row"><strong>Due:</strong>&nbsp;{task.dueDate || "—"}</div>
      </div>

      <form className="inline-form" onSubmit={save}>
        <label>Status:
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todo">To do</option>
            <option value="inprogress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label>Date:
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </label>

        <button type="submit">Save</button>
      </form>

      <form className="inline-form" onSubmit={attach} encType="multipart/form-data">
        <label>Add files:
          <input type="file" multiple ref={attachRef} />
        </label>
        <button type="submit">Upload</button>
      </form>

      {task.files?.length ? (
        <div className="files">
          <strong>Files:</strong>
          <ul>
            {task.files.map((f) => (
              <li key={f.id}>
                <a href={f.path} target="_blank" rel="noreferrer">{f.originalname}</a>
                {" "}•{" "}
                <a href={`/api/tasks/${task.id}/files/${f.id}/download`} target="_blank" rel="noreferrer">
                  download
                </a>
                {" "}({Math.ceil((f.size || 0) / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <form className="inline-form danger" onSubmit={(e) => { e.preventDefault(); onDelete(); }}>
        <button type="submit">Delete</button>
      </form>
    </div>
  );
}

function labelStatus(s) {
  switch (s) {
    case "todo": return "To do";
    case "inprogress": return "In progress";
    case "done": return "Done";
    default: return s;
  }
}

window.TaskItem = TaskItem;
