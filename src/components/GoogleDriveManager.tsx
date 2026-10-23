import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  initAuth,
  googleSignIn,
  googleSignOut,
  getAccessToken
} from '../services/firebaseAuth';
import {
  listStudyFiles,
  saveStudyDocumentToDrive,
  deleteDriveFile,
  fetchFileContent,
  DriveFileItem
} from '../services/googleDriveService';
import { GoogleSignInButton } from './GoogleSignInButton';
import { ConfirmModal } from './ConfirmModal';
import {
  Cloud,
  FolderOpen,
  ExternalLink,
  Trash2,
  RefreshCw,
  FileText,
  LogOut,
  CheckCircle,
  AlertCircle,
  Download,
  Upload
} from 'lucide-react';

interface GoogleDriveManagerProps {
  onImportContent?: (title: string, content: string, type: 'reading' | 'writing') => void;
}

export const GoogleDriveManager: React.FC<GoogleDriveManagerProps> = ({ onImportContent }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [files, setFiles] = useState<DriveFileItem[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal xác nhận xóa file
  const [fileToDelete, setFileToDelete] = useState<DriveFileItem | null>(null);

  // Khởi tạo Auth listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        if (currentToken) {
          loadFiles();
        }
      },
      () => {
        setUser(null);
        setToken(null);
        setFiles([]);
      }
    );

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setErrorMsg(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setUser(res.user);
        setToken(res.accessToken);
        setSuccessMsg('Đã kết nối Google Drive (Phạm vi tối thiểu drive.file — Chỉ tệp do bạn tạo trên ứng dụng)!');
        setTimeout(() => setSuccessMsg(null), 3500);
        await loadFiles();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Đăng nhập Google thất bại.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await googleSignOut();
      setUser(null);
      setToken(null);
      setFiles([]);
      setSuccessMsg('Đã đăng xuất Google Drive.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg('Lỗi đăng xuất: ' + err.message);
    }
  };

  const loadFiles = async () => {
    setIsLoadingFiles(true);
    setErrorMsg(null);
    try {
      const fileList = await listStudyFiles();
      setFiles(fileList);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Không thể tải danh sách tệp từ Google Drive.');
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // Xác nhận xóa tệp
  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    try {
      await deleteDriveFile(fileToDelete.id);
      setSuccessMsg(`Đã xóa tệp "${fileToDelete.name}" trên Google Drive.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      setFileToDelete(null);
      await loadFiles();
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể xóa tệp trên Google Drive.');
      setFileToDelete(null);
    }
  };

  // Đọc nội dung và nhập vào ứng dụng
  const handleImportFile = async (file: DriveFileItem) => {
    try {
      const content = await fetchFileContent(file.id, file.mimeType);
      if (onImportContent) {
        const isReading = file.name.toLowerCase().includes('doc-hieu') || file.name.toLowerCase().includes('reading');
        onImportContent(file.name.replace('.txt', ''), content, isReading ? 'reading' : 'writing');
        setSuccessMsg(`Đã nhập nội dung "${file.name}" vào trình soạn thảo!`);
        setTimeout(() => setSuccessMsg(null), 3500);
      }
    } catch (err: any) {
      setErrorMsg('Không thể đọc tệp: ' + err.message);
    }
  };

  return (
    <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-xs space-y-6">
      {/* Header khu vực Drive */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-base text-[#0F172A] flex items-center gap-2">
              <span>Đồng bộ & Lưu trữ Google Drive</span>
              {user && (
                <span className="text-[11px] font-medium text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                  Đã kết nối
                </span>
              )}
            </h3>
            <p className="text-xs text-stone-500">
              Tự động lưu bài làm và nhật ký tự sửa vào thư mục "VănAI 12 - Ôn thi THPT" trên Google Drive cá nhân của bạn.
            </p>
          </div>
        </div>

        <div>
          {!user ? (
            <GoogleSignInButton onClick={handleLogin} isLoading={isLoggingIn} />
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-stone-800">{user.displayName || 'Học sinh'}</div>
                <div className="text-[11px] text-stone-500">{user.email}</div>
              </div>
              {user.photoURL && (
                <img
                  src={user.photoURL}
                  alt={user.displayName || 'Avatar'}
                  className="w-8 h-8 rounded-full border border-stone-200 object-cover"
                />
              )}
              <button
                onClick={handleLogout}
                className="p-2 text-stone-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors title='Đăng xuất Google Drive'"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Thông báo trạng thái */}
      {successMsg && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-900 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Danh sách tệp từ Drive khi đã đăng nhập */}
      {user ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-stone-600">
            <span className="font-semibold text-stone-800 flex items-center gap-1.5">
              <FolderOpen className="w-4 h-4 text-amber-600" />
              <span>Thư mục: VănAI 12 - Ôn thi THPT ({files.length} tệp)</span>
            </span>
            <button
              onClick={loadFiles}
              disabled={isLoadingFiles}
              className="flex items-center gap-1 text-stone-600 hover:text-stone-900 px-2 py-1 rounded hover:bg-stone-100"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingFiles ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>
          </div>

          {isLoadingFiles ? (
            <div className="py-8 text-center text-xs text-stone-500">
              Đang tải danh sách tài liệu từ Google Drive...
            </div>
          ) : files.length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-stone-50 border border-dashed border-stone-200 text-xs text-stone-500 space-y-2">
              <FileText className="w-8 h-8 text-stone-400 mx-auto" />
              <p>Chưa có tệp ôn thi nào được lưu trên Google Drive.</p>
              <p className="text-[11px] text-stone-400">
                Hãy hoàn thành một bài đọc hiểu hoặc bài viết nghị luận rồi nhấn nút "Lưu lên Google Drive".
              </p>
            </div>
          ) : (
            <div className="divide-y divide-stone-100 border border-stone-200 rounded-xl overflow-hidden">
              {files.map((file) => (
                <div
                  key={file.id}
                  className="p-3.5 bg-white hover:bg-stone-50 flex items-center justify-between gap-4 transition-colors text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-stone-800 truncate">{file.name}</div>
                      <div className="text-[11px] text-stone-500">
                        Cập nhật: {new Date(file.modifiedTime).toLocaleString('vi-VN')}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {onImportContent && (
                      <button
                        onClick={() => handleImportFile(file)}
                        className="px-2.5 py-1 text-xs text-stone-700 hover:bg-stone-200/60 rounded flex items-center gap-1 border border-stone-200"
                        title="Đọc nội dung tệp này vào ứng dụng"
                      >
                        <Download className="w-3 h-3 text-stone-600" />
                        <span className="hidden sm:inline">Mở lại</span>
                      </button>
                    )}

                    {file.webViewLink && (
                      <a
                        href={file.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="p-1.5 text-stone-500 hover:text-blue-700 hover:bg-blue-50 rounded"
                        title="Mở trên Google Drive"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}

                    <button
                      onClick={() => setFileToDelete(file)}
                      className="p-1.5 text-stone-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      title="Xóa tệp khỏi Google Drive"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="p-5 rounded-xl bg-blue-50/60 border border-blue-200/80 text-xs text-blue-950 space-y-2">
          <div className="font-bold flex items-center gap-1.5 text-blue-900">
            <Cloud className="w-4 h-4 text-blue-700" />
            <span>Lợi ích khi kết nối Google Drive:</span>
          </div>
          <ul className="space-y-1 list-disc pl-5 text-stone-700 leading-relaxed">
            <li>Lưu trữ vĩnh viễn bài đọc hiểu và bài viết nghị luận mà không lo mất dữ liệu khi đóng trình duyệt.</li>
            <li>Dễ dàng mở lại và xem trên điện thoại hoặc máy tính khác thông qua tài khoản Google Drive của bạn.</li>
            <li>Bài làm được phân loại gọn gàng trong thư mục riêng <strong>"VănAI 12 - Ôn thi THPT"</strong>.</li>
          </ul>
        </div>
      )}

      {/* Modal xác nhận xóa bắt buộc theo tiêu chuẩn Destructive Actions */}
      {fileToDelete && (
        <ConfirmModal
          isOpen={!!fileToDelete}
          title="Xác nhận xóa tệp trên Google Drive"
          message="Bạn có chắc chắn muốn xóa tệp này khỏi Google Drive không? Thao tác này sẽ xóa tệp vĩnh viễn và không thể hoàn tác."
          itemName={fileToDelete?.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setFileToDelete(null)}
        />
      )}
    </div>
  );
};
