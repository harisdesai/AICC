const WebSocket = require("ws");
const key = process.env.ASSEMBLYAI_API_KEY || "e4f5c203ca414ebdaf1843779c8512bb";

const ws = new WebSocket("wss://streaming.assemblyai.com/v3/ws?sample_rate=16000", {
  headers: { Authorization: key }
});

ws.on("open", () => {
  console.log("Connected to AssemblyAI v3!");
  ws.close();
});

ws.on("error", (e) => {
  console.error("AssemblyAI Error:", e.message);
});

ws.on("unexpected-response", (req, res) => {
  console.error("Unexpected response:", res.statusCode);
});
