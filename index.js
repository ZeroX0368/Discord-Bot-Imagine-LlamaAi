const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

// Load or create channel settings
let channelSettings = {};
try {
  channelSettings = JSON.parse(fs.readFileSync('./channels.json', 'utf8'));
} catch (error) {
  channelSettings = {};
}

function getServerSettings(serverId) {
  if (!channelSettings[serverId]) {
    channelSettings[serverId] = { imagine: [], ai: [] };
  }
  return channelSettings[serverId];
}

// Spam protection system
const userLastMessage = new Map(); // userId -> timestamp
const blacklistedUsers = new Map(); // userId -> blacklist end time
const SPAM_THRESHOLD = 2000; // 2 seconds
const BLACKLIST_DURATION = 5 * 60 * 1000; // 5 minutes

// Permanent blacklist system
const permanentBlacklistedUsers = new Set(); // userId set
const blacklistedServers = new Set(); // serverId set

// Bot start time for uptime calculation
const botStartTime = Date.now();

function saveChannelSettings() {
  fs.writeFileSync('./channels.json', JSON.stringify(channelSettings, null, 2));
}

function isUserBlacklisted(userId) {
  const blacklistEnd = blacklistedUsers.get(userId);
  if (!blacklistEnd) return false;
  
  if (Date.now() >= blacklistEnd) {
    blacklistedUsers.delete(userId);
    return false;
  }
  
  return true;
}

function checkSpam(userId) {
  const now = Date.now();
  const lastMessage = userLastMessage.get(userId);
  
  if (lastMessage && (now - lastMessage) < SPAM_THRESHOLD) {
    // User is spamming, blacklist them
    blacklistedUsers.set(userId, now + BLACKLIST_DURATION);
    return true;
  }
  
  userLastMessage.set(userId, now);
  return false;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  client.user.setStatus(config.setStatus);
  client.user.setActivity(config.setActivity);

  // Register slash commands
  registerCommands();
});

