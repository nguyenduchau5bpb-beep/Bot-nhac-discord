const express = require('express');
const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    REST,
    Routes,
    SlashCommandBuilder
} = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const play = require('play-dl');

// Keep-Alive Server
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
// 🎧 PHÁT LUỒNG ÂM THANH
// ==========================================
async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('⏹️ *Đã rời Voice Channel do hết nhạc.*');
        }, 120000);
        return;
    }

    if (queue.timeout) clearTimeout(queue.timeout);
    const song = queue.songs[0];

    try {
        let stream = await play.stream(song.url, { discordPlayerCompatibility: true }).catch(async () => {
            const scSearch = await play.search(song.title, { limit: 1, source: { soundcloud: 'tracks' } });
            if (scSearch.length > 0) return await play.stream(scSearch[0].url, { discordPlayerCompatibility: true });
            throw new Error('Stream Failed');
        });

        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        queue.player.play(resource);
        queue.playing = true;

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎶 ĐANG PHÁT NHẠC')
            .setDescription(`👉 **[${song.title}](${song.url})**\n⏱️ Thời lượng: \`${song.duration}\` | Yêu cầu: **${song.requestedBy}**`)
            .setThumbnail(song.thumbnail);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
        );

        textChannel.send({ embeds: [embed], components: [row] });
    } catch (error) {
        console.error('Lỗi Stream:', error);
        textChannel.send(`⚠️ Lỗi tải bài **${song.title}**, đang chuyển bài tiếp...`);
        queue.songs.shift();
        playNextSong(guildId, textChannel);
    }
}

// ==========================================
// 🚀 ĐĂNG KÝ SLASH COMMANDS VỚI DISCORD
// ==========================================
const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ tên bài hát hoặc đường link')
        .addStringOption(opt => opt.setName('query').setDescription('Tên bài hát hoặc link YouTube/SoundCloud').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và rời voice')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`✅ BOT ONLINE: ${client.user.tag}`);
    client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        console.log('⏳ Đang đồng bộ Slash Commands...');
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Cập nhật /play, /skip, /stop thành công!');
    } catch (err) {
        console.error('Lỗi REST Slash Commands:', err);
    }
});

// ==========================================
// 🔍 XỬ LÝ DỮ LIỆU BÀI HÁT
// ==========================================
async function handlePlay(guild, member, channel, query, replyFn) {
    const voiceChannel = member.voice.channel;
    if (!voiceChannel) return replyFn('🔊 Bạn cần vào Voice Channel trước!');

    try {
        let songsToAdd = [];
        const validation = await play.validate(query);

        if (validation === 'yt_playlist') {
            const playlist = await play.playlist_info(query, { incomplete: true });
            const videos = await playlist.all_videos();
            for (const vid of videos) {
                songsToAdd.push({
                    title: vid.title,
                    url: vid.url,
                    duration: vid.durationRaw || 'N/A',
                    thumbnail: vid.thumbnails[0]?.url || '',
                    requestedBy: member.user.username
                });
            }
            replyFn(`✅ Đã thêm **${songsToAdd.length}** bài từ Playlist **${playlist.title}**!`);
        } else if (validation === 'yt_video') {
            const videoInfo = await play.video_basic_info(query);
            const vid = videoInfo.video_details;
            songsToAdd.push({
                title: vid.title,
                url: vid.url,
                duration: vid.durationRaw || 'N/A',
                thumbnail: vid.thumbnails[0]?.url || '',
                requestedBy: member.user.username
            });
        } else {
            let searchResult = await play.search(query, { limit: 1, source: { soundcloud: 'tracks' } });
            if (!searchResult || searchResult.length === 0) {
                searchResult = await play.search(query, { limit: 1, source: { youtube: 'video' } });
            }

            if (!searchResult || searchResult.length === 0) return replyFn('❌ Không tìm thấy bài hát!');

            songsToAdd.push({
                title: searchResult[0].title,
                url: searchResult[0].url,
                duration: searchResult[0].durationRaw || 'N/A',
                thumbnail: searchResult[0].thumbnails[0]?.url || '',
                requestedBy: member.user.username
            });
        }

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

            queue = { connection, player, songs: [], playing: false };
            queues.set(guild.id, queue);
            queue.songs.push(...songsToAdd);

            player.on(AudioPlayerStatus.Idle, () => {
                queue.songs.shift();
                playNextSong(guild.id, channel);
            });

            if (validation !== 'yt_playlist') {
                replyFn(`🎶 Đang phát: **${songsToAdd[0].title}**`);
            }
            playNextSong(guild.id, channel);
        } else {
            queue.songs.push(...songsToAdd);
            if (validation !== 'yt_playlist') {
                replyFn(`✅ Đã thêm bài hát vào hàng chờ **#${queue.songs.length}**: **${songsToAdd[0].title}**`);
            }
        }
    } catch (e) {
        console.error('Lỗi Play:', e);
        return replyFn('❌ Có lỗi xảy ra khi xử lý yêu cầu!');
    }
}

// ==========================================
// 🖱️ XỬ LÝ SLASH COMMANDS VÀ BUTTON
// ==========================================
client.on('interactionCreate', async (interaction) => {
    // 1. Lệnh Slash Command (Bắt đầu bằng dấu /)
    if (interaction.isChatInputCommand()) {
        // Phản hồi ngay lập tức để chống lỗi "Ứng dụng không phản hồi"
        await interaction.deferReply();

        const { commandName } = interaction;

        if (commandName === 'play') {
            const query = interaction.options.getString('query');
            await handlePlay(
                interaction.guild, 
                interaction.member, 
                interaction.channel, 
                query, 
                (content) => interaction.editReply(content)
            );
        }

        if (commandName === 'skip') {
            const queue = queues.get(interaction.guild.id);
            if (!queue) return interaction.editReply('❌ Dòng nhạc đang trống!');
            queue.player.stop();
            return interaction.editReply('⏭️ Đã skip bài hát!');
        }

        if (commandName === 'stop') {
            const queue = queues.get(interaction.guild.id);
            if (!queue) return interaction.editReply('❌ Bot không trong kênh voice!');
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(interaction.guild.id);
            return interaction.editReply('⏹️ Đã tắt nhạc và rời kênh!');
        }
    }

    // 2. Nút bấm trên khung nhạc
    if (interaction.isButton()) {
        const queue = queues.get(interaction.guild.id);
        if (!queue) return interaction.reply({ content: '❌ Nhạc đã dừng từ trước!', ephemeral: true });

        if (interaction.customId === 'btn_skip') {
            queue.player.stop();
            return interaction.reply({ content: '⏭️ Đã skip!', ephemeral: true });
        }
        if (interaction.customId === 'btn_stop') {
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(interaction.guild.id);
            return interaction.reply({ content: '⏹️ Đã tắt nhạc!', ephemeral: true });
        }
    }
});

// Vẫn giữ hỗ trợ Prefix !play nếu cần
client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.content.startsWith(PREFIX)) return;
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'play' || command === 'p') {
        const query = args.join(' ');
        if (!query) return message.reply('❌ Vui lòng nhập tên bài!');
        const msg = await message.reply('⚡ Đang xử lý...');
        handlePlay(message.guild, message.member, message.channel, query, (content) => msg.edit(content));
    }
});

client.login(process.env.TOKEN);
 
