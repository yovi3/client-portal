import logging
from twilio.rest import Client

from ..config import get_settings


logger = logging.getLogger(__name__)
settings = get_settings()


if not all([settings.twilio_account_sid, settings.twilio_auth_token, settings.twilio_phone_number]):
    logger.warning("Twilio configuration missing. SMS functionality will not work.")
    _twilio_client = None
else:
    _twilio_client = Client(settings.twilio_account_sid, settings.twilio_auth_token)


def send_sms(to_number: str, body: str):
    if not _twilio_client:
        logger.info("SMS SIMULATION to %s: %s", to_number, body)
        return
    try:
        message = _twilio_client.messages.create(
            body=body,
            from_=settings.twilio_phone_number,
            to=to_number,
        )
        logger.info("SMS Sent (SID: %s) to %s", message.sid, to_number)
    except Exception as e:
        logger.error("Failed to send SMS to %s: %s", to_number, str(e))
