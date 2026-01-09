const fetch = require("node-fetch");

module.exports = async function (context, req) {
  context.log("SSE proxy gestart");

  // Haal eventuele connectionId op uit de querystring
  const connectionId = req.query.connectionId;
  const baseUrl = "https://sanme.azurewebsites.net/api/events/stream";

  const externalUrl = connectionId
    ? `${baseUrl}?connectionId=${encodeURIComponent(connectionId)}`
    : baseUrl;

  context.log("Proxy naar:", externalUrl);

  // Zet de response in SSE streaming mode
  context.res = {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Transfer-Encoding": "chunked"
    },
    body: ""
  };

  // Nodig om SWA buffering te omzeilen
  context.res.flush = () => {};

  const principalHeader = req.headers["x-ms-client-principal"];
  const apiKey = process.env.EXTERNAL_API_KEY;

  // Maak verbinding met de externe SSE endpoint
  const externalResponse = await fetch(externalUrl, {
    method: "GET",
    headers: {
      // Stuur SWA identity door 
      ...(principalHeader && { "x-ms-client-principal": principalHeader }),
      // Stuur API-key door
      ...(apiKey && { "api-key": apiKey })
    }
  });

  if (!externalResponse.ok) {
    context.log("Externe SSE API gaf een fout:", externalResponse.status);
    context.res.write(`event: error\ndata: ${externalResponse.status}\n\n`);
    context.res.end();
    return;
  }

  const reader = externalResponse.body.getReader();

  // Stream de chunks door naar de client
  async function pump() {
    const { done, value } = await reader.read();

    if (done) {
      context.log("Externe SSE stream beëindigd");
      context.res.end();
      return;
    }

    // Schrijf chunk door naar de client
    context.res.write(value);
    context.res.flush();

    // Volgende chunk
    pump();
  }

  pump();
};
