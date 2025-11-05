source .venv/bin/activate

VENV_PYTHON=$(which python)

$VENV_PYTHON -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8002
