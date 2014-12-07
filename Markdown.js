var chronoNode = require('chrono-node');
var assert = require('assert');

var parseDate = function(dateString) {
    var date = chronoNode.parseDate(dateString);
    if(date instanceof Date) {
        return date;
    } else {
        throw new Error('cannot parse date: ' + dateString);
    }
};

var assertValidGoal = function(goal, boards) {
    assert(typeof goal.goal === 'string');
    assert(goal.todo instanceof Date);
    assert(Object.keys(boards).map(function(board) {
        return boards[board];
    }).indexOf(goal.board) >= 0);
    assert(Array.isArray(goal.pomodori));
    if(goal.board === boards.doing) {
        assert(goal.doing instanceof Date);
        assert(typeof goal.done === 'undefined');
        assert(typeof goal.iced === 'undefined');
        assert(typeof goal.cause === 'undefined');
    } else if(goal.board === boards.done) {
        assert(goal.doing instanceof Date);
        assert(goal.done instanceof Date);
        assert(typeof goal.iced === 'undefined');
        assert(typeof goal.cause === 'undefined');
    } else if(goal.board === boards.iced) {
        assert(goal.iced instanceof Date);
        assert(typeof goal.cause === 'string');
    }
};

function Markdown() {
}

Markdown.prototype._boards = null;

Markdown.prototype.setBoards = function(boards) {
    this._boards = boards;
};

Markdown.prototype.parse = function(buffer, cb) {
    setTimeout(function() {
        var goal = null;
        try {
            var lines = buffer.toString().split('\n').map(function(line) {
                return line.trim();
            });
            var goals = [];
            var board;
            lines.forEach(function(line) {
                if(line.charAt(0) === '#') {
                    board = line.substr(1).trim();
                } else if(line === '') {
                    if(goal !== null) {
                        assertValidGoal(goal, this._boards);
                        goals.push(goal);
                        goal = null;
                    }
                } else {
                    line = line.split(':');
                    var key = line.shift().trim().toLowerCase();
                    var value = line.join(':').trim();
                    if(goal === null) {
                        goal = {
                            board: board,
                            pomodori: []
                        };
                    }
                    if(key === 'goal') {
                        goal.goal = value;
                    } else if(key === 'to do') {
                        goal.todo = parseDate(value);
                    } else if(key === 'doing') {
                        goal.doing = parseDate(value);
                    } else if(key === 'done') {
                        goal.done = parseDate(value);
                    } else if(key === 'iced') {
                        goal.iced = parseDate(value);
                    } else if(key === 'cause') {
                        goal.cause = value;
                    } else if(key === 'log') {
                        value = value.split(' - ');
                        var pomodoro = {
                        };
                        pomodoro.start = parseDate(value.shift());
                        pomodoro.finish = parseDate(value.shift());
                        pomodoro.summary = value.join(' - ');
                        goal.pomodori.push(pomodoro);
                    } else {
                        throw new Error('unknown key ' + key);
                    }
                }
            }.bind(this));
            cb(null, goals);
        } catch(err) {
            var err2 = new Error('Failed to parse goal (current was ' + JSON.stringify(goal) + ')');
            err2.cause = err;
            cb(err2);
        }
    }.bind(this));
};

var serializePomodori = function(pomodori) {
    return Buffer.concat(pomodori.map(function(pomodoro) {
        return new Buffer('    Log:   ' + pomodoro.start.toString() + ' - ' + pomodoro.finish.toString() + ' - ' + pomodoro.summary + '\n');
    }));
};

var serializeGoals = function(boards, goals) {
    return Buffer.concat(goals.map(function(goal) {
        assertValidGoal(goal, boards);
        var buffers = [
            new Buffer('    Goal:  ' + goal.goal + '\n'),
            new Buffer('    To do: ' + goal.todo.toString() + '\n')
        ];
        if(goal.doing instanceof Date) {
            buffers.push(new Buffer('    Doing: ' + goal.doing.toString() + '\n'));
            buffers.push(serializePomodori(goal.pomodori));
        }
        if(goal.done instanceof Date) {
            buffers.push(new Buffer('    Done:  ' + goal.done.toString() + '\n'));
        }
        if(goal.iced instanceof Date) {
            buffers.push(new Buffer('    Iced:  ' + goal.iced.toString() + '\n'));
            buffers.push(new Buffer('    Cause: ' + goal.cause + '\n'));
        }
        buffers.push(new Buffer('\n'));
        return Buffer.concat(buffers);
    }));
};

Markdown.prototype.serialize = function(goals, cb) {
    setTimeout(function() {
        cb(null, Buffer.concat([new Buffer('# ' + this._boards.todo + '\n\n'), serializeGoals(this._boards, goals.filter(function(goal) {
            return goal.board === this._boards.todo;
        }.bind(this))), new Buffer('# ' + this._boards.doing + '\n\n'), serializeGoals(this._boards, goals.filter(function(goal) {
            return goal.board === this._boards.doing;
        }.bind(this))), new Buffer('# ' + this._boards.done + '\n\n'), serializeGoals(this._boards, goals.filter(function(goal) {
            return goal.board === this._boards.done;
        }.bind(this))), new Buffer('# ' + this._boards.iced + '\n\n'), serializeGoals(this._boards, goals.filter(function(goal) {
            return goal.board === this._boards.iced;
        }.bind(this)))]));
    }.bind(this));
};

module.exports = Markdown;
