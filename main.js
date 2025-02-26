const { app, BrowserWindow, dialog } = require('electron');
const express = require('express');
const server = require('./index.js'); // 引入原来的 Express 服务器
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      nodeIntegration: true
    },
    titleBarStyle: 'hiddenInset', // Mac 风格的标题栏
    backgroundColor: '#f5f5f5',
    show: false // 先隐藏窗口
  });

  // 等待加载完成后显示窗口
  win.once('ready-to-show', () => {
    win.show();
  });

  // 添加错误处理
  win.webContents.on('did-fail-load', () => {
    dialog.showErrorBox('加载错误', '无法连接到服务器，请检查网络连接');
  });

  setTimeout(() => {
    win.loadURL('http://localhost:3000');
  }, 1000);

  // 开发工具（可选）
  win.webContents.openDevTools();
}

// 确保只运行一个实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// 优雅退出
app.on('before-quit', () => {
  if (server && server.close) {
    server.close(() => {
      console.log('Express server closed');
    });
  }
}); 