"use strict";

let fs = require('fs');
const Query = require('./query');

module.exports = class Ranking {

    constructor (season, week, teamScores) {
        this.season = season;
        this.week = week;
        this.teamScores = teamScores;
        this.ratings = {};
    
        this.teamScores.forEach(team => {
            this.ratings[team.id] = {
                rating: 0.0,
                id: team.id,
                weeks: []
            };
        });

        this.query = new Query();
    }

    build() {
        let stop = false;
        let i = 0;

        while (!stop) {
            // copy object
            let previousRatings = JSON.parse(JSON.stringify(this.ratings));
            
            this.teamScores.forEach(team => {
                team.scores.forEach((score, week) => {
                    week++;
                    if (score) {
                        this.calculate(team, score, week);
                    }
                });
            });

            i++;

            // compare new set of ratings to previous
            stop = this.compareRatings(this.ratings, previousRatings);
        }

        console.log(`Iterations needed to compute rankings: ${i}`)

        return this.ratings;
    }

    calculate(team, score, week) {
        let valueOfWin = 0.0;
        let margin = Math.abs(score.score - score.opposingScore);
        let marginValue = Math.max(margin / (margin + 120), 0.2);
        let opponent = score.opposingTeam;
        let win = false;
        let qualityOfOpponent = this.getQualityOfOpponent(opponent);
        let qualityOfOpponentValue = this.round(qualityOfOpponent * 0.3);

        // win
        if (score.score > score.opposingScore) {
            valueOfWin = 0.5;
            win = true;
        }
        // loss
        else {
            marginValue = (0.2 - marginValue);
        }
        marginValue = this.round(marginValue);

        valueOfWin = valueOfWin + marginValue + qualityOfOpponentValue;
        valueOfWin = this.round(valueOfWin);

        this.ratings[team.id].weeks[week-1] = {
            v: valueOfWin,
            w: win,
            s: score.score,
            os: score.opposingScore,
            mv: marginValue,
            o: opponent,
            qoo: qualityOfOpponent,
            qoov: qualityOfOpponentValue
        };

        //roll value of this win into the rating average
        this.ratings[team.id].rating = this.round(((this.ratings[team.id].rating * (week - 1)) + valueOfWin) / week);
    }

    store(overwrite = false) {
        // check if ratings already exist for this week
        if (!overwrite && this.query.ratingsExist(this.season, this.week)) {
            return false;
        }

        // clear existing ratings for this week
        this.query.clearRatings(this.season, this.week);

        // store each rating
        Object.keys(this.ratings).forEach((key) => {
            this.query.insertRating(this.season, this.week, this.ratings[key]);
        });

        // create ranking file
        let rankings = this.query.getRankings(this.season, this.week);
        // parse out json string column
        rankings = rankings.map(ranking => JSON.parse(ranking.json));

        fs.writeFileSync(`public/rankings/${this.season}.${this.week}.json`, JSON.stringify(rankings));

        this.createIndexFile();
    }

    compareRatings(current, previous) {
        return JSON.stringify(current) === JSON.stringify(previous);
    }

    round(number) {
        return Math.round(number * 10000) / 10000;
    }

    getQualityOfOpponent(opponent) {
        let qoo = 0.0;
        if (this.ratings[opponent] && !isNaN(this.ratings[opponent].rating)) {
            qoo = this.ratings[opponent].rating;
        }

        return this.round(qoo);
    }

    createIndexFile() {
        let files = fs.readdirSync('public/rankings/').filter(file => {
            return file !== '.DS_Store' && file !== 'index.json';
        });
    
        // format teams so id is the index
        let teams = this.query.getTeams();
        let mappedTeams = {};
        for (const team of teams) {
            mappedTeams[team.id] = {'name': team.name, 'mascot': team.mascot};
        }
    
        let data = {files, 'teams': mappedTeams};
        fs.writeFileSync('public/rankings/index.json', JSON.stringify(data));
    }
}

