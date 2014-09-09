var Client = require('bittorrent-client')
var concat = require('concat-stream')
var dragDrop = require('drag-drop/buffer')
var hat = require('hat')
var once = require('once')
var Tracker = require('webtorrent-tracker')
var through = require('through')

var username
while (!(username = window.prompt('What is your name?'))) {}
if (!username) username = 'No Name'

var color = 'rgb(' + hat(8, 10) + ',' + hat(8, 10) + ',' + hat(8, 10) + ')'
var currentPathId = null
var state = {}
var torrentData = {}

var peers = []
var peerId = new Buffer(hat(160), 'hex')
var client = new Client({ peerId: peerId })

// create canvas
var canvas = document.createElement('canvas')
var ctx = canvas.getContext('2d')
document.body.appendChild(canvas)

// set canvas settings and size
setupCanvas()
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

function redraw () {
  // clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height)

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
          console.log('createVideoElement')
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

var tracker = new Tracker(peerId, {
  announce: [ 'wss://tracker.webtorrent.io' ],
  infoHash: new Buffer(20)
})

tracker.start()

tracker.on('peer', function (peer) {
  peers.push(peer)
  peer.send({ username: username, color: color, state: state })
  peer.on('message', onMessage.bind(undefined, peer))
  peer.on('close', function () {
    peers.splice(peers.indexOf(peer), 1)
    redraw()
  })
})

function broadcast (obj) {
  peers.forEach(function (peer) {
    peer.send(obj)
  })
}

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

canvas.addEventListener('mousedown', onDown)
canvas.addEventListener('touchstart', onDown)

function onDown (e) {
  e.preventDefault()
  currentPathId = hat(80)
  var x = e.clientX || (e.changedTouches[0] && e.changedTouches[0].pageX)
  var y = e.clientY || (e.changedTouches[0] && e.changedTouches[0].pageY)
  var p1 = { x: x, y: y }
  var p2 = {
    x: x + 0.001,
    y: y + 0.001
  } // paint point on click

  state[currentPathId] = { color: color, pts: [ p1, p2 ] }
  broadcast({ i: currentPathId, pt: p1, color: color })
  broadcast({ i: currentPathId, pt: p2 })
  redraw()
}

document.body.addEventListener('mouseup', onUp)
document.body.addEventListener('touchend', onUp)

function onUp () {
  currentPathId = null
}

canvas.addEventListener('mousemove', onMove)
canvas.addEventListener('touchmove', onMove)

function onMove (e) {
  var x = e.clientX || (e.changedTouches[0] && e.changedTouches[0].pageX)
  var y = e.clientY || (e.changedTouches[0] && e.changedTouches[0].pageY)
  if (currentPathId) {
    var pt = { x: x, y: y }
    state[currentPathId].pts.push(pt)
    broadcast({ i: currentPathId, pt: pt })
    redraw()
  }
}

dragDrop('body', function (files, pos) {
  client.seed(files, function (torrent) {
    if (/.webm$/.test(files[0].name)) {
      var message = {
        infoHash: torrent.infoHash,
        pos: pos,
        video: true
      }
      broadcast(message)
      state[torrent.infoHash] = message
      torrentData[torrent.infoHash] = {
        complete: true,
        videoStream: torrent.files[0].createReadStream()
      }
      redraw()
    } else {
      bufToImage(files[0].buffer, function (img) {
        var message = {
          infoHash: torrent.infoHash,
          pos: pos,
          width: img.width,
          height: img.height,
          img: true
        }
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
  var MediaSource_ = window.MediaSource || window.WebKitMediaSource

  var mediaSource = new MediaSource_()
  var url = window.URL.createObjectURL(mediaSource)

  video.src = url

  var sourceopen = once(function () {
    console.log('mediaSource readyState: ' + this.readyState)
    var sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vorbis,vp8"')

    var chunks = []
    stream.pipe(through(function (buf) {
      console.log('sourceBuffer.append')
      chunks.push(buf)
      flow()
      video.play()
    }))

    function flow () {
      if (sourceBuffer.updating) return
      var buf = chunks.shift()
      if (buf) sourceBuffer.appendBuffer(buf)
    }

    sourceBuffer.addEventListener('updateend', flow)


    stream.on('end', function () {
      console.log('end')
      mediaSource.endOfStream()
    })
  })

  function sourceended () {
    console.log('mediaSource readyState: ' + this.readyState)
  }

  mediaSource.addEventListener('webkitsourceopen', sourceopen, false)
  mediaSource.addEventListener('sourceopen', sourceopen, false)

  mediaSource.addEventListener('webkitsourceended', sourceended, false)
  mediaSource.addEventListener('sourceended', sourceended, false)

}
