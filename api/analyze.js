const https = require('https');

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    });

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });

  const { situation } = req.body || {};
  if (!situation) return res.status(400).json({ error: '상황 설명이 필요합니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 미설정' });

  const prompt = `당신은 건설 현장 안전 법률 전문가입니다. 아래 상황을 분석하고 JSON 형식으로만 답변하세요.

상황: ${situation}

다음 JSON 형식으로 답변하세요:
{
  "summary": "상황 요약 (1~2문장)",
  "severity": "심각도 (낮음/중간/높음/매우높음)",
  "laws": [
    {"name": "법령명", "article": "조문번호", "content": "관련 내용 요약"}
  ],
  "immediate_actions": [
    "즉시 취해야 할 조치 1",
    "즉시 취해야 할 조치 2"
  ],
  "owner_obligations": [
    "사업주 의무사항 1",
    "사업주 의무사항 2"
  ],
  "penalties": "위반 시 처벌 수위",
  "prevention": [
    "재발 방지 대책 1",
    "재발 방지 대책 2"
  ]
}`;

  try {
    const raw = await callClaude(prompt);
    const data = JSON.parse(raw);
    const text = data.content[0].text;
    
    // JSON 추출
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.json({ error: '분석 실패' });
    
    const result = JSON.parse(match[0]);
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
