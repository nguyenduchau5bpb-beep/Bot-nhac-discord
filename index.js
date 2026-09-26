const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    StringSelectMenuBuilder,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');

// Keep-Alive Server
const app = express();
app.get('/', (req, res) => res.send('👑 GOD-TIER MUSIC BOT IS ONLINE 24/7!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web Server Started!'));

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
// 🎨 THANH TIẾN TRÌNH & NÚT BẤM ĐIỀU KHIỂN
// ==========================================
function createProgressBar(currentSec, totalSec, size = 12) {
    if (!totalSec || isNaN(totalSec)) return '🔘' + '▬'.repeat(size);
    const progress = Math.min(Math.round((currentSec / totalSec) * size), size);
    return '▬'.repeat(progress) + '🔘' + '▬'.repeat(Math.max(0, size - progress));
}

function createControlRow(isPaused = false, loopMode = 0) {
    let loopLabel = '🔁 Loop: OFF';
    let loopStyle = ButtonStyle.Secondary;
    if (loopMode === 1) { loopLabel = '🔂 Loop: Song'; loopStyle = ButtonStyle.Success; }
    if (loopMode === 2) { loopLabel = '🔁 Loop: Queue'; loopStyle = ButtonStyle.Primary; }

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('btn_pause')
            .setLabel(isPaused ? '▶️ Resume' : '⏸️ Pause')
            .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('btn_skip')
            .setLabel('⏭️ Skip')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_loop')
            .setLabel(loopLabel)
            .setStyle(loopStyle),
        new ButtonBuilder()
            .setCustomId('btn_queue')
            .setLabel('📋 Queue')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('btn_stop')
            .setLabel('⏹️ Stop')
            .setStyle(ButtonStyle.Danger)
    );
}

// ==========================================
// 🎧 LUỒNG PHÁT NHẠC SIÊU MƯỢT
// ==========================================
async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('✨ *Hàng chờ đã hết. Bot ngắt kết nối để tiết kiệm tài nguyên!*');
        }, 120000);
        return;
    }

    if (queue.timeout) clearTimeout(queue.timeout);
    const song = queue.songs[0];

    try {
        const stream = ytdl(song.url, {
            filter: 'audioonly',
            highWaterMark: 1 << 25,
            quality: 'highestaudio'
        });

        const resource = createAudioResource(stream);
        queue.player.play(resource);
        queue.playing = true;
        queue.startTime = Date.now();

        client.user.setActivity(`🎶 ${song.title}`, { type: 2 });

        const bar = createProgressBar(0, song.seconds);
        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('👑 ĐANG PHÁT NHẠC VVIP')
            .setDescription(`🎵 **[${song.title}](${song.url})**\n\n\`00:00\` ${bar} \`${song.duration}\`\n\n👤 **Yêu cầu bởi:** **${song.requestedBy}** | 📚 **Hàng chờ:** \`${queue.songs.length - 1}\` bài`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: '⚡ God-Tier Engine v4.0 • Zero-Lag Guaranteed' })
            .setTimestamp();

        const row = createControlRow(false, queue.loop);
        queue.nowPlayingMessage = await textChannel.send({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('Playback Error:', error);
        textChannel.send(`⚠️ Không thể tải bài **${song.title}**, tự động phát bài kế tiếp...`);
        queue.songs.shift();
        playNextSong(guildId, textChannel);
    }
}

// ==========================================
// 🚀 ĐĂNG KÝ SLASH COMMANDS
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc bằng tên bài hát hoặc link YouTube')
        .addStringOption(opt => opt.setName('query').setDescription('Nhập tên bài hát hoặc link YouTube').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Xóa hàng chờ và ngắt kết nối Voice'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách hàng chờ nhạc VVIP'),
    new SlashCommandBuilder().setName('loop').setDescription('Đổi chế độ lặp (Tắt -> 1 Bài -> Hàng chờ)'),
    new SlashCommandBuilder().setName('shuffle').setDescription('Trộn ngẫu nhiên danh sách hàng chờ'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Xem chi tiết tiến trình bài hát đang phát')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`🚀 GOD-TIER BOT IS READY: ${client.user.tag}`);
    client.user.setActivity('🎵 /play để thưởng thức âm nhạc VVIP', { type: 2 });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã đồng bộ tất cả Slash Commands thành công!');
    } catch (err) {
        console.error('REST Commands Error:', err);
    }
});

