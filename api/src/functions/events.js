
const { app } = require('@azure/functions');

app.http('events', {
  methods: ['POST'],
  handler: async (req, context) => {

  context.log("Events POST proxy gestart");

  const externalUrl = process.env.XELFLOW_API_URL + "/api/events";

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

  // Forward de body zoals ontvangen
  const body = await req.json();
  context.log(`Body: ${JSON.stringify(body)}`);

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
