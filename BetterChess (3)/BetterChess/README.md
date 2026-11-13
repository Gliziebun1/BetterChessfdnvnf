# BetterChess

Free online chess with Elo matchmaking. No dependencies: just Node 18+.

## What's in it
- **Left sidebar** (Chess.com-style): Play Online, Play Computer, Puzzles, Analysis, Home.
- **Time controls** for online play (dropdown in the Play Online panel): 1 min, 2|1 (bullet); 3 min, 3|2, 5 min (blitz); 10 min, 15|10 (rapid); 30 min (classical); or unlimited. You are only matched with players searching for the same time control.
- **Clocks**: the server keeps the authoritative clocks. They start once both players have made their first move; a player who runs out of time loses (rated). If nobody moves within 30 seconds of the match starting, the game is aborted with no rating change.
- **Puzzles**: 19 mate-in-1 / mate-in-2 puzzles. Any move that still forces mate is accepted. Progress is saved in the browser.
- **Analysis**: free board for both sides, move list with navigation (arrow keys too), load/copy FEN and PGN, a depth-3 engine evaluation and best-move hint. "Analyse game" sends your last game there.
- **Home** with quick-play time controls and a "return to game" banner.

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
- Moves are checked for turn order and format by the server; full legality is checked by each client. Clients also tell the server when a game ends by checkmate/stalemate so the clocks stop; a modified client could abuse this, so a trusted ladder would need server-side move validation.
- Elo is a single rating shared by all time controls.
- Puzzles and the analysis engine run entirely in the browser.
- Dropped connections have a 15-second grace period before the opponent is told you left.
