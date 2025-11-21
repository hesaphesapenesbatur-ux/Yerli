const socket = io();

let currentChannel = null;

// Kanalları çek ve listele
fetch('/channels')
    .then(res => res.json())
    .then(channels => {
        const ul = document.getElementById('channel-list');
        channels.forEach(c => {
            const li = document.createElement('li');
            li.textContent = c.name;
            li.style.cursor = 'pointer';

            li.onclick = () => {
                currentChannel = c.id;
                document.getElementById('current-channel').textContent = c.name;

                const messagesDiv = document.getElementById('messages');
                messagesDiv.innerHTML = ''; // önceki mesajları temizle

                // Kanal seçildiğinde server’dan o kanalın mesajlarını al
                socket.emit('joinChannel', currentChannel);
            };

            ul.appendChild(li);
        });
    });

// Mesaj gönderme
document.getElementById('send-btn').onclick = () => {
    const input = document.getElementById('message-input');
    if(input.value && currentChannel) {
        socket.emit('message', { channel: currentChannel, text: input.value });
        input.value = '';
    }
};

// Enter ile mesaj gönderme
const input = document.getElementById('message-input');
input.addEventListener('keypress', (e) => {
    if(e.key === 'Enter'){
        e.preventDefault(); // sayfa yenilenmesini engelle
        document.getElementById('send-btn').click(); // mevcut onclick fonksiyonunu çalıştır
    }
});

// Mesajları dinle ve sadece aktif kanala ait olanları göster
socket.on('message', (msg) => {
    if(msg.channel === currentChannel){
        const messagesDiv = document.getElementById('messages');
        const div = document.createElement('div');
        div.textContent = msg.text;
        messagesDiv.appendChild(div);

        // Otomatik scroll
        div.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
});
