async function fetchJson(path) {
  const response = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}`);
  }
  return response.json();
}

function formatBytes(size) {
  if (!Number.isFinite(size)) return 'unknown size';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'download-card';

  const title = document.createElement('h3');
  title.textContent = item.label;

  const size = document.createElement('p');
  size.className = 'small';
  size.textContent = `Size: ${formatBytes(item.sizeBytes)}`;

  const hash = document.createElement('p');
  hash.className = 'small';
  hash.textContent = `SHA256: ${item.sha256}`;

  const link = document.createElement('a');
  link.href = item.path;
  link.textContent = `Download ${item.name}`;
  link.setAttribute('download', '');

  card.append(title, size, hash, link);
  return card;
}

async function render() {
  const versionElement = document.getElementById('downloadVersion');
  const generatedElement = document.getElementById('downloadGeneratedAt');
  const list = document.getElementById('downloadList');

  try {
    const [versionMeta, downloadsMeta] = await Promise.all([
      fetchJson('./version.json'),
      fetchJson('./downloads.json'),
    ]);

    versionElement.textContent = `Version: ${versionMeta.version || 'unknown'}`;
    generatedElement.textContent = `Generated: ${downloadsMeta.generatedAt || 'unknown'}`;

    const items = Array.isArray(downloadsMeta.artifacts) ? downloadsMeta.artifacts : [];
    if (!items.length) {
      list.innerHTML = '<p class="small">No downloadable artifacts were generated yet.</p>';
      return;
    }

    list.replaceChildren(...items.map(createCard));
  } catch (error) {
    versionElement.textContent = 'Version: unavailable';
    generatedElement.textContent = 'Generated: unavailable';
    list.innerHTML = `<p class="small">${error.message}</p>`;
  }
}

render();
