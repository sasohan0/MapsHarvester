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
  sendWebhook: document.getElementById("sendWebhook"),
};

const State = {
  cloudTags: [],
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
        query = decodeURIComponent(url.pathname.split("/search/")[1].split("/")[0] || "maps");
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
  const searchLabel = await getMapSearchLabel();
  const cloudLabel = State.cloudTags.slice(0, 3).join("-") || "lead";
  const dateStamp = getDownloadDateStamp();
  const filterLabel = filter === "email" ? "emails-only" : "all";
  return `MapsHarvester_${searchLabel}_${cloudLabel}_${filterLabel}_${dateStamp}.csv`;
}

// Event-Driven UI Update
chrome.storage.onChanged.addListener((changes) => {
  if (changes.leads) {
    const leadsArr = changes.leads.newValue || [];
    UI.leads.innerText = leadsArr.length;
    generateWordCloud(leadsArr);
  }
  if (changes.skippedCount)
    UI.skipped.innerText = changes.skippedCount.newValue || 0;
  if (changes.isScraping) toggleState(changes.isScraping.newValue);
});

// Initial Load
chrome.storage.local.get(
  ["leads", "skippedCount", "isScraping", "baseLocation", "savedWebhook"],
  (res) => {
    UI.leads.innerText = (res.leads || []).length;
    UI.skipped.innerText = res.skippedCount || 0;
    if (res.baseLocation) UI.baseLoc.value = res.baseLocation;
    if (res.savedWebhook) UI.webhookUrl.value = res.savedWebhook;
    toggleState(res.isScraping || false);
    generateWordCloud(res.leads || []);
  },
);

UI.baseLoc.addEventListener("change", (e) =>
  chrome.storage.local.set({ baseLocation: e.target.value }),
);

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

  chrome.storage.local.get("leads", async (result) => {
    const leads = result.leads || [];
    if (!leads.length) {
      addLog("No leads available to send.", "error");
      return;
    }

    chrome.storage.local.set({ savedWebhook: webhook });
    addLog("Pushing leads to webhook...", "info");

    try {
      const response = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "MapsHarvester", leads }),
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
  const fileName = await buildDownloadFileName(filterValue);

  chrome.runtime.sendMessage(
    { action: "generateCSV", filter: filterValue },
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
