import express from "express";
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason
} from "@crysnovax/baileys";
import qrcode from "qrcode";

const app = express();
const PORT = process.env.PORT || 3000;

const AUTH_DIR = "./cody-test-auth";

let sock = null;
let qrCodeData = null;
let connectionStatus = "starting";
let reconnectTimer = null;

async function startWhatsApp() {
  try {
    console.log("Starting WhatsApp connection...");

    const { state, saveCreds } =
      await useMultiFileAuthState(AUTH_DIR);

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      browser: ["ASTROID AI", "Chrome", "1.0.0"],
      markOnlineOnConnect: false,
      syncFullHistory: false
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const {
        connection,
        lastDisconnect,
        qr
      } = update;

      if (qr) {
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = "qr_ready";

        console.log("QR code is ready.");
        console.log("Open /qr to scan it.");
      }

      if (connection === "open") {
        connectionStatus = "connected";
        qrCodeData = null;

        console.log("================================");
        console.log("WHATSAPP CONNECTED SUCCESSFULLY");
        console.log("================================");
      }

      if (connection === "close") {
        connectionStatus = "disconnected";

        const statusCode =
          lastDisconnect?.error?.output?.statusCode;

        console.log(
          "WhatsApp connection closed.",
          "Status:",
          statusCode ?? "unknown"
        );

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatus = "logged_out";
          qrCodeData = null;

          console.log(
            "WhatsApp logged out. A new login is required."
          );

          return;
        }

        if (!reconnectTimer) {
          console.log("Scheduling automatic reconnect...");

          reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            startWhatsApp();
          }, 5000);
        }
      }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
      const message = messages?.[0];

      if (!message?.message) return;
      if (message.key?.fromMe) return;

      const text =
        message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        "";

      console.log(
        "Message received:",
        text
      );

      if (
        text === ".ping" ||
        text === "!ping"
      ) {
        await sock.sendMessage(
          message.key.remoteJid,
          {
            text: "ASTROID AI 🤖 connection test is working."
          }
        );
      }
    });

  } catch (error) {
    console.error(
      "WhatsApp startup error:",
      error
    );

    connectionStatus = "error";

    if (!reconnectTimer) {
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        startWhatsApp();
      }, 5000);
    }
  }
}

app.get("/", (req, res) => {
  res.json({
    name: "ASTROID AI 🤖 CODY Connection Test",
    status: connectionStatus
  });
});

app.get("/status", (req, res) => {
  res.json({
    status: connectionStatus,
    whatsapp:
      connectionStatus === "connected"
        ? "connected"
        : "not_connected",
    uptime: process.uptime()
  });
});

app.get("/qr", (req, res) => {
  if (!qrCodeData) {
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta name="viewport"
            content="width=device-width, initial-scale=1">
          <title>ASTROID AI</title>
        </head>
        <body style="
          font-family:Arial;
          text-align:center;
          padding:30px;
        ">
          <h2>ASTROID AI 🤖</h2>
          <p>Status: ${connectionStatus}</p>
          <p>QR code is not currently available.</p>
        </body>
      </html>
    `);
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport"
          content="width=device-width, initial-scale=1">
        <title>ASTROID AI WhatsApp</title>
      </head>

      <body style="
        font-family:Arial;
        text-align:center;
        padding:20px;
      ">

        <h2>ASTROID AI 🤖</h2>

        <p>
          Scan this QR code using
          WhatsApp → Linked Devices.
        </p>

        <img
          src="${qrCodeData}"
          style="
            max-width:350px;
            width:100%;
          "
        >

        <p>
          Status: ${connectionStatus}
        </p>

      </body>
    </html>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `ASTROID AI test server running on port ${PORT}`
  );

  startWhatsApp();
});
