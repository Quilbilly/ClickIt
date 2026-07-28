const state = {
  config: null,
  sessionId: null,
  liveTimer: null,
  idleTimer: null,
};

const els = {
  app: document.getElementById("app"),
  eventName: document.getElementById("eventName"),
  cameraPill: document.getElementById("cameraPill"),
  attractTagline: document.getElementById("attractTagline"),
  liveAttract: document.getElementById("livePreviewAttract"),
  liveCapture: document.getElementById("livePreviewCapture"),
  countdown: document.getElementById("countdown"),
  countdownValue: document.getElementById("countdownValue"),
  captureStatus: document.getElementById("captureStatus"),
  captureProgress: document.getElementById("captureProgress"),
  reviewGrid: document.getElementById("reviewGrid"),
  emailForm: document.getElementById("emailForm"),
  emailInput: document.getElementById("emailInput"),
  consentInput: document.getElementById("consentInput"),
  consentRow: document.getElementById("consentRow"),
  emailError: document.getElementById("emailError"),
  doneMessage: document.getElementById("doneMessage"),
  errorMessage: document.getElementById("errorMessage"),
  qrBlock: document.getElementById("qrBlock"),
  qrImage: document.getElementById("qrImage"),
  btnStart: document.getElementById("btnStart"),
  btnRetake: document.getElementById("btnRetake"),
  btnKeep: document.getElementById("btnKeep"),
  btnSend: document.getElementById("btnSend"),
  btnQrOnly: document.getElementById("btnQrOnly"),
  btnAgain: document.getElementById("btnAgain"),
  btnErrorReset: document.getElementById("btnErrorReset"),
};

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.code = data.code;
    throw err;
  }
  return data;
}

function showScreen(name) {
  els.app.dataset.screen = name;
  document.querySelectorAll("[data-screen-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.screenPanel !== name;
  });
  resetIdleTimer(name);
}

function resetIdleTimer(screen) {
  clearTimeout(state.idleTimer);
  if (screen === "done" || screen === "error") {
    state.idleTimer = setTimeout(() => resetToAttract(), 30000);
  } else if (screen === "email" || screen === "review") {
    state.idleTimer = setTimeout(() => resetToAttract(), 120000);
  }
}

function setCameraPill(camera) {
  const ready = Boolean(camera?.connected);
  els.cameraPill.textContent = ready
    ? `${camera.model || "Camera"} · Ready`
    : camera?.message || "Camera offline";
  els.cameraPill.classList.toggle("is-ready", ready);
  els.cameraPill.classList.toggle("is-bad", !ready);
}

function startLivePreview() {
  stopLivePreview();
  const bump = () => {
    const stamp = Date.now();
    if (!els.liveAttract.closest("[hidden]")) {
      els.liveAttract.src = `/api/booth/camera/live.jpg?t=${stamp}`;
    }
    if (!els.liveCapture.closest("[hidden]")) {
      els.liveCapture.src = `/api/booth/camera/live.jpg?t=${stamp}`;
    }
  };
  bump();
  state.liveTimer = setInterval(bump, 700);
}

function stopLivePreview() {
  clearInterval(state.liveTimer);
  state.liveTimer = null;
}

async function loadConfig() {
  state.config = await api("/booth/config");
  els.eventName.textContent = state.config.eventName;
  els.attractTagline.textContent = state.config.attractTagline;
  document.documentElement.style.setProperty("--accent", state.config.brandAccent || "#f5a623");
  els.consentRow.hidden = !state.config.requireEmailConsent;
  els.consentInput.required = Boolean(state.config.requireEmailConsent);
  els.btnRetake.hidden = !state.config.allowRetake;
  els.btnQrOnly.hidden = state.config.allowQrOnly === false;
  setCameraPill(state.config.camera);
}

async function refreshCamera() {
  try {
    const camera = await api("/booth/camera/status");
    setCameraPill(camera);
  } catch {
    setCameraPill({ connected: false, message: "Camera status unavailable" });
  }
}

