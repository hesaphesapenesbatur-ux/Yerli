const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

app.use(express.static("public"));

const channelsPath = path.join(__dirname, "channel.json");
const channels = JSON.parse(fs.readFileSync(channelsPath)).channels;

app.get("/channels", (req, res) => res.json(channels));
app.get("/users", (req, res) => res.json(Object.keys(users)));

const messages = {};
const dms = {};
const users = {};        // username → socket.id
const voiceUsers = {};   // username → socket.id (sesli odadakiler)

io.on("connection", (socket) => {
    console.log("Yeni bağlantı:", socket.id);

    socket.on("register", (username) => {
        socket.username = username;
        users[username] = socket.id;
        console.log(`${username} giriş yaptı`);
    });

    socket.on("joinChannel", (channelId) => {
        if (messages[channelId]) {
            messages[channelId].forEach(msg => socket.emit("message", msg));
        }
    });

    // MESAJ SİSTEMİ - %100 ÇALIŞIYOR
    socket.on("message", (msg) => {
        // DM
        if (msg.dmUser && msg.dmUser.trim()) {
            const toId = users[msg.dmUser];
            if (toId) io.to(toId).emit("message", msg);
            io.to(socket.id).emit("message", msg);
            return;
        }

        // Grup DM
        if (Array.isArray(msg.groupUsers) && msg.groupUsers.length > 0) {
            const participants = [...msg.groupUsers];
            if (msg.user && !participants.includes(msg.user)) participants.push(msg.user);
            const key = participants.sort().join("-");
            if (!dms[key]) dms[key] = [];
            dms[key].push(msg);

            participants.forEach(u => {
                const sid = users[u];
                if (sid) io.to(sid).emit("message", msg);
            });
            return;
        }

        // Normal kanal mesajı
        if (msg.channel) {
            if (!messages[msg.channel]) messages[msg.channel] = [];
            messages[msg.channel].push(msg);
            io.emit("message", msg); // herkese gönder
        }
    });

    // SESLİ SOHBET - GİRİŞ
    socket.on("voice-join", ({ username }) => {
        if (!username || voiceUsers[username]) return; // tekrar giriş engelle

        voiceUsers[username] = socket.id;
        console.log(`${username} sesliye katıldı`);

        // Bu kullanıcıya şu an kimler var söyle
        const currentVoiceUsers = Object.keys(voiceUsers).filter(u => u !== username);
        socket.emit("voice-users", currentVoiceUsers);

        // Diğerlerine "yeni biri geldi" diye haber ver
        socket.broadcast.emit("voice-new-user", username);
    });

    // SIGNALİNG
    socket.on("voice-signal", ({ to, from, signal }) => {
        const toSocketId = voiceUsers[to];
        if (toSocketId) {
            io.to(toSocketId).emit("voice-signal", { from, signal });
        }
    });

    // SESLİDEN ÇIKIŞ (manuel)
    socket.on("voice-leave", () => {
        if (!socket.username) return;

        delete voiceUsers[socket.username];
        socket.broadcast.emit("voice-user-left", socket.username);
        console.log(`${socket.username} sesli odadan ayrıldı`);
    });

    // KULLANICI AYRILDI (disconnect)
    socket.on("disconnect", () => {
        if (!socket.username) return;

        console.log(`${socket.username} ayrıldı`);

        // Normal listeden sil
        delete users[socket.username];

        // Sesli odadan da sil ve herkese haber ver
        if (voiceUsers[socket.username]) {
            delete voiceUsers[socket.username];
            socket.broadcast.emit("voice-user-left", socket.username);
        }
    });
});

http.listen(3000, () => {
    console.log("Sunucu çalışıyor → http://localhost:3000");
});