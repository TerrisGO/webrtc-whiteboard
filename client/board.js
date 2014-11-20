var Canvas = require('./canvas');

module.exports = Board;

function Board () {
  var self = this;
  this.canvases = [];
  this.currentCanvasNum = 0;
}

Board.prototype.addCanvas = function(canvas, cb) {
  this.canvases.push(canvas);
  if (cb !== undefined) cb(canvas.state)
  localStorage.setItem('boardSize', this.canvases.length);
}

Board.prototype.loadBoard = function(cb) {
  console.log("Loading board");
  var boardSize = localStorage.getItem('boardSize');
  this.currentCanvasNum = 0;
  if (boardSize > 0) {
    console.log("from ls");
    this.loadCanvases(boardSize, cb)
  } else {
    var canvas = new Canvas('canvas0');
    this.addCanvas(canvas, cb);
  }
}

Board.prototype.loadCanvases  = function(boardSize, cb) {
  for (i=1; i <= boardSize; i++) {
    var canvasNum = 'canvas' + i;
    var canvasState = localStorage.getItem(canvasNum);
    var canvas = new Canvas(canvasNum, JSON.parse(canvasState));
    this.addCanvas(canvas);
    if (i === parseInt(boardSize)) {
      cb()
    }
  };
}

Board.prototype.nextCanvas = function(cb) {
  if (this.currentCanvasNum === this.canvases.length-1) {
    this.currentCanvasNum = 0;
  } else {
    this.currentCanvasNum++;
  }
  cb();
}

Board.prototype.currentCanvas = function() {
  return this.canvases[this.currentCanvasNum]
};
