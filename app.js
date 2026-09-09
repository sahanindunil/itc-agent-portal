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
    // Only the agent's own replies are markdown — user input and our own error
    // strings are rendered as plain text so nothing typed by a user is ever
    // interpreted as HTML.
    if (role === "assistant") {
      div.innerHTML = DOMPurify.sanitize(marked.parse(text));
    } else {
      div.textContent = text;
    }
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

  const POLL_INTERVAL_MS = 2500;
  const POLL_TIMEOUT_MS = 5 * 60 * 1000; // give up after 5 minutes of polling

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Static Web Apps hard-caps every /api request at 45 seconds, so the backend uses
  // Foundry's "background" response mode: the first call returns almost immediately
  // with either the finished answer or an in-progress id, and this polls a separate
  // lightweight status endpoint (well under 45s per poll) until it's done.
  async function pollForResult(responseId, pendingEl) {
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT_MS) {
      await sleep(POLL_INTERVAL_MS);
      const elapsed = Math.round((Date.now() - start) / 1000);
      pendingEl.textContent = `itc-plus is thinking… (${elapsed}s)`;

      const token = await getAccessToken();
      const res = await fetch(`/api/message-status?responseId=${encodeURIComponent(responseId)}`, {
        headers: { "X-Foundry-Authorization": `Bearer ${token}` },
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`itc-plus could not answer that (HTTP ${res.status}). ${errText}`);
      }

      const data = await res.json();
      if (data.done) return data.text || "(no response text returned)";
    }
    throw new Error("itc-plus is taking longer than expected — please try again or rephrase the question.");
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

      if (!res.ok) {
        pending.remove();
        const errText = await res.text();
        appendMessage("error", `itc-plus could not answer that (HTTP ${res.status}). ${errText}`);
        return;
      }

      const data = await res.json();
      const answer = data.done ? data.text || "(no response text returned)" : await pollForResult(data.responseId, pending);

      pending.remove();
      appendMessage("assistant", answer);
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
