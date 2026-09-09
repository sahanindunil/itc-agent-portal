const { app } = require("@azure/functions");

// Pulls output text out of a Foundry /openai/v1/responses payload, whether the
// service populates the convenience `output_text` field or only the structured
// `output` item array (agent-routed responses have been observed to do either).
function extractText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }

  const parts = [];
  for (const item of payload.output || []) {
    if (item.type !== "message" || !Array.isArray(item.content)) continue;
    for (const part of item.content) {
      if (typeof part.text === "string") parts.push(part.text);
    }
  }
  return parts.join("\n").trim();
}

app.http("message", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "message",
  handler: async (request, context) => {
    // Not "authorization" — Static Web Apps' managed Functions integration overwrites that
    // header with its own internal platform token before this handler ever sees it.
    const authHeader = request.headers.get("x-foundry-authorization");
    if (!authHeader) {
      return { status: 401, jsonBody: { error: "Missing X-Foundry-Authorization header" } };
    }

    const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    const agentName = process.env.FOUNDRY_AGENT_NAME;
    if (!endpoint || !agentName) {
      return {
        status: 500,
        jsonBody: { error: "FOUNDRY_PROJECT_ENDPOINT / FOUNDRY_AGENT_NAME app settings are not configured" },
      };
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return { status: 400, jsonBody: { error: "Request body must be JSON" } };
    }

    const { conversationId, message } = body || {};
    if (!conversationId || !message) {
      return { status: 400, jsonBody: { error: "conversationId and message are required" } };
    }

    const requestBody = {
      agent_reference: { type: "agent_reference", name: agentName },
      conversation: { id: conversationId },
      input: message,
      stream: false,
    };
    if (process.env.FOUNDRY_AGENT_VERSION) {
      requestBody.agent_reference.version = process.env.FOUNDRY_AGENT_VERSION;
    }

    try {
      const upstream = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/responses`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        context.error("Foundry response call failed", upstream.status, text);
        return { status: upstream.status, jsonBody: { error: "Foundry rejected the request", detail: text } };
      }

      const data = JSON.parse(text);
      return { status: 200, jsonBody: { text: extractText(data), responseId: data.id } };
    } catch (err) {
      context.error("Error calling agent", err);
      return { status: 502, jsonBody: { error: "Failed to reach Azure AI Foundry", detail: String(err) } };
    }
  },
});
