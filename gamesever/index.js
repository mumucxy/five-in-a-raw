//创建websocket服务器
var server = require('http').createServer();
var io = require('socket.io')(server);

var users ={};
var rooms ={}
//socket就是客户端与服务器的通道
io.on('connection', function(socket){
  socket.join("public");
  
  //自定义事件
   socket.on('user.online', function(user){
     user.room="public";
     users[user.id]=user;//保存用户信息
     //广播在线用户信息
     io.sockets.emit('user.online',getUsers());
     //广播房间创建成功消息
     socket.emit("room.rooms",getRooms());
   });
   
   
   socket.on('chat.send',function (chat) {
     var user = users[socket.id.replace("/#","")];
     socket.to(user.room).emit("chat.newchat",chat);
   });
   
    socket.on('room.createroom',function (roomname) {
     if(rooms[roomname]){
       socket.emit("room.exists");
       return;
     }
     
     var user = users[socket.id.replace("/#","")];
     rooms[roomname]={roomname:roomname,play1:user,play2:null};
        
     //切换房间
     socket.leave(user.room);
     socket.join(roomname);
     //用户状态转换
     user.room = roomname;
     user.status = 2;
     
    //广播房间创建成功消息
     io.sockets.in('public').emit("room.rooms",getRooms());
     //通知创建者，房间创建成功
     socket.emit("room.createOK",rooms[roomname]);
     //通知所有，用户状态信息
     io.sockets.emit('user.online',getUsers());
   });
   //加入房间
   socket.on("room.join",function (roomname) {
     if( rooms[roomname].play2 ){
       socket.emit("room.joinfalid");
       return;
     }
      var user = users[socket.id.replace("/#","")]; 
     socket.leave(user.room);
     socket.join(roomname);
     user.status = 2;
     user.room=roomname;
     
     rooms[roomname].play2 =user;
     //通知自己
     socket.emit("room.joinOK",rooms[roomname]);
     //通知房主
     socket.in(roomname).emit("room.createOK",rooms[roomname]);
      //通知所有，用户状态信息
     io.sockets.emit('user.online',getUsers());
   });
   socket.on("room.leave",function(){
      var user = users[socket.id.replace("/#","")];
      var room = rooms[user.room];
      
      if( user.id == room.play1.id ) { //房主
          delete rooms[user.room];
          if( room.play2 ) {
              room.play2.status = 1;
              room.play2.room = "public";
              //找到对方的socket，离开房间进入public
              var so = io.sockets.sockets["/#" + room.play2.id];
              so.leave(user.room);
              so.join("public");
          }
      } else { //加入者
          room.play2 = null;
          socket.in(user.room).emit("room.createOK",room);
      }

      //自己退出房间
      socket.leave(user.room);
      socket.join("public");
      user.status = 1;
      user.room = "public";
      //自己退出房间，刷新房间列表
      io.sockets.in("public").emit("room.rooms",getRooms());
      io.sockets.emit("user.online",getUsers());
  });

  socket.on('disconnect', function(){
      var user = users[socket.id.replace("/#","")];
      if( user.status == 3 ) { //游戏状态
          var room = rooms[user.room];
          if( user.id == room.play1.id ) {
              delete rooms[user.room];
              room.play2.status = 1;
              room.play2.room = "public";
              room.play2.win += 1;
              room.play2.total += 1;
              //找到对方的socket，离开房间进入public
              var so = io.sockets.sockets["/#" + room.play2.id];
              so.leave(user.room);
              so.join("public");

              so.emit("game.over",room.play2);
              so.emit("chat.newchat",{
                nickname : '系统消息',
                msg : "您的对手被网络打败了"
              });
              io.sockets.in("public").emit("room.change",getRooms()); 
          } else {
              room.play1.status = 2;
              room.play1.win += 1;
              room.play1.total += 1;
              
              room.play2 = null;
              socket.in(user.room).emit("game.over",room.play1);
              socket.in(user.room).emit("room.createOK",room);
              socket.in(user.room).emit("chat.newchat",{
                nickname : '系统消息',
                msg : "您的对手被网络打败了"
              });
          }
      }

      if( user.status == 2 ) { //等待状态
          var room = rooms[user.room];
          if( user.id == room.play1.id ) {
              delete rooms[user.room];
              if( room.play2 ) {
                room.play2.status = 1;
                room.play2.room = "public";
                //找到对方的socket，离开房间进入public
                var so = io.sockets.sockets["/#" + room.play2.id];
                so.leave(user.room);
                so.join("public");
              }
              io.sockets.in("public").emit("room.change",getRooms());
          } else {
              room.play2 = null;
              socket.in(user.room).emit("room.createOK",room);
          }
      }

      //删除自己通知所有人
      delete users[socket.id.replace("/#","")];      
      io.sockets.emit("user.online",getUsers());
  });

  //游戏开始指令
  socket.on("game.start",function(){
   var user = users[socket.id.replace("/#","")]; 
    var room = rooms[user.room];
    
    if(room.play1 && room.play2){
      //向房主发送游戏开始指令
      socket.emit("game.start",1);//1代表先手执白
      //向玩家2发送游戏开始指令
      socket.in(user.room).emit("game.start",2);//2代表后手执黑
      //修改玩家的状态
      room.play1.status = 3;
      room.play2.status = 3;
      //向所有人广播
       io.sockets.emit('user.online',getUsers());
    }
  });
  //游戏数据交换指令
  socket.on("game.changedata",function (data) {
     var user = users[socket.id.replace("/#","")];
    socket.in(user.room).emit("game.changedata",data);
  });
  //游戏结束指令
  socket.on("game.over",function(){
      //找到玩家
      var user = users[socket.id.replace("/#","")];
      var room = rooms[user.room];
      //
      var winer = user.id == room.play1.id ? room.play1 : room.play2;
      var faild = user.id == room.play1.id ? room.play2 : room.play1;
      
      //更改状态
      winer.win += 1;
      winer.total += 1;
      winer.status = 2;
      faild.total += 1;
      faild.status = 2;

      //返回游戏结束指令
      socket.emit("game.over",winer);
      socket.in(user.room).emit("game.over",faild);
      //向两位玩家发送一条系统消息
      io.sockets.in(user.room).emit("chat.newchat",{
          nickname : '系统消息',
          msg : winer.nickname + "赢了"
      });

      //向所有人广播
      io.sockets.emit("user.online",getUsers());
  });
});

function getUsers() {
  var arr = [];
  for(var key in users){
    arr.push(users[key]);
  }
  return arr;
}
function getRooms() {
  var arr = [];
  for(var key in rooms){
    arr.push(rooms[key]);
  }
  return arr;
}
//开启服务器
server.listen(3000);
console.log("服务器开启成功");