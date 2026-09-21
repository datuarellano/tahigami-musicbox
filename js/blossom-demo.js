// "How it Works" demo: a Blossom being walked, note by note, the way the
// firmware does it. A simplified loop — the same graphs and paths as the
// device, without sound or the walk orders — that cycles through every
// blossom and each of its three algorithms.
import { BlossomViz } from './updater/blossom-viz.js';
import { BLOSSOMS } from './blossom-graphs.js';

const STEP_MS = 360; // one note
const NOTES_PER_SCENE = 16;
const ALGORITHMS = [
  { id: 'contour', name: 'Contour', blurb: 'walking the outer edge' },
  { id: 'skeletal', name: 'Skeletal', blurb: 'following the internal structure' },
  { id: 'random', name: 'Random', blurb: 'hopping to any neighbouring puncture' },
];

// Puncture ids for one scene, `count` notes long.
function buildWalk(key, algo, count) {
  const b = BLOSSOMS[key];
  if (algo === 'contour' || algo === 'skeletal') {
    const seq = b[algo];
    return Array.from({ length: count }, (_, i) => seq[i % seq.length]);
  }
  // Random: hop along a thread each note, never straight back where we came
  // from unless it's the only way out.
  const nbrs = Array.from({ length: b.count }, () => []);
  for (const [a, c] of b.edges) {
    nbrs[a].push(c);
    nbrs[c].push(a);
  }
  const walk = [Math.floor(Math.random() * b.count)];
  while (walk.length < count) {
    const here = walk[walk.length - 1];
    const prev = walk[walk.length - 2];
    const options = nbrs[here].filter((n) => n !== prev);
    const pool = options.length ? options : nbrs[here];
    walk.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return walk;
}

export function initBlossomDemo() {
  const canvas = document.getElementById('blossom-demo-canvas');
  const caption = document.getElementById('blossom-demo-caption');
  if (!canvas) return;

  const viz = new BlossomViz(canvas, {
    assetBase: `${import.meta.env.BASE_URL}blossom-viz/assets/`,
    theme: {
      threadColor: [0, 0, 0],
      defaultColor: [0, 0, 0],
      punctureStrokeColor: [0, 0, 0],
      ringHoleColor: [255, 255, 255], // the card behind the canvas
      labelColor: [0, 0, 0],
      blossomColors: Object.fromEntries(
        Object.keys(BLOSSOMS).map((k) => [k, { punctureColor: [255, 255, 255] }])
      ),
    },
  });

  const keys = Object.keys(BLOSSOMS);
  const scenes = keys.flatMap((key) => ALGORITHMS.map((algo) => ({ key, algo })));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let timer = null;
  let sceneIdx = 0;
  let stepIdx = 0;
  let walk = [];
  let running = false;

  const setCaption = ({ key, algo }) => {
    caption.innerHTML = `<strong>${BLOSSOMS[key].label}</strong> · ${algo.name} — ${algo.blurb}`;
  };

  async function beginScene() {
    const { key, algo } = scenes[sceneIdx];
    setCaption({ key, algo });
    walk = buildWalk(key, algo.id, NOTES_PER_SCENE);
    stepIdx = 0;
    await viz.setBlossom(key);
  }

  async function tick() {
    if (!running) return;
    if (!document.hidden) {
      if (stepIdx >= walk.length) {
        sceneIdx = (sceneIdx + 1) % scenes.length;
        await beginScene();
      }
      viz.trigger(walk[stepIdx++]);
    }
    timer = setTimeout(tick, STEP_MS);
  }

  async function start() {
    if (running) return;
    running = true;
    viz.start();
    if (!walk.length) await beginScene();
    timer = setTimeout(tick, STEP_MS);
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    viz.stop();
  }

  if (reduceMotion) {
    // No looping animation for people who've asked for less motion: just the
    // blossom, still, with its name.
    viz.start();
    viz.setBlossom(keys[0]);
    caption.textContent = `${BLOSSOMS[keys[0]].label} Blossom`;
    return;
  }

  // Only run while it can be seen: the How it Works pane is display:none until
  // its tab is opened, and the demo needn't churn once scrolled away.
  new IntersectionObserver(
    (entries) => (entries.some((e) => e.isIntersecting) ? start() : stop()),
    { threshold: 0.2 }
  ).observe(canvas);
}
