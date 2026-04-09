const https = require('https');

function callClaude(prompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
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

  const prompt = `당신은 건설 현장 안전 법률 전문가입니다. 아래 상황을 분석해주세요.

상황: ${situation}

반드시 아래 JSON 형식으로만 답변하세요. 다른 텍스트는 절대 포함하지 마세요.
배열 항목은 반드시 큰따옴표로 감싸고, 특수문자나 줄바꿈은 사용하지 마세요.

{"summary":"상황요약","severity":"높음","laws":[{"name":"산업안전보건법","article":"제38조","content":"추락방지 조치 의무"}],"immediate_actions":["119 신고","작업 중단","현장 보존"],"owner_obligations":["안전조치 미비 책임","재해 보고 의무"],"penalties":"1년 이하 징역 또는 1000만원 이하 벌금","prevention":["안전망 설치","안전교육 강화"]}`;

  try {
    const raw = await callClaude(prompt);
    let apiResponse;
    try {
      apiResponse = JSON.parse(raw);
    } catch(e) {
      return res.json({ error: 'API 응답 파싱 실패: ' + raw.slice(0, 200) });
    }

    if (!apiResponse.content || !apiResponse.content[0]) {
      return res.json({ error: 'API 응답 없음' });
    }

    const text = apiResponse.content[0].text.trim();
    
    // JSON 부분만 추출
    let jsonStr = text;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      jsonStr = text.slice(start, end + 1);
    }

    // 줄바꿈 및 제어문자 제거
    jsonStr = jsonStr.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ');

    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch(e) {
      // JSON 파싱 실패 시 텍스트로 기본 응답 반환
      result = {
        summary: text.slice(0, 200),
        severity: '높음',
        laws: [],
        immediate_actions: ['119 신고', '작업 즉시 중단', '현장 보존', '고용노동부 보고'],
        owner_obligations: ['재해 원인 조사', '재발 방지 대책 수립'],
        penalties: '산업안전보건법 위반 시 처벌',
        prevention: ['안전교육 강화', '안전장비 점검']
      };
    }

    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
