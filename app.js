(function () {
  const msalInstance = new msal.PublicClientApplication({
    auth: {
      clientId: window.ITC_CONFIG.clientId,
      authority: `https://login.microsoftonline.com/${window.ITC_CONFIG.tenantId}`,
      redirectUri: window.location.origin + window.location.pathname,
    },
    cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false },
  });

  const loginRequest = { scopes: [window.ITC_CONFIG.agentScope] };

  const signInBtn = document.getElementById("sign-in-btn");
  const signOutBtn = document.getElementById("sign-out-btn");
  const signedInInfo = document.getElementById("signed-in-info");
  const userNameEl = document.getElementById("user-name");
  const app = document.getElementById("app");
  const signedOutPanel = document.getElementById("signed-out-panel");
  const messagesEl = document.getElementById("messages");
  const composer = document.getElementById("composer");
  const composerInput = document.getElementById("composer-input");
  const sendBtn = document.getElementById("send-btn");

  let account = null;
  let conversationId = null;

  function showSignedIn(acc) {
    account = acc;
    msalInstance.setActiveAccount(acc);
    signInBtn.hidden = true;
    signedInInfo.hidden = false;
    userNameEl.textContent = acc.username;
    app.hidden = false;
    signedOutPanel.hidden = true;
  }

  function showSignedOut() {
    account = null;
    signInBtn.hidden = false;
    signedInInfo.hidden = true;
    app.hidden = true;
    signedOutPanel.hidden = false;
  }

  async function init() {
    await msalInstance.initialize();
    const redirectResult = await msalInstance.handleRedirectPromise().catch((err) => {
      console.error("Redirect handling failed", err);
      return null;
    });

    const existing = redirectResult?.account || msalInstance.getAllAccounts()[0];
    if (existing) {
      showSignedIn(existing);
    } else {
      showSignedOut();
    }
  }

  async function getAccessToken() {
    const request = { ...loginRequest, account };
    try {
      const result = await msalInstance.acquireTokenSilent(request);
      return result.accessToken;
    } catch (err) {
      const result = await msalInstance.acquireTokenRedirect(request);
      return result?.accessToken; // page will redirect before this resolves in most cases
    }
  }

  function appendMessage(role, text) {
    const div = document.createElement("div");
    div.className = `msg ${role}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return div;
  }

  async function ensureConversation(token) {
    if (conversationId) return conversationId;
    const res = await fetch("/api/conversation", {
      method: "POST",
      // Not "Authorization" — Static Web Apps' managed Functions integration overwrites that
      // header with its own internal platform token before the function ever sees it.
      headers: { "X-Foundry-Authorization": `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Could not start a conversation (HTTP ${res.status}). ${await res.text()}`);
    }
    const data = await res.json();
    conversationId = data.id;
    return conversationId;
  }

  async function sendMessage(text) {
    sendBtn.disabled = true;
    appendMessage("user", text);
    const pending = appendMessage("pending", "itc-plus is thinking…");

    try {
      const token = await getAccessToken();
      const convId = await ensureConversation(token);

      const res = await fetch("/api/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Foundry-Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({ conversationId: convId, message: text }),
      });

      pending.remove();

      if (!res.ok) {
        const errText = await res.text();
        appendMessage("error", `itc-plus could not answer that (HTTP ${res.status}). ${errText}`);
        return;
      }

      const data = await res.json();
      appendMessage("assistant", data.text || "(no response text returned)");
    } catch (err) {
      pending.remove();
      console.error(err);
      appendMessage("error", `Something went wrong: ${err.message}`);
    } finally {
      sendBtn.disabled = false;
    }
  }

  signInBtn.addEventListener("click", () => {
    msalInstance.loginRedirect(loginRequest);
  });

  signOutBtn.addEventListener("click", () => {
    msalInstance.logoutRedirect({ account });
  });

  composer.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = composerInput.value.trim();
    if (!text) return;
    composerInput.value = "";
    sendMessage(text);
  });

  composerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      composer.requestSubmit();
    }
  });

  document.querySelectorAll(".starter").forEach((btn) => {
    btn.addEventListener("click", () => {
      composerInput.value = btn.dataset.prompt;
      composer.requestSubmit();
    });
  });

  init();
})();
