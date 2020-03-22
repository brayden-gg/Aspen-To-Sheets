const express = require('express');
const app = express();

const port = process.env.PORT || 8080;

const updateGrades = require('./updateGrades');

app.get('/update', (request, response) => {
    response.send(JSON.stringify(updateGrades()));
});

app.get('/', (req, res) => res.send('Hello World!'));

app.listen(port)

updateGrades();