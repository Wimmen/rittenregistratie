
const { app } = require('@azure/functions');

app.http('connections', {
  methods: ['GET'],
  handler: async (req, context) => {

  context.log("Connections GET proxy gestart");

  const externalUrl = "https://sanme.azurewebsites.net/api/connections";

  // Haal SWA identity header op
  const principalHeader = req.headers.get("x-ms-client-principal");
  context.log(`Principal header aanwezig: ${!!principalHeader}`);

  // Haal API-key op (vanuit client of SWA config)
  const apiKey = process.env.EXTERNAL_API_KEY;
  context.log(`API key aanwezig: ${!!apiKey}`);

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
    method: "GET",
    headers
  });

  context.log(`Externe response status: ${externalResponse.status}`);
  if (externalResponse.status === 200 || externalResponse.status === 202) {
    const responseText = await externalResponse.text();
    context.log(`ConnectionId: ${responseText}`);
    return {
      status: externalResponse.status,
      body: responseText
    };
  } else {
    const responseText = await externalResponse.text();
    context.log(`Response text: ${responseText}`);
    // Stuur response terug naar de client
    return {
      status: externalResponse.status,
      body:  {
        error: responseText
      }
    };
  }
}});
