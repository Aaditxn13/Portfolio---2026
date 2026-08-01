# Portfolio analytics setup

The portfolio now sends first-party, anonymous events to Netlify and stores them
in the `portfolio-analytics` Netlify Blobs store. The private dashboard is at
`/analytics`.

## Enable the dashboard

1. In Netlify, open **Project configuration → Environment variables**.
2. Add `ANALYTICS_PASSWORD` with a long private password.
3. Optionally add `ANALYTICS_SECRET` with a different long random value.
4. Trigger a new production deploy so the functions receive the variables.
5. Visit `https://your-domain.com/analytics` and sign in.

Never commit the real values. `.env.example` contains placeholders only.

## View it locally

1. Copy `.env.example` to `.env` and replace both placeholder values.
2. Run `npx netlify-cli dev` from the project folder.
3. Open `http://localhost:8888/analytics`.

Use Netlify Dev instead of a basic static file server because the dashboard
needs the analytics functions, redirects, environment variables, and Blobs
runtime.

## Install the app

Open `/analytics` in Chrome or Edge and choose **Install** when the button
appears. On iPhone or iPad, open the page in Safari, use **Share**, then choose
**Add to Home Screen**. The app shell can open offline, but live analytics
requires an internet connection and is never stored in the offline cache.

## What is tracked

- Anonymous visitor and session IDs
- Page views and project opens
- Resume preview opens and PDF downloads
- Contact and outbound link clicks
- 30-second engaged sessions and 50% / 90% scroll depth
- Approximate city/country, browser, and device type supplied at request time

Raw IP addresses, names, email addresses, and keystrokes are not stored.
Visitors with Do Not Track enabled are not tracked, and local development visits
are excluded.

## Privacy note

The visitor ID is pseudonymous and stored in the browser. Mention this analytics
use in the portfolio privacy notice, and review consent requirements for the
countries where the site is offered.
