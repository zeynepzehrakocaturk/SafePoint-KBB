/**
 * İzmit bbox içindeki mahalle düğümlerini ve sokak sayısını test eder.
 */
const bbox = '40.7202713,29.8542049,40.9719328,30.2674976';

const queries = {
  neighborhoods: `
[out:json][timeout:60];
(
  node["place"~"neighbourhood|suburb|quarter"](${bbox});
  relation["boundary"="administrative"]["admin_level"~"9|10"](${bbox});
);
out tags;`,

  streetCount: `
[out:json][timeout:60];
way["highway"]["name"](${bbox});
out count;`,
};

async function run(label, query) {
  const response = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'SafePoint-KBB/1.0 (Kocaeli Afet Konum; educational project)',
    },
    body: `data=${encodeURIComponent(query)}`,
  });

  const text = await response.text();
  if (!response.ok || text.startsWith('<!')) {
    throw new Error(`${label}: ${text.slice(0, 180)}`);
  }

  return JSON.parse(text);
}

const neighborhoods = await run('neighborhoods', queries.neighborhoods);
console.log('Neighborhood count:', neighborhoods.elements?.length ?? 0);
console.log(
  'Names:',
  neighborhoods.elements?.slice(0, 15).map((item) => item.tags?.name)
);

const count = await run('streetCount', queries.streetCount);
console.log('Street count tag:', count.elements?.[0]?.tags);
