export const config = {
  runtime: 'edge',
};

export default async function handler(req) {
  const url = new URL(req.url);
  
  // Формируем целевой URL к серверам NVIDIA
  const targetUrl = new URL(url.pathname + url.search, 'https://integrate.api.nvidia.com');

  // Клонируем заголовки и удаляем заголовок host, чтобы NVIDIA не отвергла запрос
  const headers = new Headers(req.headers);
  headers.delete('host');

  return fetch(targetUrl, {
    method: req.method,
    headers: headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    redirect: 'follow',
  });
}