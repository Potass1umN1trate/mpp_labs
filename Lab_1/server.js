const express = require('express');
const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));

app.use(express.urlencoded({extended: true}));

let tasks = [];

app.get('/', (req, res) => {
    res.render('index', {tasks});
})

app.post('/add', (req, res) => {
    const title = req.body.title;
    const status = req.body.status;
    if (title && title.trim() !== ''){
        tasks.push({title, status})
    }
    res.redirect('/');
})

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://loacalhost:${PORT}`))