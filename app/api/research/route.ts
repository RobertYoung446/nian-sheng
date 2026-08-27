import { getChatGPTUser } from '../../chatgpt-auth';

function decodeXml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: '请先登录' }, { status: 401 });
  const query = new URL(request.url).searchParams.get('q')?.slice(0,120);
  if (!query) return Response.json({ items: [] });
  try {
    const response = await fetch(`https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`, { headers: { 'User-Agent': 'Niansheng/1.0' } });
    const xml = await response.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0,5).map((match) => {
      const block = match[1];
      const take = (tag: string) => decodeXml(block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '');
      return { title: take('title'), url: take('link'), date: take('pubDate'), source: take('source') || '公开资讯' };
    }).filter(item => item.title && item.url);
    return Response.json({ items });
  } catch {
    return Response.json({ items: [], error: '暂时无法获取外部资讯，请稍后重试。' });
  }
}
