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
    localUser.score = 0
    users.push(localUser)

    ack(rooms, localUser)
  })

  socket.on('disconnect', function() {
      console.log(localUser.name + " disconnected");
      let index = users.indexOf(localUser)
      if(index != undefined){

          let localRoom = rooms.find(function(room) {
              let roomUserIndex = room.connectedUsers.indexOf(localUser)
              if(room.connectedUsers[roomUserIndex] != undefined) {
                  return room
              }
          })
          if(localRoom != undefined) {
            exitRoom(socket, localUser, localRoom)
          }
          users.splice(index, 1)
      }
  })

  socket.on('draw', function(data, ack) {
      let lastPoint = JSON.parse(data.lastPoint)
      let newPoint = JSON.parse(data.newPoint)
      let room = JSON.parse(data.room)

      socket.broadcast.to(room.name).emit('update draw', [lastPoint, newPoint])
  })

  socket.on('clear draw', function(data, ack) {
      let room = JSON.parse(data.room)

      socket.broadcast.to(room.name).emit('clear draw')
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
      room.maxRound = data.maxRound
      room.connectedUsers = []
      room.isGameStarted = false
      room.round = 0
      rooms.push(room)

      joinRoom(socket, localUser, room)

      ack("success", room)

      io.emit('update rooms', rooms)
  })

  socket.on('join room', function(data, ack) {
      console.log(data)
      let room = JSON.parse(data)
      let joinedRoom = rooms.find(function(obj) { return obj.id == room.id})
      console.log("========wewe");
      console.log(joinedRoom);
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

      io.in(room.name).emit('update rooms', rooms)

      if(usersReady > 1 && usersReady == localRoom.connectedUsers.length) {
          localRoom.isGameStarted = true
          localRoom.userTurn = localRoom.connectedUsers[0]
          localRoom.winningWord = createWinningWord()
          io.emit('update rooms', rooms)
          io.in(room.name).emit('start game')
      }
  })

  socket.on('user exit room', function(data, ack) {
      let room = JSON.parse(data.room)

      let localRoom = rooms.find(function(obj) { return room.id == obj.id })

      ack("ok")

      exitRoom(socket, localUser, localRoom)

      console.log(localUser.name + " è uscito dalla room chiamata: " + room.name);
  })

  socket.on('chat message', function(data, ack) {
      let message = data.message
      let room = JSON.parse(data.room)

      console.log(room.winningWord);
      let finalMessage = localUser.name + ": " + message

      if(isWordInString(room.winningWord.toUpperCase(), message.toUpperCase()) ) {
          console.log(localUser + " ha vinto indovinando la parola!");
          let localRoom = rooms.find(function(obj) { return room.id == obj.id })
          localUser.score += 50
          ack(localUser)

          localRoom.round += 1
          localRoom.userTurn = localRoom.connectedUsers[localRoom.round%localRoom.connectedUsers.length]
          localRoom.winningWord = createWinningWord()

          io.in(room.name).emit('update rooms', rooms)
          io.in(room.name).emit('win', localUser)

          if(localRoom.round >= localRoom.maxRound) {
              console.log("il gioco dovrebbe terminare.");
              console.log("end game: " + localRoom.connectedUsers.length);
              io.in(room.name).emit('end game', localRoom.connectedUsers)
          }

          finalMessage = "[SERVER] " + localUser.name + " guess the word: " + message.toUpperCase()
      }

      io.in(room.name).emit('chat message', finalMessage)
  })

});

function joinRoom(socket, user, room) {
    user.isReady = false
    user.score = 0
    socket.join(room.name, function() {

        console.log("joined in room:")
        console.log(room)

        room.connectedUsers.push(user)

        console.log("====================================");
        console.log(rooms);

        io.emit('update rooms', rooms)
    })
}

function exitRoom(socket, localUser, room) {
    if(room == undefined) return;
    socket.leave(room.name)
    console.log("successfully exit");
    let indexUser = room.connectedUsers.indexOf(localUser)
     if(indexUser != undefined) {
         room.connectedUsers.splice(indexUser, 1)
         // If the game in this room is started
         if(room.isGameStarted) {
             let message = "[DISCONNECT] " + localUser.name + " disconnected."
             io.in(room.name).emit('chat message', message)
             // If the user that leaves is drawing
             if(room.userTurn === localUser) {
                 io.in(room.name).emit('drawing user disconnected', room.userTurn)
                 if(room.connectedUsers.length <= 1) {
                     io.in(room.name).emit('end game', room.connectedUsers)
                 } else {
                     room.userTurn = room.connectedUsers[room.round%room.connectedUsers.length]
                     room.winningWord = createWinningWord()
                 }
             } else if(room.connectedUsers.length <= 1) {
                 io.in(room.name).emit('end game', room.connectedUsers)
             }
         }
         // If there are no more players in room
         if(room.connectedUsers.length <= 0) {
             rooms.splice(rooms.indexOf(room), 1)
         }
         io.emit('update rooms', rooms)
     }
}

function createWinningWord() {
    var words = [
        "Dog", "Cat", "Elephant", "Phone", "Computer", "Car", "Watch", "Display", "Table", "Chair", "Tree", "Water", "Bottle",
        "Letter", "Bed", "Fish", "Shoes", "Jeans", "Boat", "Head", "Hand", "Arm", "Soap", "Plate", "Beard", "Beer", "Cactus"
    ]
    return words[Math.floor(Math.random() * words.length)]
}

function isWordInString(s, word){
  return new RegExp( '\\b' + word + '\\b', 'i').test(s);
}

http.listen(3000, function(){
  console.log('listening on *:3000');
});
