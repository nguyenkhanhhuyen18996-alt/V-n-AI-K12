import {
  getAccessToken,
  clearExpiredAccessToken,
  getGoogleConnectedProfile
} from './firebaseAuth';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  webViewLink?: string;
  ownerEmail?: string;
}

export type GoogleWorkspaceErrorCode =
  | 'NOT_AUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'INSUFFICIENT_PERMISSION'
  | 'OWNER_MISMATCH'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'API_ERROR';

export class GoogleWorkspaceApiError extends Error {
  public readonly code: GoogleWorkspaceErrorCode;
  public readonly status?: number;

  constructor(code: GoogleWorkspaceErrorCode, message: string, status?: number) {
    super(message);
    this.name = 'GoogleWorkspaceApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Phân tích lỗi trả về từ Google Drive / Docs API và tạo thông báo tiếng Việt rõ ràng
 * cho học sinh / giáo viên (hết hạn token 401, thiếu quyền drive.file 403, sai chủ sở hữu, mất mạng...).
 */
export async function parseGoogleApiError(
  response: Response,
  actionLabel: string,
  expectedOwnerAccount?: string
): Promise<GoogleWorkspaceApiError> {
  const status = response.status;
  let rawMessage = response.statusText || '';
  let reason = '';

  try {
    const errJson = await response.json();
    rawMessage = errJson?.error?.message || rawMessage;
    reason = errJson?.error?.errors?.[0]?.reason || errJson?.error?.status || '';
  } catch {
    // Ignore JSON parse failure
  }

  if (status === 401) {
    // Xóa token hết hạn trong bộ nhớ để giao diện yêu cầu đăng nhập / làm mới phiên
    clearExpiredAccessToken();
    return new GoogleWorkspaceApiError(
      'TOKEN_EXPIRED',
      `Phiên uỷ quyền Google OAuth đã hết hạn (Mã 401) khi ${actionLabel}. Vui lòng nhấn "Kết nối / Cấp lại quyền Google" để nhận token mới.`,
      401
    );
  }

  if (status === 403) {
    const profile = getGoogleConnectedProfile();
    if (
      expectedOwnerAccount &&
      profile?.email &&
      profile.email.toLowerCase() !== expectedOwnerAccount.toLowerCase()
    ) {
      return new GoogleWorkspaceApiError(
        'OWNER_MISMATCH',
        `Từ chối truy cập (403): Tài khoản Google hiện tại (${profile.email}) không phải tài khoản chủ sở hữu đã tạo tài liệu (${expectedOwnerAccount}). Vui lòng chuyển sang đúng tài khoản chủ sở hữu.`,
        403
      );
    }

    if (
      reason.toLowerCase().includes('insufficientpermissions') ||
      rawMessage.toLowerCase().includes('insufficient authentication scopes')
    ) {
      clearExpiredAccessToken();
      return new GoogleWorkspaceApiError(
        'INSUFFICIENT_PERMISSION',
        `Thiếu quyền OAuth tối thiểu (Mã 403) khi ${actionLabel}: Ứng dụng cần phạm vi "https://www.googleapis.com/auth/drive.file" để thao tác trên tệp do chính bạn tạo. Vui lòng kết nối lại và tích chọn cấp quyền tệp ứng dụng.`,
        403
      );
    }

    return new GoogleWorkspaceApiError(
      'INSUFFICIENT_PERMISSION',
      `Không có quyền truy cập tệp (Mã 403) khi ${actionLabel}: Với phạm vi bảo mật tối thiểu "drive.file" (không chia sẻ công khai), ứng dụng chỉ mở được tài liệu do chính tài khoản Google của bạn tạo trên VănAI 12${
        expectedOwnerAccount ? ` (Chủ sở hữu: ${expectedOwnerAccount})` : ''
      }. Chi tiết: ${rawMessage}`,
      403
    );
  }

  if (status === 404) {
    return new GoogleWorkspaceApiError(
      'NOT_FOUND',
      `Không tìm thấy tài liệu (Mã 404) khi ${actionLabel}: Tài liệu có thể đã bị xóa khỏi Google Drive hoặc thuộc về tài khoản Google khác.`,
      404
    );
  }

  if (status === 429) {
    return new GoogleWorkspaceApiError(
      'RATE_LIMITED',
      `Quá giới hạn yêu cầu Google API (Mã 429) khi ${actionLabel}. Vui lòng đợi khoảng 15–30 giây rồi thử lại.`,
      429
    );
  }

  return new GoogleWorkspaceApiError(
    'API_ERROR',
    `Lỗi Google API (${status}) khi ${actionLabel}: ${rawMessage || 'Không thể hoàn tất yêu cầu.'}`,
    status
  );
}

/**
 * Kiểm tra và trả về OAuth accessToken hợp lệ; nếu chưa có hoặc đã hết hạn sau khi tải lại trang,
 * ném lỗi có cấu trúc rõ ràng.
 */
export async function requireValidGoogleAccessToken(actionLabel: string): Promise<string> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      `Đang mất kết nối mạng khi ${actionLabel}. Vui lòng kiểm tra Internet trước khi đồng bộ Google Docs / Drive.`
    );
  }

  const token = await getAccessToken();
  const profile = getGoogleConnectedProfile();

  if (!token) {
    if (profile?.email) {
      throw new GoogleWorkspaceApiError(
        'TOKEN_EXPIRED',
        `Phiên làm việc của tài khoản Google (${profile.email}) cần cấp lại mã truy cập OAuth sau khi tải lại trang để ${actionLabel}. Vui lòng nhấn "Kết nối / Cấp lại quyền Google Docs".`
      );
    }
    throw new GoogleWorkspaceApiError(
      'NOT_AUTHENTICATED',
      `Chưa kết nối tài khoản Google OAuth để ${actionLabel}. Vui lòng nhấn "Kết nối Google Docs" (chỉ yêu cầu quyền tối thiểu drive.file trên tệp của bạn).`
    );
  }

  return token;
}

