// content.js
// Execution Guard: Prevents ghost injections
if (typeof window.__MAPS_HARVESTER_ACTIVE__ === "undefined") {
  window.__MAPS_HARVESTER_ACTIVE__ = true;

  function randomDelay(min, max) {
    return new Promise((resolve) =>
      setTimeout(resolve, Math.floor(Math.random() * (max - min + 1) + min)),
    );
  }

  // Robust Logging with Fallback
  function sendLog(text, type = "info") {
    try {
      chrome.runtime
        .sendMessage({ action: "log", text: text, type: type })
        .catch(() => {
          console.log(`[Harvester] ${text}`); // Fallback to browser console if panel is closed
        });
    } catch (e) {
      console.log(`[Harvester Error] ${e}`);
    }
  }

  // Upgraded Radar: Fixed to the screen so it never scrolls away
  function injectRadarAnimation() {
    try {
      if (document.getElementById("v5-radar")) return;
      const style = document.createElement("style");
      style.innerHTML = `
        @keyframes sweep { 0% { top: 0; opacity: 0; } 10% { opacity: 1; box-shadow: 0 0 20px 5px #3b82f6; } 90% { opacity: 1; } 100% { top: 100vh; opacity: 0; } }
        #v5-radar { position: fixed; top: 0; left: 0; width: 430px; height: 3px; background: #60a5fa; z-index: 999999; pointer-events: none; animation: sweep 3s infinite linear; }
      `;
      document.head.appendChild(style);

      let radar = document.createElement("div");
      radar.id = "v5-radar";
      document.body.appendChild(radar); // Attached to body, not the scrollable feed!
      sendLog("Visual radar deployed.", "info");
    } catch (e) {
      sendLog("Warning: Could not deploy visual radar.", "error");
    }
  }

  function removeRadar() {
    const radar = document.getElementById("v5-radar");
    if (radar) radar.remove();
  }

  async function startHarvesting() {
    try {
      sendLog("Scanner initializing on Maps tab...", "info");

      let feed = document.querySelector('div[role="feed"]');
      if (!feed) {
        sendLog(
          "Critical: Could not find search results. Search for a niche first.",
          "error",
        );
        chrome.storage.local.set({ isScraping: false });
        return;
      }

      injectRadarAnimation();

      while (true) {
        let storage = await chrome.storage.local.get(["isScraping"]);
        if (!storage.isScraping) {
          removeRadar();
          sendLog("Scanner halted gracefully.", "info");
          break;
        }

        sendLog("Extracting visible blocks...", "info");
        extractListings();

        // Scroll down
        feed.scrollBy(0, 450 + Math.random() * 400);

        if (document.querySelector("span.HjBfq")) {
          removeRadar();
          sendLog("End of Google Maps list reached.", "success");
          chrome.storage.local.set({ isScraping: false });
          break;
        }

        await randomDelay(2000, 4000);
      }
    } catch (err) {
      sendLog(`Engine crash: ${err.message}`, "error");
      removeRadar();
      chrome.storage.local.set({ isScraping: false });
    }
  }

  function normalizeLeadId(name, address) {
    return `${(name || "").trim().toLowerCase()}|${(address || "").trim().toLowerCase()}`
      .replace(/\s+/g, " ")
      .replace(/[^a-z0-9 \-\|]/gi, "");
  }

  function extractListings() {
    const cards = document.querySelectorAll("div.Nv2PK");
    let newLeads = [];
    let processedThisTick = 0;

    cards.forEach((card) => {
      try {
        const nameEl = card.querySelector("div.qBF1Pd");
        if (!nameEl) return;
        const name = nameEl.innerText.trim();

        let website = "";
        card.querySelectorAll("a").forEach((a) => {
          if (a.href && !a.href.includes("google.com")) website = a.href;
        });

        let category = "",
          address = "";
        Array.from(card.querySelectorAll("div.W4Efsd"))
          .map((el) => el.innerText)
          .forEach((block) => {
            if (block.includes("·")) {
              let parts = block.split("·").map((p) => p.trim());
              if (parts.length >= 2 && !parts[0].includes("stars")) {
                if (!category) category = parts[0];
                if (!address && parts.length > 1) {
                  address = parts
                    .slice(1)
                    .join(", ")
                    .replace(/(\n?Open 24 hours|\n?Closed|\n?Opens).*/g, "")
                    .trim();
                }
              }
            }
          });

        const phoneMatch = card.innerText.match(
          /(?:\+?\d{1,3}[\s-]?)?\(?\d{2,4}\)?[\s-]?\d{3,4}[\s-]?\d{4,6}/,
        );
        const phone = phoneMatch ? phoneMatch[0] : "";

        let rating = "0",
          reviews = "0";
        const starSpan = card.querySelector('span[aria-label*="stars"]');
        if (starSpan) {
          const aria = starSpan.getAttribute("aria-label");
          const rMatch = aria.match(/([\d\.]+)\s*stars/);
          const revMatch = aria.match(/([\d\,]+)\s*Reviews/i);
          if (rMatch) rating = rMatch[1];
          if (revMatch) reviews = revMatch[1].replace(/,/g, "");
        }

        newLeads.push({
          id: normalizeLeadId(name, address),
          name,
          category,
          address,
          phone,
          website,
          rating: parseFloat(rating),
          reviews: parseInt(reviews),
        });
        processedThisTick++;
      } catch (e) {
        // Silently skip malformed cards so it doesn't break the whole app
      }
    });

    if (newLeads.length > 0) {
      sendLog(
        `Found ${processedThisTick} cards in viewport. Processing...`,
        "info",
      );
      chrome.runtime.sendMessage({ action: "processLeads", leads: newLeads });
    }
  }

  startHarvesting().finally(() => {
    window.__MAPS_HARVESTER_ACTIVE__ = undefined;
  });
} else {
  console.log("Scanner already active in this tab.");
}
