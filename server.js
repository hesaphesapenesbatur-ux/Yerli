const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

// public klasörünü statik yap
app.use(express.static("public"));

// channel.json dosyasını oku
const channelsPath = path.join(__dirname, "channel.json");
const rawData = fs.readFileSync(channelsPath);
const channels = JSON.parse(rawData).channels;

// Kanalları frontend'e JSON olarak gönder
app.get("/channels", (req, res) => {
    res.json(channels);
});

// Kanal bazlı mesaj hafızası
const messages = {}; // { channelId: [ { text, user, time } ] }

// Kullanıcı listesi (username -> socket.id)
const users = {};

io.on("connection", (socket) => {
    console.log("Bir kullanıcı bağlandı.");

    // Kullanıcı adını ayarla
    socket.on("register", (username) => {
        socket.username = username;
        users[username] = socket.id;
        console.log(`Kullanıcı adı set edildi: ${username}`);
    });

    // Kanal mesajlarını gönder
    socket.on("joinChannel", (channelId) => {
        if(messages[channelId]){
            messages[channelId].forEach(msg => socket.emit("message", msg));
        }
    });

    // Mesaj gönder
    socket.on("message", (msg) => {
        if(msg.dmUser){
            // DM mesajı: sadece gönderici ve alıcı görür
            const toSocketId = users[msg.dmUser];
            const fromSocketId = socket.id;

            if(toSocketId) io.to(toSocketId).emit("message", msg);
            io.to(fromSocketId).emit("message", msg); // göndericiye de gönder
        } else {
            // Kanal mesajı: tüm kullanıcılar görür
            if(!messages[msg.channel]) messages[msg.channel] = [];
            messages[msg.channel].push(msg);
            io.emit("message", msg);
        }
    });

    // Kullanıcı ayrılınca listeden sil
    socket.on("disconnect", () => {
        if(socket.username) delete users[socket.username];
        console.log(`${socket.username || "Anonim"} ayrıldı`);
    });
});

http.listen(3000, () => {
    console.log("Sunucu çalışıyor: http://localhost:3000");
});
