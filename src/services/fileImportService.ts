import mammoth from 'mammoth';

export interface FileImportResult {
  success: boolean;
  text?: string;
  wordCount?: number;
  fileName?: string;
  fileSizeFormatted?: string;
  mimeType?: string;
  base64Data?: string;
  isMultimodalFile?: boolean;
  errorMessage?: string;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export async function parseUploadedFile(file: File): Promise<FileImportResult> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  const fileSizeKB = (file.size / 1024).toFixed(1) + ' KB';

  // Giới hạn kích thước tệp 15MB
  if (file.size > 15 * 1024 * 1024) {
    return {
      success: false,
      errorMessage: 'Kích thước tệp quá lớn (vượt quá 15MB). Vui lòng chọn tệp nhỏ hơn.'
    };
  }

  try {
    if (extension === 'txt') {
      const text = await file.text();
      const cleanText = text.trim();
      const words = cleanText ? cleanText.split(/\s+/).length : 0;

      return {
        success: true,
        text: cleanText,
        wordCount: words,
        fileName: file.name,
        fileSizeFormatted: fileSizeKB,
        mimeType: 'text/plain'
      };
    } else if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      const cleanText = result.value.trim();
      const words = cleanText ? cleanText.split(/\s+/).length : 0;

      if (!cleanText) {
        return {
          success: false,
          errorMessage:
            'Tệp .docx này không chứa văn bản thuần hoặc là ảnh quét dán vào Word. Vui lòng xuất sang PDF hoặc ảnh để AI nhận diện OCR.'
        };
      }

      return {
        success: true,
        text: cleanText,
        wordCount: words,
        fileName: file.name,
        fileSizeFormatted: fileSizeKB,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
    } else if (
      extension === 'pdf' ||
      extension === 'png' ||
      extension === 'jpg' ||
      extension === 'jpeg' ||
      extension === 'webp'
    ) {
      const arrayBuffer = await file.arrayBuffer();
      const base64Data = arrayBufferToBase64(arrayBuffer);
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp'
      };
      const mimeType = file.type || mimeMap[extension] || 'application/pdf';

      return {
        success: true,
        text: `[Tệp ${extension.toUpperCase()} — Đã sẵn sàng gửi tới Gemini AI để nhận diện văn bản gốc: ${file.name}]`,
        wordCount: 0,
        fileName: file.name,
        fileSizeFormatted: fileSizeKB,
        mimeType,
        base64Data,
        isMultimodalFile: true
      };
    } else {
      return {
        success: false,
        errorMessage: `Định dạng tệp ".${extension}" chưa được hỗ trợ. Hệ thống hỗ trợ .docx (Word), .pdf (PDF), .txt và ảnh chụp đề (.png, .jpg).`
      };
    }
  } catch (error: any) {
    return {
      success: false,
      errorMessage: 'Không thể đọc nội dung tệp: ' + (error.message || 'Lỗi xử lý tệp.')
    };
  }
}
