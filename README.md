# 🗺️ Maps Harvester V3: Google Maps Lead Extraction Extension

**Maps Harvester V3** is a Manifest V3 Chrome extension for extracting business leads from Google Maps search results. It combines automated scraping, website enrichment, webhook export, and CSV download support for agency workflows.

## 📑 Table of Contents

1. [Core Features](#core-features)
2. [Architecture & File Structure](#architecture--file-structure)
3. [Data Schema](#data-schema)
4. [Key Code References](#key-code-references)
5. [Installation & Setup](#installation--setup)
6. [Usage](#usage)
7. [Webhook Export](#webhook-export)
8. [Notes](#notes)

---

## 🚀 Core Features

- **Google Maps scraping:** extracts business name, category, address, phone, website, rating, and review counts from search results.
- **Deep website enrichment:** crawls each lead's website and contact pages to gather email addresses and social links.
- **Duplicate detection:** maintains `masterHistory` to skip repeated business leads.
- **Webhook export:** push harvested leads to n8n, Zapier, Make, or any webhook endpoint.
- **CSV download:** export harvested leads locally as a CSV file with optional email-only filtering.
- **Chrome side panel UI:** lightweight Manifest V3 extension UI with real-time status and logging.

## 🏗 Architecture & File Structure

| File Name           | Purpose                                                                                         |
| ------------------- | ------------------------------------------------------------------------------------------------ |
| `manifest.json`     | Extension metadata and permissions for side panel, storage, scripting, and downloads.           |
| `sidepanel.html`    | Side panel UI structure and styling.                                                            |
| `sidepanel.js`      | UI logic, button controls, webhook sending, storage updates, and CSV export handling.           |
| `content.js`        | Google Maps DOM scraper injected into the active tab to collect lead data from search cards.    |
| `service_worker.js` | Background worker for lead processing, deduplication, deep crawling, and CSV generation.        |

> No external frameworks are required; the extension is built with vanilla HTML, CSS, and JavaScript.

## 📊 Data Schema

Harvested leads are stored in Chrome local storage and generally contain the following fields:

```json
{
  "id": "String",
  "name": "String",
  "category": "String",
  "address": "String",
  "phone": "String",
  "website": "String",
  "rating": "String",
  "reviews": "String",
  "email": "String",
  "socials": "String"
}
```

The extension also tracks:
- `masterHistory` — deduplication history for business IDs
- `skippedCount` — count of leads skipped due to duplicates
- `isScraping` — current scraping state flag

## 🧩 Key Code References

### `content.js`
- Scans Google Maps result cards using `document.querySelectorAll('div.Nv2PK')`
- Extracts business details, website links, category, address, and phone numbers
- Scrolls the feed and stops when the end of the list is reached or the configured limit arrives
- Sends scraped leads to the background worker for processing

### `service_worker.js`
- Receives lead batches and deduplicates them using `masterHistory`
- Performs deep crawling on lead websites to find emails and social links
- Generates CSV output in `exportToCSV(filter)` for local export
- Handles runtime messages from the side panel UI

### `sidepanel.js`
- Controls scraping flow and updates UI state
- Saves webhook URL to `chrome.storage.local`
- Sends harvested leads to a webhook endpoint as JSON
- Triggers CSV export and download via background messaging

## 🛠 Installation & Setup

1. Clone or download the repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable `Developer mode` in the top-right corner.
4. Click `Load unpacked` and select the `MapsHarvester` folder.
5. Open Google Maps and perform a search.

## Usage

1. Open the extension side panel.
2. Set the `Auto-Stop Limit` for the maximum number of leads.
3. Click `Start Scraping` while on a Google Maps results page.
4. Monitor progress in the terminal-style log area.
5. Use `Trigger Webhook to Sheets` to push data to your webhook.
6. Use `Download Local CSV` to export the collected leads.

## Webhook Export

The extension posts harvested leads in JSON format:

```json
{
  "source": "MapsHarvester",
  "leads": [ ... ]
}
```

This payload can be consumed by n8n, Zapier, Make, or any webhook-capable automation.

## Notes

- The current version does not include direct Google Sheets integration.
- For best results, run the extension on a Google Maps search results page.
- The extension uses Chrome local storage to retain leads, history, and webhook settings.
