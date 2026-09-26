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
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus,
    entersState,
    VoiceConnectionStatus
} = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
const yts = require('yt-search');

const app = express();
app.get('/', (req, res) => res.send('👑 MUSIC BOT IS ONLINE 24/7!'));
app.listen(process.env.PORT || 3000, () => console.log('🌐 Web Server Active!'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();

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
        new ButtonBuilder().setCustomId('btn_pause').setLabel(isPaused ? '▶️ Resume' : '⏸️ Pause').setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_loop').setLabel(loopLabel).setStyle(loopStyle),
        new ButtonBuilder().setCustomId('btn_queue').setLabel('📋 Queue').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );
}

// PHÁT NHẠC VÀ BẢO BỎ KẾT NỐI VOICE AN TOÀN
async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('✨ *Đã rời kênh Voice để tiết kiệm băng thông!*');
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
            .setFooter({ text: '⚡ Dynamic Audio Core' });

        const row = createControlRow(false, queue.loop);
        queue.nowPlayingMessage = await textChannel.send({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('Playback Error:', error);
        textChannel.send(`⚠️ Lỗi tải bài **${song.title}**, đang chuyển sang bài tiếp theo...`);
        queue.songs.shift();
        playNextSong(guildId, textChannel);
    }
}

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ link hoặc tìm kiếm bài hát')
        .addStringOption(opt => opt.setName('query').setDescription('Tên bài hát hoặc URL YouTube').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng nhạc và thoát kênh Voice'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem hàng chờ nhạc'),
    new SlashCommandBuilder().setName('loop').setDescription('Đổi chế độ Lặp nhạc'),
    new SlashCommandBuilder().setName('shuffle').setDescription('Trộn bài hát trong hàng chờ')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`🚀 BOT ONLINE: ${client.user.tag}`);
    client.user.setActivity('🎵 /play để thưởng thức nhạc', { type: 2 });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã nạp Slash Commands thành công!');
    } catch (err) {
        console.error('REST Commands Error:', err);
    }
});

