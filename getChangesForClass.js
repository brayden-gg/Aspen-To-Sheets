const { Assignment, GradeBook } = require('./assignment.js');

function getChangesForClass(className, oldData, newData) {
    let updated = [];

    if (newData.length > 0) {

        let oldAssignments = [];
        let newAssignments = [];


        for (let i = 0; i + 2 < oldData.length; i += 3) {
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
                updated.push(newAssignment);
            }
        }

    }

    return updated;
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

module.exports = getChangesForClass