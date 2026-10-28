import handler from '../index.js';

export default async function bootstrapAdminHandler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    req.url = '/api/auth/bootstrap-admin';
    return await handler(req, res);
  } catch (err) {
    console.error('[Vercel API /api/auth/bootstrap-admin Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          errorCategory: 'ENDPOINT_ERROR',
          message: err?.message || 'Lỗi khởi tạo quyền Quản trị viên trên máy chủ.'
        })
      );
    }
  }
}
