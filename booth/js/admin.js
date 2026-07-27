const tokenKey = "clickit.adminToken";

const els = {
  authCard: document.getElementById("authCard"),
  adminApp: document.getElementById("adminApp"),
  tokenInput: document.getElementById("tokenInput"),
  btnAuth: document.getElementById("btnAuth"),
  authError: document.getElementById("authError"),
  stats: document.getElementById("stats"),
  cameraLine: document.getElementById("cameraLine"),
  storageLine: document.getElementById("storageLine"),
  queueLine: document.getElementById("queueLine"),
  btnProcessQueue: document.getElementById("btnProcessQueue"),
  settingsForm: document.getElementById("settingsForm"),
  settingsOk: document.getElementById("settingsOk"),
  settingsError: document.getElementById("settingsError"),
  sessionsBody: document.getElementById("sessionsBody"),
  btnRefresh: document.getElementById("btnRefresh"),
};

function token() {
  return localStorage.getItem(tokenKey) || "";
}

async function adminApi(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

async function unlock() {
  els.authError.hidden = true;
  try {
    await adminApi("/admin/stats");
    localStorage.setItem(tokenKey, els.tokenInput.value.trim() || token());
    els.authCard.hidden = true;
    els.adminApp.hidden = false;
    await refreshAll();
  } catch (err) {
    els.authError.textContent = err.message;
    els.authError.hidden = false;
  }
}

async function refreshAll() {
  const [stats, settings, sessions, camera] = await Promise.all([
    adminApi("/admin/stats"),
    adminApi("/admin/settings"),
    adminApi("/admin/sessions"),
    adminApi("/admin/camera"),
  ]);

  els.stats.innerHTML = `
    <div><dt>Sessions</dt><dd>${stats.sessions}</dd></div>
    <div><dt>Delivered</dt><dd>${stats.delivered}</dd></div>
    <div><dt>Photos</dt><dd>${stats.photos}</dd></div>
    <div><dt>Queued</dt><dd>${stats.queued || 0}</dd></div>
  `;

  els.cameraLine.textContent = camera.connected
    ? `${camera.model} · ${camera.message}`
    : `Camera: ${camera.message}`;
  els.storageLine.textContent = stats.storage
    ? `Storage: ${stats.storage.provider}${stats.storage.bucket ? ` · ${stats.storage.bucket}` : ""}`
    : "Storage: local";
  els.queueLine.textContent = `Queue pending: ${stats.pendingJobs || 0}`;

  const form = els.settingsForm;
  form.eventName.value = settings.eventName;
  form.attractTagline.value = settings.attractTagline;
  form.countdownSeconds.value = settings.countdownSeconds;
  form.photoCount.value = settings.photoCount;
  form.intervalMs.value = settings.intervalMs;
  form.brandAccent.value = settings.brandAccent || "#f5a623";
  form.allowRetake.checked = Boolean(settings.allowRetake);
  form.requireEmailConsent.checked = Boolean(settings.requireEmailConsent);
  form.allowQrOnly.checked = settings.allowQrOnly !== false;
  form.emailSubject.value = settings.emailSubject;
  form.downloadLinkHours.value = settings.downloadLinkHours;

  els.sessionsBody.innerHTML = "";
  const canPrune = stats.storage?.provider === "s3" && stats.storage?.configured;
  for (const s of sessions.sessions.slice(0, 40)) {
    const tr = document.createElement("tr");
    const statusLabel = s.localPrunedAt ? `${s.status} · pruned` : s.status;
    tr.innerHTML = `
      <td>${new Date(s.createdAt).toLocaleString()}</td>
      <td>${statusLabel}</td>
      <td>${s.email || "—"}</td>
      <td>${s.photoCount}</td>
      <td class="session-actions"></td>
    `;
    const actions = tr.querySelector(".session-actions");
    if (s.email) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cta cta--ghost";
      btn.textContent = "Resend";
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        try {
          await adminApi(`/admin/sessions/${s.id}/resend`, {
            method: "POST",
            body: "{}",
          });
          btn.textContent = "Sent";
        } catch (err) {
          btn.textContent = "Failed";
          alert(err.message);
        } finally {
          btn.disabled = false;
        }
      });
      actions.appendChild(btn);
    }
    if (canPrune && s.cloudUploaded && !s.localPrunedAt) {
      const pruneBtn = document.createElement("button");
      pruneBtn.type = "button";
      pruneBtn.className = "cta cta--ghost";
      pruneBtn.textContent = "Prune local";
      pruneBtn.title = "Delete local copies after confirming cloud upload";
      pruneBtn.addEventListener("click", async () => {
        if (!confirm(`Delete local files for session ${s.id}? Cloud copies will remain.`)) return;
        pruneBtn.disabled = true;
        try {
          const result = await adminApi(`/admin/sessions/${s.id}/prune-local`, {
            method: "POST",
            body: "{}",
          });
          pruneBtn.textContent = `Pruned ${result.pruned?.length || 0}`;
          await refreshAll();
        } catch (err) {
          pruneBtn.textContent = "Failed";
          alert(err.message);
          pruneBtn.disabled = false;
        }
      });
      actions.appendChild(pruneBtn);
    }
    els.sessionsBody.appendChild(tr);
  }
}

els.btnAuth.addEventListener("click", () => {
  localStorage.setItem(tokenKey, els.tokenInput.value.trim());
  unlock();
});

els.btnRefresh.addEventListener("click", () => refreshAll().catch((e) => alert(e.message)));
els.btnProcessQueue.addEventListener("click", async () => {
  try {
    await adminApi("/admin/queue/process", { method: "POST", body: "{}" });
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

els.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.settingsOk.hidden = true;
  els.settingsError.hidden = true;
  const form = event.currentTarget;
  const payload = {
    eventName: form.eventName.value.trim(),
    attractTagline: form.attractTagline.value.trim(),
    countdownSeconds: Number(form.countdownSeconds.value),
    photoCount: Number(form.photoCount.value),
    intervalMs: Number(form.intervalMs.value),
    brandAccent: form.brandAccent.value,
    allowRetake: form.allowRetake.checked,
    requireEmailConsent: form.requireEmailConsent.checked,
    allowQrOnly: form.allowQrOnly.checked,
    emailSubject: form.emailSubject.value.trim(),
    downloadLinkHours: Number(form.downloadLinkHours.value),
  };
  try {
    await adminApi("/admin/settings", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    els.settingsOk.hidden = false;
  } catch (err) {
    els.settingsError.textContent = err.message;
    els.settingsError.hidden = false;
  }
});

els.tokenInput.value = token() || "dev-admin-token";
if (token()) {
  unlock().catch(() => {
    els.authCard.hidden = false;
    els.adminApp.hidden = true;
  });
}
