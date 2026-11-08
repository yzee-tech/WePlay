// WePlay portal: game carousel.
// Adding a game = adding one entry here. Set status to "play" and give it a
// path when it launches; "soon" entries show as coming-soon placeholders.
const GAMES = [
  { id: 'air-defense', title: 'Air Defense', tagline: 'Defend your turret from attacking planes.', path: './air-defense/', status: 'play', art: 'assets/air-defense-card.jpg' },
  { id: 'alien-invasion', title: 'Alien Invasion', tagline: 'Type the words to stop the alien ships.', path: './alien-invasion/', status: 'play', art: 'assets/alien-invasion-card.jpg' },
  { id: 'soon-3', title: 'Coming Soon', tagline: 'More fun ahead!', status: 'soon' },
  { id: 'soon-4', title: 'Coming Soon', tagline: 'Another great game on the way!', status: 'soon' },
  { id: 'soon-5', title: 'Coming Soon', tagline: 'More fun ahead!', status: 'soon' },
];

const stage = document.getElementById('stage');
const dotsBox = document.getElementById('dots');
let active = 0;

function mod(i) { return (i + GAMES.length) % GAMES.length; }

function build() {
  GAMES.forEach((g, i) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.index = i;

    const art = document.createElement('div');
    art.className = 'art';
    if (g.status === 'play' && g.art) {
      const img = document.createElement('img');
      img.src = g.art;
      img.alt = '';
      art.appendChild(img);
    } else {
      const q = document.createElement('span');
      q.className = 'q';
      q.textContent = '?';
      art.appendChild(q);
    }
    card.appendChild(art);

    const title = document.createElement('h2');
    title.textContent = g.title;
    card.appendChild(title);

    const tag = document.createElement('p');
    tag.className = 'tagline';
    tag.textContent = g.tagline;
    card.appendChild(tag);

    if (g.status === 'play') {
      const play = document.createElement('a');
      play.className = 'play-btn';
      play.href = g.path;
      play.innerHTML = 'Play &#9654;';
      card.appendChild(play);
    } else {
      const soon = document.createElement('span');
      soon.className = 'soon-badge';
      soon.textContent = 'Coming Soon';
      card.appendChild(soon);
    }

    card.addEventListener('click', (e) => {
      if (e.target.closest('.play-btn')) return;
      const offset = mod(i - active);
      if (offset === 1) go(1);
      else if (offset === GAMES.length - 1) go(-1);
    });

    stage.appendChild(card);

    const dot = document.createElement('button');
    dot.className = 'dot';
    dot.type = 'button';
    dot.setAttribute('aria-label', 'Go to game ' + (i + 1) + ' of ' + GAMES.length + ': ' + g.title);
    dot.addEventListener('click', () => goTo(i));
    dotsBox.appendChild(dot);
  });
}

function layout() {
  const cards = stage.children;
  const dots = dotsBox.children;
  for (let i = 0; i < cards.length; i++) {
    const off = mod(i - active);
    const card = cards[i];
    card.classList.remove('pos-center', 'pos-left', 'pos-right', 'pos-hidden', 'is-active');
    dots[i].classList.toggle('on', i === active);
    if (off === 0) card.classList.add('pos-center', 'is-active');
    else if (off === 1) card.classList.add('pos-right');
    else if (off === GAMES.length - 1) card.classList.add('pos-left');
    else card.classList.add('pos-hidden');
  }
}

function goTo(i) { active = mod(i); layout(); }
function go(dir) { goTo(active + dir); }

build();
layout();

document.querySelector('.arrow.prev').addEventListener('click', () => go(-1));
document.querySelector('.arrow.next').addEventListener('click', () => go(1));

document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
});

let touchX = null;
stage.addEventListener('touchstart', (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
stage.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
  touchX = null;
}, { passive: true });
