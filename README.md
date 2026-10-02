# Website Voice Agent

A **voice info desk for your website**. Enter an address, the agent reads the site, and visitors ask questions out loud and get spoken answers, only from what is on the site.

Built on Google's new real-time voice model **Gemini 3.8 Live** ([announcement](https://blog.google/innovation-and-ai/technology/developers-tools/build-real-time-voice-applications-gemini-audio/)). Built with Claude Code.

## What it does

- Reads the start page plus up to 10 linked pages (FAQ, pricing, shipping, about … first).
- Speaks the website's language and switches when a visitor clearly speaks another one.
- Says honestly when something is not on the site, instead of making it up.
- Shows the conversation as text while you talk.
- Gives you a one-line snippet to put a "Talk to us" button on your own site.

## Try it in 2 minutes

You need Node.js 20+ and a free Gemini API key from https://aistudio.google.com/apikey.

```bash
git clone https://github.com/plutunieer/website-voice-agent.git
cd website-voice-agent
npm install
cp .env.example .env      # then paste your key after GEMINI_API_KEY=
npm start
```

Open http://localhost:8815, enter a website, tap the microphone and talk. Or open the folder in Claude Code and say: *"Set this up and start it for me."*

## Costs

Google charges per minute of audio, about $0.005 per minute of listening and $0.018 per minute of speaking (see the announcement). A five-minute chat is roughly 10 cents. The key stays in `.env` on your machine and is never sent to the browser.

## Put it on your website

The button snippet (`<script src=".../widget.js" data-agent="...">`) needs a server that is reachable from the internet.

> **Not safe for public deployment yet.** The server has no login: anyone who can reach it could create agents and talk on your API key. Run it on your own machine for now. Before going public it needs a login for creating agents, an allow-list of websites for the widget, rate limits per visitor and a spending cap in Google AI Studio.

## Limits

- Sites that build all their content with JavaScript (pure single-page apps) cannot be read yet.
- While the agent speaks, your microphone is paused so it does not hear itself. Tapping the button ends the whole conversation.
- One conversation lasts at most 10 minutes.

## How it works

`crawl.js` reads the site and turns it into plain text. `server.js` keeps one Gemini Live session per conversation and relays audio between browser and Google (16 kHz in, 24 kHz out). `public/talk.js` handles microphone and playback; `public/widget.js` is the embeddable button.

## License

MIT
