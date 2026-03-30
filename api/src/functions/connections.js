
const { app } = require('@azure/functions');

app.http('connections', {
  methods: ['GET'],
  handler: async (req, context) => {

  context.log("Connections GET proxy gestart");

  const externalUrl = process.env.XELFLOW_API_URL + "/api/connections";

  // Haal SWA identity header op
  const principalHeader = req.headers.get("x-ms-client-principal");
  context.log(`Principal header aanwezig: ${!!principalHeader}`);
  const referer = req.headers.get("referer");
  context.log(`Referer: ${referer}`);
  const ip = req.headers.get("x-forwarded-for");
  context.log(`IP: ${ip}`);
  const userAgent = req.headers.get("user-agent");
  context.log(`User Agent: ${userAgent}`);

  // Haal API-key op (vanuit client of SWA config)
  const apiKey = process.env.XELFLOW_API_KEY;
  context.log(`API key aanwezig: ${!!apiKey}`);

  // Bouw headers voor de externe API
  const headers = {
    "Content-Type": "application/json",
    "Referer": referer,
    "X-Forwarded-For": ip,
    "User-Agent": userAgent
  };

  if (principalHeader) {
    headers["x-ms-client-principal"] = principalHeader;
  }

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
