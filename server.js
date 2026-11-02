// Chạy: node server.js  →  mở http://localhost:3000
// Tài khoản admin mặc định: admin / noel2026 (đổi bằng biến môi trường ADMIN_USER, ADMIN_PASS)
const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const USER = process.env.ADMIN_USER || 'admin';
const PASS = process.env.ADMIN_PASS || 'noel2026';
const DB = path.join(__dirname, 'data', 'songs.json');
const EXTS = ['mp3', 'wav', 'ogg', 'm4a'];
const MIME = { '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4' };
const tokens = new Set();

const readDB = () => JSON.parse(fs.readFileSync(DB, 'utf8'));
const saveDB = s => fs.writeFileSync(DB, JSON.stringify(s, null, 2));
const send = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
const authed = req => tokens.has((req.headers.authorization || '').replace('Bearer ', ''));
const body = (req, max = 80e6) => new Promise((ok, no) => {
  const chunks = []; let n = 0;
  req.on('data', d => { n += d.length; if (n > max) { no(new Error('File quá lớn')); req.destroy(); } else chunks.push(d); });
  req.on('end', () => ok(Buffer.concat(chunks)));
  req.on('error', no);
});

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && u.pathname === '/api/login') {
      const { user, pass } = JSON.parse(await body(req, 1e4));
      if (user !== USER || pass !== PASS) return send(res, 401, { error: 'Sai tài khoản hoặc mật khẩu' });
      const t = crypto.randomBytes(16).toString('hex'); tokens.add(t);
      return send(res, 200, { token: t });
    }

    if (req.method === 'POST' && u.pathname === '/api/songs') {
      if (!authed(req)) return send(res, 401, { error: 'Cần đăng nhập admin' });
      const ext = (u.searchParams.get('ext') || '').toLowerCase();
      if (!EXTS.includes(ext)) return send(res, 400, { error: 'Chỉ hỗ trợ ' + EXTS.join(', ') });
      const data = await body(req);
      const id = Date.now().toString(36), file = `songs/${id}.${ext}`;
      fs.writeFileSync(path.join(__dirname, file), data);
      const song = { id, title: (u.searchParams.get('title') || 'Không tên').slice(0, 80), artist: (u.searchParams.get('artist') || 'Không rõ').slice(0, 80), file };
      saveDB([...readDB(), song]);
      return send(res, 200, song);
    }

    if (req.method === 'DELETE' && u.pathname.startsWith('/api/songs/')) {
      if (!authed(req)) return send(res, 401, { error: 'Cần đăng nhập admin' });
      const id = decodeURIComponent(u.pathname.split('/').pop());
      const songs = readDB(), song = songs.find(s => s.id === id);
      if (!song) return send(res, 404, { error: 'Không tìm thấy bài hát' });
      saveDB(songs.filter(s => s.id !== id));
      const f = path.join(__dirname, song.file);
      if (f.startsWith(path.join(__dirname, 'songs') + path.sep)) fs.rm(f, { force: true }, () => {});
      return send(res, 200, { ok: true });
    }

    // File tĩnh (chỉ cho phép index.html, css/, js/, data/, songs/)
    const rel = path.normalize(decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname)).replace(/^[/\\]+/, '');
    if (!/^(index\.html$|(css|js|data|songs)[/\\])/.test(rel)) { res.writeHead(404); return res.end('Not found'); }
    const p = path.join(__dirname, rel);
    if (!fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); return res.end('Not found'); }

    const size = fs.statSync(p).size, type = MIME[path.extname(p)] || 'application/octet-stream';
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
    const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' };
    if (m) { // hỗ trợ tua nhạc
      const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
      res.writeHead(206, { ...head, 'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': b - a + 1 });
      fs.createReadStream(p, { start: a, end: b }).pipe(res);
    } else {
      res.writeHead(200, { ...head, 'Content-Length': size });
      fs.createReadStream(p).pipe(res);
    }
  } catch (err) {
    send(res, 500, { error: err.message });
  }
}).listen(PORT, () => console.log(`🎄 Mở http://localhost:${PORT}  (admin: ${USER} / ${PASS})`));
