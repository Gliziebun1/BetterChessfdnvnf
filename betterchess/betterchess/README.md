# BetterChess

Free online chess with Elo matchmaking. No dependencies: just Node 18+.

## Run locally
    npm start            # http://localhost:3000
Open it in two browser windows, choose "Play online" in each, press "Find a match".

## Put it on the internet (needs a host that runs a Node server)
Static hosts (GitHub Pages, Netlify, Vercel static) will NOT work: matchmaking needs the server.
Easy options: Render, Railway, Fly.io (all have free/cheap tiers).

1. Put this folder in a GitHub repo.
2. On Render: New > Web Service > pick the repo. Build command: (empty). Start command: `npm start`.
3. Set environment variable `SITE_URL` to your final address, e.g. `https://yourchess.com` (no trailing slash).
   This fills in the canonical link, sitemap and structured data.
4. Optional: buy a domain and attach it in the host's dashboard.
5. Run a single instance (matchmaking state lives in memory).

## Getting found on Google
Search engines only find a site after crawling it, which takes days to weeks and is never guaranteed.
1. Add the site in Google Search Console and Bing Webmaster Tools and verify ownership.
2. Submit `https://yourdomain/sitemap.xml` (the server generates it; robots.txt points to it).
3. Use a distinctive name/domain. "BetterChess" is generic and may compete with other sites.
4. Get a few links to it (Reddit, a Show HN post, social profiles).

## Notes
- Ratings are stored in each player's browser (localStorage) and are self-reported, so they can be edited. For a trusted ladder you'd add accounts and a database.
- Moves are checked for turn order and format by the server; full legality is checked by each client.
- Dropped connections have a 15-second grace period before the opponent is told you left.
