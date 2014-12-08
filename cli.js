#!/usr/bin/env node

var inquirer = require('inquirer');
var fs = require('fs');
var nopt = require('nopt');
var path = require('path');
var ProgressBar = require('progress');
var moment = require('moment');
var Markdown = require('./Markdown');
var awesomeClient = require('awesome-client');

var boards = {
    todo: 'To do',
    doing: 'Doing',
    done: 'Done',
    iced: 'Iced'
};

var convertGoalToInquirerChoice = function(goal) {
    return {
        name: goal.goal,
        value: goal.goal
    };
};

var createGoalBoardTester = function(board) {
    return function(goal) {
        return goal.board === board;
    };
};

var asyncCallback = function(cb, err, value) {
    process.nextTick(function() {
        cb(err, value);
    });
};

var findGoal = function(goals, goalName) {
    var goal = goals.filter(function(goal) {
        return goal.goal === goalName;
    });
    if(goal.length !== 1) {
        throw new Error('could not find unique goal');
    }
    return goal[0];
};

var markAsDoing = function(goal) {
    goal.board = boards.doing;
    if(!(goal.doing instanceof Date)) {
        goal.doing = new Date();
    }
};

var askToContinue = function(goals, valueForStartNew, cb) {
    var choices = goals.filter(createGoalBoardTester(boards.doing)).map(convertGoalToInquirerChoice);
    if(choices.length === 0) {
        return asyncCallback(cb, null, valueForStartNew);
    }
    choices.push(new inquirer.Separator(), {
        name: 'Start doing a new goal',
        value: valueForStartNew
    });
    inquirer.prompt({
        name: 'goal',
        type: 'list',
        message: 'Select a goal to continue doing',
        choices: choices
    }, function(selection) {
        if(selection.goal === null) {
            return cb(null, null);
        }
        var goal = findGoal(goals, selection.goal);
        markAsDoing(goal);
        cb(null, goal);
    });
};

var askToStart = function(goals, valueForCreateNew, cb) {
    var choices = goals.filter(createGoalBoardTester(boards.todo)).map(convertGoalToInquirerChoice);
    if(choices.length === 0) {
        return asyncCallback(cb, null, valueForCreateNew);
    }
    choices.push(new inquirer.Separator(), {
        name: 'Create a new goal',
        value: valueForCreateNew
    });
    inquirer.prompt({
        name: 'goal',
        type: 'list',
        message: 'Select a goal to start doing',
        choices: choices
    }, function(selection) {
        if(selection.goal === null) {
            return cb(null, null);
        }
        var goal = findGoal(goals, selection.goal);
        goal.pomodori = [];
        markAsDoing(goal);
        cb(null, goal);
    });
};

var askToStartNew = function(goals, cb) {
    inquirer.prompt({
        name: 'goal',
        type: 'input',
        message: 'Enter a goal'
    }, function(input) {
        var goal = {
            goal: input.goal,
            todo: new Date(),
            pomodori: []
        };
        markAsDoing(goal);
        goals.push(goal);
        cb(null, goal);
    });
};

var askForGoal = function(goals, cb) {
    var valueForStartNew = null;
    var valueForCreateNew = null;
    askToContinue(goals, valueForStartNew, function(err, goal) {
        if(err) {
            return cb(err);
        }
        if(goal === valueForStartNew) {
            askToStart(goals, valueForCreateNew, function(err, goal) {
                if(err) {
                    return cb(err);
                }
                if(goal === valueForCreateNew) {
                    askToStartNew(goals, cb);
                } else {
                    cb(null, goal);
                }
            });
        } else {
            cb(null, goal);
        }
    });
};

var progressIndicator = {
    clear: function() {
        awesomeClient('mypomodorowidget:set_markup(\'\')');
    },
    indicate: function(label) {
        awesomeClient('mypomodorowidget:set_markup(\'<span color="white">' + label + '</span>\')');
    }
};

