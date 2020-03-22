const {
    google
} = require('googleapis');
const cliProgress = require('cli-progress'); // loading bar because why not
const cron = require('node-cron');
const nodemailer = require('nodemailer');




const keys = require('./keys.json');

const {
    Assignment,
    GradeBook
} = require('./assignment.js');
const scrape = require('./scrape.js');

require('dotenv').config();

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USERNAME,
        pass: process.env.GMAIL_PASSWORD
    },
});

function updateGrades() {
    let result;

    const client = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );

    client.authorize((err, tokens) => {
        if (err) {
            console.log(err);
            return;
        }

        gsrun(client)
            .then(res => {
                result = res;
            })
            .catch(err => {
                console.log(err);
            });
    });
    return result;

}

async function gsrun(client) {

    const gsapi = google.sheets({
        version: 'v4',
        auth: client,
    });

    const loadingBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    let progress = 0;

    loadingBar.start(200, 0);


    let data = await scrape(process.env.ASPEN_USERNAME, process.env.ASPEN_PASSWORD, loadingBar, progress);

    progress = 100;
    loadingBar.update(progress);

    let changes = {};

    for (let className in data) {

        let newData = flip(data[className]); //because I can't spell transpose consistently

        let original = await gsapi.spreadsheets.values.get({
            spreadsheetId: '1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0',
            range: `${className}!A15:${String.fromCharCode(Math.max(newData.length, 1) + 64)}`
        });


        if (original.data.values) {
            let oldData = flip(original.data.values);

            let oldAssignments = [];
            let newAssignments = [];

            for (let i = 0; i < oldData.length; i += 3) {
                for (let j = 1; j < oldData[i].length; j++) {
                    if (oldData[i][j] != "" && oldData[i][j] !== undefined) {
                        oldAssignments.push(new Assignment(oldData[i][j], oldData[i + 1][j], oldData[i + 2][j], className));
                    }
                }
            }

            for (let i = 0; i < newData.length; i += 3) {
                for (let j = 1; j < newData[i].length; j++) {
                    if (newData[i][j] != "" && !isNaN(newData[i + 1][j]) && newData[i][j] !== undefined) {
                        newAssignments.push(new Assignment(newData[i][j], newData[i + 1][j], newData[i + 2][j], className));
                    }
                }
            }

            for (let newAssignment of newAssignments) {
                let found = false;
                for (let oldAssignment of oldAssignments) {
                    if (newAssignment.equals(oldAssignment)) {
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    if (!changes[className]) {
                        changes[className] = [];
                    }
                    changes[className].push(newAssignment);
                }
            }

        }

        if (changes[className]) {
            await gsapi.spreadsheets.values.update({
                spreadsheetId: '1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0',
                range: `${className}!A15`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: data[className]
                }
            });
        }

        progress += 10;
        loadingBar.update(progress);
    };


    if (changes["ENGLISH LITERATURE AP"]) {
        let response = await gsapi.spreadsheets.values.get({
            spreadsheetId: '1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0',
            range: `ENGLISH LITERATURE AP!A16:C`
        });

        progress += 5;
        loadingBar.update(progress);

        let pts = await gsapi.spreadsheets.values.get({
            spreadsheetId: '1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0',
            range: `ENGLISH LITERATURE AP!F2:F3`
        });

        progress += 5;
        loadingBar.update(progress);

        let drop = +pts.data.values[1][0];
        let bonus = +pts.data.values[0][0];

        let recieved = response.data.values;

        let assignments = recieved.map(e => new Assignment(...e));
        let gb = new GradeBook(assignments, [], drop);

        let best = gb.permute(gb, bonus);

        progress += 10;
        loadingBar.update(progress);

        let result = [
            ["Best to Drop", "", ""],
            ["Grade with Bonus", gb.calcGrade(5), ""],
            ["Grade with Drop", best.calcGrade(0), ""],
            ["Grade with Drop and Bonus", best.calcGrade(5), ""],
            ["", "", ""],
            ["Assignment", "Earned", "Possible"],

            ...best.removed.map(e => [e.name, e.earned, e.possible])
        ]

        await gsapi.spreadsheets.values.update({
            spreadsheetId: '1oXrBcykqODQyuacMJp1GDt2H_gsFsC2NewVQV9z0or0',
            range: `ENGLISH LITERATURE AP!E10`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: result
            }
        });
    }

    if (Object.keys(changes).length > 0) {

        console.log(changes);

        let body = "";

        for (let className in changes) {
            body += className + ":\n";
            for (let assignment of changes[className]) {
                body += `${assignment.name} ${assignment.earned} / ${assignment.possible} (${assignment.getGrade().toFixed(1)}%)\n`;
            }
            body += "\n";
        }

        const mailOptions = {
            from: process.env.GMAIL_USERNAME,
            to: "trigger@applet.ifttt.com",
            subject: "Your #aspen grades have been updated",
            text: body
        }

        transporter.sendMail(mailOptions, (err, data) => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Sent!`);
            }
        });
    }

    progress = 200;
    loadingBar.update(progress);

    loadingBar.stop();

    console.log(new Date().toLocaleString("en-US", {
        timeZone: "America/New_York"
    }));



    return changes;

}

function flip(arr) {
    let repl = [];
    for (let i = 0; i < arr[0].length; i++) {
        repl[i] = []
        for (let j = 0; j < arr.length; j++) {
            repl[i][j] = arr[j][i];
        }
    }
    return repl;
}

module.exports = updateGrades;