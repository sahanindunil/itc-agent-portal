const { app } = require("@azure/functions");

// Same-origin relay only: it forwards the caller's own Entra ID bearer token to the
// Foundry project endpoint untouched. It never holds or injects any credential of its
// own — the RBAC check (Foundry Agent Consumer role) is enforced by Azure AI Foundry
// against the signed-in user, exactly as if they called it directly.
app.http("conversation", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "conversation",
  handler: async (request, context) => {
    // Not "authorization" — Static Web Apps' managed Functions integration overwrites that
    // header with its own internal platform token before this handler ever sees it.
    const authHeader = request.headers.get("x-foundry-authorization");
    if (!authHeader) {
      return { status: 401, jsonBody: { error: "Missing X-Foundry-Authorization header" } };
    }

    const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT;
    if (!endpoint) {
      return { status: 500, jsonBody: { error: "FOUNDRY_PROJECT_ENDPOINT app setting is not configured" } };
    }

    try {
      const upstream = await fetch(`${endpoint.replace(/\/$/, "")}/openai/v1/conversations`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        context.error("Foundry conversation creation failed", upstream.status, text);
        return { status: upstream.status, jsonBody: { error: "Foundry rejected the request", detail: text } };
      }

      const data = JSON.parse(text);
      return { status: 200, jsonBody: { id: data.id } };
    } catch (err) {
      context.error("Error creating conversation", err);
      return { status: 502, jsonBody: { error: "Failed to reach Azure AI Foundry", detail: String(err) } };
    }
  },
});
