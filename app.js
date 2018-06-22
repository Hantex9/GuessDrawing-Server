var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

class Room {
  constructor() {

  }
}

class User {
  constructor() {

  }
}

var rooms = new Array()
var users = new Array()
var globalID = 0

io.on('connection', function(socket){
  console.log('a user connected');

  var localUser = new User()

  socket.on('login', function(name, ack) {
    console.log("logged with name: " + name);

    localUser.id = socket.id
    localUser.name = name
    localUser.isReady = false
    users.push(localUser)

    ack(rooms, localUser)
  })

  socket.on('create room', function(data, ack) {
      let isInArray = rooms.find(function(room) { return room.name == data.name }) !== undefined
      if(isInArray) {
          ack("Name of room already in use.")
          return
      }

      console.log("quello che sta creando si chiama: " + localUser.name);

      globalID += 1
      var room = new Room()
      room.id = globalID
      room.name = data.name
      room.maxUsers = data.maxPlayers
      room.connectedUsers = []
      room.isGameStarted = false
      rooms.push(room)

      joinRoom(socket, localUser, room)

      ack("success")

      io.emit('update rooms', rooms)
  })

  socket.on('join room', function(data, ack) {
      console.log(data)
      let room = JSON.parse(data)
      let joinedRoom = rooms.find(function(obj) { return obj.id == room.id})
      console.log("========wewe");
      console.log(joinedRoom);
      localUser.isReady = false
      joinRoom(socket, localUser, joinedRoom)

      ack("ok")
  })

  socket.on('ready', function(data, ack) {
      let user = JSON.parse(data.user)
      let room = JSON.parse(data.room)

      let localRoom = rooms.find(function(obj) { return room.id == obj.id })
      console.log(localRoom);
      let indexUser = localRoom.connectedUsers.indexOf(localUser)

      localRoom.connectedUsers[indexUser].isReady = !localRoom.connectedUsers[indexUser].isReady

      var usersReady = 0
      localRoom.connectedUsers.forEach(function(element) {
          if(element.isReady) {
              usersReady += 1
          }
      })

      io.in(room.name).emit('refresh room', localRoom.connectedUsers)

      if(usersReady > 1 && usersReady == localRoom.connectedUsers.length) {
          console.log("inizia il giocoooooooo");
          localRoom.isGameStarted = true
          io.in(room.name).emit('start game')
          io.emit('update rooms', rooms)
      }
  })

  socket.on('user exit room', function(data, ack) {
      let user = JSON.parse(data.user)
      let room = JSON.parse(data.room)

      let indexRoom = rooms.find(function(obj) { return room.id == obj.id })
      console.log(indexRoom);
      let indexUser = indexRoom.connectedUsers.indexOf(localUser)

      indexRoom.connectedUsers.splice(indexUser, 1)

      ack("ok")

      io.in(room.name).emit('refresh room', indexRoom.connectedUsers)

      if(indexRoom.connectedUsers.length <= 0) {
          rooms.splice(rooms.indexOf(indexRoom), 1)
      }

      io.emit('update rooms', rooms)

      socket.leave(room.name)
  })

  socket.on('draw', function(data, ack) {
      let lastPoint = JSON.parse(data.lastPoint)
      let newPoint = JSON.parse(data.newPoint)
      let room = JSON.parse(data.room)

      socket.broadcast.to(room.name).emit('update draw', [lastPoint, newPoint])

  })

});

function joinRoom(socket, user, room) {
    socket.join(room.name, function() {

        console.log("joined in room:")
        console.log(room)

        room.connectedUsers.push(user)

        io.in(room.name).emit('refresh room', room.connectedUsers)
        io.emit('update rooms', rooms)
    })
}

http.listen(3000, function(){
  console.log('listening on *:3000');
});
