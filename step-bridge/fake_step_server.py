import asyncio, json, websockets

async def main():
    async def handler(ws, path=None):
        steps = 0
        while True:
            await asyncio.sleep(2.0)
            steps += 1
            try:
                await ws.send(json.dumps({"steps": steps}))
            except Exception:
                # connection may be closed; bail out of loop
                print('connection handler failed')
                break
    # Bind to 0.0.0.0 so forwarded/public addresses (Codespaces, Docker host) can reach the server
    server = websockets.serve(handler, "0.0.0.0", 6789)
    print("✅ Fake step server on ws://0.0.0.0:6789 (sending {\"steps\": N})")
    await server
    await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🔚 Stopped.")
