import { getGoogleConnectedProfile } from './firebaseAuth';
import {
  getOrCreateVanAIFolder,
  requireValidGoogleAccessToken,
  parseGoogleApiError,
  GoogleWorkspaceApiError
} from './googleDriveService';

export interface GoogleDocCreationResult {
  docId: string;
  docUrl: string;
  name: string;
  taskId: string;
  studentUid: string;
  ownerAccount: string;
  ownerGoogleUid: string;
  ownerDisplayName: string;
  createdAt: string;
}

export interface GoogleDocImportResult {
  content: string;
  docId: string;
  docName: string;
  docUrl: string;
  ownerAccount: string;
  modifiedTime?: string;
}

/**
 * Tạo một tài liệu Google Docs mới của chính học sinh cho nhiệm vụ viết bài.
 * - Chỉ sử dụng phạm vi OAuth tối thiểu: https://www.googleapis.com/auth/drive.file
 * - Tài liệu thuộc quyền sở hữu riêng tư của tài khoản Google học sinh (Tuyệt đối KHÔNG chia sẻ công khai)
 * - Trả về đầy đủ docId, liên kết (docUrl), tài khoản chủ sở hữu (ownerAccount) và mã nhiệm vụ (taskId)
 */
export async function createWritingGoogleDoc(
  taskId: string,
  promptTitle: string,
  promptText: string,
  typeLabel: string,
  currentDraftText: string = '',
  studentUid: string = ''
): Promise<GoogleDocCreationResult> {
  const token = await requireValidGoogleAccessToken('tạo tài liệu Google Docs cho bài viết');
  const googleProfile = getGoogleConnectedProfile();

  const sanitizedTitle = promptTitle.replace(/[/\\?%*:|"<>]/g, '').trim().slice(0, 35);
  const docName = `VănAI 12 - ${sanitizedTitle} - [${taskId}]`;

  const folderId = await getOrCreateVanAIFolder().catch(() => null);

  const fileMetadata: Record<string, any> = {
    name: docName,
    mimeType: 'application/vnd.google-apps.document',
    description: `Nhiệm vụ viết VănAI 12 - Mã nhiệm vụ: ${taskId} - Học sinh UID: ${studentUid}`
  };

  if (folderId) {
    fileMetadata.parents = [folderId];
  }

  const initialDocBody = `======================================================================
VĂNAI 12 – TRỢ LÝ ĐỌC HIỂU & VIẾT THPT
Mã nhiệm vụ: ${taskId}
Dạng bài: ${typeLabel}
Đề bài: ${promptTitle}
----------------------------------------------------------------------
YÊU CẦU ĐỀ BÀI:
${promptText}
======================================================================
[KHU VỰC SOẠN BÀI LÀM CỦA HỌC SINH - Bắt đầu viết từ dòng dưới đây]

${currentDraftText ? currentDraftText : ''}
`;

  const boundary = '-------docboundary3141592653589';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(fileMetadata) +
    delimiter +
    'Content-Type: text/plain; charset=UTF-8\r\n\r\n' +
    initialDocBody +
    closeDelimiter;

  let response: Response;
  try {
    response = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,owners(emailAddress,displayName)',
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
      'Mất kết nối mạng khi tạo tài liệu Google Docs. Vui lòng kiểm tra kết nối Internet và thử lại.'
    );
  }

  if (!response.ok) {
    throw await parseGoogleApiError(response, 'tạo tài liệu Google Docs mới');
  }

  const result = await response.json();
  if (!result || !result.id) {
    throw new GoogleWorkspaceApiError(
      'API_ERROR',
      'Google Drive API không trả về mã tài liệu (docId) hợp lệ.'
    );
  }

  const docUrl = result.webViewLink || `https://docs.google.com/document/d/${result.id}/edit`;
  const ownerEmailFromApi = result.owners?.[0]?.emailAddress || '';
  const ownerDisplayFromApi = result.owners?.[0]?.displayName || '';

  const ownerAccount =
    ownerEmailFromApi ||
    googleProfile?.email ||
    googleProfile?.uid ||
    studentUid ||
    'Tài khoản Google chủ sở hữu';

  return {
    docId: result.id,
    docUrl,
    name: result.name || docName,
    taskId,
    studentUid,
    ownerAccount,
    ownerGoogleUid: googleProfile?.uid || '',
    ownerDisplayName: ownerDisplayFromApi || googleProfile?.displayName || ownerAccount,
    createdAt: new Date().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    })
  };
}

