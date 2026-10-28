import handler from '../index.js';

export default async function googleMatchHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    req.url = '/api/auth/google-match';
    return await handler(req, res);
  } catch (err) {
    console.error('[Vercel API /api/auth/google-match Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          matched: false,
          errorCategory: 'ENDPOINT_ERROR',
          message: err?.message || 'Lỗi xác thực Firebase ID Token trên máy chủ.'
        })
      );
    }
  }
}
