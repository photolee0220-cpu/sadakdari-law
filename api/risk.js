const https = require('https');

function callClaude(messages, systemPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      system: systemPrompt,
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 허용' });

  const { type, gongchong, danwiJakup, teukiSahang, riskPoints } = req.body || {};
  if (!gongchong) return res.status(400).json({ error: '공종이 필요합니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 미설정' });

  const systemPrompt = `당신은 건설 현장 안전관리 전문가입니다. 위험성평가표를 작성합니다.
반드시 JSON 형식으로만 응답하세요. 마크다운 코드블록(\`\`\`)을 절대 사용하지 마세요.
가능성(빈도): 1=낮음(월1회), 2=보통(주1회), 3=높음(매일)
중대성(강도): 1=경미(비치료), 2=보통(휴업불필요), 3=중대(사망/휴업)
위험성 = 가능성 × 중대성`;

  const prompt = `공종: ${gongchong}
단위작업: ${danwiJakup || gongchong}
특이사항: ${teukiSahang || '없음'}
위험포인트: ${(riskPoints || []).join(', ') || '없음'}
평가유형: ${type === 'sussi' ? '수시평가' : '최초평가'}

위 현장 조건에 맞는 위험성평가 항목을 생성하세요.
수시평가는 분류(인적요인/기계적요인/전기적요인/작업특성요인/작업환경요인)별로,
최초평가는 작업단계별로 구성하세요.

반드시 아래 JSON 구조로만 응답하세요:
{
  "items": [
    {
      "bunryu": "분류명(수시) 또는 작업단계(최초)",
      "yuhaeWihomYoin": "유해위험요인 구체적 설명",
      "ganeungsung": 숫자(1~3),
      "jungdaesung": 숫자(1~3),
      "wiheomsung": 숫자(자동계산),
      "gamsoTaechaek": "감소대책 구체적 내용",
      "bigo": ""
    }
  ]
}

항목은 8~12개 생성하세요. 현장 특이사항과 위험포인트를 반드시 반영하세요.`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], systemPrompt);
    const apiResponse = JSON.parse(raw);
    if (!apiResponse.content || !apiResponse.content[0]) {
      return res.json({ error: 'API 응답 없음' });
    }

    let text = apiResponse.content[0].text.trim();
    // JSON 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'JSON 파싱 실패' });
    
    const result = JSON.parse(jsonMatch[0]);
    // 위험성 자동계산 및 비고 자동태깅
    result.items = result.items.map(item => {
      item.wiheomsung = item.ganeungsung * item.jungdaesung;
      if (item.wiheomsung >= 6) item.bigo = '중대한위험';
      if (item.wiheomsung >= 9) item.bigo = '허용불가위험';
      return item;
    });

    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
