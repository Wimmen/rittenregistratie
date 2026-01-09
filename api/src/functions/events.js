
const { app } = require('@azure/functions');

app.http('events', {
  methods: ['POST'],
  handler: async (req, context) => {

  context.log("Events POST proxy gestart");

  const externalUrl = "https://sanme.azurewebsites.net/api/events";

  // Haal SWA identity header op
  const principalHeader = req.headers["x-ms-client-principal"];

  // Haal API-key op (vanuit client of SWA config)
  const apiKey = process.env.EXTERNAL_API_KEY;

  // Forward de body zoals ontvangen
  const body = req.rawBody;

  // Bouw headers voor de externe API
  const headers = {
    "Content-Type": "application/json"
  };

  if (principalHeader) {
    headers["x-ms-client-principal"] = principalHeader;
  }

  if (apiKey) {
    headers["api-key"] = apiKey;
  }

  // Verstuur POST naar externe backend
  const externalResponse = await fetch(externalUrl, {
    method: "POST",
    headers,
    body
  });

  const responseText = await externalResponse.text();

  // Stuur response terug naar de client
  context.res = {
    status: externalResponse.status,
    headers: {
      "Content-Type": externalResponse.headers.get("content-type") || "text/plain"
    },
    body: responseText
  };
}});