var makePomodori = function(cb) {
    var another = function(pomodori) {
        inquirer.prompt({
            name: 'minutes',
            type: 'input',
            message: 'Enter minutes to focus on this goal'
        }, function(input) {
            var minutes = parseInt(input.minutes, 10);
            if(Number.isNaN(minutes) || minutes < 0) {
                return another(pomodori);
            }
            if(minutes === 0) {
                return cb(null, pomodori);
            }

            var tickDuration = 1000;
            var ticks = minutes * 60;
            var end = moment().add(minutes, 'minutes');

            var progress = new ProgressBar('  [:bar] :percent', {
                total: ticks,
                incomplete: ' '
            });
            var pomodoro = {
                start: new Date()
            };
            var onInterrupt = function() {
                process.removeListener('SIGINT', onInterrupt);
                onInterrupt = null;
                progress.curr = ticks;
            };
            process.addListener('SIGINT', onInterrupt);
            var timer = setInterval(function() {
                progress.tick(1);
                progressIndicator.indicate(moment.utc(end.diff(moment())).format('mm:ss'));
                if(progress.complete) {
                    if(onInterrupt) {
                        process.removeListener('SIGINT', onInterrupt);
                    }
                    progressIndicator.clear();
                    pomodoro.finish = new Date();
                    clearInterval(timer);
                    inquirer.prompt([{
                        name: 'summary',
                        type: 'input',
                        message: 'Enter pomodoro summary'
                    }, {
                        name: 'another',
                        type: 'confirm',
                        message: 'Continue'
                    }], function(input) {
                        pomodoro.summary = input.summary;
                        pomodori.push(pomodoro);
                        if(input.another) {
                            another(pomodori);
                        } else {
                            cb(null, pomodori);
                        }
                    });
                }
            }, tickDuration);
        });
    };
    another([]);
};

var save = function(converter, filename, goals, cb) {
    converter.serialize(goals, function(err, buffer) {
        if(err) {
            return cb(err);
        }
        fs.writeFile(filename, buffer.toString(), function(err) {
            if(err) {
                return cb(err);
            }
            cb();
        });
    });
};

var load = function(converter, filename, cb) {
    fs.readFile(filename, function(err, buffer) {
        if(err) {
            return fs.writeFile(filename, new Buffer(0), function(err) {
                if(err) {
                    return cb(err);
                }
                cb(null, []);
            });
        }
        converter.parse(buffer, cb);
    });
};

var main = function(filename, cb) {
    var markdown = new Markdown();
    markdown.setBoards(boards);

    progressIndicator.clear();
    load(markdown, filename, function(err, goals) {
        if(err) {
            return cb(err);
        }
        askForGoal(goals, function(err, goal) {
            if(err) {
                return cb(err);
            }
            makePomodori(function(err, pomodori) {
                goal.pomodori.push.apply(goal.pomodori, pomodori);
                var askIfIced = function(cb) {
                    inquirer.prompt([{
                        name: 'iced',
                        type: 'confirm',
                        message: 'Is this goal iced?'
                    }], function(input) {
                        if(input.iced) {
                            inquirer.prompt([{
                                name: 'cause',
                                type: 'input',
                                message: 'Enter the cause'
                            }], function(input) {
                                goal.iced = new Date();
                                goal.cause = input.cause;
                                goal.board = boards.iced;
                                cb();
                            });
                        } else {
                            cb();
                        }
                    });
                };
                var askIfDone = function(cb) {
                    inquirer.prompt([{
                        name: 'done',
                        type: 'confirm',
                        message: 'Is this goal done?'
                    }], function(input) {
                        if(input.done) {
                            goal.done = new Date();
                            goal.board = boards.done;
                            cb();
                        } else {
                            askIfIced(cb);
                        }
                    });
                };
                askIfDone(function(err) {
                    if(err) {
                        return cb(err);
                    }
                    save(markdown, filename, goals, cb);
                });
            });
        });
    });
};

var printError = function(err) {
    if(err) {
        console.log(err.stack);
        if(err.cause) {
            console.log('Caused by:');
            printError(err.cause);
        }
    }
};

var options = nopt({
    file: path
}, {}, process.argv, 2);

if(typeof options.file !== 'string') {
    console.log('File not specified');
    process.exit(1);
}

main(options.file, printError);
