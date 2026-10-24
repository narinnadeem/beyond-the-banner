# Beyond the Banner

Web-task + survey app for measuring the "no banner = no tracking" awareness gap.

## Run
    npm install
    ADMIN_KEY=choose-a-secret npm start      # Windows PowerShell: $env:ADMIN_KEY="choose-a-secret"; npm start
Open http://localhost:3000 (send this link to participants; use ngrok or deploy to Render/Railway for remote participants).
Results: http://localhost:3000/admin.html?key=choose-a-secret

## Flow
index.html (consent + cohort) -> article.html (task, silent trackers) -> survey.html (blind Qs -> reveal of real data -> impact Qs -> debrief)

## Files
- server.js            Express API + JSON storage (data/db.json) + admin stats/CSV
- public/t/*.js, pixel Simulated trackers (analytics, fingerprint, pixel). They report to our own server, so the reveal shows real captured data.
- public/admin.html    Researcher dashboard
