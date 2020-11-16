const express = require('express');
const app = express();

app.use(express.static("public"));
app.use(express.json({
    limit: "1mb"
}));

require('dotenv').config();

const port = process.env.PORT || 3000;

const updateGrades = require('./updateGrades');

app.get('/update', (req, res) => {
    updateGrades(process.env.ASPEN_USERNAME, process.env.ASPEN_PASSWORD, "https://maker.ifttt.com/trigger/aspen/with/key/hm95k8-U0CbNpQ2qY1zUgz6yPhq78Ypcs8oLT8dU6bs", "1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0")
        .then(changes => res.send(JSON.stringify(changes)))
        .catch(err => console.log(err));
});


app.post('/update', (req, res) => {

    if (req.body.username.length !== 9 || req.body.password.length < 5) {
        console.log("Invalid username or password");
        res.send("Invalid username or password")
    }

    console.log(`Request from ${req.body.username}`);

    updateGrades(req.body.username, req.body.password, req.body.trigger_url, req.body.spreadsheetId)
        .then(changes => res.send(JSON.stringify(changes)))
        .catch(err => console.log(err));

});

app.listen(port)