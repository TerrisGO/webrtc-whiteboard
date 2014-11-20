module.exports = Canvas

/* Constructor function for create a new canvas slide */ 

function Canvas (storageKey, state) {
  this.state = state || {images:[]};
  this.images = {};
  this.storageKey = storageKey;
}

Canvas.prototype.saveState = function() {
  localStorage.setItem(this.storageKey, JSON.stringify(this.state));
}
