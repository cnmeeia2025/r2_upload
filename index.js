const express = require("express");
const multer = require("multer");
const {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");

// 加载环境变量
dotenv.config();

const app = express();
const upload = multer({
  limits: {
    fileSize: 50 * 5024 * 5024, 
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp", "image/mp4", "image/webm", "image/avif"];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("不支持的文件类型"));
    }
  },
});

// 配置 S3 客户端（用于 R2）
const s3Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// 文件上传接口
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "没有文件被上传" });
    }

    const file = req.file;
    const fileName = `${Date.now()}-${file.originalname}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await s3Client.send(command);

    const fileUrl = `https://${process.env.R2_PUBLIC_URL}/${fileName}`;

    res.json({
      message: "文件上传成功",
      fileName: fileName,
      fileUrl: fileUrl,
    });
  } catch (error) {
    console.error("上传错误:", error);
    res.status(500).json({ error: "文件上传失败" });
  }
});

// 获取文件列表接口
app.get("/list-files", async (req, res) => {
  try {
    // 添加缓存控制头
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 100, // 先获取更多文件
    });

    const response = await s3Client.send(command);
    const files = response.Contents || [];

    // 按时间倒序排序，最新的在前面
    const sortedFiles = files
      .sort((a, b) => {
        // 使用 getTime() 确保正确的时间比较
        const timeA = new Date(b.LastModified).getTime();
        const timeB = new Date(a.LastModified).getTime();
        return timeA - timeB;
      })
      .slice(0, 3) // 只取最新的3张
      .map((file) => ({
        name: file.Key,
        url: `https://${process.env.R2_PUBLIC_URL}/${file.Key}`,
        size: file.Size,
        lastModified: file.LastModified,
      }));

    console.log("获取的文件列表:", {
      total: files.length,
      sorted: sortedFiles.map((f) => ({
        name: f.name,
        lastModified: f.lastModified,
      })),
    });

    res.json(sortedFiles);
  } catch (error) {
    console.error("获取文件列表错误:", error);
    res.status(500).json({ error: "获取文件列表失败" });
  }
});

