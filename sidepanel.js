// sidepanel.js
const UI = {
  start: document.getElementById("startBtn"),
  stop: document.getElementById("stopBtn"),
  log: document.getElementById("logContainer"),
  leads: document.getElementById("leadCount"),
  skipped: document.getElementById("skippedCount"),
  indicator: document.getElementById("statusIndicator"),
  cloud: document.getElementById("wordCloud"),
  baseLoc: document.getElementById("baseLocation"),
  webhookUrl: document.getElementById("webhookUrl"),
  exportFilter: document.getElementById("exportFilter"),
  webhookPayloadMode: document.getElementById("webhookPayloadMode"),
  statusFilter: document.getElementById("statusFilter"),
  leadTagInput: document.getElementById("leadTagInput"),
  applyTag: document.getElementById("applyTag"),
  profileName: document.getElementById("profileName"),
  saveSearchProfile: document.getElementById("saveSearchProfile"),
  savedSearches: document.getElementById("savedSearches"),
  applySavedSearch: document.getElementById("applySavedSearch"),
  currentQueryLabel: document.getElementById("currentQueryLabel"),
  highPriorityCount: document.getElementById("highPriorityCount"),
  emailLeadCount: document.getElementById("emailLeadCount"),
};

const State = {
  cloudTags: [],
  savedSearches: [],
  activeSearchProfile: null,
};

function addLog(msg, type = "info") {
  const div = document.createElement("div");
  div.innerText = `> ${msg}`;
  div.className = `log-${type}`;
  UI.log.appendChild(div);
  UI.log.scrollTop = UI.log.scrollHeight;
}

function slugify(value) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/--+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

