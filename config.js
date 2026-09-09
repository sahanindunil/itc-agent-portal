// Values you fill in after creating the Entra ID App Registration (see README.md).
// None of these are secrets — a SPA client ID and tenant ID are safe to ship in client-side code.
window.ITC_CONFIG = {
  clientId: "a2cfeb0b-38fb-4cd4-ac8b-3f17e78c0463",
  tenantId: "ab67a4df-5f9a-421c-8998-5203f79fb256",
  // Delegated scope exposed by the well-known "Microsoft Cognitive Services" resource —
  // this endpoint is on the services.ai.azure.com hostname, which validates tokens against
  // the cognitiveservices.azure.com audience (not ai.azure.com, which is a different surface).
  agentScope: "https://cognitiveservices.azure.com/user_impersonation",
};
