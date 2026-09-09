// Values you fill in after creating the Entra ID App Registration (see README.md).
// None of these are secrets — a SPA client ID and tenant ID are safe to ship in client-side code.
window.ITC_CONFIG = {
  clientId: "a2cfeb0b-38fb-4cd4-ac8b-3f17e78c0463",
  tenantId: "ab67a4df-5f9a-421c-8998-5203f79fb256",
  // Delegated scope exposed by the well-known "Azure Machine Learning Services" resource,
  // which backs the https://ai.azure.com/.default audience Foundry SDKs use. Confirmed live:
  // once the real bearer token started reaching Foundry (see git history for the Static Web
  // Apps header-swallowing bug that masked this earlier), Foundry's own 401 explicitly named
  // "https://ai.azure.com" as the expected audience — matching Microsoft's own template.
  agentScope: "https://ai.azure.com/user_impersonation",
};
