/**
 * SYNODE BRIDGE - Run on nodeJS
 */

// ----------------------------------------------------------------------------
// Configuration

var authoritySecret = "mauvaisMotDePasse";    // API password

var debug     = true;  // Enable / disable debug mode
var port      = 1337;  // Listening port
var userAry   = new Array();    // Array of users tokens allowed for connexion
var roomCount = new Array();    // Array of rooms with number of user connected to.
var gcTimeout = 5;     // Garbage Collector Interval (in sec.)
var cxTimeout = 30;    // Max duration allowed to connect (in sec.)


//-----------------------------------------------------------------------------
// Serveur Synode

var jsSHA = require("jssha");
var io    = require("socket.io").listen(port, { log: false });

if (debug) console.log("[SYNODE] Brige listening on port "+port);

io.sockets.on('connection', function (socket) {

  socket.on('disconnect', function() {
    if (debug) console.log("[SYNODE] Socket disconnected");
    if (socket.isUser) {
      if (debug) console.log("[SYNODE] Socket of user "+socket.uid+" removed from "+socket.room);
      roomCount[socket.room]--;
    }
  });

  socket.on('allow', function(order) {
    if (debug) console.log("[SYNODE] Incomming allow...");
    if(isAutority(order.tokenSalt, order.tokenTest)) {
      userAry[order.userHash] = { uid:order.userId, allowed:order.access, room:order.room, expire:(getTimestamp()+30) };
      if (debug) console.log("[SYNODE] "+order.userHash+" allowed to join "+userAry[order.userHash].room+" until "+userAry[order.userHash].expire);
    } else {
      if (debug) console.log("[SYNODE] Rejecting authority : "+order.tokenTest+" failed.");
    }
  });

  socket.on('subscribe', function(data) {
    if (debug) console.log("[SYNODE] Incomming subscription");
    if (userAry[data.userHash] != null && userAry[data.userHash].allowed) {
      socket.uid    = userAry[data.userHash].uid;
      socket.room   = userAry[data.userHash].room;
      socket.isUser = true;
      socket.join(socket.room);
      roomCount[socket.room] = (roomCount[socket.room] > 0) ? roomCount[userAry[data.userHash].room]++ : 1;
      userAry[data.userHash].allowed = false; // Prevent multiple connexions.
      if (debug) console.log("[SYNODE] User "+socket.uid+" allowed in "+socket.room+" ("+roomCount[socket.room]+" users).");
      socket.emit("subscribe", {result:true});
    }
    else {
      socket.emit("subscribe", {result:false});
      if (debug) console.log("[SYNODE] Incomming user denied.");
      socket.disconnect();
    }
  });

  socket.on('push', function(order){
    if (debug) console.log("[SYNODE] Incomming Server Push ("+order.userId+" => "+order.room+"):");
    if(isAutority(order.tokenSalt, order.tokenTest)) {
      //if (debug) console.log(order.data);
      io.sockets.in(order.room).emit("push", {uid:order.userId, action:order.action, data:order.data});
    } else {
      if (debug) console.log("[SYNODE] Server Push not allowed : bad password");
    }
  });

  socket.on('sync', function(syncData){
    if (debug) console.log("[SYNODE] Incomming Client Sync ("+socket.uid+" => "+socket.room+"):")
    if (socket.isUser) {
      //if (debug) console.log(syncData);
      io.sockets.in(socket.room).emit("sync", {uid:socket.uid, action:syncData.action, data:syncData.data});
    } else {
      if (debug) console.log("[SYNODE] Sync not allowed : not a user");
    }
  });

  if (debug) console.log("[SYNODE] New connexion !");
});

setInterval(garbageCollect, gcTimeout*1000);

//-----------------------------------------------------------------------------
/**
 * Check the socket authority to push (Broadcast) messages.
 * @param  {string}  token1   Token de Salt
 * @param  {string}  token2   Token de Test
 * @return {Boolean}      [description]
 */
function isAutority(token1, token2) {
  var crypticSecret = token1+authoritySecret;
  var crypticToken  = new jsSHA(crypticSecret, "TEXT");
  var crypticSHA256 = crypticToken.getHash("SHA-256", "HEX");
  return (crypticSHA256 == token2); 
}

//-----------------------------------------------------------------------------
/**
 * Garbage collector, used to clean User & Room array.
 * @return {void}
 */
function garbageCollect() {
  // Clean users array
  var tmpUserAry   = [];
  var curTimestamp = getTimestamp();
  for (var userHash in userAry) {
    if (userAry[userHash].expire-curTimestamp > 0 && userAry[userHash].allowed) {
      tmpUserAry[userHash] = userAry[userHash];
    } else {
      if (debug) console.log("[SYNODE] Removing hash:"+userHash);
    } 
  }
  userAry = tmpUserAry;

  // clean unused rooms
  var tmpRoomCount = [];
  for (var room in roomCount) {
    if (roomCount[room]>0) {
      tmpRoomCount[room] = roomCount[room];
    } else {
      if (debug) console.log("[SYNODE] Removing room:"+room);
    }
  }
  roomCount = tmpRoomCount;
}

//-----------------------------------------------------------------------------
/**
 * Return a timestamp (in sec.)
 * @return {int} [timestamp]
 */
function getTimestamp() {
  return Math.round(+new Date() / 1000);
}