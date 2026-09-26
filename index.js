const express = require('express');
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

// 1. WEB SERVER KEEP-ALIVE 24/7 (RENDER FREE)
const app = express();
app.get('/', (req, res) => res.send('🚀 Bot Discord Nhạc & Quản Lý Admin đang hoạt động 24/7!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🌐 Web Server Keep-Alive đang chạy tại port ${PORT}`));

// 2. DISCORD CLIENT & LAVALINK ENGINE
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages
    ]
});

const Nodes = [
    { name: 'Node-Lava', url: 'lava-v4.ajiehospitality.com:443', auth: 'https://discord.gg/ajiehospitality', secure: true },
    { name: 'Node-Yuji', url: 'lavalink.yujibot.tasks.gq:443', auth: 'yuji', secure: true },
    { name: 'Node-Serenetia', url: 'lava.serenetia.com:443', auth: 'youshallnotpass', secure: true }
];

const kazagumo = new Kazagumo({
    defaultSearchEngine: 'youtube',
    send: (guildId, payload) => {
        const guild = client.guilds.cache.get(guildId);
        if (guild) guild.shard.send(payload);
    },
    plugins: [new Plugins.PlayerMoved(client)]
}, new Connectors.DiscordJS(client), Nodes);

// 3. CHỐNG CRASH BOT
kazagumo.shoukaku.on('error', (name, error) => console.error(`⚠️ Node ${name} lỗi:`, error));
kazagumo.on('playerError', (player, error) => console.error('⚠️ Player lỗi:', error));
process.on('unhandledRejection', (error) => console.error('⚠️ Lỗi hệ thống:', error));

