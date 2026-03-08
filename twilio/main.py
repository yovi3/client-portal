from twilio.rest import Client
from twilio.base.exceptions import TwilioRestException
import os

account_sid = os.getenv("TWILIO_ACCOUNT_SID")
auth_token = os.getenv("TWILIO_AUTH_TOKEN")
client = Client(account_sid, auth_token)

try:
    message = client.messages.create(
        body="Twoje zamówienie jest gotowe 😊",
        from_="+13853635466",  # numer Twilio
        to="+18777804236"      # numer klienta
    )
    print("Wiadomość wysłana! SID:", message.sid)

except TwilioRestException as e:
    print("Błąd Twilio:")
    print("Status kodu:", e.status)
    print("Kod błędu:", e.code)
    print("Treść błędu:", e.msg)

except Exception as e:
    print("Nieoczekiwany błąd:", e)

print(message.sid)
