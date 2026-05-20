# MapsHarvester

MapsHarvester is a Chrome extension designed for harvesting business leads from Google Maps search results. It includes automated scraping, deep website crawl for emails and social links, webhook export support for n8n/Google Sheets pipelines, and CSV download capabilities.

## Features

- Smart lead extraction from Google Maps search results
- Auto-scroll and continuous scraping until a configured target limit is reached
- Duplicate detection and skip counter
- Website deep crawl for email and social profile discovery
- Webhook push to n8n, Zapier, Make, or any HTTP endpoint
- Local CSV export with optional email-only filtering
- Built as a Chrome Manifest V3 extension with side panel UI

## Installation

1. Clone the repository or download the extension folder.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable `Developer mode` in the top-right.
4. Click `Load unpacked` and select the `MapsHarvester` folder.
5. Open Google Maps and run a relevant search.

## Usage

1. Open the extension using the action button or the side panel.
2. Set the `Auto-Stop Limit` for the maximum number of leads to harvest.
3. Click `Start Scraping` while on a Google Maps results page.
4. Monitor progress through the terminal-style log and session lead counter.
5. Use `Stop` to manually abort the scraping session.

## Export Options

- `Trigger Webhook to Sheets`: sends the current lead set to a configured webhook URL.
- `Download Local CSV`: exports lead data as a CSV file.
- `Export All` or `Only Leads with Emails` filter options are available.

## Data Captured

Each lead may include:

- Business name
- Category
- Address
- Phone number
- Website URL
- Google Maps rating
- Review count
- Email address (from deep crawl)
- Social links (from homepage/contact page)

## Architecture

- `manifest.json` - extension metadata and permissions
- `sidepanel.html` - extension UI
- `sidepanel.js` - UI behavior and interaction handling
- `content.js` - Google Maps page scraper injected into the active tab
- `service_worker.js` - background worker, lead deduplication, deep crawl, and CSV export

## Notes

- Navigate to a Google Maps listing or search results page before starting.
- The extension uses Chrome storage to retain leads, history, and settings.
- The webhook payload is JSON with `source: "MapsHarvester"` and the `leads` array.

## License

This repository does not specify a license. Add one if you want to publish or share it publicly.
