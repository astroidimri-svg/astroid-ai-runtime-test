import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@whiskeysockets/baileys";
import qrcode from "qrcode";

const app = express();
const PORT = process.env.PORT || 3000;

let sock;
let qrCodeData = null;
let connectionStatus = "starting";

async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      qrCodeData = await qrcode.toDataURL(qr);
      connectionStatus = "qr_ready";
      console.log("WhatsApp QR code is ready.");
    }

    if (connection === "open") {
      connectionStatus = "connected";
      qrCodeData = null;
      console.log("ASTROID AI WhatsApp connection established.");
    }

    if (connection === "close") {
      connectionStatus = "disconnected";

      const statusCode =
        lastDisconnect?.error?.output?.statusCode;

      if (statusCode !== DisconnectReason.loggedOut) {
        console.log("Connection closed. Reconnecting...");
        setTimeout(startWhatsApp, 3000);
      } else {
        console.log("WhatsApp logged out. A new QR code is required.");
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const message = messages[0];

    if (!message?.message) return;
    if (message.key.fromMe) return;

    const text =
      message.message.conversation ||
      message.message.extendedTextMessage?.text ||
      "";

    console.log("Incoming message:", text);

    // ASTROID AI commands must begin with "." or "!"
    if (!text.startsWith(".") && !text.startsWith("!")) return;

    const command = text.trim().split(/\s+/)[0].toLowerCase();

    if (command === ".ping" || command === "!ping") {
      await sock.sendMessage(message.key.remoteJid, {
        text: "ASTROID AI 🤖 is online."
      });
    }
  });
}

app.get("/", (req, res) => {
  res.json({
    name: "ASTROID AI 🤖",
    status: connectionStatus
  });
});

app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    whatsapp: connectionStatus,
    uptime: process.uptime()
  });
});

app.get("/qr", (req, res) => {
  if (!qrCodeData) {
    return res.json({
      status: connectionStatus,
      message: "QR code is not currently available."
    });
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>ASTROID AI WhatsApp</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
      </head>
      <body style="text-align:center;font-family:Arial;padding:30px">
        <h2>ASTROID AI 🤖</h2>
        <p>Scan this QR code with WhatsApp Linked Devices.</p>
        <img src="${qrCodeData}" style="max-width:350px;width:100%">
      </body>
    </html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`ASTROID AI runtime listening on port ${PORT}`);
  startWhatsApp();
});
