// Refreshes the REPOS and VIDEOS blocks of README.md.
// Run by .github/workflows/update-readme.yml via actions/github-script.
const fs = require('fs');

const README = 'README.md';
const USER = 'mandar-tabib-1';
const CHANNEL_ID = 'UCGIZt5eD9L5NV5ZhAtX-grQ'; // youtube.com/@tabibmandar
const VIDEOS_SINCE = '2020-01-01'; // older uploads on the channel are personal, not research
const MAX_REPOS = 6;
const MAX_VIDEOS = 6;

function replaceBlock(text, tag, body) {
  const re = new RegExp(`(<!-- ${tag}:START -->)[\\s\\S]*?(<!-- ${tag}:END -->)`);
  return text.replace(re, `$1\n${body}\n$2`);
}

const esc = (s) => (s || '').replace(/\|/g, '\\|').replace(/"/g, '&quot;').trim();

async function reposBlock(github) {
  const { data } = await github.rest.repos.listForUser({
    username: USER, sort: 'pushed', direction: 'desc', per_page: 50, type: 'owner',
  });
  const repos = data.filter((r) => !r.fork && !r.archived && r.name !== USER).slice(0, MAX_REPOS);
  if (!repos.length) return null;
  const rows = repos.map((r) => {
    const stars = r.stargazers_count ? ` ⭐ ${r.stargazers_count}` : '';
    return `| [${r.name}](${r.html_url})${stars} | ${esc(r.description) || '—'} |`;
  });
  return ['| Repository | Description |', '|---|---|', ...rows].join('\n');
}

async function videosBlock() {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`);
  if (!res.ok) return null;
  const xml = await res.text();
  const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m) => {
    const e = m[1];
    const pick = (re) => (e.match(re) || [])[1];
    return {
      id: pick(/<yt:videoId>(.*?)<\/yt:videoId>/),
      title: pick(/<title>(.*?)<\/title>/),
      published: pick(/<published>(.*?)<\/published>/),
    };
  });
  const vids = entries.filter((v) => v.id && v.published >= VIDEOS_SINCE).slice(0, MAX_VIDEOS);
  if (!vids.length) return null;
  const imgs = vids.map((v) =>
    `<a href="https://www.youtube.com/watch?v=${v.id}"><img src="https://img.youtube.com/vi/${v.id}/mqdefault.jpg" width="30%" alt="${esc(v.title)}"/></a>`);
  return ['<p align="center">', ...imgs, '</p>'].join('\n');
}

module.exports = async ({ github, core }) => {
  let text = fs.readFileSync(README, 'utf8');
  const original = text;

  try {
    const repos = await reposBlock(github);
    if (repos) text = replaceBlock(text, 'REPOS', repos);
  } catch (e) {
    core.warning(`Repo list not updated: ${e.message}`);
  }
  try {
    const videos = await videosBlock();
    if (videos) text = replaceBlock(text, 'VIDEOS', videos);
  } catch (e) {
    core.warning(`Video list not updated: ${e.message}`);
  }

  if (text !== original) {
    fs.writeFileSync(README, text);
    core.info('README updated.');
  } else {
    core.info('No changes.');
  }
};
