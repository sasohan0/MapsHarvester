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
  storageGet("isScraping");
}, KEEP_ALIVE_INTERVAL);

function storageGet(keys) {
  return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
}

function storageSet(items) {
  return new Promise((resolve) => chrome.storage.local.set(items, resolve));
}

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

function normalizeLeadId(name, address) {
  return `${(name || "").trim().toLowerCase()}|${(address || "").trim().toLowerCase()}`
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 \-\|]/gi, "");
}

async function handleNewLeads(newLeads) {
  try {
    let storage = await storageGet([
      "leads",
      "masterHistory",
      "skippedCount",
      "baseLocation",
    ]);
    let leads = storage.leads || [];
    let history = new Set(storage.masterHistory || []);
    let skipped = storage.skippedCount || 0;

    for (let rawLead of newLeads) {
      const leadId = normalizeLeadId(rawLead.name, rawLead.address);
      if (history.has(leadId)) {
        skipped++;
        continue;
      }
      history.add(leadId);

      let lead = {
        ...rawLead,
        id: leadId,
        tags: Array.isArray(rawLead.tags) ? rawLead.tags : [],
      };

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
      lead.priority =
        lead.score >= 70 ? "high" : lead.score >= 45 ? "medium" : "low";
      lead.status = lead.status || (lead.email ? "new" : "no-email");
      lead.completeness = [
        lead.name,
        lead.address,
        lead.phone,
        lead.website,
        lead.email,
      ].filter(Boolean).length;

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
    await storageSet({
      leads,
      masterHistory: Array.from(history),
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

async function exportToCSV(filter, status = "all") {
  let { leads = [] } = await storageGet("leads");
  if (filter === "email") {
    leads = leads.filter((lead) => lead.email && lead.email.trim() !== "");
  }
  if (status && status !== "all") {
    if (status === "high-priority") {
      leads = leads.filter((lead) => lead.priority === "high");
    } else {
      leads = leads.filter((lead) => lead.status === status);
    }
  }
  let csv =
    "Business Name,Lead Score,Priority,Status,Tags,Category,Address,Phone,Email,Website,Rating,Reviews,SEO Audit Link,Directions Link,Social Links\n";
  leads.forEach((l) => {
    const w = (s) => `"${(s || "").toString().replace(/"/g, '""')}"`;
    csv += `${w(l.name)},${w(l.score)},${w.priority},${w.status},${w.tags?.join("|") || ""},${w(l.category)},${w(l.address)},${w(l.phone)},${w(l.email)},${w(l.website)},${w(l.rating)},${w(l.reviews)},${w(l.seoLink)},${w(l.routeLink)},${w(l.socials)}\n`;
  });
  return csv;
}
