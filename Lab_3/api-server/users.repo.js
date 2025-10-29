const db = require("./db");

const qFindByUsername = db.prepare(`select * from users where username = ?`);
const qFindById       = db.prepare(`select * from users where id = ?`);
const qInsert         = db.prepare(`insert into users (id, username, password_hash) values (?, ?, ?)`);

function findByUsername(username) {
    return qFindByUsername.get(username) || null;
}

function findByUserId(id) {
    return qFindById.get(id) || null;
}

function createUser(id, username, passwordHash) {
    qInsert.run(id, username, passwordHash);
    return findByUserId(id);
}

module.exports = { findByUsername, findByUserId, createUser };