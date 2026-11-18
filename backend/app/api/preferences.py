"""Each person's own settings (appearance for now). Saved on their account, so they
follow them to any computer."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import database, models, schemas
from ..deps import get_current_user

router = APIRouter(tags=["preferences"])


@router.patch("/me/appearance", response_model=schemas.User)
def update_appearance(
    payload: schemas.AppearanceUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.get(models.User, current_user.id)
    if payload.theme is not None:
        user.theme = payload.theme
    if payload.text_size is not None:
        user.text_size = payload.text_size
    if payload.panel_colors is not None:
        user.panel_colors = payload.panel_colors
    db.commit()
    db.refresh(user)
    return user
