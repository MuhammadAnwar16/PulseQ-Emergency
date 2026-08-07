import asyncio
import json
import logging
from typing import Any, Dict, Set, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("pulseq.emergency.realtime")

_main_loop: Optional[asyncio.AbstractEventLoop] = None


def set_main_event_loop(loop: asyncio.AbstractEventLoop) -> None:
    global _main_loop
    _main_loop = loop


class EmergencyRealtimeManager:
    def __init__(self) -> None:
        # room_name -> set of WebSocket connections
        self._rooms: Dict[str, Set[WebSocket]] = {}

    def _room(self, name: str) -> Set[WebSocket]:
        return self._rooms.setdefault(name, set())

    async def connect(self, room: str, ws: WebSocket) -> None:
        await ws.accept()
        self._room(room).add(ws)
        # Save running loop if not set
        global _main_loop
        if _main_loop is None:
            _main_loop = asyncio.get_running_loop()
        logger.info("emergency realtime: ws connected room=%s (total=%d)", room, len(self._rooms[room]))

    def disconnect(self, room: str, ws: WebSocket) -> None:
        subs = self._rooms.get(room)
        if subs and ws in subs:
            subs.discard(ws)
            if not subs:
                self._rooms.pop(room, None)

    async def publish(self, room: str, payload: Dict[str, Any]) -> None:
        subs = list(self._rooms.get(room, set()))
        dead: list[WebSocket] = []
        for ws in subs:
            try:
                await ws.send_text(json.dumps(payload, default=str))
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room, ws)


manager = EmergencyRealtimeManager()


def hospital_room(hospital_id: str) -> str:
    return f"hospital_{hospital_id}"


async def _publish_to_room(hospital_id: str, payload: Dict[str, Any]) -> None:
    await manager.publish(hospital_room(hospital_id), payload)


def broadcast_er_event(hospital_id: str, event_type: str, data: Dict[str, Any]) -> None:
    """Broadcast a typed emergency event to hospital_<id> room."""
    payload: Dict[str, Any] = {
        "type": event_type,
        "data": data,
    }
    global _main_loop
    try:
        if _main_loop and _main_loop.is_running():
            asyncio.run_coroutine_threadsafe(_publish_to_room(hospital_id, payload), _main_loop)
        else:
            loop = asyncio.get_running_loop()
            loop.create_task(_publish_to_room(hospital_id, payload))
    except Exception as err:
        logger.warning("emergency realtime broadcast fallback error: %s", err)


router = APIRouter()


@router.websocket("/ws")
async def emergency_ws(websocket: WebSocket, room: str = "") -> None:
    """Subscribe to emergency room, e.g. /api/v1/emergency/ws?room=hospital_<id>."""
    if not room:
        await websocket.accept()
        await websocket.send_text(json.dumps({"type": "error", "detail": "room parameter required"}))
        await websocket.close()
        return

    global _main_loop
    _main_loop = asyncio.get_running_loop()

    await manager.connect(room, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(room, websocket)
