module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ADMIN_PW = process.env.ADMIN_PASSWORD || 'sadakdari2024';

  function getSites() {
    try {
      const raw = process.env.SITES_DATA;
      if (raw) return JSON.parse(raw);
    } catch(e) {}
    return [];
  }

  // GET: 앱용 현장 목록
  if (req.method === 'GET') {
    const sites = getSites().filter(s => s.status === 'active');
    return res.json({ success: true, sites });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: '허용 안됨' });

  const { action, password } = req.body || {};

  if (action === 'login') {
    return password === ADMIN_PW
      ? res.json({ success: true })
      : res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  }

  if (action === 'list') {
    return res.json({ success: true, sites: getSites() });
  }

  return res.json({ success: true, sites: getSites() });
};
