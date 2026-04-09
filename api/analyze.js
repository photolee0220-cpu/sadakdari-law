const https = require('https');

function callClaude(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: '당신은 건설 현장 안전 법률 전문가입니다. 마크다운 기호(**, ##, |, - 등)를 절대 사용하지 말고 순수 텍스트로만 답변하세요.',
      messages: messages
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

function cleanText(text) {
  return text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\|/g, '')
    .replace(/^[-•]\s*/gm, '')
    .replace(/^\d+\.\s*/gm, '')
    .trim();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });

  const { situation } = req.body || {};
  if (!situation) return res.status(400).json({ error: '상황 설명이 필요합니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 미설정' });

  try {
    const raw = await callClaude([{
      role: 'user',
      content: `건설 현장 상황: "${situation}"

아래 형식으로 정확히 분석해주세요. 각 항목 앞에 [태그]를 붙여주세요.

[요약] 상황을 한두 문장으로 요약
[심각도] 낮음, 중간, 높음, 매우높음 중 하나만
[법령1] 법령명: 관련 내용 한 문장
[법령2] 법령명: 관련 내용 한 문장
[대처1] 즉각 대처방법 첫 번째
[대처2] 즉각 대처방법 두 번째
[대처3] 즉각 대처방법 세 번째
[대처4] 즉각 대처방법 네 번째
[의무1] 사업주 의무사항 첫 번째
[의무2] 사업주 의무사항 두 번째
[의무3] 사업주 의무사항 세 번째
[처벌] 위반 시 처벌 내용
[방지1] 재발 방지 대책 첫 번째
[방지2] 재발 방지 대책 두 번째
[방지3] 재발 방지 대책 세 번째`
    }]);

    const apiResponse = JSON.parse(raw);
    if (!apiResponse.content || !apiResponse.content[0]) {
      return res.json({ error: 'API 응답 없음' });
    }

    const text = apiResponse.content[0].text;
    const result = parseTagged(text, situation);
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function parseTagged(text, situation) {
  const result = {
    summary: '',
    severity: '높음',
    laws: [],
    immediate_actions: [],
    owner_obligations: [],
    penalties: '',
    prevention: []
  };

  const lines = text.split('\n').map(l => l.trim()).filter(l => l);

  for (const line of lines) {
    const clean = cleanText(line);
    if (!clean) continue;

    if (line.startsWith('[요약]')) {
      result.summary = clean.replace('[요약]', '').trim();
    } else if (line.startsWith('[심각도]')) {
      const s = clean.replace('[심각도]', '').trim();
      if (s.includes('매우')) result.severity = '매우높음';
      else if (s.includes('높음')) result.severity = '높음';
      else if (s.includes('중간')) result.severity = '중간';
      else if (s.includes('낮음')) result.severity = '낮음';
    } else if (line.startsWith('[법령')) {
      const content = clean.replace(/\[법령\d+\]/, '').trim();
      if (content) {
        const parts = content.split(':');
        result.laws.push({
          name: parts[0] ? parts[0].trim() : '관련 법령',
          article: '',
          content: parts[1] ? parts[1].trim() : content
        });
      }
    } else if (line.startsWith('[대처')) {
      const content = clean.replace(/\[대처\d+\]/, '').trim();
      if (content) result.immediate_actions.push(content);
    } else if (line.startsWith('[의무')) {
      const content = clean.replace(/\[의무\d+\]/, '').trim();
      if (content) result.owner_obligations.push(content);
    } else if (line.startsWith('[처벌]')) {
      result.penalties = clean.replace('[처벌]', '').trim();
    } else if (line.startsWith('[방지')) {
      const content = clean.replace(/\[방지\d+\]/, '').trim();
      if (content) result.prevention.push(content);
    }
  }

  // 기본값
  if (!result.summary) result.summary = '건설 현장 안전사고 상황입니다. 즉각적인 조치가 필요합니다.';
  if (!result.immediate_actions.length) result.immediate_actions = ['119 신고 및 응급처치', '작업 즉시 중단', '현장 보존', '고용노동부 보고'];
  if (!result.owner_obligations.length) result.owner_obligations = ['재해 원인 조사', '재발 방지 대책 수립', '안전보건관리책임자 보고'];
  if (!result.penalties) result.penalties = '산업안전보건법 위반 시 5년 이하 징역 또는 5천만원 이하 벌금';
  if (!result.prevention.length) result.prevention = ['안전교육 정기 실시', '안전장비 착용 의무화', '현장 안전점검 강화'];

  return result;
}
