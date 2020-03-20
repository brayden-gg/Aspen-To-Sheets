const express = require('express');
const app = express();

const port = process.env.PORT || 8080;

const updateGrades = require('./updateGrades');

app.get('/update', async (request, response) => {
    await updateGrades();
});

app.get('/', (req, res) => res.send('Hello World!'));

app.listen(port);