(function () {
  const form = document.getElementById("inquiry-form");
  const statusEl = document.getElementById("form-status");
  const savedSection = document.getElementById("saved");
  const inquiryList = document.getElementById("inquiry-list");
  const toggleSaved = document.getElementById("toggle-saved");
  const clearBtn = document.getElementById("clear-inquiries");
  const { readInquiries, saveInquiry, clearInquiries } = window.TwParentCareStorage;

  function formatDate(iso) {
    try {
      return new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function renderInquiries() {
    const inquiries = readInquiries();
    inquiryList.innerHTML = "";

    if (!inquiries.length) {
      inquiryList.innerHTML = "<li class='inquiry-item'><p>No inquiries saved on this device yet.</p></li>";
      return;
    }

    for (const item of inquiries) {
      const li = document.createElement("li");
      li.className = "inquiry-item";
      li.innerHTML = `
        <h3>${escapeHtml(item.name)} · ${escapeHtml(item.forWhom)}</h3>
        <p class="inquiry-meta">${escapeHtml(item.email)}${item.phone ? " · " + escapeHtml(item.phone) : ""} · ${escapeHtml(formatDate(item.createdAt))}</p>
        <p>${escapeHtml(item.message)}</p>
      `;
      inquiryList.appendChild(li);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function setStatus(message, isError = false) {
    statusEl.textContent = message;
    statusEl.classList.toggle("is-error", isError);
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const inquiry = {
      name: String(data.get("name") || "").trim(),
      email: String(data.get("email") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      forWhom: String(data.get("forWhom") || "").trim(),
      message: String(data.get("message") || "").trim(),
    };

    if (!inquiry.name || !inquiry.email || !inquiry.forWhom || !inquiry.message) {
      setStatus("Please complete the required fields.", true);
      return;
    }

    saveInquiry(inquiry);
    form.reset();
    setStatus("Saved on this device. You can view it below anytime.");
    renderInquiries();
    savedSection.hidden = false;
    toggleSaved.textContent = "Hide saved inquiries";
    savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  toggleSaved.addEventListener("click", () => {
    const willShow = savedSection.hidden;
    savedSection.hidden = !willShow;
    toggleSaved.textContent = willShow ? "Hide saved inquiries" : "View saved inquiries";
    if (willShow) {
      renderInquiries();
      savedSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  clearBtn.addEventListener("click", () => {
    if (!readInquiries().length) {
      setStatus("Nothing to clear.");
      return;
    }
    const confirmed = window.confirm("Clear all locally saved inquiries?");
    if (!confirmed) return;
    clearInquiries();
    renderInquiries();
    setStatus("Local inquiries cleared.");
  });

  const fadeTargets = document.querySelectorAll(
    ".care-list li, .approach-copy, .connect-copy, .inquiry-form"
  );
  const stepTargets = document.querySelectorAll(".steps li");

  fadeTargets.forEach((el, index) => {
    el.classList.add("reveal");
    el.style.animationDelay = `${index * 0.06}s`;
  });

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.2 }
    );

    [...fadeTargets, ...stepTargets].forEach((el) => observer.observe(el));
  } else {
    [...fadeTargets, ...stepTargets].forEach((el) => el.classList.add("is-visible"));
  }

  renderInquiries();
})();
