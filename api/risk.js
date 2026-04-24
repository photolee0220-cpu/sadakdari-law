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

  const { type, gongchong, danwiJakup, teukiSahang, riskPoints, photoDesc } = req.body || {};
  if (!gongchong) return res.status(400).json({ error: '공종이 필요합니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 미설정' });

  const systemPrompt = `당신은 건설현장 안전관리 전문가입니다. 위험성평가표를 작성합니다.
반드시 JSON 형식으로만 응답하세요. 마크다운 코드블록을 절대 사용하지 마세요.
가능성(빈도): 1=낮음(월1회이하), 2=보통(주1회), 3=높음(매일노출)
중대성(강도): 1=경미(비치료), 2=보통(휴업불필요), 3=중대(사망/중상/휴업)
위험성 = 가능성 × 중대성`;

  const photoLine = photoDesc ? `\n현장 사진 분석 내용: ${photoDesc}` : '';
  const prompt = `공종: ${gongchong}
단위작업: ${danwiJakup || gongchong}
특이사항: ${teukiSahang || '없음'}
위험포인트: ${(riskPoints || []).join(', ') || '없음'}${photoLine}
평가유형: ${type === 'sussi' ? '수시평가(SD-QP-04-02)' : '최초평가(SD-QP-04-01)'}

위 현장 조건에 맞는 위험성평가 항목을 8~12개 생성하세요.
수시평가: 분류를 인적요인/기계적요인/전기적요인/작업특성요인/작업환경요인 중 하나로.
최초평가: 분류를 작업단계명으로.

현장 특이사항, 사진 분석내용, 위험포인트를 반드시 반영하세요.

JSON 구조:
{"items":[{"bunryu":"분류명","yuhaeWihomYoin":"유해위험요인 구체적 설명","ganeungsung":숫자1~3,"jungdaesung":숫자1~3,"gamsoTaechaek":"감소대책 구체적 내용"}]}`;

  try {
    const raw = await callClaude([{ role: 'user', content: prompt }], systemPrompt);
    const apiResponse = JSON.parse(raw);
    if (!apiResponse.content || !apiResponse.content[0]) return res.json({ error: 'API 응답 없음' });

    let text = apiResponse.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'JSON 파싱 실패' });

    const result = JSON.parse(jsonMatch[0]);
    result.items = result.items.map(item => {
      item.wiheomsung = item.ganeungsung * item.jungdaesung;
      item.bigo = item.wiheomsung >= 9 ? '허용불가위험' : item.wiheomsung >= 6 ? '중대한위험' : '';
      return item;
    });
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
