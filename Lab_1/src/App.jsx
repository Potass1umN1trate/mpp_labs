import TaskItem from "./TaskItem.jsx";

export default function App({ tasks, filter }) {
  return (
    <>
      <h1>My Tasks (React SSR)</h1>

      {/* Filter (GET) */}
      <form method="GET" action="/" className="card">
        <label htmlFor="status">Filter by status: </label>
        <select id="status" name="status" defaultValue={filter}>
          <option value="all">All</option>
          <option value="todo">To do</option>
          <option value="inprogress">In progress</option>
          <option value="done">Done</option>
        </select>
        <button type="submit">Apply</button>
      </form>

      {/* Create task (POST) */}
      <form method="POST" action="/add" encType="multipart/form-data" className="card">
        <h2>Add task</h2>

        <label>
          Title:
          <input name="title" required />
        </label>

        <label>
          Status:
          <select name="status" defaultValue="todo">
            <option value="todo">To do</option>
            <option value="inprogress">In progress</option>
            <option value="done">Done</option>
          </select>
        </label>

        <label>
          Due date:
          <input type="date" name="dueDate" />
        </label>

        <label>
          Files:
          <input type="file" name="files" multiple />
        </label>

        <button type="submit">Create</button>
      </form>

      {/* Task list */}
      <div className="list">
        {tasks.length === 0 ? (
          <p>No tasks for the selected filter.</p>
        ) : (
          tasks.map(t => (
            <TaskItem key={t.id} task={t} />
          ))
        )}
      </div>
    </>
  );
}
