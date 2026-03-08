from flask import Flask, request, Response

app = Flask(__name__)

@app.route("/sms/incoming", methods=["POST"])
def sms_incoming():
    print("Endpoint został wywołany!")
    from_number = request.form.get("From")
    body = request.form.get("Body")

    print(f"Przychodzący SMS od {from_number}: {body}")

    # Twilio wymaga odpowiedzi 200 OK w formacie TwiML, jeśli chcemy wysłać automatyczną odpowiedź
    response = """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>Dziękujemy za wiadomość!</Message>
</Response>"""
    return Response(response, mimetype="text/xml")

if __name__ == "__main__":
    # host="0.0.0.0" pozwala ngrokowi się połączyć
    app.run(debug=True, host="0.0.0.0", port=5000)
