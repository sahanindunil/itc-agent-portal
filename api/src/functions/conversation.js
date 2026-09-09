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
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return { status: 401, jsonBody: { error: "Missing Authorization header" } };
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
        let tokenDebug = null;
        try {
          const payload = authHeader.replace(/^Bearer\s+/i, "").split(".")[1];
          tokenDebug = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
        } catch (e) {
          tokenDebug = { decodeError: String(e) };
        }
        return {
          status: upstream.status,
          jsonBody: {
            error: "Foundry rejected the request",
            detail: text,
            requestedUrl: `${endpoint.replace(/\/$/, "")}/openai/v1/conversations`,
            // TEMPORARY diagnostic — remove once the auth mismatch is root-caused.
            tokenAudience: tokenDebug && tokenDebug.aud,
            tokenAppId: tokenDebug && (tokenDebug.appid || tokenDebug.azp),
            tokenScp: tokenDebug && tokenDebug.scp,
          },
        };
      }

      const data = JSON.parse(text);
      return { status: 200, jsonBody: { id: data.id } };
    } catch (err) {
      context.error("Error creating conversation", err);
      return { status: 502, jsonBody: { error: "Failed to reach Azure AI Foundry", detail: String(err) } };
    }
  },
});