/**
 * Tìm hoặc tạo thư mục 'VănAI 12 - Ôn thi THPT' trên Google Drive của chính học sinh
 * (Hoạt động hoàn toàn với phạm vi tối thiểu https://www.googleapis.com/auth/drive.file, không chia sẻ công khai)
 */
export async function getOrCreateVanAIFolder(): Promise<string | null> {
  const token = await requireValidGoogleAccessToken('khởi tạo thư mục học tập VănAI 12');

  const folderName = 'VănAI 12 - Ôn thi THPT';
  const query = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${folderName}' and trashed=false`
  );

  let searchRes: Response;
  try {
    searchRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Không thể kết nối tới máy chủ Google Drive API. Vui lòng kiểm tra kết nối mạng.'
    );
  }

  if (!searchRes.ok) {
    throw await parseGoogleApiError(searchRes, 'tìm thư mục VănAI 12 trên Google Drive');
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Tạo thư mục riêng tư cho học sinh (mặc định private, tuyệt đối không tạo quyền public)
  let createRes: Response;
  try {
    createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Thư mục lưu trữ riêng tư bài làm từ ứng dụng VănAI 12 (Phạm vi tối thiểu drive.file)'
      })
    });
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Mất kết nối mạng khi tạo thư mục lưu trữ trên Google Drive.'
    );
  }

  if (!createRes.ok) {
    throw await parseGoogleApiError(createRes, 'tạo thư mục VănAI 12 trên Google Drive');
  }

  const newFolder = await createRes.json();
  return newFolder.id;
}

/**
 * Liệt kê danh sách các tài liệu học tập do chính học sinh tạo qua ứng dụng (phạm vi drive.file)
 */
export async function listStudyFiles(): Promise<DriveFileItem[]> {
  const token = await requireValidGoogleAccessToken('liệt kê tài liệu học tập của bạn');

  // Với phạm vi tối thiểu drive.file, API chỉ trả về các tệp do chính ứng dụng VănAI 12 tạo ra
  const query = encodeURIComponent(
    "trashed=false and mimeType != 'application/vnd.google-apps.folder'"
  );
  const url = `https://www.googleapis.com/drive/v3/files?q=${query}&orderBy=modifiedTime desc&fields=files(id,name,mimeType,modifiedTime,size,webViewLink,owners(emailAddress))`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Lỗi mạng khi tải danh sách tệp từ Google Drive.'
    );
  }

  if (!response.ok) {
    throw await parseGoogleApiError(response, 'tải danh sách tài liệu học tập');
  }

  const data = await response.json();
  return (data.files || []).map((f: any) => ({
    id: f.id,
    name: f.name,
    mimeType: f.mimeType,
    modifiedTime: f.modifiedTime,
    size: f.size,
    webViewLink: f.webViewLink || `https://docs.google.com/document/d/${f.id}/edit`,
    ownerEmail: f.owners?.[0]?.emailAddress || undefined
  }));
}

/**
 * Lưu bài học (Đọc hiểu hoặc Bài viết) lên Google Drive (riêng tư, phạm vi drive.file)
 */
export async function saveStudyDocumentToDrive(
  filename: string,
  content: string,
  metadataDescription: string = 'Tài liệu ôn thi Ngữ văn 12 từ VănAI'
): Promise<DriveFileItem> {
  const token = await requireValidGoogleAccessToken('lưu tài liệu học tập lên Google Drive');

  const folderId = await getOrCreateVanAIFolder().catch(() => null);

  const fileMetadata: Record<string, any> = {
    name: filename.endsWith('.txt') ? filename : `${filename}.txt`,
    mimeType: 'text/plain',
    description: metadataDescription
  };

  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(fileMetadata) +
    delimiter +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    content +
    closeDelimiter;

  let response: Response;
  try {
    response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        },
        body: multipartRequestBody
      }
    );
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Mất kết nối mạng khi tải tệp lên Google Drive.'
    );
  }

  if (!response.ok) {
    throw await parseGoogleApiError(response, 'tải tệp lên Google Drive');
  }

  return await response.json();
}

/**
 * Đọc nội dung tệp từ Google Drive (Hỗ trợ cả Google Docs export và tệp text/plain trong phạm vi drive.file)
 */
export async function fetchFileContent(fileId: string, mimeType?: string): Promise<string> {
  const token = await requireValidGoogleAccessToken('đọc nội dung tài liệu từ Google Drive');

  const isGoogleDoc = mimeType === 'application/vnd.google-apps.document';
  const endpoint = isGoogleDoc
    ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`
    : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Lỗi kết nối mạng khi đọc nội dung tệp từ Google Drive.'
    );
  }

  if (!response.ok) {
    throw await parseGoogleApiError(response, 'đọc nội dung tệp trên Google Drive');
  }

  return await response.text();
}

/**
 * Xóa tệp do ứng dụng tạo trên Google Drive (Phải có hộp thoại xác nhận trước khi gọi hàm này)
 */
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await requireValidGoogleAccessToken('xóa tệp trên Google Drive');

  let response: Response;
  try {
    response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      }
    );
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Mất kết nối mạng khi thực hiện xóa tệp trên Google Drive.'
    );
  }

  if (!response.ok && response.status !== 204) {
    throw await parseGoogleApiError(response, 'xóa tệp trên Google Drive');
  }
}
