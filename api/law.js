const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'Referer': 'https://www.law.go.kr/'
      }
    };
    https.get(url, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    }).on('error', e => reject(e));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const OC = process.env.LAW_API_KEY;
  if (!OC) {
    return res.json({ error: 'API_KEY_MISSING' });
  }

  const { target, query, mst, id } = req.query;

  let url;
  if (mst) {
    url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=law&MST=${mst}&type=JSON`;
  } else if (id) {
    url = `https://www.law.go.kr/DRF/lawService.do?OC=${OC}&target=prec&ID=${id}&type=JSON`;
  } else {
    const t = target || 'law';
    const q = encodeURIComponent(query || '');
    url = `https://www.law.go.kr/DRF/lawSearch.do?OC=${OC}&target=${t}&type=JSON&query=${q}&display=8`;
  }

  try {
    const data = await httpsGet(url);
    res.send(data);
  } catch (e) {
    res.json({ error: 'FETCH_FAILED', message: e.message });
  }
};
