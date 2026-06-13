require('./keep_alive');
const { Client } = require('discord.js-selfbot-v13');

const client = new Client({ checkUpdate: false });

const GUILD_ID      = '701688616614625360';
const CHANNEL_ID    = '1414687975974895636';
const STREAM_TITLE  = 'Yoyo';
const STREAM_URL    = 'https://www.twitch.tv/monstercat';
const STATUSES      = ['Hi', 'My', 'World'];

let statusIndex  = 0;
let currentVoice = null;

// ── Streaming + custom status ────────────────────────────────
async function setPresence(customText) {
    try {
        await client.user.setPresence({
            activities: [
                { name: STREAM_TITLE, type: 'STREAMING', url: STREAM_URL },
                { name: customText,   type: 'CUSTOM' }
            ],
            status: 'online'
        });
        console.log(`[Streaming] Title: "${STREAM_TITLE}" (fixed) | URL: ${STREAM_URL} | Custom status: "${customText}"`);
    } catch (err) {
        console.error(`[Presence Error] ${err?.message || err}`);
    }
}

function startStatusLoop() {
    setInterval(async () => {
        const text = STATUSES[statusIndex];
        await setPresence(text);
        statusIndex = (statusIndex + 1) % STATUSES.length;
    }, 5000);
}

// ── Voice connection ─────────────────────────────────────────
async function joinVoice() {
    try {
        const guild = client.guilds.cache.get(GUILD_ID)
                   || await client.guilds.fetch(GUILD_ID).catch(() => null);

        if (!guild) {
            console.log('[Voice] Guild not found — retrying in 10s...');
            setTimeout(joinVoice, 10000);
            return;
        }

        const channel = guild.channels.cache.get(CHANNEL_ID)
                     || await guild.channels.fetch(CHANNEL_ID).catch(() => null);

        if (!channel || !channel.isVoice()) {
            console.log('[Voice] Channel not found or not a voice channel — retrying in 10s...');
            setTimeout(joinVoice, 10000);
            return;
        }

        console.log(`[Voice] Joining: ${channel.name} (${CHANNEL_ID})`);

        if (currentVoice) {
            try { currentVoice.disconnect(); } catch (_) {}
            currentVoice = null;
        }

        currentVoice = await client.voice.joinChannel(channel, {
            selfDeaf:  false,
            selfMute:  false,
            selfVideo: false
        });

        console.log(`[Voice] Joined "${channel.name}" successfully!`);

        currentVoice.on('error', (err) => {
            console.error(`[Voice Error] ${err?.message || err} — retrying in 5s...`);
            currentVoice = null;
            setTimeout(joinVoice, 5000);
        });

        currentVoice.on('disconnect', () => {
            console.log('[Voice] Disconnected — retrying in 5s...');
            currentVoice = null;
            setTimeout(joinVoice, 5000);
        });

    } catch (err) {
        console.error(`[Voice] Failed to join: ${err?.message || err} — retrying in 5s...`);
        currentVoice = null;
        setTimeout(joinVoice, 5000);
    }
}

// ── Health check every 30s ───────────────────────────────────
let voiceRetryScheduled = false;

function startHealthCheck() {
    setInterval(() => {
        const connected = currentVoice && currentVoice.status === 0;
        const voiceStatus = connected ? `"${currentVoice.channel?.name}"` : 'NOT CONNECTED';
        const latencyMs = client.ws.ping;
        console.log(`[Health] OK — latency: ${latencyMs}ms | streaming: "${STREAM_TITLE}" | voice: ${voiceStatus}`);

        // Re-join voice if dropped (rate-limited: only if no retry already pending)
        if (!connected && !voiceRetryScheduled) {
            voiceRetryScheduled = true;
            console.log('[Health] Voice not connected — scheduling rejoin in 15s...');
            setTimeout(() => {
                voiceRetryScheduled = false;
                joinVoice();
            }, 15000);
        }
    }, 30000);
}

// ── Bot events ───────────────────────────────────────────────
client.on('ready', async () => {
    console.log(`[Bot] Logged in as ${client.user.tag}`);

    // Set initial presence
    await setPresence(STATUSES[statusIndex]);
    statusIndex = (statusIndex + 1) % STATUSES.length;

    // Start loops
    startStatusLoop();
    startHealthCheck();

    // Join voice
    await joinVoice();
});

client.on('disconnect', () => {
    console.log('[Event] Disconnected from Discord.');
});

// Debug voice state updates for this user
client.on('raw', (packet) => {
    if (
        (packet.t === 'VOICE_STATE_UPDATE' && packet.d?.user_id === client.user?.id) ||
        packet.t === 'VOICE_SERVER_UPDATE'
    ) {
        console.log(`[Voice Raw] ${packet.t} — channel: ${packet.d?.channel_id || 'N/A'} endpoint: ${packet.d?.endpoint || 'N/A'}`);
    }
});

client.login(process.env.TOKEN);
