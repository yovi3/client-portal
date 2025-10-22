#!/bin/bash
# Activate virtual environment
source .venv/bin/activate

# Get full path to the venv’s python
VENV_PYTHON=$(which python)

# Run uvicorn using the venv python explicitly
$VENV_PYTHON -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
