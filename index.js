const express = require('express');
const multer = require('multer');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');

// 加载环境变量
dotenv.config();

const app = express();
const upload = multer({
  limits: {
    fileSize: 5 * 1024 * 1024, // 限制 5MB
  },
  fileFilter: (req, file, cb) => {
    // 允许的文件类型
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型'));
    }
  }
});

// 配置 S3 客户端（用于 R2）
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});

// 文件上传接口
app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件被上传' });
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
      message: '文件上传成功',
      fileName: fileName,
      fileUrl: fileUrl
    });

  } catch (error) {
    console.error('上传错误:', error);
    res.status(500).json({ error: '文件上传失败' });
  }
});

// 获取文件列表接口
app.get('/list-files', async (req, res) => {
  try {
    // 添加缓存控制头
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    const command = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 100  // 先获取更多文件
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
      .slice(0, 3)  // 只取最新的3张
      .map(file => ({
        name: file.Key,
        url: `https://${process.env.R2_PUBLIC_URL}/${file.Key}`,
        size: file.Size,
        lastModified: file.LastModified
      }));

    console.log('获取的文件列表:', {
      total: files.length,
      sorted: sortedFiles.map(f => ({
        name: f.name,
        lastModified: f.lastModified
      }))
    });

    res.json(sortedFiles);
  } catch (error) {
    console.error('获取文件列表错误:', error);
    res.status(500).json({ error: '获取文件列表失败' });
  }
});

// 主页面路由
app.get('/', (req, res) => {
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
          
          body {
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
          }
          
          .card {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 20px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 800px;  /* 增加卡片宽度 */
            overflow: hidden;
          }

          .upload-section {
            padding: 2rem;
            border-bottom: 1px solid #edf2f7;
            text-align: center;
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
            padding: 2rem;
            background: #f7fafc;
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
            grid-template-columns: repeat(3, 1fr);
            gap: 1.5rem;  /* 增加图片间距 */
            margin: 1.5rem 0;  /* 增加上下边距 */
            padding: 0 1.5rem;  /* 增加左右内边距 */
          }

          .gallery-item {
            position: relative;
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 1;  /* 保持1:1比例 */
            min-height: 180px;  /* 设置最小高度 */
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            transition: transform 0.2s, box-shadow 0.2s;
          }

          .gallery-item:hover {
            transform: translateY(-5px);
            box-shadow: 0 6px 16px rgba(0,0,0,0.2);
          }

          .gallery-item img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            border-radius: 12px;
          }

          .gallery-item-info {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 0.5rem;
            background: rgba(0,0,0,0.7);
            color: white;
            font-size: 0.75rem;
            opacity: 0;
            transition: opacity 0.2s;
          }

          .gallery-item:hover .gallery-item-info {
            opacity: 1;
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

          /* 适配移动端 */
          @media (max-width: 600px) {
            .card {
              margin: 10px;
            }
            
            .gallery-grid {
              gap: 1rem;
              padding: 0 1rem;
            }

            .gallery-item {
              min-height: 120px;  /* 移动端稍微小一点 */
            }
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
              <p class="upload-text" style="font-size: 0.8rem;">支持 jpg、png、gif 格式，最大 5MB</p>
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
              <span>最近上传</span>
            </div>
            <div id="gallery-grid" class="gallery-grid">
              <div class="loading">加载中...</div>
            </div>
          </div>
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

          async function loadFiles() {
            try {
              const response = await fetch('/list-files?' + new Date().getTime());
              const files = await response.json();
              
              if (!files.length) {
                galleryGrid.innerHTML = '<div class="loading">暂无文件</div>';
                return;
              }

              // 更新图片槽位
              files.forEach((file, index) => {
                imageSlots[index] = file.url;
              });

              // 生成HTML，保持3个位置
              const htmlContent = imageSlots.map((url, index) => {
                if (!url) return '<div class="gallery-item empty"></div>';
                return '<a href="' + url + '" target="_blank" class="gallery-item">' +
                       '<img src="' + url + '?t=' + new Date().getTime() + '" loading="lazy">' +
                       '</a>';
              }).join('');

              galleryGrid.innerHTML = htmlContent;
            } catch (error) {
              console.error('加载文件失败:', error);
              galleryGrid.innerHTML = '<div class="loading">加载失败</div>';
            }
          }

          // 上传成功后立即刷新列表
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
                uploadStatus.innerHTML = '上传成功！<br><a href="' + result.fileUrl + '" target="_blank">查看文件</a>';
                lastUploadTime = Date.now();
                await loadFiles(); // 立即刷新列表
                
                // 上传成功后的额外刷新
                clearTimeout(refreshTimer);
                refreshTimer = setTimeout(loadFiles, 2000); // 2秒后再刷新一次确保更新
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
              fileInput.value = '';
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
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小超过限制' });
    }
  }
  res.status(400).json({ error: error.message });
});

// 修改服务器启动部分
const PORT = process.env.PORT || 3000;
let currentPort = PORT;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`端口 ${port} 已被占用，尝试端口 ${port + 1}`);
      startServer(port + 1);
    } else {
      console.error('服务器启动错误:', err);
    }
  });

  return server;
}

const server = startServer(currentPort);

// 导出 server 实例
module.exports = server; 