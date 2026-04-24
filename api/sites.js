// 현장 관리 API - 메모리 기반 (Vercel 재시작시 초기화됨)
// 실제 운영시 Vercel KV나 외부DB 연동 권장

const DEFAULT_SITES = [];

let _sites = null;

function getSites() {
  if (!_sites) _sites = [...DEFAULT_SITES];
  return _sites;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ADMIN_PW = process.env.ADMIN_PASSWORD || 'sadakdari2024';

  // GET: 활성 현장 목록 (앱용)
  if (req.method === 'GET') {
    const sites = getSites().filter(s => s.status === 'active');
    return res.json({ success: true, sites });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: '허용 안됨' });

  const body = req.body || {};
  const { action, password, site, id } = body;

  // 로그인
  if (action === 'login') {
    return password === ADMIN_PW
      ? res.json({ success: true })
      : res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  }

  // 전체 목록 (관리자용)
  if (action === 'list') {
    return res.json({ success: true, sites: getSites() });
  }

  // 추가
  if (action === 'add') {
    if (!site || !site.name) return res.status(400).json({ error: '현장명 필수' });
    const newSite = {
      id: String(Date.now()),
      name: site.name.trim(),
      suguin: (site.suguin || '').trim(),
      startDate: site.startDate || '',
      endDate: site.endDate || '',
      status: 'active',
      createdAt: new Date().toISOString()
    };
    getSites().push(newSite);
    return res.json({ success: true, sites: getSites() });
  }

  // 수정
  if (action === 'update') {
    const sites = getSites();
    const idx = sites.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: '현장 없음' });
    sites[idx] = { ...sites[idx], ...site };
    return res.json({ success: true, sites });
  }

  // 삭제
  if (action === 'delete') {
    const sites = getSites();
    const idx = sites.findIndex(s => s.id === id);
    if (idx === -1) return res.status(404).json({ error: '현장 없음' });
    sites[idx].status = 'deleted';
    return res.json({ success: true, sites });
  }

  res.status(400).json({ error: '알 수 없는 action' });
};
