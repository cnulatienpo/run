import asyncio, json, websockets

async def main():
    async def handler(ws, path):
        steps = 0
        while True:
            await asyncio.sleep(2.0)
            steps += 1
            await ws.send(json.dumps({"steps": steps}))
    server = websockets.serve(handler, "localhost", 6789)
    print("✅ Fake step server on ws://localhost:6789 (sending {\"steps\": N})")
    await server
    await asyncio.Future()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n🔚 Stopped.")
