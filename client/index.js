var Client = require('bittorrent-client')
var concat = require('concat-stream')
var dragDrop = require('drag-drop/buffer')
var hat = require('hat')
var once = require('once')
var stream = require('stream')
var through = require('through')
var Tracker = require('webtorrent-tracker')
var Board = require('./board');
var Canvas = require('./canvas');

// prompt user for their name
var username
while (!(username = window.prompt('What is your name?'))) {}
if (!username) username = 'No Name'

// pick random stroke color
var color = 'rgb(' + hat(8, 10) + ',' + hat(8, 10) + ',' + hat(8, 10) + ')'

var currentPathId = null
// var board.currentCanvas.state = {}
var board = new Board;
var peers = []
var peerId = new Buffer(hat(160), 'hex')

var torrentData = {}
var client = new Client({ peerId: peerId })

// create canvas
var canvas = document.createElement('canvas')
var ctx = canvas.getContext('2d')
document.body.appendChild(canvas)

// setup button listeners
document.getElementById('new-canvas').addEventListener('click', function(e) {
  console.log("new canvas");
  board.addCanvas(null, redraw);
});

document.getElementById('next').addEventListener('click', function(e) {
  console.log("next canvas");
  board.nextCanvas(redraw);
})

document.getElementById('prev').addEventListener('click', function(e) {
  console.log("next canvas");
  board.previousCanvas(redraw);
})

// set canvas settings and size
setupCanvas()
board.loadBoard(redraw);
window.addEventListener('resize', function() {
  setupCanvas()
  redraw()
});

function setupCanvas () {
  // calculate scale factor for retina displays
  var devicePixelRatio = window.devicePixelRatio || 1
  var backingStoreRatio = ctx.webkitBackingStorePixelRatio ||
    ctx.mozBackingStorePixelRatio ||
    ctx.msBackingStorePixelRatio ||
    ctx.oBackingStorePixelRatio ||
    ctx.backingStorePixelRatio || 1
  var ratio = devicePixelRatio / backingStoreRatio

  // set canvas width and scale factor
  canvas.width = window.innerWidth * ratio
  canvas.height = window.innerHeight * ratio
  canvas.style.width = window.innerWidth + 'px'
  canvas.style.height = window.innerHeight + 'px'
  ctx.scale(ratio, ratio)

  // set stroke options
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.lineWidth = 5

  // set font options
  ctx.fillStyle = 'rgb(255,0,0)'
  ctx.font ='16px sans-serif'
}

function redraw () {
  console.log("redrawing");
  var state = board.currentCanvas().state
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Draw images from state
  if (state.images) {
    Object.keys(state['images']).forEach(function(hashId) {
      var imgData = state['images'][hashId]
      var imgBuffer = new Uint8Array(imgData.buffer.data);
      bufToImage(imgBuffer, function (img) {
        ctx.drawImage(
          img,
          imgData.pos.x - (imgData.width / 4), imgData.pos.y - (imgData.height / 4),
          imgData.width / 2, imgData.height / 2
        )
      })
    })
  }

  // draw the current canvas state
  Object.keys(state)
    .filter(function(key) {
      return key !== 'images' && key !== 'dragging';
    }).forEach(function (id) {
    var data = state[id]
    // draw paths
    if (data.pts) {
      ctx.beginPath()
      ctx.strokeStyle = data.color
      data.pts.forEach(function (point, i) {
        if (i === 0) ctx.moveTo(point.x, point.y)
        else ctx.lineTo(point.x, point.y)
      })
      ctx.stroke()
    }
  })

  // draw usernames
  peers.concat({ color: color, username: username })
    .forEach(function (peer, i) {
      if (!peer.username) return
      ctx.fillStyle = peer.color
      ctx.fillText(peer.username, 20, window.innerHeight - 20 - (i * 20))
    })
}

function broadcast (obj) {
  peers.forEach(function (peer) {
    peer.send(obj)
  })
}

canvas.addEventListener('mousedown', onDown)
canvas.addEventListener('touchstart', onDown)