async function runCountdown(seconds) {
  if (seconds <= 0) return;
  els.countdown.hidden = false;
  for (let i = seconds; i >= 1; i -= 1) {
    els.countdownValue.textContent = String(i);
    els.countdownValue.style.animation = "none";
    void els.countdownValue.offsetWidth;
    els.countdownValue.style.animation = "";
    els.captureStatus.textContent = i === 1 ? "Smile!" : "Get ready";
    await wait(1000);
  }
  els.countdown.hidden = true;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startSession() {
  try {
    showScreen("capture");
    startLivePreview();
    els.captureStatus.textContent = "Get ready";
    els.captureProgress.textContent = "";

    const created = await api("/booth/sessions", { method: "POST", body: "{}" });
    state.sessionId = created.id;

    await runCountdown(state.config.countdownSeconds);

    // Stop live view polling so USB is free for shutter + download.
    stopLivePreview();
    els.captureStatus.textContent = "Capturing…";
    els.captureProgress.textContent = `Photo set of ${state.config.photoCount}`;

    const progress = tickCaptureProgress(state.config.photoCount, state.config.intervalMs);

    const session = await api(`/booth/sessions/${state.sessionId}/capture`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    progress.stop();
    renderReview(session.photos || []);
    showScreen("review");
  } catch (err) {
    showError(err.message);
  }
}

function tickCaptureProgress(total, intervalMs) {
  let i = 1;
  els.captureProgress.textContent = `Photo 1 of ${total}`;
  const timer = setInterval(() => {
    i = Math.min(total, i + 1);
    els.captureProgress.textContent = `Photo ${i} of ${total}`;
    els.captureStatus.textContent = "Hold still";
  }, Math.max(intervalMs, 400));
  return {
    stop() {
      clearInterval(timer);
    },
  };
}

function renderReview(photos) {
  els.reviewGrid.innerHTML = "";
  photos.forEach((photo, idx) => {
    const img = document.createElement("img");
    img.src = photo.url;
    img.alt = `Photo ${photo.index || idx + 1}`;
    img.style.animationDelay = `${Math.min(idx * 0.06, 0.4)}s`;
    els.reviewGrid.appendChild(img);
  });
}

async function retake() {
  try {
    await api(`/booth/sessions/${state.sessionId}/retake`, {
      method: "POST",
      body: "{}",
    });
    await startSession();
  } catch (err) {
    showError(err.message);
  }
}

function showDone(result, { emailedTo = null, queued = false } = {}) {
  if (emailedTo && queued) {
    els.doneMessage.textContent = `We’ll email ${emailedTo} when the network is back. You can also scan the QR now.`;
  } else if (emailedTo) {
    els.doneMessage.textContent = `Sent to ${emailedTo}. You can also scan the QR code.`;
  } else {
    els.doneMessage.textContent = "Scan the QR code to download your photos on your phone.";
  }

  if (result.qrDataUrl) {
    els.qrImage.src = result.qrDataUrl;
    els.qrBlock.hidden = false;
  } else {
    els.qrBlock.hidden = true;
  }
  showScreen("done");
}

async function submitEmail(event) {
  event.preventDefault();
  els.emailError.hidden = true;
  els.btnSend.disabled = true;
  try {
    const payload = {
      email: els.emailInput.value.trim(),
      consent: els.consentInput.checked,
    };
    const result = await api(`/booth/sessions/${state.sessionId}/email`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (result.emailPreview) console.info("Email transport preview:", result.emailPreview);
    showDone(result, { emailedTo: payload.email, queued: result.queuedEmail });
  } catch (err) {
    els.emailError.textContent = err.message;
    els.emailError.hidden = false;
  } finally {
    els.btnSend.disabled = false;
  }
}

async function submitQrOnly() {
  els.emailError.hidden = true;
  els.btnQrOnly.disabled = true;
  try {
    const result = await api(`/booth/sessions/${state.sessionId}/qr`, {
      method: "POST",
      body: "{}",
    });
    showDone(result);
  } catch (err) {
    els.emailError.textContent = err.message;
    els.emailError.hidden = false;
  } finally {
    els.btnQrOnly.disabled = false;
  }
}

function showError(message) {
  els.errorMessage.textContent = message || "Please ask a staff member for help.";
  showScreen("error");
}

function resetToAttract() {
  state.sessionId = null;
  els.emailForm.reset();
  els.emailError.hidden = true;
  els.qrBlock.hidden = true;
  els.qrImage.removeAttribute("src");
  showScreen("attract");
  startLivePreview();
  refreshCamera();
}

els.btnStart.addEventListener("click", startSession);
els.btnRetake.addEventListener("click", retake);
els.btnKeep.addEventListener("click", () => showScreen("email"));
els.emailForm.addEventListener("submit", submitEmail);
els.btnQrOnly.addEventListener("click", submitQrOnly);
els.btnAgain.addEventListener("click", resetToAttract);
els.btnErrorReset.addEventListener("click", resetToAttract);

await loadConfig();
showScreen("attract");
startLivePreview();
setInterval(refreshCamera, 10000);
