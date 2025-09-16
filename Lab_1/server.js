const express = require('express');
const app = express();

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

app.use('/uploads', express.static(uploadDir));

const upload = multer({dest: uploadDir});

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.urlencoded({extended: true}));

let tasks = [];
let indexId = 1;

app.get('/', (req, res) => {
    const filter = req.query.status || 'all';
    const filtered = filter === 'all' ? tasks : tasks.filter(t => t.status === filter);
    res.render('index', {tasks: filtered, filter});
})

app.post('/add', (req, res) => {
    const {title, status, dueDate} = req.body;
    if (title && title.trim() !== ''){
        tasks.push({
            id: indexId++,
            title: title.trim(),
            status: status || 'todo',
            dueDate: dueDate || ''
        })
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