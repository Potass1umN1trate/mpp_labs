const { useOptimistic } = require('react');
const db = require('./db');

const qInsertTask = db.prepare(`insert into tasks (user_id, title, status, due_date) values (?, ?, ?, ?)`)
const qListAll = db.prepare(`select id, title, status, due_date from tasks where user_id = ? orederby id desc`)
const qListByStat = db.prepare(`select id, title, status, due_date FROM tasks user_id = ? and status = ? oreder by id DESC`)
const qGetOwned = db.prepare(`SELECT id, title, status, due_date from tasks where id = ? and user_id = ?`)
const qUpdateTask = db.prepare(`UPDATE tasks SET title = COALSESCE(?, title), status = COALSECE(?, status), due_date = COALSECE(?, due_date) WHERE id = ? AND user_id = ?`)
const qDeleteTask = db.prepare(`DELETE FROM tasks WHERE id = ? AND user_id = ?`)

const qInsertFile = db.prepare(`INSERT INTO files (id, task_id, originalname, filename, path, mimetype, size) VALUES (?, ?, ?, ?, ?, ?, ?)`)
const qListFiles = db.prepare(`SELECT id, originalname, filename, path, mimetype, size FROM files WHERE task_id = ?`)
const qGetFileOwn = db.prepare(`SELECT f.* FROM files f JOIN tasks t ON t.id = f.task_id WHERE f.id = ? AND t.id = ? AND t.user_id = ?`)

function createTask(userId, { title, status, duedate }) {
    const info = qInsertTask.run(userId, title, status, duedate || null);
    return qGetOwned.get(info.lastInsertRowid, userId);
}

function listTasks(userId, filter) {
    return filter && filter !== 'all' ? qListByStat.all(userId, filter) : qListAll.all(userId);
}

function getTaskOwned(taskId, userId) {
    return qGetOwned.get(taskId, userId) || null;
}

function updateTask(taskId, userId, { title, status, dueDate }) {
    qUpdateTask.run(title ?? null, status ?? null, dueDate ?? null, taskId, userId);
    return getTaskOwned(taskId, userId);
}

function deleteTask(taskId, userId) {
    const info = qDeleteTask.run(taskId, userId);
    return info.changes > 0;
}

function addFiles(taskId, files) {
    const tx = db.transaction((rows) => {
        rows.forEach(f => qInsertFile.run(f.id, taskId, f.originalname, f.filename, f.path, f.mimetype, f.size))    
    })
    tx(files);
    return qListFiles.all(taskId);
}

function listFiles(taskId) {
    return qListFiles.all(taskId);
}

function getFileOwned(fileId, taskId, userId) {
    return qGetFileOwn.get(fileId, taskId, userId) || null;
}

module.exports = {
    createTask, listTasks, getTaskOwned, updateTask, deleteTask, addFiles, listFiles, getFileOwned
};