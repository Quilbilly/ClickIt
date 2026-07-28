const STORAGE_KEY = "tw-parent-care:inquiries";

function readInquiries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeInquiries(inquiries) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inquiries));
}

function saveInquiry(inquiry) {
  const inquiries = readInquiries();
  const entry = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...inquiry,
  };
  inquiries.unshift(entry);
  writeInquiries(inquiries);
  return entry;
}

function clearInquiries() {
  localStorage.removeItem(STORAGE_KEY);
}

window.TwParentCareStorage = {
  readInquiries,
  saveInquiry,
  clearInquiries,
};