function getDownloadDateStamp() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${yyyy}${mm}${dd}_${hh}${min}`;
}

async function getCurrentSearchMeta() {
  let query = "maps";
  let url = "";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      url = tab.url || "";
      const normalized = new URL(url);
      if (normalized.searchParams.has("q")) {
        query = normalized.searchParams.get("q");
      } else if (normalized.pathname.includes("/search/")) {
        query = decodeURIComponent(
          normalized.pathname.split("/search/")[1].split("/")[0] || "maps",
        );
      } else if (tab.title) {
        query = tab.title.replace(/\s*-\s*Google Maps$/i, "");
      }
    }
  } catch (err) {
    console.warn("Could not derive map search label", err);
  }
  return { query: slugify(query || "maps"), url };
}

async function setCurrentQueryLabel() {
  const { query } = await getCurrentSearchMeta();
  UI.currentQueryLabel.innerText = `Current query: ${query}`;
}

function normalizeLeadId(name, address) {
  return slugify(`${name}_${address || ""}`);
}

function getLeadStatusCounts(leads) {
  const counts = {
    highPriority: 0,
    emailCount: 0,
    status: {},
    tagged: 0,
  };
  leads.forEach((lead) => {
    if (lead.score >= 70) counts.highPriority += 1;
    if (lead.email) counts.emailCount += 1;
    const status = lead.status || "new";
    counts.status[status] = (counts.status[status] || 0) + 1;
    if (Array.isArray(lead.tags) && lead.tags.length) counts.tagged += 1;
  });
  return counts;
}

function refreshLeadMetrics(leads) {
  const counts = getLeadStatusCounts(leads);
  UI.highPriorityCount.innerText = counts.highPriority;
  UI.emailLeadCount.innerText = counts.emailCount;
}

function buildWebhookPayload(leads, queryLabel) {
  if (UI.webhookPayloadMode.value === "crm") {
    return {
      source: "MapsHarvester",
      queryLabel,
      totalLeads: leads.length,
      leads: leads.map((lead) => ({
        company: lead.name,
        email: lead.email,
        phone: lead.phone,
        website: lead.website,
        score: lead.score,
        category: lead.category,
        address: lead.address,
        status: lead.status || "new",
        tags: lead.tags || [],
        routeLink: lead.routeLink,
        seoLink: lead.seoLink,
      })),
    };
  }
  return {
    source: "MapsHarvester",
    queryLabel,
    totalLeads: leads.length,
    leads,
  };
}

async function loadSavedSearches() {
  const storage = await chrome.storage.local.get(["savedSearches"]);
  State.savedSearches = storage.savedSearches || [];
  UI.savedSearches.innerHTML = "<option value=''>Select saved profile</option>";
  State.savedSearches.forEach((profile, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.text = `${profile.name} — ${profile.queryLabel}`;
    UI.savedSearches.appendChild(option);
  });
}

async function saveCurrentSearchProfile() {
  const profileName = UI.profileName.value.trim();
  if (!profileName) {
    addLog("Enter a preset name before saving.", "error");
    return;
  }
  const { query, url } = await getCurrentSearchMeta();
  const profile = {
    name: profileName,
    queryLabel: query,
    url,
    createdAt: new Date().toISOString(),
  };
  State.savedSearches = State.savedSearches.filter(
    (item) => item.name !== profile.name,
  );
  State.savedSearches.unshift(profile);
  await chrome.storage.local.set({ savedSearches: State.savedSearches });
  UI.profileName.value = "";
  addLog(`Saved search preset: ${profile.name} (${query})`, "success");
  await loadSavedSearches();
}

function applySavedSearchProfile() {
  const selectedIndex = UI.savedSearches.value;
  if (selectedIndex === "") {
    addLog("Choose a saved profile first.", "error");
    return;
  }
  const profile = State.savedSearches[parseInt(selectedIndex, 10)];
  if (!profile) {
    addLog("Saved profile not found.", "error");
    return;
  }
  State.activeSearchProfile = profile;
  UI.currentQueryLabel.innerText = `Active profile: ${profile.name} (${profile.queryLabel})`;
  addLog(`Activated search preset: ${profile.name}`, "info");
}

async function applyTagToLeads() {
  const tag = UI.leadTagInput.value.trim();
  if (!tag) {
    addLog("Enter a tag before applying.", "error");
    return;
  }
  const { leads = [] } = await chrome.storage.local.get("leads");
  if (!leads.length) {
    addLog("No leads available to tag.", "error");
    return;
  }
  const normalizedTag = slugify(tag);
  const updated = leads.map((lead) => {
    const tags = Array.isArray(lead.tags) ? [...lead.tags] : [];
    if (!tags.includes(normalizedTag)) tags.push(normalizedTag);
    return { ...lead, tags };
  });
  await chrome.storage.local.set({ leads: updated });
  UI.leadTagInput.value = "";
  addLog(`Applied tag to ${updated.length} leads: ${normalizedTag}`, "success");
}

function getActiveQueryLabel() {
  if (State.activeSearchProfile) return State.activeSearchProfile.queryLabel;
  return UI.currentQueryLabel.innerText.replace(/^(Current query|Active profile):\s*/i, "") || "maps";
}

async function getMapSearchLabel() {
  let query = "maps";
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      const url = new URL(tab.url);
      if (url.searchParams.has("q")) {
        query = url.searchParams.get("q");
      } else if (url.pathname.includes("/search/")) {
        query = decodeURIComponent(
          url.pathname.split("/search/")[1].split("/")[0] || "maps",
        );
      } else if (tab.title) {
        query = tab.title.replace(/\s*-\s*Google Maps$/i, "");
      }
    }
  } catch (err) {
    console.warn("Could not derive map search label", err);
  }
  return slugify(query || "maps");
}

async function buildDownloadFileName(filter) {
  const searchLabel = getActiveQueryLabel() || (await getMapSearchLabel());
  const cloudLabel = State.cloudTags.slice(0, 3).join("-") || "lead";
  const statusLabel = UI.statusFilter.value.replace(/_/g, "-");
  const dateStamp = getDownloadDateStamp();
  const filterLabel = filter === "email" ? "emails-only" : "all";
  return `MapsHarvester_${searchLabel}_${cloudLabel}_${statusLabel}_${filterLabel}_${dateStamp}.csv`;
}

// Event-Driven UI Update
chrome.storage.onChanged.addListener((changes) => {
  if (changes.leads) {
    const leadsArr = changes.leads.newValue || [];
    UI.leads.innerText = leadsArr.length;
    generateWordCloud(leadsArr);
    refreshLeadMetrics(leadsArr);
  }
  if (changes.skippedCount)
    UI.skipped.innerText = changes.skippedCount.newValue || 0;
  if (changes.isScraping) toggleState(changes.isScraping.newValue);
});

// Initial Load
chrome.storage.local.get(
  [
    "leads",
    "skippedCount",
    "isScraping",
    "baseLocation",
    "savedWebhook",
    "savedSearches",
  ],
  async (res) => {
    UI.leads.innerText = (res.leads || []).length;
    UI.skipped.innerText = res.skippedCount || 0;
    if (res.baseLocation) UI.baseLoc.value = res.baseLocation;
    if (res.savedWebhook) UI.webhookUrl.value = res.savedWebhook;
    State.savedSearches = res.savedSearches || [];
    toggleState(res.isScraping || false);
    generateWordCloud(res.leads || []);
    refreshLeadMetrics(res.leads || []);
    await loadSavedSearches();
    await setCurrentQueryLabel();
  },
);

UI.baseLoc.addEventListener("change", (e) =>
  chrome.storage.local.set({ baseLocation: e.target.value }),
);

UI.saveSearchProfile.addEventListener("click", saveCurrentSearchProfile);
UI.applySavedSearch.addEventListener("click", applySavedSearchProfile);
UI.applyTag.addEventListener("click", applyTagToLeads);

function toggleState(isScraping) {
  if (isScraping) {
    UI.indicator.className = "indicator active";
    UI.start.disabled = true;
    UI.start.className = "btn btn-disabled";
    UI.stop.disabled = false;
    UI.stop.className = "btn btn-danger";
  } else {
    UI.indicator.className = "indicator";
    UI.start.disabled = false;
    UI.start.className = "btn btn-primary";
    UI.stop.disabled = true;
    UI.stop.className = "btn btn-disabled";
  }
}

function generateWordCloud(leads) {
  if (leads.length === 0) return;
  const words = {};
  leads.forEach((l) => {
    if (l.category) {
      let w = l.category.split(" ")[0];
      words[w] = (words[w] || 0) + 1;
    }
  });

  const sorted = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  UI.cloud.innerHTML = "";
  State.cloudTags = [];
  sorted.forEach(([word, count]) => {
    let span = document.createElement("span");
    span.className = "cloud-word";
    span.innerText = word;
    let size = 0.65 + count * 0.05;
    span.style.fontSize = `${Math.min(size, 1.2)}rem`;
    UI.cloud.appendChild(span);
    State.cloudTags.push(slugify(word));
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "log") addLog(msg.text, msg.type);
});

UI.start.addEventListener("click", async () => {
  try {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.url || !tab.url.includes("/maps")) {
      addLog("Error: Open a Google Maps tab first.", "error");
      return;
    }

    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "ping" }, () => resolve());
    });

    chrome.storage.local.set({
      isScraping: true,
      targetLimit: parseInt(document.getElementById("limit").value) || 100,
    });
    addLog("Deploying scanner to Maps...", "info");

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (err) {
    addLog(`Injection failed: ${err.message}`, "error");
    chrome.storage.local.set({ isScraping: false });
  }
});

UI.stop.addEventListener("click", () => {
  chrome.storage.local.set({ isScraping: false });
  addLog("Manual Halt Initiated.", "error");
});

document.getElementById("clearData").addEventListener("click", () => {
  chrome.storage.local.set({ leads: [], masterHistory: [], skippedCount: 0 });
  UI.cloud.innerHTML = "";
  addLog("Memory Purged.", "info");
});

UI.sendWebhook.addEventListener("click", () => {
  const webhook = UI.webhookUrl.value.trim();
  if (!webhook) {
    addLog("Enter a valid webhook URL first.", "error");
    return;
  }

  chrome.storage.local.get(["leads", "savedWebhook"], async (result) => {
    const leads = result.leads || [];
    if (!leads.length) {
      addLog("No leads available to send.", "error");
      return;
    }

    chrome.storage.local.set({ savedWebhook: webhook });
    const queryLabel = getActiveQueryLabel();
    const payload = buildWebhookPayload(leads, queryLabel);
    addLog("Pushing leads to webhook...", "info");

    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      addLog("Webhook push succeeded.", "success");
    } catch (error) {
      addLog(`Webhook push failed: ${error.message}`, "error");
    }
  });
});

document.getElementById("exportCSV").addEventListener("click", async () => {
  const filterValue = UI.exportFilter.value;
  const statusValue = UI.statusFilter.value;
  const fileName = await buildDownloadFileName(filterValue);

  chrome.runtime.sendMessage(
    { action: "generateCSV", filter: filterValue, status: statusValue },
    (response) => {
      if (response && response.csvText) {
        const blob = new Blob([response.csvText], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        addLog(`CSV export complete: ${fileName}`, "success");
      } else {
        addLog("CSV export failed or returned no data.", "error");
      }
    },
  );
});
