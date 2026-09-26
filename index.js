const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder, 
    PermissionsBitField 
} = require('discord.js');
const { Connectors } = require('shoukaku');
const { Kazagumo, Plugins } = require('kazagumo');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

// Nodes Lavalink mượt đét
const Nodes = [
    { name: 'Node-1', url: 'lavalink.ptchosting.com:443', auth: 'ptchosting.com', secure: true },
    { name: 'Node-2', url: 'lava-v4.ajiehospitality.com:443', auth: 'https://discord.gg/ajiehospitality', secure: true }
];

const kazagumo = new Kazagumo({
    defaultSearchEngine: 'youtube',
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    plugins: [new Plugins.PlayerMoved(client)]
}, new Connectors.DiscordJS(client), Nodes);

// -------------------------------------------------------------
// KHAI BÁO TẤT CẢ LỆNH SLASH ( / )
// -------------------------------------------------------------
const commands = [
    // 🎵 Nhóm Lệnh Nhạc
    new SlashCommandBuilder().setName('play').setDescription('Phát nhạc từ YouTube/Spotify/SoundCloud').addStringOption(opt => opt.setName('song').setDescription('Tên bài hát hoặc Link').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng nhạc và rời kênh voice'),
    new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng hoặc phát tiếp nhạc'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách hàng đợi phát nhạc'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Xem bài hát đang phát'),

    // 👑 Nhóm Lệnh Admin & Quản Lý
    new SlashCommandBuilder().setName('clear').setDescription('Xóa tin nhắn rác').addIntegerOption(opt => opt.setName('amount').setDescription('Số lượng (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Cấm ngôn thành viên').addUserOption(opt => opt.setName('user').setDescription('Người bị cấm').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Số phút').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Gỡ cấm ngôn thành viên').addUserOption(opt => opt.setName('user').setDescription('Người được gỡ').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Kick thành viên ra khỏi server').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do')),
    new SlashCommandBuilder().setName('slowmode').setDescription('Bật/Tắt chế độ chat chậm').addIntegerOption(opt => opt.setName('seconds').setDescription('Số giây giãn cách (0 để tắt)').setRequired(true)),

    // 🎮 Nhóm Lệnh Tiện Ích & Giải Trí
    new SlashCommandBuilder().setName('userinfo').setDescription('Xem thông tin chi tiết của một người').addUserOption(opt => opt.setName('target').setDescription('Chọn người dùng')),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Xem thông tin server Discord này'),
    new SlashCommandBuilder().setName('avatar').setDescription('Lấy ảnh đại diện (Avatar) phóng to').addUserOption(opt => opt.setName('user').setDescription('Chọn người dùng')),
    new SlashCommandBuilder().setName('dice').setDescription('Lắc xí ngầu may mắn (1-6)'),
    new SlashCommandBuilder().setName('botinfo').setDescription('Xem tình trạng hoạt động của Bot')
].map(command => command.toJSON());

// -------------------------------------------------------------
// ĐĂNG KÝ LỆNH SLASH VỚI DISCORD API
// -------------------------------------------------------------
client.on('ready', async () => {
    console.log(`🚀 Bot Pro đã sẵn sàng: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Đã cập nhật thành công tất cả các lệnh Slash (/)!');
    } catch (error) {
        console.error(error);
    }
});

// -------------------------------------------------------------
// XỬ LÝ SỰ KIỆN KHI NGƯỜI DÙNG DÙNG LỆNH /
// -------------------------------------------------------------
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, member, guild, channel } = interaction;

        // 🎵 NHẠC
        if (commandName === 'play') {
            const query = options.getString('song');
            if (!member.voice.channel) return interaction.reply({ content: '❌ Hãy vào Voice Channel trước!', ephemeral: true });

            await interaction.deferReply();
            let player = kazagumo.players.get(guild.id);
            if (!player) {
                player = await kazagumo.createPlayer({
                    guildId: guild.id,
                    textId: channel.id,
                    voiceId: member.voice.channel.id,
                    deaf: true
                });
            }

            const result = await kazagumo.search(query, { requester: interaction.user });
            if (!result.tracks.length) return interaction.editReply('❌ Không tìm thấy bài hát!');

            if (result.type === 'PLAYLIST') {
                for (const track of result.tracks) player.queue.add(track);
                interaction.editReply(`🎶 Đã thêm Playlist **${result.playlistName}** (${result.tracks.length} bài) vào hàng đợi!`);
            } else {
                player.queue.add(result.tracks[0]);
                interaction.editReply(`➕ Đã thêm: **${result.tracks[0].title}**`);
            }
            if (!player.playing && !player.paused) player.play();
        }

        if (commandName === 'skip') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Bot chưa vào Voice!', ephemeral: true });
            player.skip();
            interaction.reply('⏭️ Đã chuyển sang bài tiếp theo!');
        }

        if (commandName === 'stop') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Bot chưa vào Voice!', ephemeral: true });
            player.destroy();
            interaction.reply('⏹️ Đã dừng phát nhạc và ngắt kết nối!');
        }

        if (commandName === 'pause') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Không có nhạc đang phát!', ephemeral: true });
            player.pause(!player.paused);
            interaction.reply(player.paused ? '⏸️ Đã tạm dừng phát nhạc!' : '▶️ Đã tiếp tục phát nhạc!');
        }

        if (commandName === 'queue') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.length) return interaction.reply({ content: '❌ Hàng đợi hiện đang trống!', ephemeral: true });
            const list = player.queue.slice(0, 10).map((t, i) => `**${i + 1}.** [${t.title}](${t.uri})`).join('\n');
            const embed = new EmbedBuilder().setColor('#0099ff').setTitle('🎶 Hàng Đợi Phát Nhạc').setDescription(list);
            interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'nowplaying') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.current) return interaction.reply({ content: '❌ Không có nhạc đang phát!', ephemeral: true });
            const track = player.queue.current;
            const embed = new EmbedBuilder()
                .setColor('#1DB954')
                .setTitle('🎶 Đang Phát Bài Hát')
                .setDescription(`**[${track.title}](${track.uri})**`)
                .setThumbnail(track.thumbnail || '');
            interaction.reply({ embeds: [embed] });
        }

        // 👑 ADMIN
        if (commandName === 'clear') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn không phải Admin!', ephemeral: true });
            const amount = options.getInteger('amount');
            await channel.bulkDelete(amount, true);
            interaction.reply({ content: `🧹 Đã dọn sạch **${amount}** tin nhắn!`, ephemeral: true });
        }

        if (commandName === 'mute') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn không phải Admin!', ephemeral: true });
            const user = options.getUser('user');
            const minutes = options.getInteger('minutes');
            const target = guild.members.cache.get(user.id);
            await target.timeout(minutes * 60 * 1000);
            interaction.reply(`🔇 Đã cấm ngôn **${user.tag}** trong **${minutes}** phút!`);
        }

        if (commandName === 'unmute') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn không phải Admin!', ephemeral: true });
            const user = options.getUser('user');
            const target = guild.members.cache.get(user.id);
            await target.timeout(null);
            interaction.reply(`🔊 Đã mở cấm ngôn cho **${user.tag}**!`);
        }

        if (commandName === 'kick') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn không phải Admin!', ephemeral: true });
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'Không có lý do';
            await guild.members.kick(user.id, reason);
            interaction.reply(`🚪 Đã kick **${user.tag}**! Lý do: ${reason}`);
        }

        if (commandName === 'slowmode') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn không phải Admin!', ephemeral: true });
            const sec = options.getInteger('seconds');
            await channel.setRateLimitPerUser(sec);
            interaction.reply(`⏳ Đã đặt thời gian giãn cách chat: **${sec}s**!`);
        }

        // 🎮 TIỆN ÍCH & GIẢI TRÍ
        if (commandName === 'userinfo') {
            const user = options.getUser('target') || interaction.user;
            const targetMember = guild.members.cache.get(user.id);
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`👤 Thông Tin: ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '📅 Ngày tham gia Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '📥 Ngày vào Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true }
                );
            interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'serverinfo') {
            const embed = new EmbedBuilder()
                .setColor('#00FF7F')
                .setTitle(`🏰 Server: ${guild.name}`)
                .setThumbnail(guild.iconURL())
                .addFields(
                    { name: '👥 Thành viên', value: `${guild.memberCount}`, inline: true },
                    { name: '👑 Chủ Server', value: `<@${guild.ownerId}>`, inline: true },
                    { name: '📅 Ngày tạo', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true }
                );
            interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'avatar') {
            const user = options.getUser('user') || interaction.user;
            const embed = new EmbedBuilder()
                .setColor('#9B59B6')
                .setTitle(`🖼️ Avatar của ${user.tag}`)
                .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }));
            interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'dice') {
            const roll = Math.floor(Math.random() * 6) + 1;
            interaction.reply(`🎲 Bạn lắc xí ngầu được số: **${roll}**!`);
        }

        if (commandName === 'botinfo') {
            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle('🤖 Trạng Thái Bot')
                .addFields(
                    { name: '⏱️ Độ trễ (Ping)', value: `\`${client.ws.ping}ms\``, inline: true },
                    { name: '📊 Server đang gánh', value: `\`${client.guilds.cache.size}\``, inline: true }
                );
            interaction.reply({ embeds: [embed] });
        }
    }

    // XỬ LÝ NÚT BẤM NHẠC
    if (interaction.isButton()) {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) return interaction.reply({ content: '❌ Không có nhạc đang phát!', ephemeral: true });

        if (interaction.customId === 'pause_resume') {
            player.pause(!player.paused);
            interaction.reply({ content: player.paused ? '⏸️ Tạm dừng!' : '▶️ Tiếp tục!', ephemeral: true });
        } else if (interaction.customId === 'skip') {
            player.skip();
            interaction.reply({ content: '⏭️ Đã chuyển bài!', ephemeral: true });
        } else if (interaction.customId === 'stop') {
            player.destroy();
            interaction.reply({ content: '⏹️ Đã dừng phát nhạc!', ephemeral: true });
        }
    }
});

// BẢNG ĐIỀU KHIỂN NHẠC CÓ NÚT BẤM
kazagumo.on('playerStart', (player, track) => {
    const channel = client.channels.cache.get(player.textId);
    if (!channel) return;

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pause_resume').setLabel('⏯️ Play/Pause').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('skip').setLabel('⏭️ Skip').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('stop').setLabel('⏹️ Stop').setStyle(ButtonStyle.Danger)
    );

    const embed = new EmbedBuilder()
        .setColor('#1DB954')
        .setTitle('🎶 Đang Phát (Lavalink High Quality)')
        .setDescription(`**[${track.title}](${track.uri})**`)
        .setThumbnail(track.thumbnail || '');

    channel.send({ embeds: [embed], components: [row] });
});

client.login(process.env.TOKEN);
