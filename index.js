const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

// ==========================================
// 🌐 KEEP-ALIVE SERVER CHO RENDER
// ==========================================
const app = express();
app.get('/', (req, res) => res.send('🎵 BOT MUSIC IS ONLINE 24/7!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web Server Started!'));

const PREFIX = '!';
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();

// ==========================================
// 🎧 HÀM PHÁT NHẠC
// ==========================================
async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('⏹️ *Đã rời Voice Channel do hết nhạc trong hàng chờ.*');
        }, 120000);
        return;
    }

    if (queue.timeout) clearTimeout(queue.timeout);
    const song = queue.songs[0];

    try {
        const stream = await play.stream(song.url, { quality: 2 });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });

        queue.player.play(resource);
        queue.playing = true;

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎶 ĐANG PHÁT NHẠC')
            .setDescription(`👉 **[${song.title}](${song.url})**\n⏱️ Thời lượng: \`${song.duration}\` | Yêu cầu bởi: **${song.requestedBy}**`)
            .setThumbnail(song.thumbnail);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
        );

        textChannel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Lỗi Stream:', error);
        textChannel.send(`⚠️ Lỗi bài **${song.title}**, đang tự chuyển bài tiếp...`);
        queue.songs.shift();
        playNextSong(guildId, textChannel);
    }
}

client.on('ready', () => {
    console.log(`✅ BOT MUSIC ONLINE KHÔNG LỖI: ${client.user.tag}`);
    client.user.setActivity('🎵 !play <link YT / tên bài>', { type: 2 });
});

// ==========================================
// 📩 XỬ LÝ LỆNH CHAT
// ==========================================
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('🔊 Bạn phải vào Voice Channel trước!');

        const query = args.join(' ');
        if (!query) return message.reply('❌ Nhập tên bài hoặc dán link YouTube! Ví dụ: `!play Sơn Tùng M-TP`');

        const msg = await message.reply('🔍 *Đang xử lý bài hát / đường link...*');

        try {
            let songsToAdd = [];
            const validation = await play.validate(query);

            // 1. Dán link Playlist YouTube
            if (validation === 'yt_playlist') {
                const playlist = await play.playlist_info(query, { incomplete: true });
                const videos = await playlist.all_videos();
                for (const vid of videos) {
                    songsToAdd.push({
                        title: vid.title,
                        url: vid.url,
                        duration: vid.durationRaw || 'N/A',
                        thumbnail: vid.thumbnails[0]?.url || '',
                        requestedBy: message.author.username
                    });
                }
                msg.edit(`✅ Đã thêm **${songsToAdd.length}** bài từ Playlist **${playlist.title}** vào hàng chờ!`);

            // 2. Dán link Video YouTube
            } else if (validation === 'yt_video') {
                const videoInfo = await play.video_basic_info(query);
                const vid = videoInfo.video_details;
                songsToAdd.push({
                    title: vid.title,
                    url: vid.url,
                    duration: vid.durationRaw || 'N/A',
                    thumbnail: vid.thumbnails[0]?.url || '',
                    requestedBy: message.author.username
                });

            // 3. Tìm kiếm bằng từ khóa tên bài hát
            } else {
                let searchResult = await play.search(query, { limit: 1, source: { youtube: 'video' } });
                if (!searchResult || searchResult.length === 0) {
                    searchResult = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
                }

                if (!searchResult || searchResult.length === 0) return msg.edit('❌ Không tìm thấy bài hát!');

                songsToAdd.push({
                    title: searchResult[0].title,
                    url: searchResult[0].url,
                    duration: searchResult[0].durationRaw || 'N/A',
                    thumbnail: searchResult[0].thumbnails[0]?.url || '',
                    requestedBy: message.author.username
                });
            }

            let queue = queues.get(message.guild.id);

            if (!queue) {
                const connection = joinVoiceChannel({
                    channelId: voiceChannel.id,
                    guildId: message.guild.id,
                    adapterCreator: message.guild.voiceAdapterCreator,
                });

                const player = createAudioPlayer();
                connection.subscribe(player);

                queue = {
                    connection: connection,
                    player: player,
                    songs: [],
                    playing: false
                };

                queues.set(message.guild.id, queue);
                queue.songs.push(...songsToAdd);

                player.on(AudioPlayerStatus.Idle, () => {
                    queue.songs.shift();
                    playNextSong(message.guild.id, message.channel);
                });

                if (validation !== 'yt_playlist') msg.delete();
                playNextSong(message.guild.id, message.channel);
            } else {
                queue.songs.push(...songsToAdd);
                if (validation !== 'yt_playlist') {
                    msg.edit(`✅ Đã thêm vào hàng chờ vị trí **#${queue.songs.length}**: **${songsToAdd[0].title}**`);
                }
            }
        } catch (e) {
            console.error(e);
            return msg.edit('❌ Link không hợp lệ hoặc xảy ra lỗi khi tải dữ liệu!');
        }
    }

    if (command === 'skip' || command === 's') {
        const queue = queues.get(message.guild.id);
        if (!queue) return message.reply('❌ Không có bài hát nào!');
        queue.player.stop();
        return message.reply('⏭️ Đã skip bài!');
    }

    if (command === 'stop' || command === 'leave') {
        const queue = queues.get(message.guild.id);
        if (!queue) return message.reply('❌ Bot không ở trong Voice!');
        queue.songs = [];
        queue.player.stop();
        if (queue.connection) queue.connection.destroy();
        queues.delete(message.guild.id);
        return message.reply('⏹️ Đã tắt nhạc và thoát!');
    }
});

// ==========================================
// 🖱️ CÁC NÚT BẤM ĐIỀU KHIỂN
// ==========================================
client.on('interactionCreate', async (i) => {
    if (!i.isButton()) return;
    const queue = queues.get(i.guild.id);
    if (!queue) return i.reply({ content: '❌ Nhạc đã dừng!', ephemeral: true });

    if (i.customId === 'btn_skip') {
        queue.player.stop();
        return i.reply({ content: '⏭️ Đã Skip!', ephemeral: true });
    }
    if (i.customId === 'btn_stop') {
        queue.songs = [];
        queue.player.stop();
        if (queue.connection) queue.connection.destroy();
        queues.delete(i.guild.id);
        return i.reply({ content: '⏹️ Đã tắt nhạc!', ephemeral: true });
    }
});

client.login(process.env.TOKEN);
