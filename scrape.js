const puppeteer = require('puppeteer');

async function scrape(username, password, loadingBar, progress) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.goto("https://studentdata.k12.somerville.ma.us/x2sis/logon.do");

    await page.type('#username', username);
    await page.type('#password', password);

    await page.click('#logonButton');
    await page.waitFor('#layoutHeader > table > tbody > tr > td:nth-child(5) > a'); //Academics button
    await page.click('#layoutHeader > table > tbody > tr > td:nth-child(5) > a');

    let allAssignments = {};
    await page.waitFor('#dataGrid > table > tbody > tr') //table rows
    let tableRows = (await page.$$('#dataGrid > table > tbody > tr')) //one for each class + the header

    for (let classId = 0; classId < tableRows.length - 1; classId++) {
        await page.waitFor('#dataGrid > table > tbody > tr:nth-child(4) > td:nth-child(8)'); //wait for grades to appear

        let classNameElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${classId + 2}) > td:nth-child(2) > a`);
        let classNameParam = await classNameElt.getProperty('innerText');
        let className = await classNameParam.jsonValue();

        const gradeElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${classId + 2}) > td:nth-child(8)`);
        const gradeProp = await gradeElt.getProperty('innerText');
        const gradeText = await gradeProp.jsonValue();

        let gradeValue = /\d+\.?\d*/.exec(gradeText); //find numbers with optional decimal
        allAssignments[className] = {
            grade: gradeValue ? gradeValue[0] : ""
        }

        await page.click(`#dataGrid > table > tbody > tr:nth-child(${classId + 2}) > td:nth-child(2) > a`);
        await page.waitFor('#layoutVerticalTabs > table > tbody > tr:nth-child(2) > td > div > a') //wait for assignments button to load
        let weights = {};
        let categoryGrades = {}

        let outerTable = await page.$$('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > table:nth-child(6) > tbody > tr:nth-child(3) > td > table > tbody > tr');

        let tableRows = ((await page.$$(`#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > table:nth-child(6) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(${outerTable.length - 2}) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td > div > table > tbody > tr`)).length - 3) / 2;

        for (let i = 0; i < tableRows; i++) {
            let elt, prop, category;

            elt = await page.$(`#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > table:nth-child(6) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(${outerTable.length - 2}) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td > div > table > tbody > tr:nth-child(${i * 2 + 2}) > td:nth-child(1)`);
            if (!elt) break;
            prop = await elt.getProperty('innerText');
            category = await prop.jsonValue();
            weights[category] = [];
            categoryGrades[category] = [];

            for (let j = 2; j < 6; j++) {//loop through quarters of the year (+2 because category takes up 2)

                let weightElt = await page.$(`#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > table:nth-child(6) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(${outerTable.length - 2}) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td > div > table > tbody > tr:nth-child(${i * 2 + 2}) > td:nth-child(${j + 1})`);
                let weightProp = await weightElt.getProperty('innerText');

                let gradeElt = await page.$(`#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > table:nth-child(6) > tbody > tr:nth-child(3) > td > table > tbody > tr:nth-child(${outerTable.length - 2}) > td:nth-child(2) > table > tbody > tr:nth-child(3) > td > div > table > tbody > tr:nth-child(${i * 2 + 3}) > td:nth-child(${j})`);

                let gradeProp = await gradeElt.getProperty('innerText');
                let gradeText = await gradeProp.jsonValue();

                let gradeValue = /\d+\.?\d*/.exec(gradeText); //find numbers with optional decimal
                weights[category].push(await weightProp.jsonValue()); //add  the weights for each quarter into the array so we can get the one for the current quarter later
                categoryGrades[category].push(gradeValue ? gradeValue[0] : "");
            }
        }

        await page.click('#layoutVerticalTabs > table > tbody > tr:nth-child(2) > td > div > a');
        await page.waitFor('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > center > table > tbody > tr > td > div > table > tbody > tr:nth-child(2) > td.detailValue > select');

        let quarterDropDown = await page.$('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > center > table > tbody > tr > td > div > table > tbody > tr:nth-child(3) > td.detailValue > select');
        let currentQuarter = (/selected">T(\d)/).exec(await quarterDropDown.getProperty('innerHTML'))[1] - 1; // Arrays start at zero and also makes it a number

        let assignments = [
            []
        ];

        if (!className.match("ENGLISH")) {
            let catId = 0;

            for (let category in weights) {
                page.waitFor('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > center > table > tbody > tr > td > div > table > tbody > tr:nth-child(2) > td.detailValue > select');
                let categoryDropDown = await page.$('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > center > table > tbody > tr > td > div > table > tbody > tr:nth-child(2) > td.detailValue > select');
                let re = new RegExp(`value="(.*?)">${category}`);
                let dropValue = re.exec(await categoryDropDown.getProperty('innerHTML'))[1];

                await page.select('#contentArea > table:nth-child(2) > tbody > tr:nth-child(1) > td.contentContainer > center > table > tbody > tr > td > div > table > tbody > tr:nth-child(2) > td.detailValue > select', dropValue);
                await page.waitFor(`#dataGrid`);
                let rows = await page.$$('#dataGrid > table > tbody > tr');
                assignments[0][catId * 3] = category;
                assignments[0][catId * 3 + 1] = weights[category][currentQuarter];

                for (let i = 1; i < rows.length; i++) {
                    assignments[i] = assignments[i] || []; //if no rows, add one

                    const nameElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${i + 1}) > td:nth-child(2)`);

                    if (!nameElt) break;

                    const nameProp = await nameElt.getProperty('innerText');
                    assignments[i][catId * 3] = await nameProp.jsonValue();

                    const scoreElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${i + 1}) > td:nth-child(5)`);
                    const scoreProp = await scoreElt.getProperty('innerText');
                    const scoreTxt = await scoreProp.jsonValue();
                    let scoreMatch = /(\d+\.?\d*) \/ (\d+\.?\d*)/.exec(scoreTxt); // matches x / y with decimals

                    if (scoreMatch) {
                        assignments[i][catId * 3 + 1] = scoreMatch[1];
                        assignments[i][catId * 3 + 2] = scoreMatch[2];
                    } else {
                        assignments[i][catId * 3 + 1] = 'Ungraded';
                        assignments[i][catId * 3 + 2] = 'Ungraded';
                    }


                }

                assignments[0][catId * 3 + 2] = categoryGrades[category][currentQuarter];

                catId++;
            }
        } else {

            let rows = await page.$$('#dataGrid > table > tbody > tr');
            assignments[0] = ["All", "Earned", "Possible"];
            for (let i = 1; i < rows.length; i++) {
                assignments[i] = assignments[i] || []; //if no rows, add one

                const nameElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${i + 1}) > td:nth-child(2)`);

                if (!nameElt) break;

                const nameProp = await nameElt.getProperty('innerText');
                assignments[i][0] = await nameProp.jsonValue();

                const scoreElt = await page.$(`#dataGrid > table > tbody > tr:nth-child(${i + 1}) > td:nth-child(5)`);
                const scoreProp = await scoreElt.getProperty('innerText');
                const scoreTxt = await scoreProp.jsonValue();
                let scoreMatch = /(\d+\.?\d*) \/ (\d+\.?\d*)/.exec(scoreTxt); // matches x / y with decimals

                if (scoreMatch) {
                    assignments[i][1] = scoreMatch[1];
                    assignments[i][2] = scoreMatch[2];
                } else {
                    assignments[i][1] = 'Ungraded';
                    assignments[i][2] = 'Ungraded';
                }

            }
        }

        allAssignments[className].assignments = assignments;
        await page.click('body > form > table > tbody > tr:nth-child(2) > td > table > tbody > tr > td.navTabBackgroundSelected > a');
        progress += 5;
        loadingBar.update(progress);

    }

    await browser.close();

    return allAssignments;

}

module.exports = scrape;