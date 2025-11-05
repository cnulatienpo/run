import asyncio, json, os, signal, sys
import websockets

PORT = int(os.environ.get("PORT", "6789"))
HOST = os.environ.get("HOST", "0.0.0.0")

async def handler(ws):
    steps = 0
    try:
        while True:
            await asyncio.sleep(2.0)
            steps += 1
            await ws.send(json.dumps({"steps": steps}))
    except Exception as e:
        print(f"[ws] client ended: {e}", flush=True)

async def main():
    async with websockets.serve(handler, HOST, PORT):
        print(f"✅ Fake step server listening on ws://{HOST}:{PORT}", flush=True)
        stop = asyncio.Future()
        def _sig(*_):
            if not stop.done():
                stop.set_result(True)
        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                asyncio.get_running_loop().add_signal_handler(s, _sig)
            except NotImplementedError:
                pass
        await stop

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except OSError as e:
        print(f"❌ Bind error on {HOST}:{PORT}: {e}", file=sys.stderr)
        sys.exit(1)
