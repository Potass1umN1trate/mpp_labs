export default function TaskItem({ task }) {
  return (
    <div className="task card">
      <div className="task-main">
        <h3>#{task.id} {task.title}</h3>
        <div className="row"><strong>Status:</strong>&nbsp;{labelStatus(task.status)}</div>
        <div className="row"><strong>Due:</strong>&nbsp;{task.dueDate || "—"}</div>
      </div>

      {/* Edit (POST) */}
      <form method="POST" action="/update" className="inline-form">
        <input type="hidden" name="id" value={task.id} />

        <label>
          Status:
          <select name="status" defaultValue={task.status}>
            <option value="todo">To do</option>
            <option value="inprogress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label>
          Date:
          <input type="date" name="dueDate" defaultValue={task.dueDate} />
        </label>

        <button type="submit">Save</button>
      </form>

      {/* Attach files (POST multipart) */}
      <form method="POST" action="/attach" encType="multipart/form-data" className="inline-form">
        <input type="hidden" name="id" value={task.id} />

        <label>
          Add files:
          <input type="file" name="files" multiple />
        </label>
        <button type="submit">Upload</button>
      </form>

      {/* Files */}
      {task.files?.length ? (
        <div className="files">
          <strong>Files:</strong>
          <ul>
            {task.files.map((f, idx) => (
              <li key={idx}>
                {/* If you implemented /download/:taskId/:stored, swap href below accordingly */}
                <a href={f.path} target="_blank" rel="noreferrer" download={f.originalName}>
                  {f.originalName}
                </a>{" "}
                ({Math.ceil((f.size || 0) / 1024)} KB)
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Delete (POST) */}
      <form method="POST" action="/delete" className="inline-form danger">
        <input type="hidden" name="id" value={task.id} />
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
