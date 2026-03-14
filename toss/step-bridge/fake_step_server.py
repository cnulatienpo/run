import asyncio
import json

import websockets


async def handler(websocket):
    steps = 0
    while True:
        await asyncio.sleep(2)
        steps += 1
        await websocket.send(json.dumps({"steps": steps}))


async def main():
    async with websockets.serve(handler, "0.0.0.0", 6789):
        print("✅ Fake step server running on ws://localhost:6789")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
