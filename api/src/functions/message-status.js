const { app } = require("@azure/functions");
const { extractText } = require("./message");

// Polled by the frontend after a background response (see message.js) comes back
// "in_progress". Each call is a quick status lookup, so it comfortably stays under
// Static Web Apps' 45-second per-request cap no matter how long the agent itself takes.
app.http("message-status", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "message-status",
  handler: async (request, context) => {
    const authHeader = request.headers.get("x-foundry-authorization");
    if (!authHeader) {
      return { status: 401, jsonBody: { error: "Missing X-Foundry-Authorization header" } };
    }

    const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    if (!endpoint) {
      return { status: 500, jsonBody: { error: "FOUNDRY_PROJECT_ENDPOINT app setting is not configured" } };
    }

    const responseId = request.query.get("responseId");
    if (!responseId) {
      return { status: 400, jsonBody: { error: "responseId query parameter is required" } };
    }

    try {
      const upstream = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/responses/${responseId}`, {
        method: "GET",
        headers: { Authorization: authHeader },
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        context.error("Foundry status check failed", upstream.status, text);
        return { status: upstream.status, jsonBody: { error: "Foundry rejected the request", detail: text } };
      }

      const data = JSON.parse(text);
      if (data.status === "completed") {
        return { status: 200, jsonBody: { done: true, text: extractText(data), responseId: data.id } };
      }
      if (data.status === "failed" || data.status === "incomplete" || data.status === "cancelled") {
        return { status: 502, jsonBody: { error: `Foundry response ${data.status}`, detail: text } };
      }
      return { status: 200, jsonBody: { done: false, responseId: data.id, foundryStatus: data.status } };
    } catch (err) {
      context.error("Error checking response status", err);
      return { status: 502, jsonBody: { error: "Failed to reach Azure AI Foundry", detail: String(err) } };
    }
  },
});
