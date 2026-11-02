const $ = s => document.querySelector(s);
const audio = $('#audio');
let songs = [], cur = -1, loopOne = false, token = sessionStorage.getItem('admin-token');

const fmt = t => isFinite(t) ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : '0:00';
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fill = el => el.style.setProperty('--p', (el.value / el.max * 100) + '%');

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.id); toast.id = setTimeout(() => t.classList.remove('show'), 3200);
}

/* ---------- Danh sách nhạc ---------- */
async function loadSongs(keepId) {
  try {
    songs = await (await fetch('data/songs.json', { cache: 'no-store' })).json();
  } catch {
    songs = [];
    toast('Không đọc được songs.json. Hãy chạy "node server.js" rồi mở http://localhost:3000');
  }
  const i = songs.findIndex(s => s.id === keepId);
  if (i >= 0) cur = i;
  else if (songs.length) select(0, false);
  else cur = -1;
  renderList();
}

function renderList() {
  $('#list').innerHTML = songs.map((s, i) => `
    <li class="${i === cur ? 'on' : ''}" data-i="${i}">
      <span>${i === cur && !audio.paused ? '🎵' : i + 1}</span>
      <div><b>${esc(s.title)}</b><small>${esc(s.artist)}</small></div>
      <button class="del admin-only" data-id="${s.id}" title="Xóa bài hát" aria-label="Xóa ${esc(s.title)}">🗑</button>
    </li>`).join('') || '<li class="empty">Chưa có bài hát nào 🎅</li>';
}

function select(i, play = true) {
  if (!songs[i]) return;
  cur = i;
  audio.src = songs[i].file;
  $('#title').textContent = songs[i].title;
  $('#artist').textContent = songs[i].artist;
  $('#seek').value = 0; fill($('#seek'));
  $('#cur').textContent = '0:00'; $('#dur').textContent = '0:00';
  if (play) audio.play().catch(() => toast('Không phát được file này'));
  renderList();
}

const step = d => songs.length && select((cur + d + songs.length) % songs.length);

$('#list').addEventListener('click', e => {
  const del = e.target.closest('.del');
  if (del) return removeSong(del.dataset.id);
  const li = e.target.closest('li[data-i]');
  if (li) select(+li.dataset.i);
});

/* ---------- Điều khiển phát nhạc ---------- */
$('#play').onclick = () => {
  if (cur < 0) return;
  audio.paused ? audio.play() : audio.pause();
};
$('#prev').onclick = () => step(-1);
$('#next').onclick = () => step(1);
$('#loop').onclick = e => { loopOne = !loopOne; e.currentTarget.classList.toggle('on', loopOne); };
$('#vol').oninput = e => { audio.volume = e.target.value; fill(e.target); };
$('#seek').oninput = e => {
  if (isFinite(audio.duration)) audio.currentTime = e.target.value / 1000 * audio.duration;
  fill(e.target);
};

audio.addEventListener('play', syncState);
audio.addEventListener('pause', syncState);
audio.addEventListener('loadedmetadata', () => $('#dur').textContent = fmt(audio.duration));
audio.addEventListener('timeupdate', () => {
  $('#cur').textContent = fmt(audio.currentTime);
  if (isFinite(audio.duration)) { $('#seek').value = audio.currentTime / audio.duration * 1000; fill($('#seek')); }
});
audio.addEventListener('ended', () => loopOne ? (audio.currentTime = 0, audio.play()) : step(1));
audio.addEventListener('error', () => audio.src && toast('Không tải được file nhạc'));

function syncState() {
  $('.stage').classList.toggle('playing', !audio.paused);
  $('#play').textContent = audio.paused ? '▶' : '⏸';
  renderList();
}

/* ---------- Admin ---------- */
function setAdmin(on) {
  document.body.classList.toggle('admin', on);
  $('#loginBtn').textContent = on ? '🚪 Đăng xuất (admin)' : '🔑 Đăng nhập admin';
  if (!on) { token = null; sessionStorage.removeItem('admin-token'); }
}

$('#loginBtn').onclick = () => {
  if (token) { setAdmin(false); toast('Đã đăng xuất'); }
  else $('#dlg').showModal();
};
$('#cancel').onclick = () => $('#dlg').close();

