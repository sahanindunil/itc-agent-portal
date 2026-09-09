# itc-agent-portal

Branded demo web portal for the International Tea Committee, embedding the **itc-plus** Azure AI Foundry agent for an executive/broker chat demo.

## Architecture

```
Browser (GitHub-sourced, hosted on Azure Static Web Apps free tier)
  │  MSAL.js sign-in with your inttea.com / company Entra ID account
  │  (no credential is ever stored in the site — you sign in live)
  ▼
Static frontend (index.html / app.js) ── same origin ──▶ /api/* (Azure Functions, bundled free with SWA)
                                                              │  forwards YOUR bearer token as-is
                                                              ▼
                                          Azure AI Foundry project endpoint (itc-plus agent)
                                          RBAC: Foundry Agent Consumer role on your account
```

Why a relay function at all, if it's your own token: Azure AI Foundry's data-plane endpoint doesn't return CORS headers for arbitrary browser origins, so a browser calling it directly gets blocked regardless of a valid token. The `/api` functions in this repo do nothing but forward your `Authorization` header untouched — they hold no secret and make no authorization decisions themselves; Foundry still checks your RBAC role exactly as if you'd called it directly. Static Web Apps' free tier bundles this API function at no extra cost and serves it same-origin, which is what avoids the CORS problem.

## One-time setup (run these yourself in your Azure tenant)

### 1. Register the SPA in Entra ID

```bash
az login
az ad app create \
  --display-name "itc-agent-portal" \
  --sign-in-audience AzureADMyOrg \
  --web-redirect-uris "http://localhost:4280" \
  --required-resource-accesses '[{
    "resourceAppId": "18a66f5f-dbdf-4c17-9dd7-1634712a9cbe",
    "resourceAccess": [{"id": "1a7925b5-f871-417a-9b8b-303f9f29fa10", "type": "Scope"}]
  }]'
```

The `resourceAppId`/scope `id` above are the well-known, stable IDs for the "Azure Machine Learning Services" first-party resource that backs the `https://ai.azure.com/.default` scope Foundry SDKs use — pulled directly from Microsoft's own [entra-app.bicep](https://github.com/microsoft-foundry/foundry-agent-webapp/blob/main/infra/entra-app.bicep) for this same agent web app template, so they're guaranteed correct for your tenant.

Then switch the app to a **SPA** platform (the CLI above registers a `web` redirect for simplicity; move it to `spa` so MSAL's auth-code+PKCE flow works without a client secret):

```bash
APP_ID=$(az ad app list --display-name itc-agent-portal --query "[0].appId" -o tsv)
az ad app update --id $APP_ID --set spa='{"redirectUris":["http://localhost:4280"]}' web='{"redirectUris":[]}'
```

Grant admin consent for the permission (needed once, by a tenant admin — or a user can consent individually on first sign-in if your tenant allows user consent):

```bash
az ad app permission admin-consent --id $APP_ID
```

Note the `appId` (client ID) and your tenant ID (`az account show --query tenantId -o tsv`) — you'll need both next.

### 2. Fill in `config.js`

Edit [config.js](config.js) with the real `clientId` and `tenantId` from step 1. These are not secrets — safe to commit.

### 3. Create the Static Web App (free tier)

```bash
az staticwebapp create \
  --name itc-agent-portal \
  --resource-group <your-resource-group> \
  --location eastus2 \
  --sku Free \
  --source https://github.com/sahanindunil/itc-agent-portal \
  --branch main \
  --app-location "/" \
  --api-location "api" \
  --login-with-github
```

`--source`/`--login-with-github` auto-creates the GitHub Actions workflow that builds and deploys on every push. If you'd rather deploy once by hand without wiring CI, drop those two flags, create the resource, then deploy with the [SWA CLI](https://azure.github.io/static-web-apps-cli/):

```bash
npm install -g @azure/static-web-apps-cli
swa deploy . --api-location api --deployment-token <token-from-portal-or-az-staticwebapp-secrets-list>
```

### 4. Configure the API's app settings

The relay functions read the target agent from environment, not from code:

```bash
az staticwebapp appsettings set \
  --name itc-agent-portal \
  --setting-names \
    FOUNDRY_PROJECT_ENDPOINT="https://itc-ai-agent-resource.services.ai.azure.com/api/projects/itc-ai-agent" \
    FOUNDRY_AGENT_NAME="2a3c5a1f-9459-407e-8305-ae17fa4fc540"
```

`FOUNDRY_AGENT_NAME` is set to the agent ID from your briefing doc. **Verify this resolves** the first time you chat — Foundry's Agent Administration API addresses agents by a `name` that may be the friendly slug (`itc-plus`) rather than the GUID depending on how the agent was created. If the first message comes back with a 404 from Foundry, change this setting to `itc-plus` and redeploy the setting (no redeploy of code needed).

### 5. Update the redirect URI to your real deployed URL

`az staticwebapp create` prints your `<name>.azurestaticapps.net` URL. Add it to the SPA redirect URIs:

```bash
az ad app update --id $APP_ID --set spa='{"redirectUris":["http://localhost:4280","https://itc-agent-portal.azurestaticapps.net"]}'
```

If you later attach `inttea.com` (or a subdomain) as a custom domain in the Static Web App, add that URL here too.

## Local development

```bash
npm install -g @azure/static-web-apps-cli
cd api && npm install && cd ..
cp api/local.settings.json.example api/local.settings.json   # fill in your values
swa start . --api-location api
```

`swa start` serves the static site and the API on one local origin, so sign-in and the relay work exactly as they will in production.

## Known limitations (demo scope)

- Single conversation per browser session (no history list, no delete) — matches "quick demo," not the full official template's feature set.
- Non-streaming responses only (answer appears once complete, not token-by-token) — simpler and more reliable to get right on a first deploy than relaying Server-Sent Events through a serverless function.
- No file/image upload, no citations UI — the official `microsoft-foundry/foundry-agent-webapp` template has both if you need full parity later.