// THÊM BÀI HÁT VÀO QUEUE & PHÁT KẾT NỐI VOICE
async function addSongsToQueue(guild, member, voiceChannel, channel, songs) {
    let queue = queues.get(guild.id);
    if (!queue) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        // Đảm bảo kết nối Voice sẵn sàng
        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 20000);
        } catch (e) {
            connection.destroy();
            return channel.send('❌ Không thể kết nối tới Voice Channel! Kiểm tra lại quyền của Bot.');
        }

        const player = createAudioPlayer();
        connection.subscribe(player);

        queue = { connection, player, songs: [], playing: false, loop: 0, startTime: 0, nowPlayingMessage: null };
        queues.set(guild.id, queue);
        queue.songs.push(...songs);

        player.on(AudioPlayerStatus.Idle, () => {
            if (queue.loop === 1) {
                // Loop 1 bài
            } else if (queue.loop === 2) {
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

client.on('interactionCreate', async (i) => {
    // 1. CHỌN BÀI HÁT TỪ SELECT MENU
    if (i.isStringSelectMenu() && i.customId === 'select_song') {
        // Phản hồi Discord lập tức để tránh lỗi "Ứng dụng không phản hồi"
        await i.deferReply();
        const songUrl = i.values[0];
        
        if (!i.member.voice.channel) {
            return i.editReply('🔊 Bạn cần phải vào Voice Channel trước!');
        }

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
        return i.editReply({ content: `✅ Đã chọn phát bài: **${song.title}**` });
    }

    // 2. XỬ LÝ SLASH COMMANDS
    if (i.isChatInputCommand()) {
        await i.deferReply(); // Phản hồi ngay lập tức để tránh Timeout
        const { commandName } = i;
        const queue = queues.get(i.guild.id);

        if (commandName === 'play') {
            const voiceChannel = i.member.voice.channel;
            if (!voiceChannel) return i.editReply('🔊 Bạn cần vào một Voice Channel trước!');

            const query = i.options.getString('query');

            try {
                if (ytdl.validateURL(query)) {
                    const info = await ytdl.getBasicInfo(query);
                    const song = {
                        title: info.videoDetails.title,
                        url: info.videoDetails.video_url,
                        duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(14, 5),
                        seconds: parseInt(info.videoDetails.lengthSeconds),
                        thumbnail: info.videoDetails.thumbnails[0]?.url || '',
                        requestedBy: i.user.username
                    };
                    addSongsToQueue(i.guild, i.member, voiceChannel, i.channel, [song]);
                    return i.editReply(`🎶 Đã thêm bài hát vào hàng chờ: **${song.title}**`);
                } else {
                    const searchResult = await yts(query);
                    const videos = searchResult.videos.slice(0, 5);

                    if (!videos || videos.length === 0) return i.editReply('❌ Không tìm thấy bài hát nào!');

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId('select_song')
                        .setPlaceholder('🎯 Chọn bài hát phát ngay...')
                        .addOptions(videos.map((v, idx) => ({
                            label: `${idx + 1}.${v.title.slice(0, 90)}`,
                            description: `⏱️ ${v.timestamp} \vert{} Kênh: ${v.author.name}`,
                            value: v.url
                        })));

                    const row = new ActionRowBuilder().addComponents(selectMenu);
                    return i.editReply({ content: '🔍 **Chọn bài hát bên dưới:**', components: [row] });
                }
            } catch (err) {
                console.error(err);
                return i.editReply('❌ Đã xảy ra lỗi khi tìm kiếm bài hát!');
            }
        }

        if (commandName === 'skip') {
            if (!queue) return i.editReply('❌ Hàng chờ hiện đang trống!');
            queue.player.stop();
            return i.editReply('⏭️ Đã skip bài!');
        }

        if (commandName === 'stop') {
            if (!queue) return i.editReply('❌ Bot không ở trong Voice!');
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
            return i.editReply('⏹️ Đã ngắt kết nối Voice!');
        }

        if (commandName === 'queue') {
            if (!queue || queue.songs.length === 0) return i.editReply('📋 Hàng chờ đang trống!');
            let list = queue.songs.slice(0, 10).map((s, idx) => `${idx === 0 ? '▶️ **[Đang phát]**' : `**#${idx}**`} [${s.title}](${s.url}) | \`${s.duration}\``).join('\n');
            const embed = new EmbedBuilder().setColor('#00FFAB').setTitle('📜 Danh Sách Hàng Chờ').setDescription(list);
            return i.editReply({ embeds: [embed] });
        }

        if (commandName === 'loop') {
            if (!queue) return i.editReply('❌ Hàng chờ đang trống!');
            queue.loop = (queue.loop + 1) % 3;
            const modes = ['TẮT ❌', 'Lặp 1 Bài Hát 🔂', 'Lặp Cả Hàng Chờ 🔁'];
            return i.editReply(`🔄 Đổi chế độ lặp thành: **${modes[queue.loop]}**`);
        }

        if (commandName === 'shuffle') {
            if (!queue || queue.songs.length <= 2) return i.editReply('❌ Cần từ 3 bài trở lên để trộn!');
            const now = queue.songs.shift();
            for (let idx = queue.songs.length - 1; idx > 0; idx--) {
                const j = Math.floor(Math.random() * (idx + 1));
                [queue.songs[idx], queue.songs[j]] = [queue.songs[j], queue.songs[idx]];
            }
            queue.songs.unshift(now);
            return i.editReply('🔀 Đã xáo trộn danh sách bài hát!');
        }
    }

    // 3. XỬ LÝ NÚT BẤM (BUTTONS)
    if (i.isButton()) {
        const queue = queues.get(i.guild.id);
        if (!queue) return i.reply({ content: '❌ Nhạc đã dừng!', ephemeral: true });

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
            return i.reply({ content: '⏹️ Đã dừng phát nhạc!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
