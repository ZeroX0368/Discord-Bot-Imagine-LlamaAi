const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes } = require('discord.js');
const axios = require('axios');
const config = require('./config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Store AI-enabled channels per guild (server)
const aiChannels = new Map(); // guildId -> channelId

// Store image-enabled channels per guild (server)
const imageChannels = new Map(); // guildId -> channelId

// Track bot start time for uptime
const botStartTime = Date.now();

// Slash command definition
const commands = [
    new SlashCommandBuilder()
        .setName('channel')
        .setDescription('Channel management commands')
        .setDefaultMemberPermissions(16) // MANAGE_CHANNELS permission
        .addSubcommand(subcommand =>
            subcommand
                .setName('setai')
                .setDescription('Enable AI for a channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to enable AI for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('setai-remove')
                .setDescription('Remove AI from a channel')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to remove AI from')
                        .setRequired(true)
                )
        ),
    new SlashCommandBuilder()
        .setName('image')
        .setDescription('Image generation commands')
        .setDefaultMemberPermissions(1024) // VIEW_CHANNEL permission (minimum for generate)
        .addSubcommand(subcommand =>
            subcommand
                .setName('generate')
                .setDescription('Generate an image from a text prompt')
                .addStringOption(option =>
                    option
                        .setName('prompt')
                        .setDescription('The text prompt for image generation')
                        .setRequired(true)
                )
        )
        
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-image')
                .setDescription('Set a channel for automatic image generation')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to enable automatic image generation for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove-image')
                .setDescription('Remove a channel from automatic image generation')
                .addChannelOption(option =>
                    option
                        .setName('channel')
                        .setDescription('The channel to remove automatic image generation from')
                        .setRequired(true)
                )
        ),
    new SlashCommandBuilder()
        .setName('bot')
        .setDescription('Bot management commands')
        .addSubcommand(subcommand =>
            subcommand
                .setName('uptime')
                .setDescription('Show bot uptime')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('ping')
                .setDescription('Check bot latency')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show bot help information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('feedback')
                .setDescription('Send feedback to the bot developers')
                .addStringOption(option =>
                    option
                        .setName('message')
                        .setDescription('Your feedback message')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('support')
                .setDescription('Get support information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription('Get bot invite link')
        )
];

// Register slash commands
async function registerCommands() {
    try {
        const rest = new REST().setToken(config.token);

        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(config.CLIENT_ID),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Function to make API call to Llama AI
async function getLlamaResponse(message) {
    try {
        const encodedMessage = encodeURIComponent(message);
        const response = await axios.get(`https://llama-ai-khaki.vercel.app/api/llama/chat?prompt=${encodedMessage}`);

        if (response.data && response.data.choices && response.data.choices[0] && response.data.choices[0].message) {
            return response.data.choices[0].message.content;
        }

        return 'Sorry, I could not generate a response.';
    } catch (error) {
        console.error('Error calling Llama AI:', error);
        return 'Error occurred while processing your request.';
    }
}

// Function to generate image using the API
async function generateImage(prompt) {
    try {
        const encodedPrompt = encodeURIComponent(prompt);
        const response = await axios.get(`http://67.220.85.146:6207/image?prompt=${encodedPrompt}`, {
            headers: {
                'x-api-key': 'bucu'
            }
        });

        return response.data;
    } catch (error) {
        console.error('Error generating image:', error);
        throw error;
    }
}

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await registerCommands();
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Check if command is used in a guild (server)
    if (!interaction.guild) {
        const errorEmbed = {
            title: '❌ Server Only',
            description: 'Commands only work in servers.',
            color: parseInt(config.errorcolor.replace('#', ''), 16),
            timestamp: new Date().toISOString(),
            footer: {
                text: `Requested by: ${interaction.user.username}`
            }
        };
        await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        return;
    }

    try {
        const { commandName, options } = interaction;

        // Permission check function
        const hasPermission = (requiredPermissions) => {
            if (!interaction.guild) return false; // DM commands not allowed for these
            
            const member = interaction.guild.members.cache.get(interaction.user.id);
            if (!member) return false;
            
            // Check if user has any of the required permissions
            return requiredPermissions.some(permission => {
                if (permission === 'ADMINISTRATOR') {
                    return member.permissions.has('Administrator');
                } else if (permission === 'MANAGE_CHANNELS') {
                    return member.permissions.has('ManageChannels');
                } else if (permission === 'VIEW_CHANNEL') {
                    return member.permissions.has('ViewChannel');
                }
                return false;
            });
        };

        const sendPermissionError = async () => {
            const errorEmbed = {
                title: '❌ Permission Denied',
                description: 'You do not have permission to use this command. Required permissions: Administrator, Manage Channels, or View Channel.',
                color: parseInt(config.errorcolor.replace('#', ''), 16),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Requested by: ${interaction.user.username}`
                }
            };
            await interaction.reply({ embeds: [errorEmbed], flags: 64 });
        };

        if (commandName === 'image') {
            const subcommand = options.getSubcommand();

            // Check permissions for image commands that modify settings
            if (['set-image', 'remove-image'].includes(subcommand)) {
                if (!hasPermission(['ADMINISTRATOR', 'MANAGE_CHANNELS'])) {
                    await sendPermissionError();
                    return;
                }
            }
            
            

            if (subcommand === 'generate') {
                const prompt = options.getString('prompt');

                try {
                    // Show loading embed
                    const loadingEmbed = {
                        title: '⏳ Generating Image...',
                        description: `**Prompt:**\n\`\`\`${prompt}\`\`\`\n\n🎨 Please wait while we generate your image...`,
                        color: parseInt(config.successcolor.replace('#', ''), 16),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Requested by: ${interaction.user.username}`,
                            icon_url: interaction.user.displayAvatarURL()
                        }
                    };

                    await interaction.reply({ embeds: [loadingEmbed] });

                    const imageData = await generateImage(prompt);

                    const embed = {
                        title: '🎨 Image Generate',
                        description: `**Prompt:**\n\`\`\`${imageData.prompt || prompt}\`\`\``,
                        fields: [
                            {
                                name: 'Information',
                                value: `**imageId:** ${imageData.imageId || 'N/A'}\n**status:** ${imageData.status || 'N/A'}\n**duration:** ${imageData.duration || 'N/A'}`,
                                inline: false
                            }
                        ],
                        image: {
                            url: imageData.image
                        },
                        color: parseInt(config.successcolor.replace('#', ''), 16),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Requested by: ${interaction.user.username}`,
                            icon_url: interaction.user.displayAvatarURL()
                        }
                    };

                    const components = [{
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 5,
                                label: 'Invite Bot',
                                url: `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
                            },
                            {
                                type: 2,
                                style: 5,
                                label: 'Join Server',
                                url: 'https://discord.gg/Zg2XkS5hq9'
                            }
                        ]
                    }];

                    await interaction.editReply({ embeds: [embed], components });
                } catch (error) {
                    console.error('Error generating image:', error);
                    const errorEmbed = {
                        title: '❌ Error',
                        description: 'Sorry, there was an error generating the image. Please try again later.',
                        color: parseInt(config.errorcolor.replace('#', ''), 16),
                        timestamp: new Date().toISOString(),
                        footer: {
                            text: `Requested by: ${interaction.user.username}`,
                            icon_url: interaction.user.displayAvatarURL()
                        }
                    };
                    await interaction.editReply({ embeds: [errorEmbed], components: [] });
                }
            } else if (subcommand === 'set-image') {
                const targetChannel = options.getChannel('channel');
                const guildId = interaction.guild.id;

                // Check if there's already an image channel for this server
                const currentImageChannel = imageChannels.get(guildId);
                let responseMessage = `Automatic image generation has been enabled for ${targetChannel}`;

                if (currentImageChannel && currentImageChannel !== targetChannel.id) {
                    responseMessage += `\n⚠️ Previous image channel <#${currentImageChannel}> has been disabled.`;
                }

                // Set the new image channel for this guild (replaces any existing one)
                imageChannels.set(guildId, targetChannel.id);
                await interaction.reply({
                    content: responseMessage
                });
            } else if (subcommand === 'remove-image') {
                const targetChannel = options.getChannel('channel');
                const guildId = interaction.guild.id;

                // Check if this channel is the current image channel for this guild
                const currentImageChannel = imageChannels.get(guildId);
                if (!currentImageChannel || currentImageChannel !== targetChannel.id) {
                    await interaction.reply({
                        content: `Automatic image generation is not enabled for ${targetChannel}. Use /image set-image first to enable it for this channel.`,
                        flags: 64 // ephemeral flag
                    });
                    return;
                }

                // Remove image generation from this guild
                imageChannels.delete(guildId);
                await interaction.reply({
                    content: `Automatic image generation has been removed from ${targetChannel}`
                });
            }
        } else if (commandName === 'channel') {
            const subcommand = options.getSubcommand();

            // Check permissions for channel AI commands
            if (!hasPermission(['ADMINISTRATOR', 'MANAGE_CHANNELS'])) {
                await sendPermissionError();
                return;
            }

            if (subcommand === 'setai') {
                const targetChannel = options.getChannel('channel');
                const guildId = interaction.guild.id;

                // Check if there's already an AI channel for this server
                const currentAiChannel = aiChannels.get(guildId);
                let responseMessage = `AI has been enabled for ${targetChannel}`;

                if (currentAiChannel && currentAiChannel !== targetChannel.id) {
                    responseMessage += `\n⚠️ Previous AI channel <#${currentAiChannel}> has been disabled.`;
                }

                // Set the new AI channel for this guild (replaces any existing one)
                aiChannels.set(guildId, targetChannel.id);
                await interaction.reply({
                    content: responseMessage
                });
            } else if (subcommand === 'setai-remove') {
                const targetChannel = options.getChannel('channel');
                const guildId = interaction.guild.id;

                // Check if this channel is the current AI channel for this guild
                const currentAiChannel = aiChannels.get(guildId);
                if (!currentAiChannel || currentAiChannel !== targetChannel.id) {
                    await interaction.reply({
                        content: `AI is not enabled for ${targetChannel}. Use /channel setai first to enable AI for this channel.`,
                        flags: 64 // ephemeral flag
                    });
                    return;
                }

                // Remove AI from this guild
                aiChannels.delete(guildId);
                await interaction.reply({
                    content: `AI has been removed from ${targetChannel}`
                });
            }
        } else if (commandName === 'bot') {
            const subcommand = options.getSubcommand();

            if (subcommand === 'uptime') {
                const uptime = Date.now() - botStartTime;
                const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
                const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((uptime % (1000 * 60)) / 1000);

                const embed = {
                    title: '⏰ Bot Uptime',
                    description: `${days}d ${hours}h ${minutes}m ${seconds}s`,
                    color: parseInt(config.successcolor.replace('#', ''), 16),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Requested by: ${interaction.user.username}`
                    }
                };

                await interaction.reply({ embeds: [embed] });
            } else if (subcommand === 'ping') {
                const sent = await interaction.reply({ 
                    content: 'Pinging...', 
                    fetchReply: true 
                });
                const latency = sent.createdTimestamp - interaction.createdTimestamp;

                const embed = {
                    title: '🏓 Pong!',
                    fields: [
                        { name: 'Latency', value: `${latency}ms`, inline: true },
                        { name: 'API Latency', value: `${Math.round(client.ws.ping)}ms`, inline: true }
                    ],
                    color: parseInt(config.successcolor.replace('#', ''), 16),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Requested by: ${interaction.user.username}`
                    }
                };

                await interaction.editReply({ content: null, embeds: [embed] });
            } else if (subcommand === 'help') {
                const embed = {
                    title: '📋 Bot Commands',
                    fields: [
                        { 
                            name: 'Channel Commands', 
                            value: '`/channel setai <#channel>` - Enable AI for a channel\n`/channel setai-remove <#channel>` - Remove AI from a channel',
                            inline: false 
                        },
                        { 
                            name: 'Image Commands', 
                            value: '`/image generate <prompt>` - Generate an image from text\n`/image set-image <#channel>` - Enable auto image generation\n`/image remove-image <#channel>` - Remove auto image generation',
                            inline: false 
                        },
                        { 
                            name: 'Bot Commands', 
                            value: '`/bot ping` - Check bot latency\n`/bot uptime` - Show bot uptime\n`/bot help` - Show this help menu\n`/bot feedback <message>` - Send feedback\n`/bot support` - Get support info\n`/bot invite` - Get invite link',
                            inline: false 
                        }
                    ],
                    color: parseInt(config.successcolor.replace('#', ''), 16),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Requested by: ${interaction.user.username}`
                    }
                };

                await interaction.reply({ embeds: [embed] });
            } else if (subcommand === 'feedback') {
                const feedbackMessage = options.getString('message');

                // Send feedback to configured channel if it exists
                if (config.channel) {
                    try {
                        const feedbackChannel = client.channels.cache.get(config.channel);
                        if (feedbackChannel) {
                            const embed = {
                                title: '💬 New Feedback',
                                fields: [
                                    { name: 'User', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                                    { name: 'Server', value: interaction.guild?.name || 'DM', inline: true },
                                    { name: 'Message', value: feedbackMessage, inline: false }
                                ],
                                color: parseInt(config.successcolor.replace('#', ''), 16),
                                timestamp: new Date().toISOString(),
                                footer: {
                                    text: `Requested by: ${interaction.user.username}`
                                }
                            };

                            await feedbackChannel.send({ embeds: [embed] });
                        }
                    } catch (error) {
                        console.error('Error sending feedback:', error);
                    }
                }

                await interaction.reply({
                    content: 'Thank you for your feedback! It has been sent to our team.',
                    flags: 64 // ephemeral flag
                });
            } else if (subcommand === 'support') {
                const embed = {
                    title: '🛠️ Support',
                    description: config.support,
                    color: parseInt(config.successcolor.replace('#', ''), 16),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Requested by: ${interaction.user.username}`
                    }
                };

                await interaction.reply({ embeds: [embed] });
            } else if (subcommand === 'invite') {
                const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`;

                const embed = {
                    title: '🔗 Invite Bot',
                    description: `[Click here to invite the bot to your server](${inviteUrl})`,
                    color: parseInt(config.successcolor.replace('#', ''), 16),
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: `Requested by: ${interaction.user.username}`
                    }
                };

                await interaction.reply({ embeds: [embed] });
            }
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({
                    content: 'An error occurred while processing your command.',
                    flags: 64 // ephemeral flag
                });
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        }
    }
});

client.on('messageCreate', async message => {
    // Don't respond to bot messages
    if (message.author.bot) return;

    // Handle AI-enabled channels
    const guildId = message.guild?.id;
    if (guildId && aiChannels.get(guildId) === message.channel.id) {
        // Get AI response
        const aiResponse = await getLlamaResponse(message.content);

        // Send response as embed
        const embed = {
            description: aiResponse,
            color: parseInt(config.successcolor.replace('#', ''), 16),
            timestamp: new Date().toISOString(),
            footer: {
                text: `Requested by: ${message.author.username}`
            }
        };

        await message.reply({ embeds: [embed] });
        return;
    }

    // Handle automatic image generation in image-enabled channels
    if (guildId && imageChannels.get(guildId) === message.channel.id) {
        try {
            // Show loading embed
            const loadingEmbed = {
                title: '⏳ Generating Image...',
                description: `**Prompt:**\n\`\`\`${message.content}\`\`\`\n\n🎨 Please wait while we generate your image...`,
                color: parseInt(config.successcolor.replace('#', ''), 16),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Requested by: ${message.author.username}`,
                    icon_url: message.author.displayAvatarURL()
                }
            };

            const loadingMessage = await message.reply({ embeds: [loadingEmbed] });

            const imageData = await generateImage(message.content);

            const embed = {
                title: '🎨 Image Generate',
                description: `**Prompt:**\n\`\`\`${imageData.prompt || message.content}\`\`\``,
                fields: [
                    {
                        name: 'Information',
                        value: `**imageId:** ${imageData.imageId || 'N/A'}\n**status:** ${imageData.status || 'N/A'}\n**duration:** ${imageData.duration || 'N/A'}`,
                        inline: false
                    }
                ],
                image: {
                    url: imageData.image
                },
                color: parseInt(config.successcolor.replace('#', ''), 16),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Requested by: ${message.author.username}`,
                    icon_url: message.author.displayAvatarURL()
                }
            };

            const components = [{
                type: 1,
                components: [
                    {
                        type: 2,
                        style: 5,
                        label: 'Invite Bot',
                        url: `https://discord.com/api/oauth2/authorize?client_id=${config.CLIENT_ID}&permissions=8&scope=bot%20applications.commands`
                    },
                    {
                        type: 2,
                        style: 5,
                        label: 'Join Server',
                        url: 'https://discord.gg/Zg2XkS5hq9'
                    }
                ]
            }];

            await loadingMessage.edit({ embeds: [embed], components });
        } catch (error) {
            console.error('Error generating automatic image:', error);
            const errorEmbed = {
                title: '❌ Error',
                description: 'Sorry, there was an error generating the image automatically. Please try again later.',
                color: parseInt(config.errorcolor.replace('#', ''), 16),
                timestamp: new Date().toISOString(),
                footer: {
                    text: `Requested by: ${message.author.username}`,
                    icon_url: message.author.displayAvatarURL()
                }
            };
            await message.reply({ embeds: [errorEmbed] });
        }
    }
});

// Error handling
client.on('error', console.error);

// Start the bot
client.login(config.token);
