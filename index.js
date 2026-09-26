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
const play = require('play-dl');

const app = express();
app.get('/', (req, res) => res.send('👑 FAST MUSIC BOT IS ONLINE!'));
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

// ==========================================
// 🎧 PHÁT NHẠC TỐC ĐỘ CAO
// ==========================================
async function playNextSong(guildId, textChannel) {
    const queue = queues.get(guildId);
    if (!queue || queue.songs.length === 0) {
        queue.playing = false;
        client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
        queue.timeout = setTimeout(() => {
            if (queue.connection) queue.connection.destroy();
            queues.delete(guildId);
            textChannel.send('✨ *Hàng chờ đã hết. Bot ngắt kết nối voice!*');
        }, 120000);
        return;
    }

    if (queue.timeout) clearTimeout(queue.timeout);
    const song = queue.songs[0];

    try {
        // Lấy stream trực tiếp siêu tốc
        let stream = await play.stream(song.url, { discordPlayerCompatibility: true });
        const resource = createAudioResource(stream.stream, { inputType: stream.type });
        
        queue.player.play(resource);
        queue.playing = true;
        queue.startTime = Date.now();

        client.user.setActivity(`🎶 ${song.title}`, { type: 2 });

        const embed = new EmbedBuilder()
            .setColor('#7289DA')
            .setTitle('👑 ĐANG PHÁT NHẠC VVIP')
            .setDescription(`🎵 **[${song.title}](${song.url})**\n\n⏱️ **Thời lượng:** \`${song.duration}\`\n👤 **Yêu cầu bởi:** **${song.requestedBy}**\n📚 **Còn lại trong hàng chờ:** \`${queue.songs.length - 1}\` bài`)
            .setThumbnail(song.thumbnail)
            .setFooter({ text: '⚡ Ultra Fast Engine' });

        const row = createControlRow(false, queue.loop);
        queue.nowPlayingMessage = await textChannel.send({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('Playback Error:', error);
        textChannel.send(`⚠️ Lỗi khi phát **${song.title}**, đang chuyển bài kế tiếp...`);
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
        .setDescription('Phát nhạc siêu tốc từ tên bài hát hoặc link nhạc')
        .addStringOption(opt => opt.setName('query').setDescription('Tên bài hát').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng phát nhạc và rời kênh Voice'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách hàng chờ phát nhạc'),
    new SlashCommandBuilder().setName('loop').setDescription('Chuyển đổi chế độ lặp bài'),
    new SlashCommandBuilder().setName('shuffle').setDescription('Trộn danh sách hàng chờ')
].map(c => c.toJSON());

client.on('ready', async () => {
    console.log(`🚀 BOT ONLINE: ${client.user.tag}`);
    client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã nạp Slash Commands thành công!');
    } catch (err) {
        console.error('REST Error:', err);
    }
});

// ==========================================
// 🔗 KẾT NỐI VOICE & THÊM HÀNG CHỜ
// ==========================================
async function addSongsToQueue(guild, member, voiceChannel, channel, songs) {
    let queue = queues.get(guild.id);
    if (!queue) {
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true
        });

        try {
            await entersState(connection, VoiceConnectionStatus.Ready, 15000);
        } catch (e) {
            connection.destroy();
            return channel.send('❌ Không thể vào Voice Channel! Vui lòng kiểm tra quyền Kết nối của Bot.');
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

// ==========================================
// 🖱️ XỬ LÝ SỰ KIỆN NÚT BẤM & MENU (FIX LỖI TREO)
// ==========================================
client.on('interactionCreate', async (i) => {

    // 1. CHỌN BÀI HÁT TỪ SELECT MENU (ĐÃ FIX SỰ KIỆN DEFER UPDATE)
    if (i.isStringSelectMenu() && i.customId === 'select_song') {
        // Dùng deferUpdate() để cập nhật Menu mượt mà, không bị treo "Đang suy nghĩ..."
        await i.deferUpdate(); 
        
        if (!i.member.voice.channel) {
            return i.followUp({ content: '🔊 Bạn cần vào một Voice Channel trước!', ephemeral: true });
        }

        const selectedUrl = i.values[0];
        try {
            const searchRes = await play.search(selectedUrl, { limit: 1 });
            if (searchRes.length > 0) {
                const item = searchRes[0];
                const song = {
                    title: item.title,
                    url: item.url,
                    duration: item.durationRaw || 'N/A',
                    seconds: item.durationInSec || 0,
                    thumbnail: item.thumbnails[0]?.url || '',
                    requestedBy: i.user.username
                };

                addSongsToQueue(i.guild, i.member, i.member.voice.channel, i.channel, [song]);
                return i.editReply({ content: `✅ **Đã chọn:** ${song.title}`, components: [] });
            }
        } catch (err) {
            console.error(err);
            return i.editReply({ content: '❌ Không thể phát bài hát này!', components: [] });
        }
    }

    // 2. LỆNH SLASH COMMANDS
    if (i.isChatInputCommand()) {
        await i.deferReply();
        const { commandName } = i;
        const queue = queues.get(i.guild.id);

        if (commandName === 'play') {
            const voiceChannel = i.member.voice.channel;
            if (!voiceChannel) return i.editReply('🔊 Bạn cần vào một Voice Channel trước!');

            const query = i.options.getString('query');

            try {
                // TÌM KIẾM NHANH QUA SOUNDCLOUD / YOUTUBE
                let results = await play.search(query, { limit: 5, source: { soundcloud: 'tracks' } });
                if (!results || results.length === 0) {
                    results = await play.search(query, { limit: 5, source: { youtube: 'video' } });
                }

                if (!results || results.length === 0) return i.editReply('❌ Không tìm thấy kết quả nào!');

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('select_song')
                    .setPlaceholder('🎯 Chọn bài hát phát ngay...')
                    .addOptions(results.slice(0, 5).map((v, idx) => ({
                        label: `${idx + 1}.${v.title.slice(0, 90)}`,
                        description: `⏱️ ${v.durationRaw || 'N/A'}`,
                        value: v.url
                    })));

                const row = new ActionRowBuilder().addComponents(selectMenu);
                return i.editReply({ content: '🔍 **Chọn bài hát bạn muốn nghe:**', components: [row] });

            } catch (err) {
                console.error(err);
                return i.editReply('❌ Có lỗi xảy ra khi tìm kiếm!');
            }
        }

        if (commandName === 'skip') {
            if (!queue) return i.editReply('❌ Hàng chờ đang trống!');
            queue.player.stop();
            return i.editReply('⏭️ Đã skip bài hát!');
        }

        if (commandName === 'stop') {
            if (!queue) return i.editReply('❌ Bot chưa ở trong kênh Voice!');
            queue.songs = [];
            queue.player.stop();
            if (queue.connection) queue.connection.destroy();
            queues.delete(i.guild.id);
            client.user.setActivity('🎵 /play để nghe nhạc', { type: 2 });
            return i.editReply('⏹️ Đã dừng nhạc và ngắt kết nối!');
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
            return i.editReply(`🔄 Chế độ lặp: **${modes[queue.loop]}**`);
        }

        if (commandName === 'shuffle') {
            if (!queue || queue.songs.length <= 2) return i.editReply('❌ Cần từ 3 bài trở lên để trộn!');
            const now = queue.songs.shift();
            for (let idx = queue.songs.length - 1; idx > 0; idx--) {
                const j = Math.floor(Math.random() * (idx + 1));
                [queue.songs[idx], queue.songs[j]] = [queue.songs[j], queue.songs[idx]];
            }
            queue.songs.unshift(now);
            return i.editReply('🔀 Đã trộn danh sách bài hát!');
        }
    }

    // 3. XỬ LÝ NÚT BẤM TƯƠNG TÁC
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
            return i.reply({ content: '⏹️ Đã dừng nhạc!', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
