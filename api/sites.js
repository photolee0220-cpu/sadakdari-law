// 현장 관리 API (Vercel KV 없이 환경변수 기반 간단 구현)
// 실제 배포 시 Vercel KV나 DB로 교체 가능

let sitesCache = null;

function getSites() {
  if (sitesCache) return sitesCache;
  try {
    const raw = process.env.SITES_DATA;
    if (raw) return JSON.parse(raw);
  } catch(e) {}
  return getDefaultSites();
}

function getDefaultSites() {
  return [
    { id: '1', name: '사랑과진리교회 신축현장', suguin: '바른탑종합건설', startDate: '2023-10', endDate: '2025-03', status: 'active' },
    { id: '2', name: '샘플현장 (테스트용)', suguin: '(주)사닥다리종합건설', startDate: '2024-01', endDate: '2025-12', status: 'active' }
  ];
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, password, site, id } = req.body || {};
  const ADMIN_PW = process.env.ADMIN_PASSWORD || 'sadakdari2024';

  // GET - 현장 목록 조회 (인증 불필요)
  if (req.method === 'GET') {
    const sites = getSites().filter(s => s.status === 'active');
    return res.json({ success: true, sites });
  }

  // POST - 관리 작업 (인증 필요)
  if (req.method === 'POST') {
    if (action === 'login') {
      if (password === ADMIN_PW) {
        return res.json({ success: true, token: 'admin_' + Date.now() });
      }
      return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
    }

    if (action === 'list') {
      return res.json({ success: true, sites: getSites() });
    }

    if (action === 'add') {
      const sites = getSites();
      const newSite = {
        id: String(Date.now()),
        name: site.name,
        suguin: site.suguin || '',
        startDate: site.startDate || '',
        endDate: site.endDate || '',
        status: 'active',
        createdAt: new Date().toISOString()
      };
      sites.push(newSite);
      sitesCache = sites;
      return res.json({ success: true, site: newSite, sites });
    }

    if (action === 'delete') {
      const sites = getSites();
      const idx = sites.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: '현장을 찾을 수 없습니다' });
      sites[idx].status = 'deleted';
      sitesCache = sites;
      return res.json({ success: true, sites });
    }

    if (action === 'update') {
      const sites = getSites();
      const idx = sites.findIndex(s => s.id === id);
      if (idx === -1) return res.status(404).json({ error: '현장을 찾을 수 없습니다' });
      sites[idx] = { ...sites[idx], ...site };
      sitesCache = sites;
      return res.json({ success: true, sites });
    }
  }

  res.status(405).json({ error: '허용되지 않는 메서드' });
};
