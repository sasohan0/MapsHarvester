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
};

function addLog(msg, type = "info") {
  const div = document.createElement("div");
  div.innerText = `> ${msg}`;
  div.className = `log-${type}`;
  UI.log.appendChild(div);
  UI.log.scrollTop = UI.log.scrollHeight;
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
  ["leads", "skippedCount", "isScraping", "baseLocation"],
  (res) => {
    UI.leads.innerText = (res.leads || []).length;
    UI.skipped.innerText = res.skippedCount || 0;
    if (res.baseLocation) UI.baseLoc.value = res.baseLocation;
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
  sorted.forEach(([word, count]) => {
    let span = document.createElement("span");
    span.className = "cloud-word";
    span.innerText = word;
    let size = 0.65 + count * 0.05;
    span.style.fontSize = `${Math.min(size, 1.2)}rem`;
    UI.cloud.appendChild(span);
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

    // Wake up Service Worker if it slept
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ action: "ping" }, (response) => {
        if (chrome.runtime.lastError) {
          /* ignore */
        }
        resolve();
      });
    });

    chrome.storage.local.set({
      isScraping: true,
      targetLimit: parseInt(document.getElementById("limit").value) || 100,
    });
    addLog("Deploying scanner to Maps...", "info");

    // Inject the robust execution guard script
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

document.getElementById("exportCSV").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "generateCSV" }, (response) => {
    if (response && response.csvText) {
      const blob = new Blob([response.csvText], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `Maps_V5_CRM_${new Date().getTime()}.csv`);
      document.body.appendChild(link);
      link.click();
      URL.revokeObjectURL(url);
    }
  });
});
