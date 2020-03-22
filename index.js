const express = require('express');
const app = express();

const port = process.env.PORT || 8080;

const updateGrades = require('./updateGrades');

app.get('/update', (request, response) => {
    updateGrades(request.query.username, request.query.password, request.query.spreadsheetId)
        .then(changes => response.send(JSON.stringify(changes)))
        .catch(err => console.log(err));
});

app.get('/', (req, res) => res.send('Go to /update and enter your aspen username, password and spreadsheetId to update'));

app.listen(port)