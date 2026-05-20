// content.js
const randomDelay = (min, max) =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)),
  );

function sendLog(text, type = "info") {
  chrome.runtime.sendMessage({ action: "log", text, type }).catch(() => {});
}

async function startHarvesting() {
  sendLog("Content scraper active. Analyzing Maps DOM...");

  let feed = document.querySelector('div[role="feed"]');
  if (!feed) {
    sendLog("Could not find search results. Aborting.", "error");
    chrome.storage.local.set({ isScraping: false });
    return;
  }

  while (true) {
    let storage = await chrome.storage.local.get([
      "isScraping",
      "targetLimit",
      "leads",
    ]);
    let currentLeads = (storage.leads || []).length;
    let limit = storage.targetLimit || 100;

    if (!storage.isScraping) {
      sendLog("Scraping halted by user.");
      break;
    }

    if (currentLeads >= limit) {
      sendLog(
        `Target limit of ${limit} reached. Stopping automatically.`,
        "success",
      );
      chrome.storage.local.set({ isScraping: false });
      break;
    }

    extractListings();

    sendLog("Scrolling to load more data...");
    feed.scrollBy(0, 400 + Math.random() * 500);

    let endOfList = document.querySelector("span.HjBfq");
    if (endOfList) {
      sendLog("End of Google Maps list reached.", "success");
      chrome.storage.local.set({ isScraping: false });
      break;
    }

    await randomDelay(2500, 5000);
  }
}

function extractListings() {
  const cards = document.querySelectorAll("div.Nv2PK");
  let newLeads = [];

  cards.forEach((card) => {
    try {
      const nameEl = card.querySelector("div.qBF1Pd");
      if (!nameEl) return;

      const name = nameEl.innerText;

      let website = "";
      const links = card.querySelectorAll("a");
      links.forEach((a) => {
        if (
          a.href &&
          !a.href.includes("google.com") &&
          !a.href.includes("maps")
        ) {
          website = a.href;
        }
      });

      const rawText = card.innerText;
      const phoneMatch = rawText.match(
        /(\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s-]?\d{3}[\s-]?\d{4}/,
      );
      const phone = phoneMatch ? phoneMatch[0] : "";

      let rating = "";
      let reviews = "";
      const starSpan = card.querySelector('span[aria-label*="stars"]');
      if (starSpan) {
        const aria = starSpan.getAttribute("aria-label");
        const rMatch = aria.match(/([\d\.]+)\s*stars/);
        const revMatch = aria.match(/([\d\,]+)\s*Reviews/i);
        if (rMatch) rating = rMatch[1];
        if (revMatch) reviews = revMatch[1];
      }

      newLeads.push({
        id: name + phone,
        name,
        phone,
        website,
        rating,
        reviews,
      });
    } catch (e) {}
  });

  if (newLeads.length > 0) {
    chrome.runtime.sendMessage({ action: "processLeads", leads: newLeads });
  }
}

startHarvesting();
