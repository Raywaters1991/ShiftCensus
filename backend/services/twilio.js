// backend/services/twilio.js
require("dotenv").config();
const twilio = require("twilio");

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

async function sendSms(to, body) {
  if (!to) throw new Error("Missing SMS destination number");
  return client.messages.create({
    from: process.env.TWILIO_FROM,
    to,
    body,
  });
}

module.exports = { sendSms };
