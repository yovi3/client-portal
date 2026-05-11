"""role rename, lawbase case number, and profile/name split

Revision ID: f4a1b2c3d4e5
Revises: e8f1a2b3c4d5
Create Date: 2026-03-16 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f4a1b2c3d4e5'
down_revision = 'e8f1a2b3c4d5'
branch_labels = None
depends_on = None


ROLE_MAP = {
    'accountant': 'accounting',
    'paralegal': 'other',
    'legal assistant': 'case manager',
}


def _map_role(value: str | None) -> str | None:
    if value is None:
        return None
    lowered = value.strip().lower()
    return ROLE_MAP.get(lowered, lowered)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    user_columns = {col['name'] for col in inspector.get_columns('users')}
    with op.batch_alter_table('users', schema=None) as batch_op:
        if 'first_name' not in user_columns:
            batch_op.add_column(sa.Column('first_name', sa.String(), nullable=True))
        if 'last_name' not in user_columns:
            batch_op.add_column(sa.Column('last_name', sa.String(), nullable=True))

    profile_columns = {col['name'] for col in inspector.get_columns('client_profiles')}
    with op.batch_alter_table('client_profiles', schema=None) as batch_op:
        for col_name in ('street_1', 'street_2', 'city', 'state', 'zip_code', 'country'):
            if col_name not in profile_columns:
                batch_op.add_column(sa.Column(col_name, sa.String(), nullable=True))

    case_columns = {col['name'] for col in inspector.get_columns('cases')}
    with op.batch_alter_table('cases', schema=None) as batch_op:
        if 'case_type' not in case_columns:
            batch_op.add_column(sa.Column('case_type', sa.String(), nullable=True))
        if 'lawbase_case_number' not in case_columns:
            batch_op.add_column(sa.Column('lawbase_case_number', sa.String(), nullable=True))
    case_indexes = {idx['name'] for idx in inspector.get_indexes('cases')}
    with op.batch_alter_table('cases', schema=None) as batch_op:
        if 'ix_cases_lawbase_case_number' not in case_indexes:
            batch_op.create_index('ix_cases_lawbase_case_number', ['lawbase_case_number'], unique=True)

    invite_columns = {col['name'] for col in inspector.get_columns('invites')}
    with op.batch_alter_table('invites', schema=None) as batch_op:
        for col_name in (
            'prefill_street_1',
            'prefill_street_2',
            'prefill_city',
            'prefill_state',
            'prefill_zip_code',
            'prefill_country',
        ):
            if col_name not in invite_columns:
                batch_op.add_column(sa.Column(col_name, sa.String(), nullable=True))

    users_rows = bind.execute(sa.text('SELECT id, name, role FROM users')).fetchall()
    for user_id, name, role in users_rows:
        raw_name = (name or '').strip()
        parts = raw_name.split()
        first_name = parts[0] if parts else ''
        last_name = ' '.join(parts[1:]) if len(parts) > 1 else ''
        bind.execute(
            sa.text(
                'UPDATE users SET first_name = :first_name, last_name = :last_name, role = :role WHERE id = :id'
            ),
            {
                'id': user_id,
                'first_name': first_name or None,
                'last_name': last_name or None,
                'role': _map_role(role) or role,
            },
        )

    bind.execute(
        sa.text(
            "UPDATE client_profiles SET street_1 = address WHERE (street_1 IS NULL OR street_1 = '') AND address IS NOT NULL"
        )
    )

    bind.execute(
        sa.text(
            "UPDATE invites SET prefill_street_1 = prefill_address WHERE (prefill_street_1 IS NULL OR prefill_street_1 = '') AND prefill_address IS NOT NULL"
        )
    )

    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'accounting' WHERE role = 'accountant'"))
    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'other' WHERE role = 'paralegal'"))
    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'case manager' WHERE role = 'legal assistant'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'accounting' WHERE role = 'accountant'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'other' WHERE role = 'paralegal'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'case manager' WHERE role = 'legal assistant'"))
    bind.execute(sa.text("UPDATE invites SET role = 'accounting' WHERE role = 'accountant'"))
    bind.execute(sa.text("UPDATE invites SET role = 'other' WHERE role = 'paralegal'"))
    bind.execute(sa.text("UPDATE invites SET role = 'case manager' WHERE role = 'legal assistant'"))

    bind.execute(
        sa.text(
            "UPDATE cases SET case_type = COALESCE(NULLIF(case_type, ''), category, 'General') WHERE case_type IS NULL OR case_type = ''"
        )
    )
    bind.execute(
        sa.text(
            "UPDATE cases SET lawbase_case_number = COALESCE(NULLIF(lawbase_case_number, ''), CAST(case_number AS TEXT), CAST(id AS TEXT)) "
            "WHERE lawbase_case_number IS NULL OR lawbase_case_number = ''"
        )
    )


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(sa.text("UPDATE users SET role = 'accountant' WHERE role = 'accounting'"))
    bind.execute(sa.text("UPDATE users SET role = 'paralegal' WHERE role = 'other'"))
    bind.execute(sa.text("UPDATE users SET role = 'legal assistant' WHERE role = 'case manager'"))
    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'accountant' WHERE role = 'accounting'"))
    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'paralegal' WHERE role = 'other'"))
    bind.execute(sa.text("UPDATE case_personnel_association SET role = 'legal assistant' WHERE role = 'case manager'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'accountant' WHERE role = 'accounting'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'paralegal' WHERE role = 'other'"))
    bind.execute(sa.text("UPDATE role_permissions SET role = 'legal assistant' WHERE role = 'case manager'"))

    inspector = sa.inspect(bind)
    case_indexes = {idx['name'] for idx in inspector.get_indexes('cases')}
    with op.batch_alter_table('cases', schema=None) as batch_op:
        if 'ix_cases_lawbase_case_number' in case_indexes:
            batch_op.drop_index('ix_cases_lawbase_case_number')
        for col_name in ('lawbase_case_number', 'case_type'):
            if col_name in {col['name'] for col in inspector.get_columns('cases')}:
                batch_op.drop_column(col_name)

    with op.batch_alter_table('client_profiles', schema=None) as batch_op:
        for col_name in ('street_1', 'street_2', 'city', 'state', 'zip_code', 'country'):
            if col_name in {col['name'] for col in inspector.get_columns('client_profiles')}:
                batch_op.drop_column(col_name)

    with op.batch_alter_table('invites', schema=None) as batch_op:
        for col_name in ('prefill_street_1', 'prefill_street_2', 'prefill_city', 'prefill_state', 'prefill_zip_code', 'prefill_country'):
            if col_name in {col['name'] for col in inspector.get_columns('invites')}:
                batch_op.drop_column(col_name)

    with op.batch_alter_table('users', schema=None) as batch_op:
        for col_name in ('first_name', 'last_name'):
            if col_name in {col['name'] for col in inspector.get_columns('users')}:
                batch_op.drop_column(col_name)
