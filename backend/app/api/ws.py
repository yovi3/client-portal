from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Dict, List

from .. import database, schemas, crud, auth
from ..services import conversations, texting
from ..config import get_settings
from .utils import ensure_case_access, PERSONNEL_ROLES


router = APIRouter(tags=["ws"])
settings = get_settings()


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room: str):
        await websocket.accept()
        if room not in self.active_connections:
            self.active_connections[room] = []
        self.active_connections[room].append(websocket)

    def disconnect(self, websocket: WebSocket, room: str):
        if room in self.active_connections:
            self.active_connections[room].remove(websocket)

    async def broadcast(self, message: str, room: str):
        if room in self.active_connections:
            for connection in self.active_connections[room]:
                await connection.send_text(message)


manager = ConnectionManager()


def get_ws_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.websocket("/ws/dm/{other_user_id}")
async def websocket_dm_endpoint(
    websocket: WebSocket,
    other_user_id: int,
    db: Session = Depends(get_ws_db),
):
    token = websocket.cookies.get(settings.auth_cookie_name)
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = auth.decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=1008)
        return

    user = crud.get_user_by_id(db, user_id)
    if not user:
        await websocket.close(code=1008)
        return

    room = f"dm_{min(user_id, other_user_id)}_{max(user_id, other_user_id)}"
    await manager.connect(websocket, room)

    try:
        while True:
            data = await websocket.receive_json()
            sender_id = data.get("sender_id")
            if not sender_id or int(sender_id) != user.id:
                await websocket.send_text('{"error": "Invalid sender_id"}')
                continue

            msg = crud.create_direct_message(db, sender_id=user_id, receiver_id=other_user_id, content=data["content"])
            broadcast_data = schemas.DirectMessage.from_orm(msg).model_dump_json()
            await manager.broadcast(broadcast_data, room)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
    except Exception:
        manager.disconnect(websocket, room)


@router.websocket("/ws/{case_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    case_id: int,
    db: Session = Depends(get_ws_db),
):
    token = websocket.cookies.get(settings.auth_cookie_name)
    if not token:
        await websocket.close(code=1008)
        return

    try:
        payload = auth.decode_access_token(token)
        user_id = int(payload.get("sub"))
    except Exception:
        await websocket.close(code=1008)
        return

    user = crud.get_user_by_id(db, user_id)
    if not user:
        await websocket.close(code=1008)
        return

    try:
        ensure_case_access(db, user, case_id)
    except HTTPException:
        await websocket.close(code=1008)
        return
    room = f"case_{case_id}"
    await manager.connect(websocket, room)

    try:
        while True:
            data = await websocket.receive_json()
            sender_id = data.get("sender_id")
            if not sender_id or int(sender_id) != user.id:
                await websocket.send_text('{"error": "Invalid sender_id"}')
                continue

            message_schema = schemas.MessageCreate(
                content=data["content"],
                case_id=case_id,
                sender_id=sender_id,
                channel="portal",
            )
            db_message_simple = crud.create_message(db, message=message_schema)
            db_message_full = crud.get_message_by_id(db, db_message_simple.id)
            if not db_message_full:
                continue
            conversations.attach_message(db, db_message_full)

            # A message from the firm's staff is also texted to the client. The text
            # status is set before the message goes out, so screens show it right away.
            sender = db_message_full.sender_user
            plan = None
            if sender and sender.role in PERSONNEL_ROLES:
                plan = texting.prepare_client_text(db, db_message_full)
                db.refresh(db_message_full)

            await manager.broadcast(texting.message_event(db_message_full), room)
            if plan:
                texting.start_delivery(plan, manager.broadcast)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room)
    except Exception:
        manager.disconnect(websocket, room)
