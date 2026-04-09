const https = require('https');

function callClaude(messages) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      system: '당신은 건설 현장 안전 법률 전문가입니다. 한국 건설 현장의 안전사고와 관련된 법령, 판례, 대처방법을 전문적으로 분석합니다.',
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

  const { situation } = req.body || {};
  if (!situation) return res.status(400).json({ error: '상황 설명이 필요합니다' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API 키 미설정' });

  try {
    const raw = await callClaude([{
      role: 'user',
      content: `다음 건설 현장 상황을 분석해주세요: "${situation}"\n\n다음 항목별로 분석 결과를 작성해주세요:\n1. 상황요약\n2. 심각도 (낮음/중간/높음/매우높음 중 하나)\n3. 관련법령 (법령명과 핵심 내용)\n4. 즉각대처방법 (번호 목록)\n5. 사업주의무사항 (번호 목록)\n6. 위반시처벌\n7. 재발방지대책 (번호 목록)`
    }]);

    const apiResponse = JSON.parse(raw);
    
    if (!apiResponse.content || !apiResponse.content[0]) {
      return res.json({ error: 'API 응답 없음' });
    }

    const text = apiResponse.content[0].text;
    
    // 텍스트를 파싱해서 구조화
    const result = parseAnalysis(text, situation);
    
    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

function parseAnalysis(text, situation) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    summary: '',
    severity: '높음',
    laws: [],
    immediate_actions: [],
    owner_obligations: [],
    penalties: '',
    prevention: []
  };

  let currentSection = '';
  
  for (const line of lines) {
    const lower = line.toLowerCase();
    
    if (line.includes('상황요약') || line.includes('1.')) {
      currentSection = 'summary';
      const content = line.replace(/^[\d.]\s*상황요약[:\s]*/,'').replace(/^1\.\s*/,'').trim();
      if (content) result.summary = content;
    } else if (line.includes('심각도') || line.includes('2.')) {
      currentSection = 'severity';
      if (line.includes('매우높음') || line.includes('매우 높음')) result.severity = '매우높음';
      else if (line.includes('높음')) result.severity = '높음';
      else if (line.includes('중간')) result.severity = '중간';
      else if (line.includes('낮음')) result.severity = '낮음';
    } else if (line.includes('관련법령') || line.includes('3.')) {
      currentSection = 'laws';
    } else if (line.includes('즉각대처') || line.includes('즉각 대처') || line.includes('4.')) {
      currentSection = 'immediate';
    } else if (line.includes('사업주의무') || line.includes('사업주 의무') || line.includes('5.')) {
      currentSection = 'obligations';
    } else if (line.includes('위반시처벌') || line.includes('위반 시 처벌') || line.includes('6.')) {
      currentSection = 'penalties';
      const content = line.replace(/^[\d.]\s*위반.*처벌[:\s]*/,'').trim();
      if (content) result.penalties = content;
    } else if (line.includes('재발방지') || line.includes('재발 방지') || line.includes('7.')) {
      currentSection = 'prevention';
    } else {
      // 섹션 내용 추가
      const cleanLine = line.replace(/^[-•\d.]\s*/, '').trim();
      if (!cleanLine) continue;
      
      if (currentSection === 'summary' && !result.summary) {
        result.summary = cleanLine;
      } else if (currentSection === 'laws') {
        if (cleanLine.length > 5) {
          result.laws.push({ name: cleanLine.slice(0, 30), article: '', content: cleanLine });
        }
      } else if (currentSection === 'immediate') {
        if (cleanLine.length > 2) result.immediate_actions.push(cleanLine);
      } else if (currentSection === 'obligations') {
        if (cleanLine.length > 2) result.owner_obligations.push(cleanLine);
      } else if (currentSection === 'penalties' && !result.penalties) {
        result.penalties = cleanLine;
      } else if (currentSection === 'prevention') {
        if (cleanLine.length > 2) result.prevention.push(cleanLine);
      }
    }
  }

  // 기본값 설정
  if (!result.summary) result.summary = situation + ' 상황에 대한 안전 법률 분석 결과입니다.';
  if (!result.immediate_actions.length) result.immediate_actions = ['119 신고 및 응급처치', '작업 즉시 중단', '현장 보존 및 증거 확보', '고용노동부 보고'];
  if (!result.owner_obligations.length) result.owner_obligations = ['재해 원인 조사 실시', '재발 방지 대책 수립', '안전보건관리책임자 보고'];
  if (!result.penalties) result.penalties = '산업안전보건법 위반 시 5년 이하 징역 또는 5천만원 이하 벌금';
  if (!result.prevention.length) result.prevention = ['안전교육 정기 실시', '안전장비 착용 의무화', '현장 안전점검 강화'];

  return result;
}
