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



const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USERNAME,
        pass: process.env.GMAIL_PASSWORD
    },
});

async function updateGrades(username, password, email_address, spreadsheetId) {
    let result;

    const client = new google.auth.JWT(
        keys.client_email,
        null,
        keys.private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );

    client.authorize(async (err, tokens) => {
        if (err) {
            console.log(err);
            return;
        }

        result = await gsrun(client, username, password, email_address, spreadsheetId);
    });

    return result;

}

async function gsrun(client, username, password, email_address, spreadsheetId) {

    const gsapi = google.sheets({
        version: 'v4',
        auth: client,
    });

    const loadingBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    let progress = 0;

    loadingBar.start(200, 0);


    let data = await scrape(username, password, loadingBar, progress);

    progress = 100;
    loadingBar.update(progress);

    let changes = {};

    for (let className in data) {

        let newData = flip(data[className]); //because I can't spell transpose consistently
        let original;

        try {

            original = await gsapi.spreadsheets.values.get({
                spreadsheetId,
                range: `${className}!A15:${String.fromCharCode(Math.max(newData.length, 1) + 64)}`
            });

        } catch (err) {

            await gsapi.spreadsheets.batchUpdate({
                spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: className
                            }
                        }
                    }],
                },
                auth: client,
            });

            if (!className.match("ENGLISH")) {
                let numerator = []
                let denominator = [];
                for (let i = 0; i < data[className][0].length; i += 3) {
                    numerator.push(`IFERROR(SUM(${String.fromCharCode(i + 66)}16: ${String.fromCharCode(i + 66)}) / SUM(${String.fromCharCode(i + 67)}16: ${String.fromCharCode(i + 67)}), 0) * ${String.fromCharCode(i + 66)}15`);
                    denominator.push(`IF(LEN(${String.fromCharCode(i + 66)}16), ${String.fromCharCode(i + 66)}15, 0)`);
                }

                let formula = `=IFERROR(100 * (${numerator.join(" + ")})/(${denominator.join(" + ")}), "")`

                await gsapi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${className}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [
                            ["Current Grade", formula]
                        ]
                    }
                });
            } else {
                let cells = [
                    [`Current Grade`, `=IFERROR(F1/H1 * 100, "")`, `Points Earned`, `=SUM(B:B)`, `Total Points`, `=SUM(C:C)`],
                    [`Grade With Bonus`, `=IF(AND(F2>0, ISNUMBER(F2)),(F1 + F2)/H1 * 100, "")`, `Bonus Points`, `OPTIONAL`],
                    [`Bonus and Drop`, `=IF(AND(F3>0, ISNUMBER(F3)), MAX(F13,I13,K13), "")`, `Drop Number`, `OPTIONAL`]
                ]
                await gsapi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${className}!C1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: cells
                    }
                });
            }
        }


        if (newData.length > 0) {
            let oldData = [];

            if (original && original.data.values) {
                oldData = flip(original.data.values);
            }


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
                spreadsheetId,
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

    let classNames = Object.keys(data);
    let english = classNames.filter((e) => e.indexOf("ENGLISH") !== -1)[0];


    if (changes[english]) {
        let response = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range: `${english}!A16:C`
        });

        progress += 5;
        loadingBar.update(progress);

        let pts = await gsapi.spreadsheets.values.get({
            spreadsheetId,
            range: `${english}!F2:F3`
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
            ["Grade with Bonus", gb.calcGrade(bonus), ""],
            ["Grade with Drop", best.calcGrade(0), ""],
            ["Grade with Drop and Bonus", best.calcGrade(bonus), ""],
            ["", "", ""],
            ["Assignment", "Earned", "Possible"],

            ...best.removed.map(e => [e.name, e.earned, e.possible])
        ]

        await gsapi.spreadsheets.values.update({
            spreadsheetId,
            range: `${english}!E10`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: result
            }
        });
    }

    if (Object.keys(changes).length > 0) {

        let body = "";
        let count = 0;

        for (let className in changes) {
            body += className + ":\n";
            for (let assignment of changes[className]) {
                body += `${assignment.name} ${assignment.earned} / ${assignment.possible} (${assignment.getGrade().toFixed(1)}%)\n`;
                count++;
            }
            body += "\n";
        }

        const mailOptions = {
            from: process.env.GMAIL_USERNAME,
            to: email_address,
            subject: "Your #aspen grades have been updated",
            text: body
        }

        transporter.sendMail(mailOptions, (err, data) => {
            if (err) {
                console.log(err);
            } else {
                console.log(`Sent ${count} changes!`);
            }
        });
    }

    progress = 200;
    loadingBar.update(progress);

    loadingBar.stop();

    console.log(new Date().toLocaleString("en-US", {
        timeZone: "America/New_York"
    }), username);

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