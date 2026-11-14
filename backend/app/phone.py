"""One spelling for every phone number the system stores or compares.

Twilio sends numbers as E.164 (+12015550123). People type them every other way:
(201) 555-0123, 201.555.0123, 1-201-555-0123. Everything is turned into E.164
before it is saved or looked up, so the same person always matches.
"""
import re
from typing import Optional


def normalize_phone(raw: Optional[str]) -> Optional[str]:
    """Return the number in E.164, or None if it can't be a phone number.

    Numbers without a country code are treated as US numbers.
    """
    if not raw:
        return None
    text = str(raw).strip()
    digits = re.sub(r"\D", "", text)
    if text.startswith("+"):
        return f"+{digits}" if 8 <= len(digits) <= 15 else None
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    return None
