"""added filed upload - file_path

Revision ID: 2902fa2705cd
Revises: cfd548b48dba
Create Date: 2025-11-14 11:40:09.688261

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


# revision identifiers, used by Alembic.
revision: str = '2902fa2705cd'
down_revision: Union[str, None] = 'cfd548b48dba'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col['name'] for col in inspector.get_columns('requested_documents')}
    if 'file_path' not in columns:
        op.add_column('requested_documents', sa.Column('file_path', sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = {col['name'] for col in inspector.get_columns('requested_documents')}
    if 'file_path' in columns:
        op.drop_column('requested_documents', 'file_path')