$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  try {
    const r = await fetch('/api/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: $('#user').value, pass: $('#pass').value })
    });
    const d = await r.json();
    if (!r.ok) return toast(d.error || 'Đăng nhập thất bại');
    token = d.token; sessionStorage.setItem('admin-token', token);
    setAdmin(true); $('#dlg').close(); $('#pass').value = '';
    toast('Xin chào admin 🎅');
  } catch { toast('Chưa có server. Hãy chạy "node server.js"'); }
};

async function api(url, opts) {
  const r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + token } });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) { setAdmin(false); throw new Error('Phiên đăng nhập hết hạn, hãy đăng nhập lại'); }
  if (!r.ok) throw new Error(d.error || 'Có lỗi xảy ra');
  return d;
}

$('#addForm').onsubmit = async e => {
  e.preventDefault();
  const f = $('#newFile').files[0];
  if (!f) return;
  const q = new URLSearchParams({
    title: $('#newTitle').value.trim() || f.name.replace(/\.[^.]+$/, ''),
    artist: $('#newArtist').value.trim() || 'Không rõ',
    ext: f.name.split('.').pop()
  });
  const btn = e.submitter; btn.disabled = true; btn.textContent = 'Đang tải lên...';
  try {
    const song = await api('/api/songs?' + q, { method: 'POST', body: f });
    e.target.reset();
    await loadSongs(songs[cur]?.id);
    toast(`Đã thêm "${song.title}" 🎁`);
  } catch (err) { toast(err.message); }
  btn.disabled = false; btn.textContent = 'Thêm vào danh sách';
};

async function removeSong(id) {
  const s = songs.find(x => x.id === id);
  if (!s || !confirm(`Xóa bài "${s.title}" khỏi dự án?`)) return;
  const playingId = songs[cur]?.id;
  try {
    await api('/api/songs/' + id, { method: 'DELETE' });
    if (playingId === id) { audio.pause(); audio.removeAttribute('src'); cur = -1; $('#title').textContent = 'Chọn một bài hát'; $('#artist').innerHTML = '&nbsp;'; }
    await loadSongs(playingId === id ? null : playingId);
    toast('Đã xóa bài hát');
  } catch (err) { toast(err.message); }
}

/* ---------- Đĩa quay có quán tính (tăng tốc khi phát, giảm tốc khi dừng) ---------- */
const disc = $('#disc');
let ang = 0, speed = 0, last = 0;
(function spin(t) {
  const dt = Math.min((t - last) / 1000, .1); last = t;
  const target = audio.paused ? 0 : 200;               // 200°/giây ≈ 33 vòng/phút
  speed += (target - speed) * Math.min(dt * (target ? 1.6 : 1), 1);
  if (speed > .05) { ang = (ang + speed * dt) % 360; disc.style.transform = `rotate(${ang}deg)`; }
  requestAnimationFrame(spin);
})(0);

/* ---------- Tuyết rơi: hạt tròn nhiều cỡ, hạt to rơi nhanh hơn (gần), hạt nhỏ rơi chậm (xa) ---------- */
const cv = document.createElement('canvas'), cx = cv.getContext('2d');
cv.id = 'snow'; document.body.appendChild(cv);
let W, H;
const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
fit(); addEventListener('resize', fit);
const flakes = Array.from({ length: 140 }, () => ({
  x: Math.random() * innerWidth, y: Math.random() * innerHeight,
  r: 1.5 + Math.pow(Math.random(), 2.2) * 6.5, p: Math.random() * 6.28
}));
(function snow() {
  cx.clearRect(0, 0, W, H);
  for (const f of flakes) {
    {
      f.p += .012; f.y += .4 + f.r * .28; f.x += Math.sin(f.p) * .6 + .15;
      if (f.y > H + 10) { f.y = -10; f.x = Math.random() * W; }
      if (f.x > W + 10) f.x = -10;
    }
    const g = cx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, `rgba(255,255,255,${.6 + f.r / 18})`);
    g.addColorStop(.6, 'rgba(255,255,255,.6)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cx.fillStyle = g; cx.beginPath(); cx.arc(f.x, f.y, f.r, 0, 6.283); cx.fill();
  }
  requestAnimationFrame(snow);
})();

/* ---------- Khởi động ---------- */
audio.volume = 0.8; fill($('#vol')); fill($('#seek'));
setAdmin(!!token);
loadSongs();
