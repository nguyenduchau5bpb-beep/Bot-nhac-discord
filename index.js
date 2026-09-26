const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo } = require('kazagumo');

// ==========================================
// 🌐 SERVER KEEP-ALIVE CHO RENDER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('⚡ LAVALINK MUSIC BOT IS ONLINE 24/7!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web Server Running!'));

const PREFIX = '!';
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ==========================================
// 🚀 CẤU HÌNH DANH SÁCH LAVALINK NODES
// ==========================================
const Nodes = [
    {
        name: 'Node-Lavalink-1',
        url: 'lavalink.lavalink.rocks:443',
        auth: 'horizongaming',
        secure: true
    },
    {
        name: 'Node-Lavalink-2',
        url: 'lava.link:80',
        auth: 'youshallnotpass',
        secure: false
    }
];

// Khởi tạo Kazagumo Manager
const kazagumo = new Kazagumo({
    defaultSearchEngine: 'youtube',
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    }
}, new Connectors.DiscordJS(client), Nodes);

// ==========================================
// 🎶 SỰ KIỆN PHÁT NHẠC (LAVALINK EVENTS)
// ==========================================
kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('🔥 [LAVALINK ENGINE] ĐANG PHÁT NHẠC')
        .setDescription(`🎵 **[${track.title}](${track.uri})**\n\n⏱️ **Thời lượng:** \`${msToTime(track.length)}\`\n👤 **Yêu cầu bởi:** **${track.requester.username}**`)
        .setThumbnail(track.thumbnail || '')
        .setFooter({ text: 'Âm thanh 320kbps Lossless từ Server Lavalink Dedicated' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel('⏯️ Tạm Dừng').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    channel.send({ embeds: [embed], components: [row] });
});

kazagumo.on('playerEmpty', (player) => {
    const channel = client.channels.cache.get(player.textId);
    if (channel) channel.send('⏹️ *Hàng chờ đã hết. Bot ngắt kết nối để tiết kiệm băng thông.*');
    player.destroy();
});

kazagumo.shoukaku.on('ready', (name) => console.log(`✅ Lavalink Node "${name}" đã sẵn sàng kết nối!`));
kazagumo.shoukaku.on('error', (name, error) => console.error(`❌ Lỗi Lavalink Node "${name}":`, error));

client.on('ready', () => {
    console.log(`✅ BOT DISCORD LAVALINK READY: ${client.user.tag}`);
    client.user.setActivity('🎧 Nhạc VIP Lavalink | !play', { type: 2 });
});

// Helper đổi ms sang phút:giây
function msToTime(duration) {
    const seconds = Math.floor((duration / 1000) % 60);
    const minutes = Math.floor((duration / (1000 * 60)) % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// ==========================================
// 📩 HỆ THỐNG LỆNH CHAT
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // 1. LỆNH PLAY (!play / !p)
    if (command === 'play' || command === 'p') {
        const { channel } = message.member.voice;
        if (!channel) return message.reply('🔊 Bạn phải vào Voice Channel trước!');

        const query = args.join(' ');
        if (!query) return message.reply('❌ Nhập tên bài hoặc link! Ví dụ: `!play Sơn Tùng M-TP`');

        const msg = await message.reply('⚡ *Đang truy vấn dữ liệu từ Lavalink Server...*');

        let player = kazagumo.players.get(message.guild.id);
        if (!player) {
            player = await kazagumo.createPlayer({
                guildId: message.guild.id,
                textId: message.channel.id,
                voiceId: channel.id,
                deaf: true
            });
        }

        const result = await kazagumo.search(query, { requester: message.author });

        if (!result.tracks.length) {
            return msg.edit('❌ Không tìm thấy bài hát nào!');
        }

        if (result.type === 'PLAYLIST') {
            for (const track of result.tracks) player.queue.add(track);
            msg.edit(`✅ Đã thêm Playlist **${result.playlistName}** (${result.tracks.length} bài) vào hàng chờ!`);
        } else {
            player.queue.add(result.tracks[0]);
            msg.edit(`✅ Đã thêm vào hàng chờ: **${result.tracks[0].title}**`);
        }

        if (!player.playing && !player.paused) player.play();
    }

    // 2. LỆNH SKIP (!skip / !s)
    if (command === 'skip' || command === 's') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply('❌ Bot không phát nhạc!');
        player.skip();
        return message.reply('⏭️ Đã chuyển bài!');
    }

    // 3. LỆNH STOP (!stop / !leave)
    if (command === 'stop' || command === 'leave') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player) return message.reply('❌ Bot không trong voice!');
        player.destroy();
        return message.reply('⏹️ Đã dừng phát nhạc và rời kênh!');
    }

    // 4. LỆNH QUEUE (!queue / !q)
    if (command === 'queue' || command === 'q') {
        const player = kazagumo.players.get(message.guild.id);
        if (!player || !player.queue.length) return message.reply('📑 Hàng chờ trống!');

        const list = player.queue.slice(0, 10).map((t, i) => `**${i + 1}.** [${t.title}](${t.uri}) - \`${msToTime(t.length)}\``).join('\n');
        const embed = new EmbedBuilder()
            .setColor('#9b59b6')
            .setTitle('📑 HÀNG CHỜ LẮP ĐẶT TRÊN LAVALINK')
            .setDescription(`▶️ **Đang phát:** [${player.queue.current.title}](${player.queue.current.uri})\n\n**Bài tiếp theo:**\n${list}`);

        return message.channel.send({ embeds: [embed] });
    }
});

// ==========================================
// 🖱️ NÚT BẤM ĐIỀU KHIỂN (INTERACTION)
// ==========================================
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const player = kazagumo.players.get(i.guild.id);
    if (!player) return i.reply({ content: '❌ Nhạc đã dừng!', ephemeral: true });

    if (i.customId === 'btn_pause') {
        player.pause(!player.paused);
        return i.reply({ content: player.paused ? '⏸️ Tạm dừng!' : '▶️ Tiếp tục!', ephemeral: true });
    }
    if (i.customId === 'btn_skip') {
        player.skip();
        return i.reply({ content: '⏭️ Đã Skip!', ephemeral: true });
    }
    if (i.customId === 'btn_stop') {
        player.destroy();
        return i.reply({ content: '⏹️ Đã tắt nhạc!', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
 
