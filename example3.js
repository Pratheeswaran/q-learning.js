var config = {
    canvas: {
        id: 'canvas',
        width: 300,
        height: 300
    },
    matrix: {
        height: 15,
        width: 15
    },
    color: {
        empty: 'white',
        intruder: 'red',
        citizen: 'blue'
    },
    reward: {
        collide: -100, //reward to stay in a place which will be occupied by and intruder
        moveToCitizen: -5, //reward to moving to an already occupied cell (with a citizen)
        moveToEmpty: -1, //reward of moving to am empty cell
        stay: 0 //reward of staying in the same cell and nothing happens
    },
    density: 0.3,
    exploration: 0.2,
    scoreId: 'score'
};

function GameBoard(config) {
    this.time = 0;
    this.matrix = []; //the representation of the world
    for (var column = 0; column < config.matrix.width; column++) {
        this.matrix.push([]);
        for (var line = 0; line < config.matrix.height; line++) {
            this.matrix[column].push(null);
        }
    }
    var canvas = document.getElementById(config.canvas.id);
    this.canvasContext = canvas.getContext('2d');
    this.fillBoard();
}

/**
 * update agent position on board
 */
GameBoard.prototype.updateAgent = function (agent) {
    var x, y;
    //clear the previous position
    if (agent.previousPosition) {
        x = agent.previousPosition.x;
        y = agent.previousPosition.y;
        this.matrix[x][y] = null;
    }
    //set the new position on the board
    x = agent.position.x;
    y = agent.position.y;
    this.matrix[x][y] = agent;
};

GameBoard.prototype.clear = function () {
    var context = this.canvasContext;
    context.clearRect(0, 0, config.canvas.width, config.canvas.height);
};

GameBoard.prototype.draw = function () {
    var dx = config.canvas.width / config.matrix.width;
    var dy = config.canvas.height / config.matrix.height;
    var radius = Math.min(dx, dy) / 2.5;
    var pi2 = Math.PI * 2;
    var context = this.canvasContext;

    for (var column = 0; column < this.matrix.length; column++) {
        for (var line = 0; line < this.matrix[0].length; line++) {
            var agent = this.matrix[column][line];
            var color = agent ? config.color[agent.mark] : config.color.empty;
            context.beginPath();
            context.arc(dx * (column + 0.5), dy * (line + 0.5), radius, 0, pi2, false);
            context.fillStyle = color;
            context.fill();
            context.lineWidth = 2;
            context.strokeStyle = '#333333';
            context.stroke();
        }
    }
};


function Intruder(config) {
    this.mark = 'intruder';
}

function Citizen(config) {
    this.mark = 'citizen';
}

/**
 * functions to set position, for citizens and intruder
 */
Intruder.prototype.setPosition = Citizen.prototype.setPosition = function (x, y) {
    this.previousPosition = this.position;
    if (!this.position) this.position = {};
    this.position.x = x;
    this.position.y = y;
};

/**
 * intruder position is predefined as a function of time
 * @param board
 * @param time
 */
Intruder.prototype.move = function (matrix, time) {
    var cols = matrix.length;
    var rows = matrix[0].length;
    var v = 0.1;
    var x = ~~(cols * 0.5 * (Math.sin(2 * v * time) + 1));
    var y = ~~(rows * 0.5 * (Math.cos(v * time) + 1));
    this.setPosition(x, y);
};


GameBoard.prototype.fillBoard = function () {
    //insert more food and poison
    this.citizens = [];
    for (var column = 0; column < this.matrix.length; column++) {
        for (var line = 0; line < this.matrix[0].length; line++) {
            if (Math.random() < config.density) {
                var citizen = new Citizen(config);
                citizen.setPosition(column, line);
                this.citizens.push(citizen);
                this.matrix[column][line] = citizen;
            }
        }
    }
    this.intruder = new Intruder(config);
    this.intruder.move(this.matrix, this.time);

};


Citizen.prototype.currentState = function (matrix) {
    //get a representation of the objects in the 3x3 square in front of the agent
    var state = [];
    var x = this.position.x;
    var y = this.position.y;
    for (var dcol = -1; dcol <= 1; dcol++) {
        for (var dline = -1; dline <= 1; dline++) {
            var line = ((y + dline) + config.matrix.height) % config.matrix.height;
            var column = ((x + dcol) + config.matrix.width) % config.matrix.width;
            state.push(matrix[column][line]);
        }
    }
    return state;
};

Citizen.prototype.currentStateString = function (matrix) {
    return this.currentState(matrix).join('');
};

GameBoard.prototype.objectAt = function (column, line) {
    return this.matrix[column][line];
};

GameBoard.prototype.randomAction = function () {
    //actions are -1,0,+1
    return ~~(Math.random() * 3) - 1;
};


var game = new GameBoard(config);

game.draw();


var learner = new QLearner();

var sid;
//= setInterval(step, 500);

function slow() {
    clearInterval(sid);
    sid = setInterval(step, 500);
}

function fast() {
    clearInterval(sid);
    sid = setInterval(step, 20);
}

function step() {
    //memorize current state

    var currentState = game.currentState();
    //get some action
    var randomAction = game.randomAction();
    //and the best action
    var action = learner.bestAction(currentState);
    //if there is no best action try to explore
    if (action === null || action === undefined || (!learner.knowsAction(currentState, randomAction) && Math.random() < game.exploration)) {
        action = randomAction;
    }
    //action is a number -1,0,+1
    action = Number(action);
    //apply the action
    game.setPosition(game.intruderPosition.column + action);
    //get next state, compute reward
    game.moveObjectsDown();
    var collidedWith = game.objectAt(game.intruderPosition.column, game.intruderPosition.line);
    var reward = game.rewardDictionary[collidedWith];

    var nextState = game.currentState();
    learner.add(currentState, nextState, reward, action);

    //make que q-learning algorithm number of iterations=10 or it could be another number
    learner.learn(10);

    game.addGreens();

    //some feedback on performance
    game.score[collidedWith]++;

    game.draw();
}

function updateSummary() {
    var summary = "<br />green==food: " + game.score[game.food];
    summary += "<br />gray=poison: " + game.score[game.poison];
    summary += "<br />poison/food: " + Math.round(100 * game.score[game.poison] / game.score[game.food]) + "%";
    document.getElementById(game.scoreId).innerHTML = summary;
}







