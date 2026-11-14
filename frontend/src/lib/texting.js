// Helpers for showing staff how portal messages reach clients by text.

// Must match SMS_SENDER_NAME in the backend .env (default below).
export const SMS_SENDER_NAME = "Davis, Saperstein & Salomon"

// What the client's phone shows. Mirrors build_client_text() in backend/app/services/sms.py.
export const buildClientText = (senderFirstName, content) => {
  const who = senderFirstName ? ` - ${senderFirstName}` : ""
  return `${SMS_SENDER_NAME}${who}: ${(content || "").trim()}`
}

// GSM-7 is the standard texting alphabet: 160 characters per text, 153 per part when split.
// Anything outside it (emoji, curly quotes, many accented letters) switches the whole text
// to Unicode: 70 per text, 67 per part. Extended GSM characters count as two.
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
const GSM_EXTENDED = "^{}\\[~]|€\f"

export const countTextParts = (text) => {
  let units = 0
  let unicode = false
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) units += 1
    else if (GSM_EXTENDED.includes(ch)) units += 2
    else { unicode = true; break }
  }
  if (unicode) {
    const len = [...text].length
    return len <= 70 ? 1 : Math.ceil(len / 67)
  }
  return units <= 160 ? 1 : Math.ceil(units / 153)
}

// "+12015550123" -> "(201) 555-0123"; other formats are shown as stored.
export const formatPhone = (phone) => {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec((phone || "").replace(/[\s().-]/g, ""))
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone
}

// Where texts for this case go, from the first client on the case.
export const getTextingTarget = (caseData) => {
  const client = caseData?.clients?.[0]
  const profile = client?.client_profile
  if (!client) return { mode: "none", reason: "No client on this case. Messages stay in the portal." }
  if (!profile?.phone) return { mode: "none", client, reason: "No mobile number on file. Messages stay in the portal." }
  if (profile.sms_opted_out)
    return { mode: "none", client, reason: `${client.name} opted out of texts. Messages stay in the portal.` }
  return { mode: "text", client, phone: formatPhone(profile.phone) }
}

// The line under a staff message that says what happened to its text.
export const describeTextStatus = (status, error) => {
  switch (status) {
    case "sending": return { tone: "muted", label: "Sending text…", busy: true }
    case "sent": return { tone: "muted", label: "Texted" }
    case "delivered": return { tone: "muted", label: "Delivered", done: true }
    case "simulated": return { tone: "muted", label: "Text simulated (test mode)" }
    case "failed": return { tone: "danger", label: `Text not delivered: ${error || "unknown reason"}` }
    case "opted_out":
    case "no_phone": return { tone: "warning", label: `Portal only: ${error || "not texted"}` }
    default: return null
  }
}
