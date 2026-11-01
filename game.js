(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const N = 20, S = canvas.width / N;
  const scoreEl = document.getElementById('score'), bestEl = document.getElementById('best');
  let best = 0;
  try { best = +localStorage.getItem('snake-best') || 0; } catch (e) {}
  bestEl.textContent = best;

  let snake, dir, nextDir, food, score, alive, paused, timer;

  function reset() {
    snake = [{x: 10, y: 10}, {x: 9, y: 10}, {x: 8, y: 10}];
    dir = nextDir = {x: 1, y: 0};
    score = 0; alive = true; paused = false;
    scoreEl.textContent = 0;
    placeFood();
    clearInterval(timer);
    timer = setInterval(tick, 110);
    draw();
  }
  function placeFood() {
    do { food = {x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N)}; }
    while (snake.some(s => s.x === food.x && s.y === food.y));
  }
  function turn(x, y) {
    if (x === -dir.x && y === -dir.y) return;
    nextDir = {x, y};
  }
  function tick() {
    if (!alive || paused) return;
    dir = nextDir;
    const head = {x: snake[0].x + dir.x, y: snake[0].y + dir.y};
    if (head.x < 0 || head.y < 0 || head.x >= N || head.y >= N ||
        snake.some(s => s.x === head.x && s.y === head.y)) {
      alive = false;
      if (score > best) {
        best = score; bestEl.textContent = best;
        try { localStorage.setItem('snake-best', best); } catch (e) {}
      }
      draw(); return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score++; scoreEl.textContent = score; placeFood();
    } else snake.pop();
    draw();
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(food.x * S + S / 2, food.y * S + S / 2, S / 2 - 2, 0, 7); ctx.fill();
    snake.forEach((s, i) => {
      ctx.fillStyle = i ? '#22c55e' : '#86efac';
      ctx.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2);
    });
    if (!alive || paused) {
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 28px system-ui';
      ctx.fillText(alive ? 'Paused' : 'Game Over', canvas.width / 2, canvas.height / 2 - 6);
      ctx.font = '16px system-ui';
      ctx.fillText(alive ? 'Space to resume' : 'Space or tap to restart', canvas.width / 2, canvas.height / 2 + 22);
    }
  }
  function toggle() {
    if (!alive) reset(); else { paused = !paused; draw(); }
  }

  const keys = {ArrowUp:[0,-1],w:[0,-1],ArrowDown:[0,1],s:[0,1],ArrowLeft:[-1,0],a:[-1,0],ArrowRight:[1,0],d:[1,0]};
  addEventListener('keydown', e => {
    if (e.key === ' ') { e.preventDefault(); toggle(); return; }
    const k = keys[e.key] || keys[e.key.toLowerCase()];
    if (k) { e.preventDefault(); turn(...k); }
  });

  let t0;
  canvas.addEventListener('touchstart', e => { t0 = e.touches[0]; }, {passive: true});
  canvas.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - t0.clientX, dy = t.clientY - t0.clientY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) { if (!alive) reset(); return; }
    if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
  });
  canvas.addEventListener('click', () => { if (!alive) reset(); });

  reset();
})();
