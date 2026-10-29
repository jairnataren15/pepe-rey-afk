import fs from 'fs';
import path from 'path';
import https from 'https';

const isWindows = process.platform === 'win32';
const targetFile = isWindows ? 'yt-dlp.exe' : 'yt-dlp';
const targetPath = path.resolve(process.cwd(), targetFile);

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} al descargar ${url}`));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          if (!isWindows) {
            try { fs.chmodSync(dest, 0o755); } catch {}
          }
          resolve();
        });
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

export async function asegurarYtDlp() {
  if (fs.existsSync(targetPath)) {
    console.log(`✅ [yt-dlp] Ya existe en ${targetPath}`);
    return targetPath;
  }

  const downloadUrl = isWindows
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';

  console.log(`⏳ [yt-dlp] Descargando binario independiente para ${process.platform}...`);
  try {
    await downloadFile(downloadUrl, targetPath);
    console.log(`🚀 [yt-dlp] Binario instalado correctamente en ${targetPath}`);
    return targetPath;
  } catch (err) {
    console.error(`❌ [yt-dlp] Error descargando binario: ${err.message}`);
    return null;
  }
}

// Si se ejecuta directamente (npm run postinstall / node install-ytdlp.js)
if (process.argv[1] && process.argv[1].endsWith('install-ytdlp.js')) {
  asegurarYtDlp();
}
