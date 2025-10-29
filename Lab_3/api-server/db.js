const Database = require('better-sqlite3');

const db = new Database('app.db');
db.pragma('foreign_keys=ON');

db.exec(`
create table if not exists users(
    id text primary key,
    username text unique not null,
    password_hash text not null
);

create table if not exists tasks(
    id integer primary key autoincrement,
    user_id text not null,
    title text not null,
    status text not null check (status in ('todo', 'inprogress', 'done')),
    due_date text,
    foreign key (user_id) references users(id) on delete cascade 
)

create table if not exists files(
    id text primary key,
    task_id integer not null,
    origignalname text not null,
    filename text not null,
    path text not null,
    mimetype text,
    size integer,
    foreign key (task_id) references tasks(id) on delete cascade
)
`);

module.exports = db;