// ==========================================
// 🔍 XỬ LÝ SEARCH BÀI HÁT & SELECT MENU
// ==========================================
async function handlePlay(guild, member, channel, query, replyFn) {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) return replyFn('🔊 Bạn hãy vào một Voice Channel trước!');

    try {
        let song = null;

        if (ytdl.validateURL(query)) {
            const info = await ytdl.getBasicInfo(query);
            song = {
                title: info.videoDetails.title,
                url: info.videoDetails.video_url,
                duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(14, 5),
                seconds: parseInt(info.videoDetails.lengthSeconds),
                thumbnail: info.videoDetails.thumbnails[0]?.url || '',
                requestedBy: member.user.username
            };
            addSongsToQueue(guild, member, voiceChannel, channel, [song]);
            return replyFn(`🎶 Đã thêm vào hàng chờ: **${song.title}**`);
        } else {
            // TÌM KIẾM BÀI HÁT TẠO MENU CHỌN XỊN XÒ
            const searchResult = await yts(query);
            const videos = searchResult.videos.slice(0, 5);

            if (!videos || videos.length === 0) return replyFn('❌ Không tìm thấy bài hát nào phù hợp!');

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('select_song')
                .setPlaceholder('🎯 Chọn bài hát bạn muốn phát...')
                .addOptions(videos.map((v, idx) => ({
                    label: `${idx + 1}.${v.title.slice(0, 90)}`,
                    description: `⏱️ Thời lượng: ${v.timestamp} \vert{} Kênh: ${v.author.name}`,
                    value: v.url
                })));

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return replyFn({ content: '🔍 **Kết quả tìm kiếm của bạn:**', components: [row] });
        }
    } catch (e) {
        console.error('Play Error:', e);
        return replyFn('❌ Có lỗi xảy ra khi xử lý bài hát!');
    }
}

function addSongsToQueue(guild, member, voiceChannel, channel, songs) {
    let queue = queues.get(guild.id);
    if (!queue) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        const player = createAudioPlayer();
        connection.subscribe(player);

        queue = { connection, player, songs: [], playing: false, loop: 0, startTime: 0, nowPlayingMessage: null };
        queues.set(guild.id, queue);
        queue.songs.push(...songs);

        player.on(AudioPlayerStatus.Idle, () => {
            if (queue.loop === 1) {
                // Lặp 1 bài
            } else if (queue.loop === 2) {
                // Lặp danh sách
                const finished = queue.songs.shift();
                queue.songs.push(finished);
            } else {
                queue.songs.shift();
            }
            playNextSong(guild.id, channel);
        });

        playNextSong(guild.id, channel);
    } else {
        queue.songs.push(...songs);
    }
}

