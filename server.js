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
const users = {};
const voiceUsers = {};

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

    socket.on("message", (msg) => {
        if (msg.dmUser && msg.dmUser.trim()) {
            const toId = users[msg.dmUser];
            if (toId) io.to(toId).emit("message", msg);
            io.to(socket.id).emit("message", msg);
            return;
        }

        if (Array.isArray(msg.groupUsers) && msg.groupUsers.length > 0) {
            const key = [...msg.groupUsers, msg.user].sort().join("-");
            if (!dms[key]) dms[key] = [];
            dms[key].push(msg);
            [...msg.groupUsers, msg.user].forEach(u => {
                const sid = users[u];
                if (sid) io.to(sid).emit("message", msg);
            });
            return;
        }

        if (msg.channel) {
            if (!messages[msg.channel]) messages[msg.channel] = [];
            messages[msg.channel].push(msg);
            io.emit("message", msg);
        }
    });

    socket.on("voice-join", ({ username }) => {
        voiceUsers[username] = socket.id;
        console.log(`${username} sesliye katıldı`);
        socket.emit("voice-users", Object.keys(voiceUsers).filter(u => u !== username));
        socket.broadcast.emit("voice-new-user", username);
    });

    socket.on("voice-signal", ({ to, from, signal }) => {
        const toSocketId = voiceUsers[to];
        if (toSocketId) {
            io.to(toSocketId).emit("voice-signal", { from, signal });
        }
    });

    socket.on("voice-leave", () => {
        if (socket.username) {
            delete voiceUsers[socket.username];
            socket.broadcast.emit("voice-user-left", socket.username);
        }
    });

    socket.on("disconnect", () => {
        if (socket.username) {
            delete users[socket.username];
            delete voiceUsers[socket.username];
            socket.broadcast.emit("voice-user-left", socket.username);
            console.log(`${socket.username} ayrıldı`);
        }
    });
});

http.listen(3000, () => {
    console.log("Sunucu çalışıyor → http://localhost:3000");
});