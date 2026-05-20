// service_worker.js

// 1. Force Side Panel to open on click
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("Side Panel Binding Error:", error));
});

// Also bind it immediately on worker startup just in case
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

// 2. Keep-Alive Mechanism
const KEEP_ALIVE_INTERVAL = 20000;
setInterval(() => {
  chrome.storage.local.get("isScraping");
}, KEEP_ALIVE_INTERVAL);

// ... (Keep the rest of your service worker code exactly as it was) ...
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ...
  if (request.action === "processLeads") {
    handleNewLeads(request.leads).then(() => sendResponse({ status: "ok" }));
    return true; // Keep message channel open for async
  } else if (request.action === "generateCSV") {
    exportToCSV(request.filter).then((csvText) => sendResponse({ csvText }));
    return true;
  } else if (request.action === "ping") {
    sendResponse({ status: "alive" });
    return true;
  }
});

function sendLog(text, type = "info") {
  chrome.runtime.sendMessage({ action: "log", text, type }).catch(() => {});
}

async function handleNewLeads(newLeads) {
  try {
    let storage = await chrome.storage.local.get([
      "leads",
      "masterHistory",
      "skippedCount",
      "baseLocation",
    ]);
    let leads = storage.leads || [],
      history = storage.masterHistory || [],
      skipped = storage.skippedCount || 0;

    for (let lead of newLeads) {
      if (history.includes(lead.id)) {
        skipped++;
        continue;
      }
      history.push(lead.id);

      // Deep Crawl
      if (lead.website) {
        let data = await deepCrawl(lead.website);
        lead.email = data.email;
        lead.socials = data.socials;
      } else {
        lead.email = "";
        lead.socials = "";
      }

      // Lead Scoring Engine (0-100)
      let score = 0;
      score += (lead.rating / 5) * 40;
      score += lead.reviews > 50 ? 20 : lead.reviews > 10 ? 10 : 5;
      score += lead.website ? 20 : 0;
      score += lead.email ? 20 : 0;
      lead.score = Math.round(score);

      lead.seoLink = lead.website
        ? `https://pagespeed.web.dev/analysis?url=${encodeURIComponent(lead.website)}`
        : "";

      let base = storage.baseLocation
        ? encodeURIComponent(storage.baseLocation)
        : "";
      let dest = encodeURIComponent(lead.address || lead.name);
      lead.routeLink =
        base && dest ? `https://www.google.com/maps/dir/${base}/${dest}` : "";

      leads.push(lead);
    }
    await chrome.storage.local.set({
      leads,
      masterHistory: history,
      skippedCount: skipped,
    });
  } catch (err) {
    sendLog(`Background Error: ${err.message}`, "error");
  }
}

async function fetchHTML(url) {
  try {
    let res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok ? await res.text() : "";
  } catch (e) {
    return "";
  }
}

async function deepCrawl(baseUrl) {
  let html = await fetchHTML(baseUrl);
  if (!html) return { email: "", socials: "" };
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;
  const rawEmails = html.match(emailRegex) || [];
  const email =
    [...new Set(rawEmails)].filter(
      (e) => !e.match(/\.(png|jpg|jpeg|gif|js|css)$/i),
    )[0] || "";

  const socialRegex =
    /href=["'](https?:\/\/(www\.)?(facebook\.com|linkedin\.com|instagram\.com|twitter\.com)\/[^"']+)["']/gi;
  let socials = [],
    match;
  while ((match = socialRegex.exec(html)) !== null)
    if (match[1]) socials.push(match[1].split("?")[0]);

  return { email, socials: [...new Set(socials)].join(" | ") };
}

async function exportToCSV(filter) {
  let { leads = [] } = await chrome.storage.local.get("leads");
  if (filter === "email") {
    leads = leads.filter((lead) => lead.email && lead.email.trim() !== "");
  }
  let csv =
    "Business Name,Lead Score,Category,Address,Phone,Email,Website,Rating,Reviews,SEO Audit Link,Directions Link,Social Links\n";
  leads.forEach((l) => {
    const w = (s) => `"${(s || "").toString().replace(/"/g, '""')}"`;
    csv += `${w(l.name)},${w(l.score)},${w(l.category)},${w(l.address)},${w(l.phone)},${w(l.email)},${w(l.website)},${w(l.rating)},${w(l.reviews)},${w(l.seoLink)},${w(l.routeLink)},${w(l.socials)}\n`;
  });
  return csv;
}
