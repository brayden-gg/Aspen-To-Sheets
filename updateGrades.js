const { google } = require('googleapis');
const cliProgress = require('cli-progress'); // loading bar because why not
const fetch = require('node-fetch')
const keys = require('./keys.json');

const { Assignment, GradeBook } = require('./assignment.js');
const getChangesForClass = require('./getChangesForClass.js')
const scrape = require('./scrape.js');


async function updateGrades(username, password, trigger_url, spreadsheetId, client_email, private_key) {
    let result;

    const client = new google.auth.JWT(
        client_email,
        null,
        private_key,
        ['https://www.googleapis.com/auth/spreadsheets']
    );

    client.authorize(async (err, tokens) => {
        if (err) {
            console.log(err);
            return;
        }

        result = await gsrun(client, username, password, trigger_url, spreadsheetId);
    });

    return result;

}

async function gsrun(client, username, password, trigger_url, spreadsheetId) {

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

        if (data[className].assignments.reduce((p, c) => p + c.length, 0) == 0) continue; //flattened assignments array is empty


        let newData = transpose(data[className].assignments); //because I can't spell transpose consistently
        let original;

        try { //see if sheets exist
            original = await gsapi.spreadsheets.values.get({
                spreadsheetId,
                range: `${className}!A15:${String.fromCharCode(Math.max(newData.length, 1) + 64)}`
            });
        } catch (err) { // make new sheets for this class
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


            if (className.match("ENGLISH")) {
                let cells = [
                    [`Current Grade`, '', `Points Earned`, `=SUM(B16:B)`, `Total Points`, `=SUM(C16:C)`],
                    [`Grade With Bonus`, `=IF(AND(F2>0, ISNUMBER(F2)),(F1 + F2)/H1 * 100, "")`, `Bonus Points`, 'OPTIONAL'],
                    [`Bonus and Drop`, `=IF(AND(F3>0, ISNUMBER(F3)), MAX(F13,I13,K13), "")`, `Drop Number`, 'OPTIONAL GRADE DROP']
                ]

                await gsapi.spreadsheets.values.update({
                    spreadsheetId,
                    range: `${className}!A1`,
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: cells
                    }
                });
            }

        }


        await gsapi.spreadsheets.values.update({
            spreadsheetId,
            range: `${className}!A1`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: [
                    ["Current Grade", data[className].grade]
                ]
            }
        });


        let oldData = [];

        if (newData.length > 0 && original && original.data.values) {
            oldData = transpose(original.data.values);
        }

        let updatedAssignments = getChangesForClass(className, oldData, newData)

        if (updatedAssignments.length > 0) {
            changes[className] = {
                assignments: updatedAssignments,
                grade: data[className].grade
            }
        }

        //update assignments
        await gsapi.spreadsheets.values.update({
            spreadsheetId,
            range: `${className}!A15`,
            valueInputOption: 'USER_ENTERED',
            resource: {
                values: data[className].assignments
            }
        });

        progress += 10;
        loadingBar.update(progress);
    }

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
            range: `${english}!D2:D3`
        });

        progress += 5;
        loadingBar.update(progress);

        let drop = +pts.data.values[1] && +pts.data.values[1][0];
        let bonus = +pts.data.values[0] && +pts.data.values[0][0];

        let recieved = response.data.values;

        if (drop) {

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
    }

    let count = 0;

    if (Object.keys(changes).length > 0) {

        let text = "";


        for (let className in changes) {
            text += `${className} (${changes[className].grade})\n`;
            for (let assignment of changes[className].assignments) {
                text += `${assignment.name} ${assignment.earned} / ${assignment.possible} (${assignment.getGrade().toFixed(1)}%)\n`;
                count++;
            }
            text += "\n";
        }
        await fetch(trigger_url, { //send changes to IFTTT applet via POST request
            method: 'post',
            body: JSON.stringify({ value1: text }),
            headers: { 'Content-Type': 'application/json' },
        })

    }

    progress = 200;
    loadingBar.update(progress);

    loadingBar.stop();

    console.log(`${count} changes at ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} by user ${username}`);

    return changes;

}

function transpose(arr) {
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