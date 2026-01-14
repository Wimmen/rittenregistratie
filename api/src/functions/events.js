
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
  const body = await req.json();
  context.log(`Body: ${JSON.stringify(body)}`);

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
    body: JSON.stringify(body)
  });

  context.log(`Externe response status: ${externalResponse.status}`);
  if (externalResponse.status === 200) {
    const responseText = await externalResponse.text();
    context.log(`Status: ${responseText}`);
    return {
      body: responseText
    };
  } else {
    const responseText = await externalResponse.text();
    context.log(`Response text: ${responseText}`);
    // Stuur response terug naar de client
    return {
      status: externalResponse.status,
      body: responseText
    };
  }
}});
