
const { app } = require('@azure/functions');

app.http('events', {
  methods: ['POST'],
  handler: async (req, context) => {

  context.log("Events POST proxy gestart");

  const externalUrl = "https://sanme.azurewebsites.net/api/events";

  // Haal SWA identity header op
  const principalHeader = req.headers["x-ms-client-principal"];
  context.log(`Principal header aanwezig: ${!!principalHeader}`);

  // Haal API-key op (vanuit client of SWA config)
  const apiKey = process.env.EXTERNAL_API_KEY;
  context.log(`API key aanwezig: ${!!apiKey}`);

  // Forward de body zoals ontvangen
  const body = req.rawBody;
  context.log(`Body: ${body}`);

  // Bouw headers voor de externe API
  const headers = {
    "Content-Type": "application/json"
  };

  if (principalHeader) {
    headers["x-ms-client-principal"] = principalHeader;
  }

  context.log(`Headers gebouwd: ${Object.keys(headers).join(', ')}`);

  // Verstuur POST naar externe backend
  context.log(`Start fetch naar: ${externalUrl + '/' + apiKey}`);
  const externalResponse = await fetch(externalUrl + '/' + apiKey, {
    method: "POST",
    headers,
    body
  });

  context.log(`Externe response status: ${externalResponse.status}`);

  const responseText = await externalResponse.text();
  context.log(`Response text lengte: ${responseText.length}`);

  // Stuur response terug naar de client
  context.res = {
    status: externalResponse.status,
    headers: {
      "Content-Type": externalResponse.headers.get("content-type") || "text/plain"
    },
    body: responseText
  };

  context.log("Response ingesteld, functie events voltooid");
}});
