import logging
from dataclasses import dataclass
from typing import Optional

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from ..config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()

_has_sender = bool(settings.twilio_messaging_service_sid or settings.twilio_phone_number)
if not all([settings.twilio_account_sid, settings.twilio_auth_token, _has_sender]):
    logger.warning("Twilio configuration missing. SMS runs in simulation mode (logged, not sent).")
    _twilio_client = None
else:
    _twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)

# Twilio error 21610: the recipient has replied STOP to this sender.
TWILIO_ERROR_UNSUBSCRIBED = 21610

# Plain-language reasons staff see when a text fails. Unknown codes fall back to Twilio's text.
_ERROR_TEXT = {
    21211: "The phone number isn't valid.",
    21408: "Texting to this country isn't enabled.",
    21610: "The client has opted out of texts (replied STOP).",
    21614: "This number can't receive texts (probably a landline).",
    30003: "The phone is off or unreachable.",
    30004: "The client's carrier blocked the text.",
    30005: "The number doesn't exist or is no longer in service.",
    30006: "This number can't receive texts (landline or unreachable carrier).",
    30007: "The carrier filtered the text as possible spam.",
    30008: "The carrier couldn't deliver the text.",
    30034: "Texts are blocked until the firm's texting registration is approved.",
}


def describe_error(code, fallback: Optional[str] = None) -> str:
    try:
        code = int(code)
    except (TypeError, ValueError):
        return fallback or "The text could not be delivered."
    return _ERROR_TEXT.get(code) or fallback or f"The text could not be delivered (Twilio error {code})."


@dataclass
class SendResult:
    status: str                  # "sent", "failed" or "simulated"
    sid: Optional[str] = None
    error_code: Optional[int] = None
    error_text: Optional[str] = None


def build_client_text(sender_first_name: Optional[str], content: str) -> str:
    """Text a client receives for a portal message.

    Starts with the firm's name (carriers require the sender to be identified) and
    the staff member's first name. Deliberately leaves out the case title, which can
    hold sensitive details and shows on lock screens.
    """
    who = f" - {sender_first_name}" if sender_first_name else ""
    return f"{settings.sms_sender_name}{who}: {content.strip()}"


def status_callback_url() -> Optional[str]:
    """Where Twilio reports delivery updates. Only a public https backend can receive them."""
    base = (settings.backend_base_url or "").rstrip("/")
    return f"{base}/api/twilio/webhook/status" if base.startswith("https://") else None


def _masked(number: str) -> str:
    """Logs show only the last 4 digits of a phone number, and never the message itself:
    the database keeps the full record; the log only needs enough to troubleshoot."""
    digits = "".join(ch for ch in (number or "") if ch.isdigit())
    return f"...{digits[-4:]}" if digits else "(no number)"


def send_sms(to_number: str, body: str) -> SendResult:
    """Send one text.

    Blocking network call: callers in async code must run it off the event loop
    (asyncio.to_thread) so live chat is not held up while Twilio responds.
    """
    if not _twilio_client:
        logger.info("SMS SIMULATION to %s (%d characters)", _masked(to_number), len(body or ""))
        return SendResult(status="simulated")
    params = {"body": body, "to": to_number}
    if settings.twilio_messaging_service_sid:
        params["messaging_service_sid"] = settings.twilio_messaging_service_sid
    else:
        params["from_"] = settings.twilio_phone_number
    callback = status_callback_url()
    if callback:
        params["status_callback"] = callback
    try:
        message = _twilio_client.messages.create(**params)
        logger.info("SMS sent (SID: %s) to %s", message.sid, _masked(to_number))
        return SendResult(status="sent", sid=message.sid)
    except TwilioRestException as e:
        logger.error("Twilio refused SMS to %s: %s %s", _masked(to_number), e.code, e.msg)
        return SendResult(status="failed", error_code=e.code, error_text=describe_error(e.code, e.msg))
    except Exception as e:
        logger.error("Failed to send SMS to %s: %s", _masked(to_number), str(e))
        return SendResult(status="failed", error_text="The text couldn't be sent. Try again in a minute.")
