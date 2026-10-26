import type { Request, Response } from 'express';
import { apiApp } from '../server';

export default function handler(req: Request, res: Response) {
  try {
    // Chuẩn hóa đường dẫn trên Vercel Serverless khi qua rewrite (/api/:path* -> /api)
    const rawUrl = String(req.url || '/');
    const queryPath = (req as any).query?.path;

    if (
      (rawUrl === '/api' || rawUrl.startsWith('/api?')) &&
      queryPath &&
      (typeof queryPath === 'string' || Array.isArray(queryPath))
    ) {
      const joinedPath = Array.isArray(queryPath) ? queryPath.join('/') : queryPath;
      const cleanSubPath = joinedPath.replace(/^\/+/, '');
      const urlParts = rawUrl.split('?');
      const searchParams = new URLSearchParams(urlParts[1] || '');
      searchParams.delete('path');
      const qs = searchParams.toString();
      req.url = `/api/${cleanSubPath}${qs ? `?${qs}` : ''}`;
    } else if (!rawUrl.startsWith('/api/') && rawUrl !== '/api' && !rawUrl.startsWith('/api?')) {
      req.url = `/api${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    }

    return apiApp(req, res);
  } catch (err: any) {
    console.error('[Vercel Serverless API Error]:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          success: false,
          errorCategory: 'ENDPOINT_ERROR',
          error: err?.message || 'Lỗi thực thi Serverless Function trên máy chủ.'
        })
      );
    }
  }
}
