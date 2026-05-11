"""added message_type column

Revision ID: 30a917aafe5c
Revises: 
Create Date: 2025-11-13 15:59:56.945606

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '30a917aafe5c'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    message_columns = {col['name'] for col in inspector.get_columns('messages')}
    if 'message_type' not in message_columns:
        op.add_column('messages', sa.Column('message_type', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    message_columns = {col['name'] for col in inspector.get_columns('messages')}
    if 'message_type' in message_columns:
        op.drop_column('messages', 'message_type')
