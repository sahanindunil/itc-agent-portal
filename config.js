// Values you fill in after creating the Entra ID App Registration (see README.md).
// None of these are secrets — a SPA client ID and tenant ID are safe to ship in client-side code.
window.ITC_CONFIG = {
  clientId: "REPLACE_WITH_ENTRA_APP_CLIENT_ID",
  tenantId: "REPLACE_WITH_ENTRA_TENANT_ID",
  // Delegated scope exposed by the well-known "Azure Machine Learning Services" resource
  // (this is what backs the https://ai.azure.com/.default scope used by Azure AI Foundry SDKs).
  agentScope: "https://ai.azure.com/user_impersonation",
};
