
const onChatMessage = async (io, socket, getOnlineUsers) => {
  socket.on('chat:message', (data) => {
    if (data && data.to) {
      // Найти socketId по userId
      const onlineUsers = getOnlineUsers();
      const recipient = onlineUsers.find(u => u.userId === data.to);
      if (recipient) {
        io.to(recipient.socketId).emit('chat:message', data);
      }
      // Также отправить отправителю (чтобы он увидел своё сообщение)
      socket.emit('chat:message', data);
    } else {
      io.emit('chat:message', data);
    }
  });
}
export default onChatMessage;
