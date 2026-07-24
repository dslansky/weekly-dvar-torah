const BASE_URL = 'https://weekly-dvar-torah.pages.dev';

const CHANNEL = {
  title: 'Quick Torah Thoughts',
  author: 'Dov Slansky',
  description:
    "This is a collection of short Divrei Torah on the weekly Parsha for your listening enjoyment. Taken from various sources and hopefully they serve as a little inspiration. This project is לזכר נשמת גבריאל שמחה בן ר' שמואל אליהו",
};

function xmlEscape(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Returns true if the given Y-M-D date (interpreted as a calendar date, no
// time-of-day) falls within US Eastern daylight saving time. DST rules:
// starts 2nd Sunday of March, ends 1st Sunday of November.
function isEasternDST(year, month, day) {
  const nthSunday = (y, m, n) => {
    const d = new Date(Date.UTC(y, m, 1));
    const firstSunday = 1 + ((7 - d.getUTCDay()) % 7);
    return firstSunday + (n - 1) * 7;
  };
  const dstStart = nthSunday(year, 2, 2); // March, 2nd Sunday
  const dstEnd = nthSunday(year, 10, 1); // November, 1st Sunday

  if (month < 2 || month > 10) return false;
  if (month > 2 && month < 10) return true;
  if (month === 2) return day >= dstStart;
  return day < dstEnd; // month === 10
}

// Formats an ISO date (YYYY-MM-DD) as an RFC 822 pubDate at 12:00 America/New_York.
function rfc822NoonEastern(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const dst = isEasternDST(year, month - 1, day);
  const offset = dst ? '-0400' : '-0500';
  const utcHour = dst ? 16 : 17; // 12:00 ET -> UTC
  const d = new Date(Date.UTC(year, month - 1, day, utcHour, 0, 0));

  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return `${days[d.getUTCDay()]}, ${String(day).padStart(2, '0')} ${months[month - 1]} ${year} 12:00:00 ${offset}`;
}

function itunesDuration(sec) {
  if (!sec && sec !== 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function buildFeedXml(manifest) {
  const entries = manifest.entries || [];
  const lastBuildDate = manifest.updated
    ? new Date(manifest.updated).toUTCString()
    : new Date(0).toUTCString();

  const items = entries
    .map((e) => {
      const title = xmlEscape(e.title || `Parshas ${e.parsha}`);
      const pubDate = rfc822NoonEastern(e.date);
      const duration = itunesDuration(e.durationSec);
      const categories = (e.tags || []).map((t) => `      <category>${xmlEscape(t)}</category>`).join('\n');
      return `    <item>
      <title>${title}</title>
      <description>${xmlEscape(e.notes || title)}</description>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${xmlEscape(e.audio)}" length="${e.bytes || 0}" type="audio/mp4" />
      <guid isPermaLink="false">${xmlEscape(e.id)}</guid>
      <link>${xmlEscape(`${BASE_URL}/#${e.id}`)}</link>
      ${duration ? `<itunes:duration>${duration}</itunes:duration>` : ''}
      <itunes:explicit>false</itunes:explicit>
${categories}
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xmlEscape(CHANNEL.title)}</title>
    <link>${BASE_URL}/</link>
    <atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(CHANNEL.description)}</description>
    <language>en-us</language>
    <itunes:author>${xmlEscape(CHANNEL.author)}</itunes:author>
    <itunes:owner>
      <itunes:name>${xmlEscape(CHANNEL.author)}</itunes:name>
    </itunes:owner>
    <itunes:image href="${BASE_URL}/artwork.jpg" />
    <image>
      <url>${BASE_URL}/artwork.jpg</url>
      <title>${xmlEscape(CHANNEL.title)}</title>
      <link>${BASE_URL}/</link>
    </image>
    <itunes:category text="Religion &amp; Spirituality">
      <itunes:category text="Judaism" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

export { buildFeedXml, xmlEscape, rfc822NoonEastern, itunesDuration, BASE_URL, CHANNEL };
