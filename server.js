const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const fs = require("fs");
const path = require("path");

app.use(express.static("public"));

// channel.json yoksa bile çökmesin → varsayılan kanallar olsun
let channels = [
    { id: "genel", name: "Genel" },
    { id: "random", name: "Random" },
    { id: "oyun", name: "Oyun" }
];

const channelsPath = path.join(__dirname, "channel.json");
if (fs.existsSync(channelsPath)) {
    try {
        const raw = fs.readFileSync(channelsPath, "utf-8");
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.channels)) {
            channels = data.channels;
        }
    } catch (err) {
        console.log("channel.json bozuk, varsayılan kanallar kullanılıyor");
    }
} else {
    console.log("channel.json bulunamadı, varsayılan kanallar kullanılıyor");
}

app.get("/channels", (req, res) => res.json(channels));
app.get("/users", (req, res) => res.json(Object.keys(users)));

const messages = {};
const dms = {};
const users = {};        // username → socket.id
const voiceUsers = {};   // sesli odadakiler

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

    // MESAJ SİSTEMİ
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
            const participants = [...new Set([...msg.groupUsers, msg.user].filter(Boolean))];
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
            io.emit("message", msg);
        }
    });

    // SESLİ SOHBET
    socket.on("voice-join", ({ username }) => {
        if (!username || voiceUsers[username]) return;

        voiceUsers[username] = socket.id;
        console.log(`${username} sesliye katıldı`);

        const others = Object.keys(voiceUsers).filter(u => u !== username);
        socket.emit("voice-users", others);
        socket.broadcast.emit("voice-new-user", username);
    });

    socket.on("voice-signal", ({ to, from, signal }) => {
        const target = voiceUsers[to];
        if (target) {
            io.to(target).emit("voice-signal", { from, signal });
        }
    });

    socket.on("voice-leave", () => {
        if (!socket.username) return;
        delete voiceUsers[socket.username];
        socket.broadcast.emit("voice-user-left", socket.username);
        console.log(`${socket.username} sesli odadan ayrıldı`);
    });

    socket.on("disconnect", () => {
        if (!socket.username) return;

        console.log(`${socket.username} ayrıldı`);
        delete users[socket.username];

        if (voiceUsers[socket.username]) {
            delete voiceUsers[socket.username];
            socket.broadcast.emit("voice-user-left", socket.username);
        }
    });
});

http.listen(3000, () => {
    console.log("Sunucu çalışıyor → http://localhost:3000");
    console.log("Kanallar:", channels.map(c => c.name).join(", "));
});