async function registerCommands() {
  const commands = [
    new SlashCommandBuilder()
      .setName('channel')
      .setDescription('Channel management commands')
      .addSubcommand(subcommand =>
        subcommand
          .setName('setimagine')
          .setDescription('Set a channel for automatic image generation')
          .addChannelOption(option =>
            option.setName('channel')
              .setDescription('The channel to set for image generation')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('setimagine-remove')
          .setDescription('Remove a channel from automatic image generation')
          .addChannelOption(option =>
            option.setName('channel')
              .setDescription('The channel to remove from image generation')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('setai')
          .setDescription('Set a channel for AI responses')
          .addChannelOption(option =>
            option.setName('channel')
              .setDescription('The channel to set for AI responses')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('setai-remove')
          .setDescription('Remove a channel from AI responses')
          .addChannelOption(option =>
            option.setName('channel')
              .setDescription('The channel to remove from AI responses')
              .setRequired(true)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('setting')
          .setDescription('View current channel settings')
      )
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
    new SlashCommandBuilder()
      .setName('image')
      .setDescription('Image generation commands')
      .addSubcommand(subcommand =>
        subcommand
          .setName('generate')
          .setDescription('Generate an image from a prompt')
          .addStringOption(option =>
            option.setName('prompt')
              .setDescription('The prompt for image generation')
              .setRequired(true)
          )
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.UseApplicationCommands
      ),
    new SlashCommandBuilder()
      .setName('chatbot')
      .setDescription('AI chatbot commands')
      .addSubcommand(subcommand =>
        subcommand
          .setName('ai')
          .setDescription('Chat with AI')
          .addStringOption(option =>
            option.setName('prompt')
              .setDescription('Your message to the AI')
              .setRequired(true)
          )
      )
      .setDefaultMemberPermissions(
        PermissionFlagsBits.SendMessages |
        PermissionFlagsBits.UseApplicationCommands
      ),
    new SlashCommandBuilder()
      .setName('blacklist')
      .setDescription('Blacklist management commands (Owner only)')
      .addSubcommand(subcommand =>
        subcommand
          .setName('add')
          .setDescription('Add user or server to blacklist')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type to blacklist')
              .setRequired(true)
              .addChoices(
                { name: 'user', value: 'user' },
                { name: 'server', value: 'server' }
              )
          )
          .addStringOption(option =>
            option.setName('id')
              .setDescription('User ID or Server ID')
              .setRequired(false)
          )
          .addUserOption(option =>
            option.setName('user')
              .setDescription('User to blacklist')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('remove')
          .setDescription('Remove user or server from blacklist')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type to remove from blacklist')
              .setRequired(true)
              .addChoices(
                { name: 'user', value: 'user' },
                { name: 'server', value: 'server' }
              )
          )
          .addStringOption(option =>
            option.setName('id')
              .setDescription('User ID or Server ID')
              .setRequired(false)
          )
          .addUserOption(option =>
            option.setName('user')
              .setDescription('User to remove from blacklist')
              .setRequired(false)
          )
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('list')
          .setDescription('List blacklisted users or servers')
          .addStringOption(option =>
            option.setName('type')
              .setDescription('Type to list')
              .setRequired(true)
              .addChoices(
                { name: 'user', value: 'user' },
                { name: 'server', value: 'server' }
              )
          )
      ),
    new SlashCommandBuilder()
      .setName('bot')
      .setDescription('Bot utility commands')
      .addSubcommand(subcommand =>
        subcommand
          .setName('ping')
          .setDescription('Check bot latency')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('uptime')
          .setDescription('Check bot uptime')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('help')
          .setDescription('Show bot help information')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('invite')
          .setDescription('Get bot invite link')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('info')
          .setDescription('Show bot information')
      )
      .addSubcommand(subcommand =>
        subcommand
          .setName('feedback')
          .setDescription('Send feedback to bot developers')
          .addStringOption(option =>
            option.setName('message')
              .setDescription('Your feedback message')
              .setRequired(true)
          )
      )
  ];

  try {
    console.log('Started refreshing application (/) commands.');
    await client.application.commands.set(commands);
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // Check if server is blacklisted
  if (blacklistedServers.has(interaction.guild?.id)) {
    return; // Silently ignore interactions from blacklisted servers
  }
  
  // Check if user is permanently blacklisted (except for blacklist command for owner)
  if (permanentBlacklistedUsers.has(interaction.user.id) && 
      !(interaction.commandName === 'blacklist' && interaction.user.id === config.ownerId)) {
    return; // Silently ignore interactions from permanently blacklisted users
  }

  const { commandName, options } = interaction;

  if (commandName === 'image') {
    const subcommand = options.getSubcommand();
    
    if (subcommand === 'generate') {
      const prompt = options.getString('prompt');
      
      const loadingEmbed = new EmbedBuilder()
        .setTitle('Generating Image...')
        .setDescription('Your image is being created. Please wait a moment.')
        .setColor(config.loadingColor || '#FFFF00')
        .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [loadingEmbed] });
      
      await handleSlashImageGeneration(interaction, prompt);
    }
  } else if (commandName === 'chatbot') {
    const subcommand = options.getSubcommand();
    
    if (subcommand === 'ai') {
      const prompt = options.getString('prompt');
      
      const loadingEmbed = new EmbedBuilder()
        .setTitle('Processing AI Request...')
        .setDescription('Your request is being processed by the AI. Please wait a moment.')
        .setColor(config.loadingColor || '#FFFF00')
        .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
        .setTimestamp();

      await interaction.reply({ embeds: [loadingEmbed] });
      
      await handleSlashAIRequest(interaction, prompt);
    }
  } else if (commandName === 'channel') {
    const subcommand = options.getSubcommand();
    const channel = options.getChannel('channel');

    switch (subcommand) {
      case 'setimagine':
        const serverSettings = getServerSettings(interaction.guild.id);
        if (!serverSettings.imagine.includes(channel.id)) {
          serverSettings.imagine.push(channel.id);
          saveChannelSettings();

          const successEmbed = new EmbedBuilder()
            .setTitle('Image Generation Channel Set')
            .setDescription(`Successfully set ${channel} for automatic image generation!`)
            .setColor(config.successColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed] });
        } else {
          const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(`${channel} is already set for image generation!`)
            .setColor(config.errorColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;

      case 'setimagine-remove':
        const serverSettingsRemove = getServerSettings(interaction.guild.id);
        const index = serverSettingsRemove.imagine.indexOf(channel.id);
        if (index > -1) {
          serverSettingsRemove.imagine.splice(index, 1);
          saveChannelSettings();

          const successEmbed = new EmbedBuilder()
            .setTitle('Image Generation Channel Removed')
            .setDescription(`Successfully removed ${channel} from automatic image generation!`)
            .setColor(config.successColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed] });
        } else {
          const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(`${channel} is not set for image generation!`)
            .setColor(config.errorColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;

      case 'setai':
        const serverSettingsAI = getServerSettings(interaction.guild.id);
        if (!serverSettingsAI.ai.includes(channel.id)) {
          serverSettingsAI.ai.push(channel.id);
          saveChannelSettings();

          const successEmbed = new EmbedBuilder()
            .setTitle('AI Channel Set')
            .setDescription(`Successfully set ${channel} for AI responses!`)
            .setColor(config.successColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed] });
        } else {
          const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(`${channel} is already set for AI responses!`)
            .setColor(config.errorColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;

      case 'setai-remove':
        const serverSettingsAIRemove = getServerSettings(interaction.guild.id);
        const aiIndex = serverSettingsAIRemove.ai.indexOf(channel.id);
        if (aiIndex > -1) {
          serverSettingsAIRemove.ai.splice(aiIndex, 1);
          saveChannelSettings();

          const successEmbed = new EmbedBuilder()
            .setTitle('AI Channel Removed')
            .setDescription(`Successfully removed ${channel} from AI responses!`)
            .setColor(config.successColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed] });
        } else {
          const errorEmbed = new EmbedBuilder()
            .setTitle('Error')
            .setDescription(`${channel} is not set for AI responses!`)
            .setColor(config.errorColor)
            .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;

      case 'setting':
        const currentServerSettings = getServerSettings(interaction.guild.id);
        const imagineChannels = currentServerSettings.imagine.map(id => `<#${id}>`).join('\n') || 'None';
        const aiChannels = currentServerSettings.ai.map(id => `<#${id}>`).join('\n') || 'None';

        const settingsEmbed = new EmbedBuilder()
          .setTitle('Channel Settings')
          .setDescription(`Current channel configurations for **${interaction.guild.name}**`)
          .addFields(
            { name: 'Image Generation Channels', value: imagineChannels, inline: true },
            { name: 'AI Response Channels', value: aiChannels, inline: true }
          )
          .setColor(config.successColor)
          .setFooter({ text: `Requested By: ${interaction.user.username} | Server ID: ${interaction.guild.id}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        const row = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Invite Bot')
              .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
              .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
              .setLabel('Join Server')
              .setURL(config.support)
              .setStyle(ButtonStyle.Link)
          );

        await interaction.reply({ embeds: [settingsEmbed], components: [row] });
        break;
    }
  } else if (commandName === 'blacklist') {
    // Check if user is the owner
    if (interaction.user.id !== config.ownerId) {
      const noPermissionEmbed = new EmbedBuilder()
        .setTitle('❌ No Permission')
        .setDescription('This command is restricted to the bot owner only.')
        .setColor(config.errorColor)
        .setTimestamp();

      await interaction.reply({ embeds: [noPermissionEmbed], ephemeral: true });
      return;
    }

    const subcommand = options.getSubcommand();
    const type = options.getString('type');

    if (subcommand === 'add') {
      const userId = options.getString('id');
      const userOption = options.getUser('user');
      
      if (type === 'user') {
        const targetId = userId || userOption?.id;
        if (!targetId) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Please provide either a user ID or mention a user.')
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        if (permanentBlacklistedUsers.has(targetId)) {
          const alreadyBlacklistedEmbed = new EmbedBuilder()
            .setTitle('⚠️ Already Blacklisted')
            .setDescription(`User <@${targetId}> is already blacklisted.`)
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [alreadyBlacklistedEmbed], ephemeral: true });
          return;
        }

        permanentBlacklistedUsers.add(targetId);
        
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ User Blacklisted')
          .setDescription(`Successfully blacklisted user <@${targetId}>`)
          .setColor(config.successColor)
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

      } else if (type === 'server') {
        const serverId = userId;
        if (!serverId) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Please provide a server ID.')
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        if (blacklistedServers.has(serverId)) {
          const alreadyBlacklistedEmbed = new EmbedBuilder()
            .setTitle('⚠️ Already Blacklisted')
            .setDescription(`Server \`${serverId}\` is already blacklisted.`)
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [alreadyBlacklistedEmbed], ephemeral: true });
          return;
        }

        blacklistedServers.add(serverId);
        
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Server Blacklisted')
          .setDescription(`Successfully blacklisted server \`${serverId}\``)
          .setColor(config.successColor)
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
      }

    } else if (subcommand === 'remove') {
      const userId = options.getString('id');
      const userOption = options.getUser('user');
      
      if (type === 'user') {
        const targetId = userId || userOption?.id;
        if (!targetId) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Please provide either a user ID or mention a user.')
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        if (!permanentBlacklistedUsers.has(targetId)) {
          const notBlacklistedEmbed = new EmbedBuilder()
            .setTitle('⚠️ Not Blacklisted')
            .setDescription(`User <@${targetId}> is not blacklisted.`)
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [notBlacklistedEmbed], ephemeral: true });
          return;
        }

        permanentBlacklistedUsers.delete(targetId);
        
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ User Removed')
          .setDescription(`Successfully removed user <@${targetId}> from blacklist`)
          .setColor(config.successColor)
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

      } else if (type === 'server') {
        const serverId = userId;
        if (!serverId) {
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Please provide a server ID.')
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
          return;
        }

        if (!blacklistedServers.has(serverId)) {
          const notBlacklistedEmbed = new EmbedBuilder()
            .setTitle('⚠️ Not Blacklisted')
            .setDescription(`Server \`${serverId}\` is not blacklisted.`)
            .setColor(config.errorColor)
            .setTimestamp();

          await interaction.reply({ embeds: [notBlacklistedEmbed], ephemeral: true });
          return;
        }

        blacklistedServers.delete(serverId);
        
        const successEmbed = new EmbedBuilder()
          .setTitle('✅ Server Removed')
          .setDescription(`Successfully removed server \`${serverId}\` from blacklist`)
          .setColor(config.successColor)
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], ephemeral: true });
      }

    } else if (subcommand === 'list') {
      if (type === 'user') {
        const userList = Array.from(permanentBlacklistedUsers);
        const userMentions = userList.length > 0 
          ? userList.map(id => `<@${id}> (\`${id}\`)`).join('\n')
          : 'No users blacklisted';

        const listEmbed = new EmbedBuilder()
          .setTitle('📋 Blacklisted Users')
          .setDescription(userMentions)
          .setColor(config.successColor)
          .setFooter({ text: `Total: ${userList.length} users` })
          .setTimestamp();

        await interaction.reply({ embeds: [listEmbed], ephemeral: true });

      } else if (type === 'server') {
        const serverList = Array.from(blacklistedServers);
        const serverDisplay = serverList.length > 0 
          ? serverList.map(id => `\`${id}\``).join('\n')
          : 'No servers blacklisted';

        const listEmbed = new EmbedBuilder()
          .setTitle('📋 Blacklisted Servers')
          .setDescription(serverDisplay)
          .setColor(config.successColor)
          .setFooter({ text: `Total: ${serverList.length} servers` })
          .setTimestamp();

        await interaction.reply({ embeds: [listEmbed], ephemeral: true });
      }
    }
  } else if (commandName === 'bot') {
    const subcommand = options.getSubcommand();

    switch (subcommand) {
      case 'ping':
        const ping = Date.now() - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const pingEmbed = new EmbedBuilder()
          .setTitle('🏓 Pong!')
          .setDescription('Bot latency information')
          .addFields(
            { name: 'Bot Latency', value: `${ping}ms`, inline: true },
            { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
          )
          .setColor(config.successColor)
          .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [pingEmbed] });
        break;

      case 'uptime':
        const uptime = Date.now() - botStartTime;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

        const uptimeEmbed = new EmbedBuilder()
          .setTitle('⏰ Bot Uptime')
          .setDescription(`Bot has been online for:\n\`${days}d ${hours}h ${minutes}m ${seconds}s\``)
          .setColor(config.successColor)
          .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        await interaction.reply({ embeds: [uptimeEmbed] });
        break;

      case 'help':
        const helpEmbed = new EmbedBuilder()
          .setTitle('📋 Bot Help')
          .setDescription('Available commands and features')
          .addFields(
            { 
              name: '🖼️ Image Generation', 
              value: '`/image generate` - Generate images\n`/channel setimagine` - Set image channel', 
              inline: false 
            },
            { 
              name: '🤖 AI Chat', 
              value: '`/chatbot ai` - Chat with AI\n`/channel setai` - Set AI channel', 
              inline: false 
            },
            { 
              name: '⚙️ Bot Utilities', 
              value: '`/bot ping` - Check latency\n`/bot uptime` - Check uptime\n`/bot info` - Bot information\n`/bot feedback` - Send feedback', 
              inline: false 
            },
            { 
              name: '🔧 Management', 
              value: '`/channel setting` - View settings\n`/blacklist` - Blacklist management (Owner only)', 
              inline: false 
            }
          )
          .setColor(config.successColor)
          .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        const helpRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Invite Bot')
              .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
              .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
              .setLabel('Join Server')
              .setURL(config.support)
              .setStyle(ButtonStyle.Link)
          );

        await interaction.reply({ embeds: [helpEmbed], components: [helpRow] });
        break;

      case 'invite':
        const inviteEmbed = new EmbedBuilder()
          .setTitle('🔗 Invite Bot')
          .setDescription('Add this bot to your server!')
          .addFields(
            { name: 'Bot Invite', value: `[Click here to invite](https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot)`, inline: false },
            { name: 'Support Server', value: `[Join our support server](${config.support})`, inline: false }
          )
          .setColor(config.successColor)
          .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        const inviteRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Invite Bot')
              .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
              .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
              .setLabel('Join Server')
              .setURL(config.support)
              .setStyle(ButtonStyle.Link)
          );

        await interaction.reply({ embeds: [inviteEmbed], components: [inviteRow] });
        break;

      case 'info':
        const serverCount = client.guilds.cache.size;
        const userCount = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
        
        const infoEmbed = new EmbedBuilder()
          .setTitle('ℹ️ Bot Information')
          .setDescription('Detailed information about this bot')
          .addFields(
            { name: '🤖 Bot Name', value: client.user.username, inline: true },
            { name: '🆔 Bot ID', value: client.user.id, inline: true },
            { name: '📊 Servers', value: serverCount.toString(), inline: true },
            { name: '👥 Users', value: userCount.toString(), inline: true },
            { name: '🏓 Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
            { name: '💻 Platform', value: 'Node.js', inline: true },
            { name: '📚 Library', value: 'Discord.js v14', inline: true },
            { name: '⚡ Status', value: 'Online', inline: true },
            { name: '🔧 Version', value: '1.0.0', inline: true }
          )
          .setThumbnail(client.user.avatarURL())
          .setColor(config.successColor)
          .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
          .setTimestamp();

        const infoRow = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setLabel('Invite Bot')
              .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
              .setStyle(ButtonStyle.Link),
            new ButtonBuilder()
              .setLabel('Join Server')
              .setURL(config.support)
              .setStyle(ButtonStyle.Link)
          );

        await interaction.reply({ embeds: [infoEmbed], components: [infoRow] });
        break;

      case 'feedback':
        const feedbackMessage = options.getString('message');
        
        try {
          // Send feedback to designated channel
          const feedbackChannel = await client.channels.fetch(config.feedbackChannelId);
          
          if (feedbackChannel) {
            const feedbackEmbed = new EmbedBuilder()
              .setTitle('📝 New Feedback')
              .setDescription(feedbackMessage)
              .addFields(
                { name: 'User', value: `${interaction.user.username} (${interaction.user.id})`, inline: true },
                { name: 'Server', value: `${interaction.guild?.name || 'DM'} (${interaction.guild?.id || 'N/A'})`, inline: true },
                { name: 'Channel', value: `${interaction.channel?.name || 'DM'} (${interaction.channel?.id || 'N/A'})`, inline: true }
              )
              .setThumbnail(interaction.user.avatarURL())
              .setColor('#FFA500')
              .setTimestamp();

            await feedbackChannel.send({ embeds: [feedbackEmbed] });
          }

          const successEmbed = new EmbedBuilder()
            .setTitle('✅ Feedback Sent')
            .setDescription('Thank you for your feedback! It has been sent to our development team.')
            .setColor(config.successColor)
            .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [successEmbed] });
        } catch (error) {
          console.error('Error sending feedback:', error);
          
          const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Error')
            .setDescription('Failed to send feedback. Please try again later or contact support directly.')
            .setColor(config.errorColor)
            .setFooter({ text: `Requested by: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
            .setTimestamp();

          await interaction.reply({ embeds: [errorEmbed] });
        }
        break;
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  // Check if server is blacklisted
  if (blacklistedServers.has(message.guild?.id)) {
    return; // Silently ignore messages from blacklisted servers
  }
  
  // Check if user is permanently blacklisted
  if (permanentBlacklistedUsers.has(message.author.id)) {
    return; // Silently ignore messages from permanently blacklisted users
  }
  
  // Check if user is temporarily blacklisted
  if (isUserBlacklisted(message.author.id)) {
    const blacklistEnd = blacklistedUsers.get(message.author.id);
    const remainingTime = Math.ceil((blacklistEnd - Date.now()) / 1000);
    
    const blacklistEmbed = new EmbedBuilder()
      .setTitle('🚫 Blacklisted')
      .setDescription(`You are temporarily blacklisted for spamming.\nTime remaining: ${remainingTime} seconds`)
      .setColor(config.errorColor)
      .setFooter({ text: `User: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();
    
    const warningMessage = await message.channel.send({ embeds: [blacklistEmbed] });
    
    // Delete the warning message after 5 seconds
    setTimeout(() => {
      warningMessage.delete().catch(() => {});
    }, 5000);
    
    return;
  }
  
  // Check for spam (only for channels that have bot functionality)
  const currentServerSettings = getServerSettings(message.guild.id);
  const isInBotChannel = currentServerSettings.imagine.includes(message.channel.id) || 
                        currentServerSettings.ai.includes(message.channel.id);
  
  if (isInBotChannel && checkSpam(message.author.id)) {
    const spamEmbed = new EmbedBuilder()
      .setTitle('⚠️ Spam Detected')
      .setDescription('You have been blacklisted for 5 minutes due to spamming (sending messages too quickly).')
      .setColor(config.errorColor)
      .setFooter({ text: `User: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();
    
    const spamMessage = await message.channel.send({ embeds: [spamEmbed] });
    
    // Delete the spam warning message after 10 seconds
    setTimeout(() => {
      spamMessage.delete().catch(() => {});
    }, 10000);
    
    return;
  }

  // Check if message is in an image generation channel
  if (currentServerSettings.imagine.includes(message.channel.id)) {
    const loadingEmbed = new EmbedBuilder()
      .setTitle('Generating Image...')
      .setDescription('Your image is being created. Please wait a moment.')
      .setColor(config.loadingColor || '#FFFF00') // Default to yellow if no loadingColor is set
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    // Send the loading embed and store its message
    const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

    await generateImage(message, loadingMessage);
  }

  // Check if message is in an AI response channel
  if (currentServerSettings.ai.includes(message.channel.id)) {
    const loadingEmbed = new EmbedBuilder()
      .setTitle('Processing AI Request...')
      .setDescription('Your request is being processed by the AI. Please wait a moment.')
      .setColor(config.loadingColor || '#FFFF00') // Default to yellow if no loadingColor is set
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    // Send the loading embed and store its message
    const loadingMessage = await message.channel.send({ embeds: [loadingEmbed] });

    await processAIRequest(message, loadingMessage);
  }
});

async function processAIRequest(message, loadingMessage) {
  try {
    const prompt = encodeURIComponent(message.content);
    const response = await fetch(`https://llama-ai-khaki.vercel.app/api/llama/chat?prompt=${prompt}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'No response from AI';

    const aiResponseEmbed = new EmbedBuilder()
      .setTitle('AI Response')
      .setDescription(aiResponse)
      .setColor(config.successColor)
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Invite Bot')
          .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('Join Server')
          .setURL(config.support)
          .setStyle(ButtonStyle.Link)
      );

    await loadingMessage.edit({ embeds: [aiResponseEmbed], components: [row] });
  } catch (error) {
    console.error('Error processing AI request:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('Error Processing AI Request')
      .setDescription('Failed to get AI response. Please try again later.')
      .setColor(config.errorColor)
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    await loadingMessage.edit({ embeds: [errorEmbed] });
  }
}

async function generateImage(message, loadingMessage) {
  try {
    const prompt = encodeURIComponent(message.content);
    const response = await fetch(`http://67.220.85.146:6207/image?prompt=${prompt}`, {
      headers: {
        'x-api-key': config.imagineApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const embed = new EmbedBuilder()
      .setTitle('Image Generated')
      .setDescription(`**Prompt:**\n\`\`\`${data.prompt}\`\`\``)
      .addFields({
        name: 'Information',
        value: `**imageId:** ${data.imageId}\n**status:** ${data.status}\n**duration:** ${data.duration}`
      })
      .setImage(data.image)
      .setColor(config.successColor)
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Invite Bot')
          .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('Join Server')
          .setURL(config.support)
          .setStyle(ButtonStyle.Link)
      );

    await loadingMessage.edit({ embeds: [embed], components: [row] }); // Edit the loading message with the final embed
  } catch (error) {
    console.error('Error generating image:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('Error Generating Image')
      .setDescription('Failed to generate image. Please try again later.')
      .setColor(config.errorColor)
      .setFooter({ text: `Requested By: ${message.author.username}`, iconURL: message.author.avatarURL() })
      .setTimestamp();

    await loadingMessage.edit({ embeds: [errorEmbed] }); // Edit the loading message with the error embed
  }
}

async function handleSlashImageGeneration(interaction, prompt) {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const response = await fetch(`http://67.220.85.146:6207/image?prompt=${encodedPrompt}`, {
      headers: {
        'x-api-key': config.imagineApiKey
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    const embed = new EmbedBuilder()
      .setTitle('Image Generated')
      .setDescription(`**Prompt:**\n\`\`\`${data.prompt}\`\`\``)
      .addFields({
        name: 'Information',
        value: `**imageId:** ${data.imageId}\n**status:** ${data.status}\n**duration:** ${data.duration}`
      })
      .setImage(data.image)
      .setColor(config.successColor)
      .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Invite Bot')
          .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('Join Server')
          .setURL(config.support)
          .setStyle(ButtonStyle.Link)
      );

    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('Error generating image:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('Error Generating Image')
      .setDescription('Failed to generate image. Please try again later.')
      .setColor(config.errorColor)
      .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

async function handleSlashAIRequest(interaction, prompt) {
  try {
    const encodedPrompt = encodeURIComponent(prompt);
    const response = await fetch(`https://llama-ai-khaki.vercel.app/api/llama/chat?prompt=${encodedPrompt}`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content || 'No response from AI';

    const aiResponseEmbed = new EmbedBuilder()
      .setTitle('AI Response')
      .setDescription(aiResponse)
      .setColor(config.successColor)
      .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
      .setTimestamp();

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('Invite Bot')
          .setURL(`https://discord.com/oauth2/authorize?client_id=${config.clientId}&permissions=1724029901729015&integration_type=0&scope=bot`)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setLabel('Join Server')
          .setURL(config.support)
          .setStyle(ButtonStyle.Link)
      );

    await interaction.editReply({ embeds: [aiResponseEmbed], components: [row] });
  } catch (error) {
    console.error('Error processing AI request:', error);

    const errorEmbed = new EmbedBuilder()
      .setTitle('Error Processing AI Request')
      .setDescription('Failed to get AI response. Please try again later.')
      .setColor(config.errorColor)
      .setFooter({ text: `Requested By: ${interaction.user.username}`, iconURL: interaction.user.avatarURL() })
      .setTimestamp();

    await interaction.editReply({ embeds: [errorEmbed] });
  }
}

client.login(config.token);
