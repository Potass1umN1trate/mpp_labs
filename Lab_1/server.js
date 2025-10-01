const express = require('express');
const app = express();

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use('/uploads', express.static(uploadDir));

const upload = multer({dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024, files: 5 }});

//app.set('view engine', 'ejs');

app.use(express.static('public'));

app.use(express.urlencoded({extended: true}));

let tasks = [];
let indexId = 1;

// GET / for EJS
// app.get('/', (req, res) => {
//     const filter = req.query.status || 'all';
//     const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
//     res.render('index', {tasks: filtered, filter});
// })

app.get('/api/tasks', (req, res) => {
    const raw = req.query.status || 'all';
    const allowed = new Set(['all', 'todo', 'inprogress', 'done']);
    const filter = allowed.has(raw) ? raw : 'all';

    const visible = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);

    const App = require("./src/App.jsx").default;
    const html = ReactDOMServer.renderToString(React.createElement(App, {tasks: visible, filter}));

    res.t
});

app.post('/add', upload.array('files'), (req, res) => {
    const {title, status, dueDate} = req.body;
    if (title && title.trim() !== ''){
        const files = (req.files || []).map(f => ({
            originalName: f.originalname,
            filename: f.filename,
            path: `/uploads/${f.filename}`,
            mimetype: f.mimetype,
            size: f.size
        }))

        tasks.push({
            id: indexId++,
            title: title.trim(),
            status: status || 'todo',
            dueDate: dueDate || '',
            files
        })
    }
    res.redirect('/');
})

app.post('/attach', upload.array('files'), (req, res) => {
    const id = Number(req.body.id);
    const task = tasks.find(t => t.id === id);

    if (task && req.files){
        task.files = task.files;
        task.files.push(...req.files.map(f => ({
            originalName: f.originalname,
            filename: f.filename,
            path: `/uploads/${f.filename}`,
            mimetype: f.mimetype,
            size: f.size
        })))
    }

    res.redirect('/');
})

app.post('/update', (req, res) => {
    const id = Number(req.body.id);
    const {status, dueDate} = req.body;

    const task = tasks.find(t => t.id === id);
    if (task){
        if (status) task.status = status;
        task.dueDate = (dueDate ?? '').trim();  
    }

    res.redirect('/');
})

app.post('/delete', (req, res) => {
    const id = Number(req.body.id);
    tasks = tasks.filter(t => t.id !== id);
    res.redirect('/');
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://loacalhost:${PORT}`))