// sidepanel.js
let isScraping = false;

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const exportCSV = document.getElementById("exportCSV");
const clearDataBtn = document.getElementById("clearData");
const statusText = document.getElementById("statusText");
const statusIndicator = document.getElementById("statusIndicator");
const leadCountDisplay = document.getElementById("leadCount");
const logContainer = document.getElementById("logContainer");
const exportFilter = document.getElementById("exportFilter");
const limitInput = document.getElementById("limit");

function addLog(msg, type = "info") {
  const div = document.createElement("div");
  div.innerText = `> ${msg}`;
  div.className = `log-${type}`;
  logContainer.appendChild(div);
  logContainer.scrollTop = logContainer.scrollHeight;
}

document.getElementById("clearLog").addEventListener("click", () => {
  logContainer.innerHTML = "";
});

function updateUI() {
  chrome.storage.local.get(["leads", "isScraping"], (result) => {
    const leads = result.leads || [];
    leadCountDisplay.innerText = leads.length;

    isScraping = result.isScraping || false;
    if (isScraping) {
      statusText.innerText = "Extracting...";
      statusText.className = "stat-status active";
      statusIndicator.className = "indicator active";

      startBtn.disabled = true;
      startBtn.className = "btn btn-disabled";

      stopBtn.disabled = false;
      stopBtn.className = "btn btn-danger";
    } else {
      statusText.innerText = "Idle";
      statusText.className = "stat-status";
      statusIndicator.className = "indicator";

      startBtn.disabled = false;
      startBtn.className = "btn btn-primary";

      stopBtn.disabled = true;
      stopBtn.className = "btn btn-disabled";
    }
  });
}

updateUI();
setInterval(updateUI, 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "log") addLog(message.text, message.type);
});

startBtn.addEventListener("click", async () => {
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || !tab.url || !tab.url.includes("/maps")) {
    alert(
      "Please navigate to a Google Maps search page before starting the engine.",
    );
    return;
  }

  const limit = parseInt(limitInput.value) || 100;
  chrome.storage.local.set({ isScraping: true, targetLimit: limit });
  updateUI();
  addLog("Engine started. Injecting scraper...", "info");

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["content.js"],
  });
});

stopBtn.addEventListener("click", () => {
  chrome.storage.local.set({ isScraping: false });
  addLog("Process manually stopped.", "error");
  updateUI();
});

clearDataBtn.addEventListener("click", () => {
  if (confirm("Delete all stored leads?")) {
    chrome.storage.local.set({ leads: [] });
    addLog("Database cleared.", "error");
    updateUI();
  }
});

exportCSV.addEventListener("click", () => {
  const filter = exportFilter.value;
  addLog("Preparing CSV export...", "info");

  chrome.runtime.sendMessage(
    { action: "generateCSV", filter: filter },
    (response) => {
      if (response && response.csvText) {
        const blob = new Blob([response.csvText], {
          type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Maps_Leads_${new Date().getTime()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        addLog("Export complete!", "success");
      } else {
        addLog("Export failed or no leads found.", "error");
      }
    },
  );
});