// 4. KHAI BÁO DANH SÁCH LỆNH SLASH ( / ) ĐẦY ĐỦ
const commands = [
    // 🎵 Nhóm Lệnh Nhạc
    new SlashCommandBuilder().setName('play').setDescription('Phát nhạc từ YouTube/Spotify/SoundCloud').addStringOption(opt => opt.setName('song').setDescription('Tên bài hát hoặc Link').setRequired(true)),
    new SlashCommandBuilder().setName('skip').setDescription('Bỏ qua bài hát hiện tại'),
    new SlashCommandBuilder().setName('stop').setDescription('Dừng nhạc và rời phòng voice'),
    new SlashCommandBuilder().setName('pause').setDescription('Tạm dừng hoặc tiếp tục phát nhạc'),
    new SlashCommandBuilder().setName('queue').setDescription('Xem danh sách hàng đợi phát nhạc'),
    new SlashCommandBuilder().setName('nowplaying').setDescription('Xem bài hát đang phát'),

    // 👑 Nhóm Lệnh Admin & Quản Lý Server (Siêu Nâng Cấp)
    new SlashCommandBuilder().setName('clear').setDescription('Xóa hàng loạt tin nhắn').addIntegerOption(opt => opt.setName('amount').setDescription('Số lượng (1-100)').setRequired(true)),
    new SlashCommandBuilder().setName('kick').setDescription('Kick thành viên ra khỏi server').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do')),
    new SlashCommandBuilder().setName('ban').setDescription('Cấm vĩnh viễn (Ban) thành viên khỏi server').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do')),
    new SlashCommandBuilder().setName('unban').setDescription('Bỏ cấm (Unban) người dùng').addStringOption(opt => opt.setName('userid').setDescription('ID của người dùng').setRequired(true)),
    new SlashCommandBuilder().setName('mute').setDescription('Cấm ngôn (Timeout) thành viên').addUserOption(opt => opt.setName('user').setDescription('Người bị cấm').setRequired(true)).addIntegerOption(opt => opt.setName('minutes').setDescription('Số phút').setRequired(true)),
    new SlashCommandBuilder().setName('unmute').setDescription('Gỡ cấm ngôn thành viên').addUserOption(opt => opt.setName('user').setDescription('Người được gỡ').setRequired(true)),
    new SlashCommandBuilder().setName('lock').setDescription('Khóa chặt kênh chat hiện tại'),
    new SlashCommandBuilder().setName('unlock').setDescription('Mở khóa kênh chat hiện tại'),
    new SlashCommandBuilder().setName('slowmode').setDescription('Đặt thời gian giãn cách gửi tin nhắn').addIntegerOption(opt => opt.setName('seconds').setDescription('Số giây (0 để tắt)').setRequired(true)),
    new SlashCommandBuilder().setName('addrole').setDescription('Trao Chức vụ (Role) cho người dùng').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Chức vụ').setRequired(true)),
    new SlashCommandBuilder().setName('removerole').setDescription('Tước Chức vụ (Role) của người dùng').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addRoleOption(opt => opt.setName('role').setDescription('Chức vụ').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('Cảnh cáo thành viên vi phạm').addUserOption(opt => opt.setName('user').setDescription('Thành viên').setRequired(true)).addStringOption(opt => opt.setName('reason').setDescription('Lý do cảnh cáo').setRequired(true)),
    new SlashCommandBuilder().setName('announce').setDescription('Gửi thông báo đẹp mắt vào kênh').addChannelOption(opt => opt.setName('channel').setDescription('Kênh gửi').setRequired(true)).addStringOption(opt => opt.setName('title').setDescription('Tiêu đề').setRequired(true)).addStringOption(opt => opt.setName('content').setDescription('Nội dung').setRequired(true)),
    new SlashCommandBuilder().setName('poll').setDescription('Tạo bình chọn/thăm dò ý kiến').addStringOption(opt => opt.setName('question').setDescription('Câu hỏi bình chọn').setRequired(true)),

    // 🎮 Nhóm Lệnh Tiện Ích & Thông Tin
    new SlashCommandBuilder().setName('userinfo').setDescription('Xem thông tin chi tiết người dùng').addUserOption(opt => opt.setName('target').setDescription('Chọn người dùng')),
    new SlashCommandBuilder().setName('serverinfo').setDescription('Xem thông tin chi tiết server'),
    new SlashCommandBuilder().setName('avatar').setDescription('Xem và tải ảnh đại diện phóng to').addUserOption(opt => opt.setName('user').setDescription('Chọn người dùng')),
    new SlashCommandBuilder().setName('dice').setDescription('Lắc xí ngầu may mắn (1-6)'),
    new SlashCommandBuilder().setName('botinfo').setDescription('Xem thông số kỹ thuật của Bot')
].map(command => command.toJSON());

// 5. ĐĂNG KÝ LỆNH
client.on('ready', async () => {
    console.log(`🚀 Bot đã sẵn sàng với FULL bộ lệnh: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('✅ Cập nhật thành công toàn bộ lệnh Slash (/)!');
    } catch (error) {
        console.error('Lỗi đăng ký lệnh:', error);
    }
});

// 6. XỬ LÝ LỆNH TƯƠNG TÁC
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName, options, member, guild, channel } = interaction;

        // --- 🎵 NHÓM LỆNH NHẠC ---
        if (commandName === 'play') {
            const query = options.getString('song');
            if (!member.voice.channel) return interaction.reply({ content: '❌ Bạn phải vào kênh Voice trước!', ephemeral: true });

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
                interaction.editReply(`🎶 Đã thêm Playlist **${result.playlistName}** (${result.tracks.length} bài)!`);
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
            interaction.reply('⏹️ Đã dừng phát nhạc và rời kênh!');
        }

        if (commandName === 'pause') {
            const player = kazagumo.players.get(guild.id);
            if (!player) return interaction.reply({ content: '❌ Không có nhạc đang phát!', ephemeral: true });
            player.pause(!player.paused);
            interaction.reply(player.paused ? '⏸️ Đã tạm dừng!' : '▶️ Đã tiếp tục phát!');
        }

        if (commandName === 'queue') {
            const player = kazagumo.players.get(guild.id);
            if (!player || !player.queue.length) return interaction.reply({ content: '❌ Hàng đợi đang trống!', ephemeral: true });
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

        // --- 👑 NHÓM LỆNH ADMIN NÂNG CAO ---
        if (commandName === 'clear') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Messages!', ephemeral: true });
            const amount = options.getInteger('amount');
            await channel.bulkDelete(amount, true);
            interaction.reply({ content: `🧹 Đã xóa sạch **${amount}** tin nhắn!`, ephemeral: true });
        }

        if (commandName === 'kick') {
            if (!member.permissions.has(PermissionsBitField.Flags.KickMembers)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Kick Members!', ephemeral: true });
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'Không có lý do';
            await guild.members.kick(user.id, reason);
            interaction.reply(`🚪 Đã kick **${user.tag}**! Lý do: ${reason}`);
        }

        if (commandName === 'ban') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Ban Members!', ephemeral: true });
            const user = options.getUser('user');
            const reason = options.getString('reason') || 'Không có lý do';
            await guild.members.ban(user.id, { reason });
            interaction.reply(`🔨 Đã cấm vĩnh viễn (Ban) **${user.tag}**! Lý do: ${reason}`);
        }

        if (commandName === 'unban') {
            if (!member.permissions.has(PermissionsBitField.Flags.BanMembers)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Ban Members!', ephemeral: true });
            const userId = options.getString('userid');
            try {
                await guild.members.unban(userId);
                interaction.reply(`🔓 Đã bỏ cấm (Unban) người dùng có ID: **${userId}**`);
            } catch (e) {
                interaction.reply({ content: '❌ Không tìm thấy người dùng này trong danh sách bị Ban!', ephemeral: true });
            }
        }

        if (commandName === 'mute') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Moderate Members!', ephemeral: true });
            const user = options.getUser('user');
            const minutes = options.getInteger('minutes');
            const target = guild.members.cache.get(user.id);
            await target.timeout(minutes * 60 * 1000);
            interaction.reply(`🔇 Đã cấm ngôn **${user.tag}** trong **${minutes}** phút!`);
        }

        if (commandName === 'unmute') {
            if (!member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Moderate Members!', ephemeral: true });
            const user = options.getUser('user');
            const target = guild.members.cache.get(user.id);
            await target.timeout(null);
            interaction.reply(`🔊 Đã gỡ cấm ngôn cho **${user.tag}**!`);
        }

        if (commandName === 'lock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Channels!', ephemeral: true });
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false });
            interaction.reply('🔒 Đã khóa kênh chat này!');
        }

        if (commandName === 'unlock') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Channels!', ephemeral: true });
            await channel.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: true });
            interaction.reply('🔓 Đã mở khóa kênh chat này!');
        }

        if (commandName === 'slowmode') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageChannels)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Channels!', ephemeral: true });
            const sec = options.getInteger('seconds');
            await channel.setRateLimitPerUser(sec);
            interaction.reply(`⏳ Đặt thời gian giãn cách chat: **${sec}s**!`);
        }

        if (commandName === 'addrole') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Roles!', ephemeral: true });
            const user = options.getUser('user');
            const role = options.getRole('role');
            const target = guild.members.cache.get(user.id);
            await target.roles.add(role);
            interaction.reply(`✅ Đã cấp chức vụ **${role.name}** cho **${user.tag}**!`);
        }

        if (commandName === 'removerole') {
            if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Manage Roles!', ephemeral: true });
            const user = options.getUser('user');
            const role = options.getRole('role');
            const target = guild.members.cache.get(user.id);
            await target.roles.remove(role);
            interaction.reply(`🗑️ Đã thu hồi chức vụ **${role.name}** từ **${user.tag}**!`);
        }

        if (commandName === 'warn') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Admin!', ephemeral: true });
            const user = options.getUser('user');
            const reason = options.getString('reason');
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⚠️ CẢNH CÁO THÀNH VIÊN')
                .setDescription(`Thành viên ${user} đã nhận 1 cảnh cáo!`)
                .addFields({ name: 'Lý do', value: reason });
            interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'announce') {
            if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: '⛔ Bạn thiếu quyền Admin!', ephemeral: true });
            const targetChannel = options.getChannel('channel');
            const title = options.getString('title');
            const content = options.getString('content');

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`📢 ${title}`)
                .setDescription(content)
                .setTimestamp();

            await targetChannel.send({ embeds: [embed] });
            interaction.reply({ content: `✅ Đã gửi thông báo tới kênh ${targetChannel}!`, ephemeral: true });
        }

        if (commandName === 'poll') {
            const question = options.getString('question');
            const embed = new EmbedBuilder()
                .setColor('#00FFFF')
                .setTitle('📊 BÌNH CHỌN / THĂM DÒ Ý KIẾN')
                .setDescription(question)
                .setFooter({ text: `Tạo bởi: ${interaction.user.tag}` });

            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('👍');
            await msg.react('👎');
        }

        // --- 🎮 TIỆN ÍCH ---
        if (commandName === 'userinfo') {
            const user = options.getUser('target') || interaction.user;
            const targetMember = guild.members.cache.get(user.id);
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`👤 Thông Tin: ${user.tag}`)
                .setThumbnail(user.displayAvatarURL())
                .addFields(
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '📅 Tạo tài khoản', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: '📥 Vào Server', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true }
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
                    { name: '📊 Máy chủ đang gánh', value: `\`${client.guilds.cache.size}\``, inline: true }
                );
            interaction.reply({ embeds: [embed] });
        }
    }

    // NÚT BẤM ĐIỀU KHIỂN NHẠC
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

// BẢNG BÀI HÁT ĐANG PHÁT
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
        .setTitle('🎶 Đang Phát (Lavalink HQ 320kbps)')
        .setDescription(`**[${track.title}](${track.uri})**`)
        .setThumbnail(track.thumbnail || '');

    channel.send({ embeds: [embed], components: [row] });
});

client.login(process.env.TOKEN);
