// service_worker.js
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "processLeads") {
    handleNewLeads(request.leads);
  } else if (request.action === "generateCSV") {
    exportToCSV(request.filter).then((csvText) => sendResponse({ csvText }));
    return true;
  }
});

function sendLog(text, type = "info") {
  chrome.runtime.sendMessage({ action: "log", text, type }).catch(() => {});
}

async function handleNewLeads(newLeads) {
  let { leads = [] } = await chrome.storage.local.get("leads");
  let newAdditions = 0;

  for (let lead of newLeads) {
    let exists = leads.find((l) => l.id === lead.id);
    if (!exists) {
      if (lead.website) {
        sendLog(`Crawling: ${lead.website}`, "info");
        let extraData = await crawlWebsite(lead.website);
        lead.email = extraData.email;
        lead.socials = extraData.socials;
        if (lead.email) sendLog(`Found email: ${lead.email}`, "success");
      } else {
        lead.email = "";
        lead.socials = "";
      }
      leads.push(lead);
      newAdditions++;
    }
  }

  await chrome.storage.local.set({ leads });
  if (newAdditions > 0)
    sendLog(`Added ${newAdditions} new unique leads.`, "success");
}

async function crawlWebsite(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const html = await response.text();

    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/gi;
    const emails = html.match(emailRegex) || [];
    const validEmails = [...new Set(emails)].filter(
      (e) => !e.match(/\.(png|jpg|jpeg|gif|webp|svg)$/i),
    );

    let socials = [];
    if (html.includes("facebook.com")) socials.push("FB");
    if (html.includes("instagram.com")) socials.push("IG");
    if (html.includes("linkedin.com")) socials.push("IN");

    return { email: validEmails[0] || "", socials: socials.join(", ") };
  } catch (error) {
    return { email: "", socials: "" };
  }
}

async function exportToCSV(filter) {
  let { leads = [] } = await chrome.storage.local.get("leads");

  if (filter === "email")
    leads = leads.filter((l) => l.email && l.email.trim() !== "");
  else if (filter === "phone")
    leads = leads.filter((l) => l.phone && l.phone.trim() !== "");

  if (leads.length === 0) return null;

  let csvContent = "Business Name,Phone,Email,Website,Rating,Reviews,Socials\n";

  leads.forEach((lead) => {
    let name = `"${(lead.name || "").replace(/"/g, '""')}"`;
    let phone = `"${lead.phone || ""}"`;
    let email = `"${lead.email || ""}"`;
    let web = `"${lead.website || ""}"`;
    let rating = `"${lead.rating || ""}"`;
    let reviews = `"${lead.reviews || ""}"`;
    let social = `"${lead.socials || ""}"`;

    csvContent += `${name},${phone},${email},${web},${rating},${reviews},${social}\n`;
  });

  return csvContent;
}
