const express = require('express');
const app = express();

const port = process.env.PORT || 8080;

const updateGrades = require('./updateGrades');

app.get('/update', (request, response) => {
    updateGrades()
        .then(res => response.send(res))
        .catch(err => console.log(err));

});

app.get('/', (req, res) => res.send('Hello World!'));

app.listen(port)