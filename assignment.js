class Assignment {
    constructor(name, earned, possible, className) {
        this.name = name;
        this.earned = earned;
        this.possible = possible;
        this.className = className;
    }

    getGrade() {
        return 100 * this.earned / this.possible;
    }

    equals(other) {
        if (isNaN(this.earned) || isNaN(other.earned)) {
            return this.name == other.name && this.earned == other.earned && this.possible == other.possible;
        }
        return this.name == other.name && +this.earned == +other.earned && +this.possible == +other.possible;
    }

    copy() {
        return new Assignment(this.name, this.earned, this.possible);
    }

    print() {
        console.log(`${this.name}: ${this.earned} / ${this.possible}`);
    }

    toArray() {
        return [this.name, this.earned, this.possible];
    }
}

class GradeBook {
    constructor(assignments, removed, MAX_REMOVABLE) {
        this.assignments = assignments;
        this.removed = removed || [];
        this.children = [];
        this.MAX_REMOVABLE = MAX_REMOVABLE;
    }

    permute(best, bonus) {

        best = this.calcGrade(bonus) > best.calcGrade(bonus) ? this : best;

        for (let i = 0; i < this.assignments.length; i++) {

            let child = new GradeBook(this.assignments.slice(), [], this.MAX_REMOVABLE);

            child.removed = [child.assignments.splice(i, 1)[0], ...this.removed];

            if (child.pointsRemoved() <= this.MAX_REMOVABLE && child.assignments.length !== 0) {
                best = child.permute(best, bonus);
                this.children[i] = child;
            }

        }

        return best;

    }


    pointsRemoved() {
        if (this.removed.length == 0) return 0;

        return this.removed.reduce((p, c) => p + c.possible, 0);
    }

    equals(other) {
        if (this.removed.length !== other.removed.length) {
            return false;
        }
        for (let i = 0; i < this.assignments.length; i++) {
            if (!this.assignments[i].equals(other.assignments[i])) {
                return false;
            }
        }
        return true;
    }

    calcGrade(bonus) {
        bonus = bonus || 0;
        return 100 * (this.assignments.reduce((p, c) => p + (isNaN(c.earned) ? 0 : +c.earned, 0)) + bonus) / this.assignments.reduce((p, c) => p + (isNaN(c.possible) ? 0 : +c.possible), 0);
    }



    print() {
        console.log('----');

        this.assignments.forEach(e => {
            e.print()
        });
        console.log('----')
    }
    printRemoved() {
        console.log('----');

        this.removed.forEach(e => {
            e.print()
        });

        console.log('----')
    }
}

module.exports = {
    Assignment,
    GradeBook
};