// 主页面路由
app.get("/", (req, res) => {
  const html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>R2 文件上传</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          html, body {
            height: 100%;
            overflow: hidden; /* 防止页面滚动 */
          }

          body {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 0; /* 移除内边距 */
          }

          .card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            width: 90%;
            max-width: 1200px;
            height: 90vh;
            margin: 0 auto;
            overflow: hidden;
            display: flex;
            flex-direction: column;
          }

          .upload-section {
            padding: 1.5rem; /* 减小上传区域的内边距 */
            border-bottom: 1px solid #edf2f7;
            text-align: center;
            flex-shrink: 0;
          }

          .upload-area {
            border: 2px dashed #cbd5e0;
            border-radius: 8px;
            padding: 2rem;
            margin: 1rem 0;
            cursor: pointer;
            transition: all 0.3s ease;
          }

          .upload-area:hover {
            border-color: #667eea;
            background: #f7fafc;
          }

          .upload-title {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 1.5rem;
          }

          .upload-text {
            color: #718096;
            margin: 0.5rem 0;
          }

          .gallery-section {
            padding: 1.5rem 1.5rem 2rem;
            background: #f7fafc;
            flex: 1;
            display: flex;
            flex-direction: column;
          }

          .gallery-title {
            color: #2d3748;
            margin-bottom: 1rem;
            font-size: 1.2rem;
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .gallery-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 25px;
            padding: 0.5rem 0.5rem 1rem;
            flex: 1;
            align-content: center; /* 居中显示网格内容 */
          }

          .gallery-item {
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 16/9;
            min-height: 160px;
            max-height: 260px; /* 进一步减小最大高度 */
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
            cursor: zoom-in;
            background: #f0f0f0;
            transform-origin: center;
          }

          .gallery-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            transition: all 0.4s cubic-bezier(0.165, 0.84, 0.44, 1);
          }

          .gallery-item:hover {
            transform: scale(1.08);
            box-shadow: 0 12px 30px rgba(0,0,0,0.2);
            z-index: 1;
          }

          .gallery-item:hover img {
            transform: none;
          }

          .selected-file {
            margin: 1rem 0;
            padding: 0.8rem 1rem;
            background: #f7fafc;
            border-radius: 8px;
            border: 1px solid #e2e8f0;
            display: none;
            align-items: center;
            justify-content: space-between;
          }

          .file-name {
            color: #4a5568;
            font-size: 0.9rem;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .remove-file {
            color: #e53e3e;
            cursor: pointer;
            padding: 0.2rem 0.5rem;
            border-radius: 4px;
            font-size: 0.8rem;
            background: none;
            border: none;
            transition: background 0.2s;
          }

          .remove-file:hover {
            background: #fed7d7;
          }

          .upload-btn {
            background: linear-gradient(to right, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 0.8rem 2rem;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            transition: all 0.2s;
            margin-top: 1rem;
            width: 100%;
            max-width: 200px;
          }

          .upload-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 2px 6px rgba(0,0,0,0.1);
          }

          .upload-btn:disabled {
            opacity: 0.7;
            cursor: not-allowed;
            transform: none;
          }

          .loading {
            color: #718096;
            text-align: center;
            padding: 2rem;
          }

          #upload-status {
            margin-top: 1rem;
            padding: 1rem;
            border-radius: 8px;
            display: none;
          }

          .success {
            background: #c6f6d5;
            color: #2f855a;
          }

          .error {
            background: #fed7d7;
            color: #c53030;
          }

          .url-display {
            color: #4a5568;
            margin-top: 0.5rem;
            font-size: 0.9rem;
          }

          /* 响应式调整 */
          @media (max-width: 1200px) {
            .card {
              width: 95%;
              height: 92vh;
            }

            .gallery-item {
              max-height: 240px;
            }
          }

          @media (max-width: 768px) {
            .card {
              width: 98%;
              height: 94vh;
            }
            
            .gallery-section {
              padding: 1rem 1rem 1.5rem;
            }

            .gallery-grid {
              gap: 20px;
              padding: 0.5rem 0.5rem 0.8rem;
            }

            .gallery-item {
              max-height: 220px;
            }
          }

          @media (max-width: 480px) {
            .card {
              width: 100%;
              height: 100vh;
              border-radius: 0;
            }
            
            .gallery-section {
              padding: 0.8rem 0.8rem 1.2rem;
            }

            .gallery-grid {
              gap: 15px;
              padding: 0.3rem 0.3rem 0.6rem;
            }

            .gallery-item {
              max-height: 200px;
            }
          }

          /* 空状态样式 */
          .gallery-item.empty {
            background: #f5f5f5;
            border: 2px dashed #ddd;
            display: flex;
            justify-content: center;
            align-items: center;
            cursor: default;
          }

          .gallery-item.empty::after {
            content: '等待上传';
            color: #999;
            font-size: 0.9rem;
          }

          /* 修改预览遮罩层效果 */
          .preview-overlay {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 1000;
            justify-content: center;
            align-items: center;
            backdrop-filter: blur(8px);
            opacity: 0;
            transition: opacity 0.3s ease;
          }

          .preview-overlay.active {
            display: flex;
            opacity: 1;
          }

          .preview-image-container {
            position: relative;
            max-width: 90%;
            max-height: 90vh;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 0 30px rgba(0,0,0,0.3);
            transform: scale(0.9);
            transition: all 0.3s ease;
          }

          .preview-overlay.active .preview-image-container {
            transform: scale(1);
          }

          .preview-image {
            display: block;
            max-width: 100%;
            max-height: 90vh;
            object-fit: contain;
            border-radius: 12px;
          }

          .preview-close {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.2);
            border: none;
            color: white;
            font-size: 24px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.3s ease;
          }

          .preview-close:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: rotate(90deg);
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="upload-section">
            <h1 class="upload-title">R2 文件上传</h1>
            <div class="upload-area" id="drop-zone">
              <div style="font-size: 2rem; margin-bottom: 1rem;">📁</div>
              <p class="upload-text">点击或拖拽文件到这里上传</p>
              <p class="upload-text" style="font-size: 0.8rem;">支持 jpg、png、gif mp4  格式，最大 50MB</p>
            </div>
            <div id="selected-file" class="selected-file">
              <span class="file-name"></span>
              <button class="remove-file" onclick="removeFile()">删除</button>
            </div>
            <form id="upload-form" enctype="multipart/form-data">
              <input type="file" id="file-input" name="file" accept="image/jpeg,image/png,image/gif" style="display: none;">
              <button type="submit" class="upload-btn" disabled>上传文件</button>
            </form>
            <div id="upload-status"></div>
          </div>

          <div class="gallery-section">
            <div class="gallery-title">
            </div>
            <div id="gallery-grid" class="gallery-grid">
              <div class="loading">加载中...</div>
            </div>
          </div>
        </div>

        <!-- 修改预览遮罩层结构 -->
        <div class="preview-overlay" id="preview-overlay">
          <div class="preview-image-container">
            <img class="preview-image" id="preview-image" src="" alt="预览图片">
            <a id="preview-link" href="" target="_blank" style="display: none; color: white; text-decoration: underline; margin-top: 1rem;"></a>
          </div>
          <button class="preview-close" onclick="closePreview()">×</button>
        </div>

        <script>
          const dropZone = document.getElementById('drop-zone');
          const fileInput = document.getElementById('file-input');
          const uploadForm = document.getElementById('upload-form');
          const uploadStatus = document.getElementById('upload-status');
          const selectedFile = document.getElementById('selected-file');
          const fileNameDisplay = selectedFile.querySelector('.file-name');
          const submitButton = uploadForm.querySelector('button[type="submit"]');
          const galleryGrid = document.getElementById('gallery-grid');
          const imageSlots = ['', '', '']; // 用于存储3个图片位置的URL

          let refreshTimer = null;
          let lastUploadTime = 0;

          function updateFileSelection(file) {
            if (file) {
              fileNameDisplay.textContent = file.name;
              selectedFile.style.display = 'flex';
              submitButton.disabled = false;
            } else {
              selectedFile.style.display = 'none';
              submitButton.disabled = true;
            }
          }

          function removeFile() {
            fileInput.value = '';
            updateFileSelection(null);
          }

          fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            updateFileSelection(file);
          });

          dropZone.addEventListener('click', () => fileInput.click());

          dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#667eea';
          });

          dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            dropZone.style.borderColor = '#cbd5e0';
          });

          dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            const files = e.dataTransfer.files;
            if (files.length) {
              fileInput.files = files;
              updateFileSelection(files[0]);
            }
          });

          async function loadFiles(retryCount = 3) {
            try {
              const response = await fetch('/list-files?' + new Date().getTime());
              const files = await response.json();
              
              if (!files.length) {
                galleryGrid.innerHTML = '<div class="loading">暂无文件</div>';
                return;
              }

              const htmlContent = files.map(file => {
                const timestamp = new Date().getTime();
                return \`
                  <div class="gallery-item" onclick="showPreview('\${file.url}')">
                    <img src="\${file.url}?t=\${timestamp}" loading="lazy" alt="上传的图片">
                  </div>
                \`;
              }).join('');

              // 如果文件数量少于3个，添加空占位符
              const emptySlots = 3 - files.length;
              for (let i = 0; i < emptySlots; i++) {
                htmlContent += '<div class="gallery-item empty"></div>';
              }

              galleryGrid.innerHTML = htmlContent;
            } catch (error) {
              console.error('加载文件失败:', error);
              if (retryCount > 0) {
                // 失败后延迟重试
                setTimeout(() => loadFiles(retryCount - 1), 500);
              } else {
                galleryGrid.innerHTML = '<div class="loading">加载失败</div>';
              }
            }
          }

          // 修改预览相关函数
          const previewOverlay = document.getElementById('preview-overlay');
          const previewImage = document.getElementById('preview-image');
          const previewLink = document.getElementById('preview-link');

          function showPreview(url) {
            window.open(url, '_blank');
          }

          function closePreview() {
            previewOverlay.classList.remove('active');
            document.body.style.overflow = ''; // 恢复滚动

            // 隐藏图片链接和名称
            previewLink.style.display = 'none';
          }

          // 点击遮罩层关闭预览
          previewOverlay.addEventListener('click', (e) => {
            if (e.target === previewOverlay) {
              closePreview();
            }
          });

          // ESC 键关闭预览
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              closePreview();
            }
          });

          // 修改上传表单处理函数
          uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(uploadForm);
            const submitButton = uploadForm.querySelector('button[type="submit"]');
            
            try {
              submitButton.disabled = true;
              submitButton.textContent = '上传中...';
              
              const response = await fetch('/upload', {
                method: 'POST',
                body: formData
              });
              
              const result = await response.json();
              
              if (response.ok) {
                uploadStatus.className = 'success';
                uploadStatus.innerHTML = '上传成功！';
                
                // 清除表单状态
                fileInput.value = '';
                updateFileSelection(null);
                
                // 立即刷新图片列表
                await loadFiles();
                
                // 短暂延迟后再次刷新，确保新图片加载
                setTimeout(async () => {
                  await loadFiles();
                  // 隐藏成功消息
                  setTimeout(() => {
                    uploadStatus.style.display = 'none';
                  }, 2000);
                }, 500);
              } else {
                throw new Error(result.error);
              }
            } catch (error) {
              uploadStatus.className = 'error';
              uploadStatus.textContent = '上传失败: ' + error.message;
            } finally {
              submitButton.disabled = false;
              submitButton.textContent = '上传文件';
              uploadStatus.style.display = 'block';
            }
          });

          // 页面加载时刷新一次
          loadFiles();

          // 页面可见性改变时刷新
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
              // 如果距离上次上传超过30秒，才刷新
              if (Date.now() - lastUploadTime > 30000) {
                loadFiles();
              }
            }
          });
        </script>
      </body>
    </html>
  `;

  res.send(html);
});

// 错误处理中间件
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "文件大小超过限制" });
    }
  }
  res.status(400).json({ error: error.message });
});

// 修改服务器启动部分
const PORT = process.env.PORT || 3000;
let currentPort = PORT;

function startServer(port) {
  const server = app
    .listen(port, () => {
      console.log(`服务器运行在 http://localhost:${port}`);
    })
    .on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}`);
        startServer(port + 1);
      } else {
        console.error("服务器启动错误:", err);
      }
    });

  return server;
}

const server = startServer(currentPort);

// 导出 server 实例
module.exports = server;
