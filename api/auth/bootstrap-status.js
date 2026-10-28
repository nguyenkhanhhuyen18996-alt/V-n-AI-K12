import handler from '../index.js';

export default async function bootstrapStatusHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    req.url = '/api/auth/bootstrap-status';
    return await handler(req, res);
  } catch (err) {
    console.error('[Vercel API /api/auth/bootstrap-status Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          status: 'error',
          errorCategory: 'ENDPOINT_ERROR',
          message: err?.message || 'Lỗi kiểm tra cấu hình Quản trị viên trên máy chủ.'
        })
      );
    }
  }
}
