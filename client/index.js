var Client = require('bittorrent-client')
var concat = require('concat-stream')
var dragDrop = require('drag-drop/buffer')
var hat = require('hat')
var once = require('once')
var stream = require('stream')
var through = require('through')
var Tracker = require('webtorrent-tracker')

if(!localStorage.getItem('slide1')) {
  localStorage.setItem('slide1', JSON.stringify({images:{}}));
}

// prompt user for their name
var username
while (!(username = window.prompt('What is your name?'))) {}
if (!username) username = 'No Name'

// pick random stroke color
var color = 'rgb(' + hat(8, 10) + ',' + hat(8, 10) + ',' + hat(8, 10) + ')'

var currentPathId = null
var state = {}
var peers = []
var peerId = new Buffer(hat(160), 'hex')

var torrentData = {}
var client = new Client({ peerId: peerId })

// create canvas
var canvas = document.createElement('canvas')
var ctx = canvas.getContext('2d')
document.body.appendChild(canvas)

// set canvas settings and size
setupCanvas()
checkLocalstorage();
window.addEventListener('resize', setupCanvas)

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
  redraw()
}

// Check if there is data in localStorage
function checkLocalstorage() {
  window.onload = function() {
    var slideData = localStorage.getItem('slide1');
    if(slideData) {
      state = JSON.parse(slideData);
      redraw();
    }
  }
}

function redraw () {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

  // Draw images from localStorage
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
  // draw the current state
  Object.keys(state).forEach(function (id) {
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


    // draw images
    if (data.infoHash) {
      if (!torrentData[data.infoHash]) {
        torrentData[data.infoHash] = { complete: false }
        client.download({
          infoHash: data.infoHash,
          announce: [ 'wss://tracker.webtorrent.io' ]
        }, function (torrent) {
          var file = torrent.files[0]
          if (!file) return
          if (data.img) {
            file.createReadStream().pipe(concat(function (buf) {
              bufToImage(buf, function (img) {
                torrentData[data.infoHash] = { complete: true, img: img }
                redraw()
              })
            }))
          } else if (data.video) {
            torrentData[data.infoHash] = {
              complete: true,
              videoStream: file.createReadStream()
            }
            redraw()
          }
        })
        ctx.fillStyle = 'rgb(210,210,210)'
        ctx.fillRect(
          data.pos.x - (data.width / 4), data.pos.y - (data.height / 4),
          data.width / 2, data.height / 2
        )
      }
      if (torrentData[data.infoHash].complete) {
        if (torrentData[data.infoHash].img) {
          ctx.drawImage(
            torrentData[data.infoHash].img,
            data.pos.x - (data.width / 4), data.pos.y - (data.height / 4),
            data.width / 2, data.height / 2
          )
        } else if (torrentData[data.infoHash].videoStream) {
          if (document.querySelector('#' + 'infoHash_' + data.infoHash)) return
          var video = document.createElement('video')
          video.style.left = (data.pos.x - 150) + 'px'
          video.style.top = (data.pos.y - 100) + 'px'
          video.id = 'infoHash_' + data.infoHash
          video.controls = true
          document.body.appendChild(video)
          pipeToVideo(torrentData[data.infoHash].videoStream, video)
        }
      }
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
  e.preventDefault()
  var x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageX) || 0
  var y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageY) || 0
  if(e.shiftKey) {
    // Check if the click is in an image boundary 
    console.log(x);
    console.log(y);
    Object.keys(state.images).forEach(function(imgKey) {
      var img = state.images[imgKey]
      var effectiveX = img.pos.x-(img.width / 4);
      var effectiveY = img.pos.y-(img.height / 4);
      var inXaxis = x >= effectiveX && x <= effectiveX+(img.width/2)
      var inYaxis = y >= effectiveY && y <= effectiveY+(img.height/2)
      if(inXaxis && inYaxis) {
        state.dragging = imgKey;
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

    state[currentPathId] = { color: color, pts: [ p1, p2 ] }

    var slide1 = JSON.parse(localStorage.getItem('slide1'));
    slide1[currentPathId] = { color: color, pts: [ p1, p2 ] };
    localStorage.setItem('slide1', JSON.stringify(slide1));

    broadcast({ i: currentPathId, pt: p1, color: color })
    broadcast({ i: currentPathId, pt: p2 })
    redraw()
  }
}

document.body.addEventListener('mouseup', onUp)
document.body.addEventListener('touchend', onUp)

function onUp () {
  currentPathId = null;
  state.dragging = null;
}

canvas.addEventListener('mousemove', onMove)
canvas.addEventListener('touchmove', onMove)

function onMove (e) {
  var x = e.clientX || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageX) || 0
  var y = e.clientY || (e.changedTouches && e.changedTouches[0] && e.changedTouches[0].pageY) || 0
  if(e.shiftKey && state.dragging) {
    var img = state.images[state.dragging];
    img.pos.x = x;
    img.pos.y = y;
    redraw();
  } else {
    if (currentPathId) {
      var pt = { x: x, y: y }

      var slide1 = JSON.parse(localStorage.getItem('slide1'));
      slide1[currentPathId].pts.push(pt)
      localStorage.setItem('slide1', JSON.stringify(slide1));

      state[currentPathId].pts.push(pt)
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
  peer.send({ username: username, color: color, state: state })
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
        return !state[id]
      })
      .forEach(function (id) {
        state[id] = data.state[id]
      })
    redraw()
  }

  if (data.pt) {
    if (!state[data.i]) state[data.i] = { pts: [], color: data.color }
    state[data.i].pts.push(data.pt)
    redraw()
  }

  if (data.infoHash) {
    state[data.infoHash] = data
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
      state[torrent.infoHash] = message

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

        var slide1 = JSON.parse(localStorage.getItem('slide1'));
        if (!slide1['images']) slide1['images'] = {};
        message['buffer'] = files[0].buffer;
        slide1['images'][torrent.infoHash] = message
        localStorage.setItem('slide1', JSON.stringify(slide1));

        broadcast(message)
        state[torrent.infoHash] = message
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

function pipeToVideo (stream, video) {
  window.video = video
  var MediaSource_ = window.MediaSource || window.WebKitMediaSource

  var mediaSource = new MediaSource_()
  var url = window.URL.createObjectURL(mediaSource)

  video.src = url

  var sourceopen = once(function () {
    var sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vorbis,vp8"')

    var chunks = []
    stream.pipe(through(function (buf) {
      chunks.push(buf)
      flow()
    }))

    var play = once(function () {
      video.play()
    })

    function flow () {
      if (sourceBuffer.updating) return
      play()
      var buf = chunks.shift()
      if (buf) sourceBuffer.appendBuffer(buf)
    }

    sourceBuffer.addEventListener('updateend', flow)

    stream.on('end', function () {
      mediaSource.endOfStream()
    })
  })

  mediaSource.addEventListener('webkitsourceopen', sourceopen, false)
  mediaSource.addEventListener('sourceopen', sourceopen, false)
}

var ua = navigator.userAgent.toLowerCase()
if (ua.indexOf('android') > -1) {
  document.body.className = 'android'
}