function onDown (e) {
  console.log(board);
  e.preventDefault()
  var x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageX) || 0
  var y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageY) || 0
  if(e.shiftKey) {
    // Check if the click is in an image boundary 
    Object.keys(board.currentCanvas().state.images).forEach(function(imgKey) {
      var img = board.currentCanvas().state.images[imgKey]
      var effectiveX = img.pos.x-(img.width / 4);
      var effectiveY = img.pos.y-(img.height / 4);
      var inXaxis = x >= effectiveX && x <= effectiveX+(img.width/2)
      var inYaxis = y >= effectiveY && y <= effectiveY+(img.height/2)
      if(inXaxis && inYaxis) {
        board.currentCanvas().state.dragging = imgKey;
        redraw();
      }
    })   
  } else {
    currentPathId = hat(80)
    var p1 = { x: x, y: y }
    var p2 = {
      x: x + 0.001,
      y: y + 0.001
    } // paint point on click

    board.currentCanvas().state[currentPathId] = { color: color, pts: [ p1, p2 ] }
    board.currentCanvas().saveState();

    broadcast({ i: currentPathId, pt: p1, color: color })
    broadcast({ i: currentPathId, pt: p2 })
    redraw()
  }
}

document.body.addEventListener('mouseup', onUp)
document.body.addEventListener('touchend', onUp)

function onUp () {
  currentPathId = null;
  board.currentCanvas().state.dragging = null;
}

canvas.addEventListener('mousemove', onMove)
canvas.addEventListener('touchmove', onMove)

function onMove (e) {
  var x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageX) || 0
  var y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageY) || 0
  if(e.shiftKey && board.currentCanvas().state.dragging) {
    var img = board.currentCanvas().state.images[board.currentCanvas().state.dragging];
    img.pos.x = x;
    img.pos.y = y;
    redraw();
  } else {
    if (currentPathId) {
      console.log(currentPathId);
      var pt = { x: x, y: y }

      board.currentCanvas().state[currentPathId].pts.push(pt)
      board.currentCanvas().saveState();
      broadcast({ i: currentPathId, pt: pt })
      redraw()
    }
  }
}

var tracker = new Tracker(peerId, {
  announce: [ 'wss://tracker.webtorrent.io' ],
  infoHash: new Buffer(20) // all zeroes in the browser
})

tracker.start()

tracker.on('peer', function (peer) {
  peers.push(peer)
  peer.send({ username: username, color: color, state: board.currentCanvas().state })
  peer.on('message', onMessage.bind(undefined, peer))

  function onClose () {
    peers.splice(peers.indexOf(peer), 1)
    redraw()
  }

  peer.on('close', onClose)
  peer.on('error', onClose)
})

function onMessage (peer, data) {
  if (data.username) {
    peer.username = data.username
    peer.color = data.color
    redraw()
  }

  if (data.state) {
    Object.keys(data.state)
      .filter(function (id) {
        return !board.currentCanvas()[id]
      })
      .forEach(function (id) {
        state[id] = data.state[id]
      })
    redraw()
  }

  if (data.pt) {
    if (!board.currentCanvas().state[data.i]) board.currentCanvas().state[data.i] = { pts: [], color: data.color }
    board.currentCanvas().state[data.i].pts.push(data.pt)
    redraw()
  }

  if (data.infoHash) {
    board.currentCanvas().state[data.infoHash] = data
    redraw()
  }
}

dragDrop('body', function (files, pos) {
  client.seed(files, function (torrent) {
    if (/.webm$/.test(files[0].name)) {
      var message = {
        video: true,
        infoHash: torrent.infoHash,
        pos: pos
      }
      broadcast(message)
      board.currentCanvas().state[torrent.infoHash] = message

      var videoStream = new stream.PassThrough()
      videoStream.end(files[0].buffer)
      torrentData[torrent.infoHash] = {
        complete: true,
        videoStream: videoStream
      }
      redraw()
    } else {
      bufToImage(files[0].buffer, function (img) {

        var message = {
          img: true,
          infoHash: torrent.infoHash,
          pos: pos,
          width: img.width,
          height: img.height
        }

        broadcast(message)
        message['buffer'] = files[0].buffer;
        board.currentCanvas().state['images'][torrent.infoHash] = message
        board.currentCanvas().saveState();
        torrentData[torrent.infoHash] = { complete: true, img: img }
        redraw()
      })
    }
  })
})

function bufToImage (buf, cb) {
  var img = new Image()
  img.src = URL.createObjectURL(
    new Blob([ buf ])
  )
  img.onload = function () {
    cb(img)
  }
}

var ua = navigator.userAgent.toLowerCase()
if (ua.indexOf('android') > -1) {
  document.body.className = 'android'
}
