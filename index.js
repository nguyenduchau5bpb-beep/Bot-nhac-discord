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
app.get('/', (req, res) => res.send('🌐 BOT ONLINE 24/7'));
app.listen(process.env.PORT || 3000, () => console.log('Server Ready!'));

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

const queues = new Map();

function createControlRow(isPaused = false) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_pause').setLabel(isPaused ? '▶️ Tiếp tục' : '⏸️ Tạm dừng').setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('btn_skip').setLabel('⏭️ Bỏ qua').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('btn_stop').setLabel('⏹️ Dừng nhạc').setStyle(ButtonStyle.Danger)
    );
}

async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('✨ *Hàng chờ đã hết, bot ngắt kết nối.*');
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

        const embed = new EmbedBuilder()
            .setColor('#1DB954')
            .setTitle('🎶 ĐANG PHÁT NHẠC')
            .setDescription(`👉 **[${song.title}](${song.url})**\n\n⏱️ **Thời lượng:** \`${song.duration}\`\n👤 **Yêu cầu bởi:** **${song.requestedBy}**`)
            .setThumbnail(song.thumbnail);

        queue.nowPlayingMessage = await textChannel.send({ embeds: [embed], components: [createControlRow(false)] });

    } catch (error) {
        console.error('Lỗi phát nhạc:', error);
        textChannel.send(`⚠️ Không thể phát **${song.title}**, đang chuyển bài tiếp theo...`);
        queue.songs.shift();
        playNextSong(guildId, textChannel);
    }
}

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Phát nhạc từ YouTube')
        .addStringOption(opt => opt.setName('query').setDescription('Tên bài hát hoặc URL').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng nhạc và thoát Voice')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`✅ BOT ĐÃ SẴN SÀNG: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    } catch (err) {
        console.error('REST Error:', err);
    }
});

client.on('interactionCreate', async (i) => {
    if (i.isChatInputCommand()) {
        await i.deferReply();
        const { commandName } = i;
        const queue = queues.get(i.guild.id);

        if (commandName === 'play') {
            const voiceChannel = i.member.voice.channel;
            if (!voiceChannel) return i.editReply('🔊 Bạn phải vào Voice Channel trước!');

            const query = i.options.getString('query');

            try {
                let song = null;

                if (ytdl.validateURL(query)) {
                    const info = await ytdl.getBasicInfo(query);
                    song = {
                        title: info.videoDetails.title,
                        url: info.videoDetails.video_url,
                        duration: new Date(info.videoDetails.lengthSeconds * 1000).toISOString().substr(14, 5),
                        thumbnail: info.videoDetails.thumbnails[0]?.url || '',
                        requestedBy: i.user.username
                    };
                } else {
                    const searchResult = await yts(query);
                    const video = searchResult.videos[0];

                    if (!video) return i.editReply('❌ Không tìm thấy bài hát!');

                    song = {
                        title: video.title,
                        url: video.url,
                        duration: video.timestamp,
                        thumbnail: video.thumbnail,
                        requestedBy: i.user.username
                    };
                }

                let currentQueue = queues.get(i.guild.id);
                if (!currentQueue) {
                    const connection = joinVoiceChannel({
                        channelId: voiceChannel.id,
                        guildId: i.guild.id,
                        adapterCreator: i.guild.voiceAdapterCreator,
                        selfDeaf: true
                    });

                    await entersState(connection, VoiceConnectionStatus.Ready, 15000);

                    const player = createAudioPlayer();
                    connection.subscribe(player);

                    currentQueue = { connection, player, songs: [], playing: false };
                    queues.set(i.guild.id, currentQueue);
                    currentQueue.songs.push(song);

                    player.on(AudioPlayerStatus.Idle, () => {
                        currentQueue.songs.shift();
                        playNextSong(i.guild.id, i.channel);
                    });

                    i.editReply(`🎶 Đang xử lý bài hát: **${song.title}**`);
                    playNextSong(i.guild.id, i.channel);
                } else {
                    currentQueue.songs.push(song);
                    i.editReply(`✅ Đã thêm vào hàng chờ: **${song.title}**`);
                }

            } catch (err) {
                console.error(err);
                return i.editReply('❌ Có lỗi xảy ra khi xử lý bài hát!');
            }
        }

        if (commandName === 'skip') {
            if (!queue) return i.editReply('❌ Dòng nhạc đang trống!');
            queue.player.stop();
            return i.editReply('⏭️ Đã skip!');
        }

        if (commandName === 'stop') {
            if (!queue) return i.editReply('❌ Bot không trong voice!');
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            return i.editReply('⏹️ Đã dừng phát nhạc!');
        }
    }

    if (i.isButton()) {
        const queue = queues.get(i.guild.id);
        if (!queue) return i.reply({ content: '❌ Nhạc đã dừng!', ephemeral: true });

        if (i.customId === 'btn_pause') {
            if (queue.playing) {
                queue.player.pause();
                queue.playing = false;
                await i.update({ components: [createControlRow(true)] });
            } else {
                queue.player.unpause();
                queue.playing = true;
                await i.update({ components: [createControlRow(false)] });
            }
        }

        if (i.customId === 'btn_skip') {
            queue.player.stop();
            return i.reply({ content: '⏭️ Đã skip!', ephemeral: true });
        }

        if (i.customId === 'btn_stop') {
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            return i.reply({ content: '⏹️ Đã dừng!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