// ==========================================
// 🖱️ LỆNH INTERACTION & NÚT BẤM VVIP
// ==========================================
client.on('interactionCreate', async (i) => {
    // 1. SELECT MENU CHO BÀI HÁT TÌM KIẾM
    if (i.isStringSelectMenu() && i.customId === 'select_song') {
        await i.deferUpdate();
        const songUrl = i.values[0];
        const info = await ytdl.getBasicInfo(songUrl);

        const song = {
            title: info.videoDetails.title,
            url: info.videoDetails.video_url,
            duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(14, 5),
            seconds: parseInt(info.videoDetails.lengthSeconds),
            thumbnail: info.videoDetails.thumbnails[0]?.url || '',
            requestedBy: i.user.username
        };

        addSongsToQueue(i.guild, i.member, i.member.voice.channel, i.channel, [song]);
        return i.editReply({ content: `✅ Đã chọn phát bài: **${song.title}**`, components: [] });
    }

    // 2. SLASH COMMANDS
    if (i.isChatInputCommand()) {
        await i.deferReply();
        const { commandName } = i;
        const queue = queues.get(i.guild.id);

        if (commandName === 'play') {
            const query = i.options.getString('query');
            await handlePlay(i.guild, i.member, i.channel, query, (data) => i.editReply(data));
        }

        if (commandName === 'skip') {
            if (!queue) return i.editReply('❌ Dòng nhạc đang trống!');
            queue.player.stop();
            return i.editReply('⏭️ Đã chuyển sang bài tiếp theo!');
        }

        if (commandName === 'stop') {
            if (!queue) return i.editReply('❌ Bot chưa vào kênh voice!');
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
            return i.editReply('⏹️ Đã tắt nhạc và thoát khỏi phòng!');
        }

        if (commandName === 'queue') {
            if (!queue || queue.songs.length === 0) return i.editReply('📋 Hàng chờ hiện đang trống!');
            let list = queue.songs.slice(0, 10).map((s, idx) => {
                return `${idx === 0 ? '▶️ **[Đang phát]**' : `**#${idx}**`} [${s.title}](${s.url}) | \`${s.duration}\``;
            }).join('\n');

            const embed = new EmbedBuilder()
                .setColor('#00FFAB')
                .setTitle('📜 Danh Sách Hàng Chờ VVIP')
                .setDescription(list + (queue.songs.length > 10 ? `\n... và **${queue.songs.length - 10}** bài nữa.` : ''))
                .setFooter({ text: `Chế độ Lặp: ${queue.loop === 0 ? 'Tắt' : queue.loop === 1 ? 'Bài Hát' : 'Hàng Chờ'}` });

            return i.editReply({ embeds: [embed] });
        }

        if (commandName === 'loop') {
            if (!queue) return i.editReply('❌ Dòng nhạc đang trống!');
            queue.loop = (queue.loop + 1) % 3;
            const modes = ['TẮT ❌', 'Lặp 1 Bài Hát 🔂', 'Lặp Cả Hàng Chờ 🔁'];
            return i.editReply(`🔄 Chế độ lặp hiện tại: **${modes[queue.loop]}**`);
        }

        if (commandName === 'shuffle') {
            if (!queue || queue.songs.length <= 2) return i.editReply('❌ Cần ít nhất 3 bài trong hàng chờ để trộn!');
            const now = queue.songs.shift();
            for (let idx = queue.songs.length - 1; idx > 0; idx--) {
                const j = Math.floor(Math.random() * (idx + 1));
                [queue.songs[idx], queue.songs[j]] = [queue.songs[j], queue.songs[idx]];
            }
            queue.songs.unshift(now);
            return i.editReply('🔀 Đã xáo trộn danh sách bài hát mượt mà!');
        }

        if (commandName === 'nowplaying') {
            if (!queue || queue.songs.length === 0) return i.editReply('❌ Không có bài hát nào đang phát!');
            const song = queue.songs[0];
            const currentSec = Math.floor((Date.now() - queue.startTime) / 1000);
            const bar = createProgressBar(currentSec, song.seconds);

            const embed = new EmbedBuilder()
                .setColor('#FF007F')
                .setTitle('🎶 BÀI HÁT ĐANG PHÁT')
                .setDescription(`👉 **[${song.title}](${song.url})**\n\n\`${bar}\`\n⏱️ Yêu cầu bởi: **${song.requestedBy}**`)
                .setThumbnail(song.thumbnail);

            return i.editReply({ embeds: [embed] });
        }
    }

    // 3. XỬ LÝ NÚT BẤM (BUTTONS)
    if (i.isButton()) {
        const queue = queues.get(i.guild.id);
        if (!queue) return i.reply({ content: '❌ Hàng chờ nhạc đã ngắt!', ephemeral: true });

        if (i.customId === 'btn_pause') {
            if (queue.playing) {
                queue.player.pause();
                queue.playing = false;
                await i.update({ components: [createControlRow(true, queue.loop)] });
            } else {
                queue.player.unpause();
                queue.playing = true;
                await i.update({ components: [createControlRow(false, queue.loop)] });
            }
        }

        if (i.customId === 'btn_skip') {
            queue.player.stop();
            return i.reply({ content: '⏭️ Đã skip!', ephemeral: true });
        }

        if (i.customId === 'btn_loop') {
            queue.loop = (queue.loop + 1) % 3;
            await i.update({ components: [createControlRow(!queue.playing, queue.loop)] });
        }

        if (i.customId === 'btn_queue') {
            let list = queue.songs.slice(0, 5).map((s, index) => `${index === 0 ? '▶️' : `**${index}.**`} ${s.title}`).join('\n');
            return i.reply({ content: `📋 **Hàng chờ hiện tại:**\n${list}`, ephemeral: true });
        }

        if (i.customId === 'btn_stop') {
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
            return i.reply({ content: '⏹️ Đã tắt nhạc!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