/**
 * Đọc nội dung mới nhất từ tài liệu Google Docs của chính học sinh (qua phạm vi tối thiểu drive.file).
 * - Kiểm tra chặt chẽ token hết hạn (401), thiếu quyền (403), sai tài khoản chủ sở hữu hoặc lỗi mạng.
 * - Không bao giờ tự ý ghi đè bản nháp; trả về dữ liệu để hiển thị hộp thoại Xem trước & Xác nhận.
 */
export async function importLatestFromGoogleDoc(
  docId: string,
  expectedOwnerAccount?: string
): Promise<GoogleDocImportResult> {
  if (!docId || !docId.trim()) {
    throw new GoogleWorkspaceApiError(
      'NOT_FOUND',
      'Mã tài liệu Google Docs (docId) không hợp lệ hoặc bị trống.'
    );
  }

  const token = await requireValidGoogleAccessToken(
    `đọc nội dung mới nhất từ Google Docs (Mã: ${docId.slice(0, 12)}...)`
  );
  const googleProfile = getGoogleConnectedProfile();

  // Kiểm tra nếu tài khoản Google hiện tại khác với tài khoản chủ sở hữu đã lưu trong hồ sơ
  if (
    expectedOwnerAccount &&
    expectedOwnerAccount.includes('@') &&
    googleProfile?.email &&
    googleProfile.email.toLowerCase() !== expectedOwnerAccount.toLowerCase()
  ) {
    throw new GoogleWorkspaceApiError(
      'OWNER_MISMATCH',
      `Tài khoản Google đang kết nối (${googleProfile.email}) không khớp với tài khoản chủ sở hữu của tài liệu này (${expectedOwnerAccount}). Với phạm vi bảo mật tối thiểu "drive.file" (không chia sẻ công khai), vui lòng chuyển sang đúng tài khoản Google chủ sở hữu (${expectedOwnerAccount}) để đọc và đồng bộ.`
    );
  }

  // Bước 1: Kiểm tra metadata của tệp (tên, chủ sở hữu, link) qua drive.file
  let docName = `Google Docs (${docId.slice(0, 10)}...)`;
  let docUrl = `https://docs.google.com/document/d/${docId}/edit`;
  let ownerAccount = expectedOwnerAccount || googleProfile?.email || '';
  let modifiedTime: string | undefined;

  try {
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
        docId
      )}?fields=id,name,webViewLink,modifiedTime,owners(emailAddress,displayName)`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    );

    if (!metaRes.ok) {
      throw await parseGoogleApiError(
        metaRes,
        'kiểm tra quyền sở hữu tài liệu Google Docs',
        expectedOwnerAccount
      );
    }

    const metaJson = await metaRes.json();
    if (metaJson?.name) docName = metaJson.name;
    if (metaJson?.webViewLink) docUrl = metaJson.webViewLink;
    if (metaJson?.modifiedTime) modifiedTime = metaJson.modifiedTime;
    if (metaJson?.owners?.[0]?.emailAddress) {
      ownerAccount = metaJson.owners[0].emailAddress;
    }
  } catch (err) {
    if (err instanceof GoogleWorkspaceApiError) {
      throw err;
    }
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Không thể kết nối tới Google Docs API để kiểm tra tài liệu. Vui lòng kiểm tra mạng Internet.'
    );
  }

  // Bước 2: Xuất nội dung văn bản mới nhất từ Google Docs sang text/plain
  const exportUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(
    docId
  )}/export?mimeType=text/plain`;

  let exportRes: Response;
  try {
    exportRes = await fetch(exportUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {
    throw new GoogleWorkspaceApiError(
      'NETWORK_ERROR',
      'Mất kết nối mạng khi tải nội dung văn bản từ Google Docs.'
    );
  }

  if (!exportRes.ok) {
    throw await parseGoogleApiError(
      exportRes,
      'đọc nội dung mới nhất từ Google Docs',
      expectedOwnerAccount
    );
  }

  const rawText = await exportRes.text();

  // Tách bỏ phần tiêu đề hướng dẫn (nếu học sinh giữ nguyên cấu trúc mẫu)
  const marker = '[KHU VỰC SOẠN BÀI LÀM CỦA HỌC SINH - Bắt đầu viết từ dòng dưới đây]';
  let extractedContent = rawText.trim();
  if (rawText.includes(marker)) {
    const splitParts = rawText.split(marker);
    if (splitParts.length > 1) {
      extractedContent = splitParts[1].trim();
    }
  }

  return {
    content: extractedContent,
    docId,
    docName,
    docUrl,
    ownerAccount,
    modifiedTime
  };
}
