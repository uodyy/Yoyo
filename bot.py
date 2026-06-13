from flask import Flask
import threading
import discord
import asyncio
import os

# --- Keep-alive server on port 8080 ---
app = Flask(__name__)

@app.route('/')
def home():
    return "Bot is alive!"

def run_flask():
    app.run(host='0.0.0.0', port=8080)

threading.Thread(target=run_flask, daemon=True).start()

# --- Config ---
VOICE_CHANNEL_ID = 1414687975974895636
STREAM_TITLE     = 'Yoyo'
STREAM_URL       = 'https://www.twitch.tv/monstercat'
CUSTOM_STATUSES  = ['Hi', 'My', 'World']


# --- Discord self-bot ---
class MyClient(discord.Client):
    def __init__(self):
        super().__init__()
        self.current_index = 0
        self.vc = None

    async def on_ready(self):
        print(f'[Bot] Logged in as {self.user}')
        self.loop.create_task(self.status_loop())
        self.loop.create_task(self.voice_loop())
        self.loop.create_task(self.health_check())

    # ── Presence ──────────────────────────────────────────────
    async def set_status(self, custom_text):
        streaming = discord.Activity(
            type=discord.ActivityType.streaming,
            name=STREAM_TITLE,
            url=STREAM_URL
        )
        custom = discord.CustomActivity(name=custom_text)
        await self.change_presence(
            activities=[streaming, custom],
            status=discord.Status.online
        )
        print(f'[Streaming] Title: "{STREAM_TITLE}" (fixed) | URL: {STREAM_URL} | Custom status: "{custom_text}"')

    async def status_loop(self):
        await self.wait_until_ready()
        while not self.is_closed():
            try:
                text = CUSTOM_STATUSES[self.current_index]
                await self.set_status(text)
                self.current_index = (self.current_index + 1) % len(CUSTOM_STATUSES)
            except Exception as e:
                print(f'[Status Loop Error] {e}')
            await asyncio.sleep(5)

    # ── Voice ─────────────────────────────────────────────────
    async def join_voice(self):
        channel = self.get_channel(VOICE_CHANNEL_ID)
        if channel is None:
            print(f'[Voice] Channel {VOICE_CHANNEL_ID} not found — will retry...')
            return

        try:
            if self.vc and self.vc.is_connected():
                return  # already connected, nothing to do

            if self.vc:
                try:
                    await self.vc.disconnect(force=True)
                except Exception:
                    pass

            self.vc = await channel.connect(self_deaf=True, self_mute=False)
            print(f'[Voice] Joined channel: {channel.name} (ID: {VOICE_CHANNEL_ID})')
        except Exception as e:
            print(f'[Voice] Failed to join: {e}')
            self.vc = None

    async def voice_loop(self):
        await self.wait_until_ready()
        while not self.is_closed():
            try:
                if self.vc is None or not self.vc.is_connected():
                    print('[Voice] Not connected — attempting to join voice channel...')
                    await self.join_voice()
                else:
                    print(f'[Voice] Connected to "{self.vc.channel.name}" — OK')
            except Exception as e:
                print(f'[Voice Loop Error] {e}')
            await asyncio.sleep(5)

    # ── Health check ──────────────────────────────────────────
    async def health_check(self):
        await self.wait_until_ready()
        while not self.is_closed():
            await asyncio.sleep(5)
            try:
                if self.ws is None or not self.is_ready():
                    print('[Health] Connection lost — restarting bot...')
                    await self.close()
                    return

                latency = self.latency
                if latency == float('inf') or latency > 30:
                    print(f'[Health] Latency too high ({latency:.1f}s) — restarting...')
                    await self.close()
                    return

                current_activity = self.activity
                expected_text = CUSTOM_STATUSES[self.current_index - 1] if self.current_index > 0 else CUSTOM_STATUSES[-1]
                if current_activity is None or current_activity.name != expected_text:
                    print(f'[Health] Activity missing — re-applying: {expected_text}')
                    await self.set_status(expected_text)

                vc_status = f'"{self.vc.channel.name}"' if (self.vc and self.vc.is_connected()) else 'NOT CONNECTED'
                print(f'[Health] OK — latency: {latency * 1000:.0f}ms | streaming: "{STREAM_TITLE}" | voice: {vc_status}')

            except Exception as e:
                print(f'[Health Check Error] {e} — restarting bot...')
                await self.close()
                return

    async def on_disconnect(self):
        print('[Event] Disconnected from Discord.')

    async def on_resumed(self):
        print('[Event] Session resumed — re-applying status.')
        text = CUSTOM_STATUSES[self.current_index - 1] if self.current_index > 0 else CUSTOM_STATUSES[-1]
        try:
            await self.set_status(text)
        except Exception as e:
            print(f'[Resume Error] {e}')


def run_bot():
    import time
    while True:
        client = MyClient()
        try:
            client.run(os.getenv('TOKEN'))
        except Exception as e:
            print(f'[Bot Crashed] {e} — restarting in 5 seconds...')
        finally:
            try:
                asyncio.get_event_loop().close()
            except Exception:
                pass
            time.sleep(5)
            print('[Bot] Restarting...')

run_bot()
