// Tiny read-only GitHub client. Needs a personal access token
// (fine-grained, read-only "Issues" and "Pull requests" is enough).
// Bytepet never writes anything to GitHub.

const API = 'https://api.github.com';

async function gh(token, pathOrUrl) {
  const url = pathOrUrl.startsWith(API) ? pathOrUrl : `${API}${pathOrUrl}`;
  if (!url.startsWith(`${API}/`)) throw new Error('Refusing to call a non-GitHub URL');
  const r = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Bytepet',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (r.status === 401) throw new Error('GitHub rejected the token');
  if (!r.ok) throw new Error(`GitHub error ${r.status}`);
  return r.json();
}

async function whoAmI(token) {
  return (await gh(token, '/user')).login;
}

// Open issues and PRs assigned to you
async function assignedIssues(token) {
  const items = await gh(token, '/issues?filter=assigned&state=open&per_page=50');
  return items.map((i) => ({
    id: i.node_id,
    title: i.title,
    url: i.html_url,
    apiUrl: i.url,
    labels: i.labels || [],
    repo: i.repository ? i.repository.full_name : '',
  }));
}

// Open pull requests waiting for your review
async function reviewRequests(token) {
  const q = encodeURIComponent('is:open is:pr review-requested:@me');
  const res = await gh(token, `/search/issues?q=${q}&per_page=20`);
  return (res.items || []).map((i) => ({ id: i.node_id, title: i.title, url: i.html_url }));
}

async function issueState(token, apiUrl) {
  return (await gh(token, apiUrl)).state; // 'open' | 'closed'
}

module.exports = { whoAmI, assignedIssues, reviewRequests, issueState };
