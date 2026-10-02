// Reads a website: the start page plus up to MAX_PAGES linked pages on the same domain,
// reduced to plain text. That text becomes the agent's knowledge.
import dns from 'node:dns/promises';
import net from 'node:net';

const MAX_PAGES = 10;
const MAX_CHARS = 60000;
const PREFER = /about|ueber|über|faq|help|pricing|preise|price|service|leistung|product|produkt|shipping|versand|contact|kontakt|team|how/i;

function toText(html) {
  return html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n').map((l) => l.trim()).filter(function (l) { if (!l || this.has(l)) return false; this.add(l); return true; }, new Set()) // drop repeated lines (banners, menus)
    .join('\n');
}

function isPrivate(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v.startsWith('::ffff:')) return isPrivate(v.slice(7));
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb');
}

/** Only public http(s) addresses: the server must never be tricked into reading internal machines. */
async function assertPublic(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https addresses are allowed.');
  if (u.port && !['80', '443'].includes(u.port)) throw new Error('Only standard web ports (80, 443) are allowed.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const ips = net.isIP(host) ? [host] : (await dns.lookup(host, { all: true })).map((r) => r.address);
  if (!ips.length || ips.some(isPrivate)) throw new Error('Only public websites can be read.');
}

async function fetchPage(url) {
  let res;
  for (let hop = 0; hop < 5; hop++) { // follow redirects by hand so every target is checked
    await assertPublic(url);
    res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WebsiteVoiceAgent/1.0; +https://github.com/plutunieer/website-voice-agent)', 'Accept': 'text/html' }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    if (res.status < 300 || res.status >= 400 || !res.headers.get('location')) break;
    url = new URL(res.headers.get('location'), url).href;
  }
  Object.defineProperty(res, 'url', { value: url });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  if (!(res.headers.get('content-type') || '').includes('text/html')) throw new Error(`${url} is not an HTML page`);
  const html = (await res.text()).slice(0, 3_000_000);
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const links = [...html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const lang = (html.match(/<html[^>]*\slang=["']?([a-zA-Z-]+)/i)?.[1] || '').toLowerCase();
  return { url: res.url, title, lang, text: toText(html), links };
}

export async function readWebsite(input) {
  let start;
  try { start = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); } catch { throw new Error('Please enter a valid website address.'); }

  let home;
  try { home = await fetchPage(start.href); }
  catch (err) { // many sites only answer on www.
    if (start.hostname.startsWith('www.')) throw new Error(`Could not read the website: ${err.message}`);
    const www = new URL(start.href); www.hostname = `www.${www.hostname}`;
    try { home = await fetchPage(www.href); } catch { throw new Error(`Could not read the website: ${err.message}`); }
  }
  const origin = new URL(home.url).origin;
  const seen = new Set([home.url.replace(/\/$/, '')]);
  const candidates = [];
  for (const href of home.links) {
    let u; try { u = new URL(href, home.url); } catch { continue; }
    if (u.origin !== origin || /\.(pdf|jpe?g|png|gif|webp|zip|mp4)$/i.test(u.pathname)) continue;
    u.search = ''; const key = u.href.replace(/\/$/, '');
    if (seen.has(key)) continue; seen.add(key); candidates.push(u.href);
  }
  candidates.sort((a, b) => Number(PREFER.test(b)) - Number(PREFER.test(a)));

  const pages = [home];
  for (const url of candidates.slice(0, MAX_PAGES * 2)) {
    if (pages.length > MAX_PAGES) break;
    try { const p = await fetchPage(url); if (p.text.length > 200) pages.push(p); } catch { /* skip broken pages */ }
  }
  let budget = MAX_CHARS;
  const trimmed = pages.map((p) => { const text = p.text.slice(0, Math.max(0, Math.min(budget, 12000))); budget -= text.length; return { url: p.url, title: p.title || p.url, text }; }).filter((p) => p.text);
  if (!trimmed.length || trimmed.reduce((n, p) => n + p.text.length, 0) < 300) throw new Error('Almost no readable text found. The site probably builds its content with JavaScript only, which this tool cannot read yet.');
  return { url: home.url, title: home.title, lang: home.lang, pages: trimmed };
}
