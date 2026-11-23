export const BAHI_MOODS = Object.freeze(['happy', 'thinking', 'celebrate', 'worried', 'wave']);

const CX = 200;
const R = 20;
const EYE_DX = 32;
const n = (value) => Number(value.toFixed(2));

const MOUTHS = {
  smile: [[-22, -4], [0, -1], [22, -4], [13, 11], [0, 16], [-13, 11]],
  grin: [[-27, -7], [0, -3], [27, -7], [19, 15], [0, 25], [-19, 15]],
  hmm: [[-3, 3], [8, 0], [19, -3], [18, -1], [8, 2.5], [-2, 5]],
  worry: [[-14, 7], [0, -1], [14, 7], [12, 9], [0, 2], [-12, 9]],
  open: [[-24, -5], [0, -2], [24, -5], [15, 13], [0, 19], [-15, 13]],
};

const TONGUE = { smile: 12, grin: 19, hmm: 12, worry: 9, open: 14 };


const SHOULDER = { L: [CX - 80, 210], R: [CX + 80, 210] };
const ARMS = {
  happy: { L: [[CX - 102, 238], [CX - 104, 268]], R: [[CX + 102, 238], [CX + 104, 268]] },
  thinking: { L: [[CX - 102, 238], [CX - 104, 268]], R: [[CX + 114, 262], [CX + 54, 258]] },
  celebrate: { L: [[CX - 104, 178], [CX - 114, 132]], R: [[CX + 104, 178], [CX + 114, 132]] },
  worried: { L: [[CX - 98, 250], [CX - 26, 270]], R: [[CX + 98, 250], [CX + 34, 270]] },
  wave: { L: [[CX - 102, 238], [CX - 104, 268]], R: [[CX + 110, 172], [CX + 122, 128]] },
};

function closedSmooth(points, corners = [0, 2]) {
  const count = points.length;
  const tangent = (k) => {
    const [px, py] = points[(k - 1 + count) % count];
    const [nx, ny] = points[(k + 1) % count];
    const t = corners.includes(k) ? 0.35 : 1;
    return [((nx - px) / 6) * t, ((ny - py) / 6) * t];
  };
  let d = `M${n(points[0][0])} ${n(points[0][1])}`;
  for (let k = 0; k < count; k += 1) {
    const [x0, y0] = points[k];
    const [x1, y1] = points[(k + 1) % count];
    const [ax, ay] = tangent(k);
    const [bx, by] = tangent((k + 1) % count);
    d += `C${n(x0 + ax)} ${n(y0 + ay)} ${n(x1 - bx)} ${n(y1 - by)} ${n(x1)} ${n(y1)}`;
  }
  return `${d}Z`;
}

function armPath(side, [mid, hand]) {
  const [sx, sy] = SHOULDER[side];
  const tx = (hand[0] - sx) / 4;
  const ty = (hand[1] - sy) / 4;
  return `M${sx} ${sy}Q${n(mid[0] - tx * 0.2)} ${n(mid[1] - ty * 0.2)} ${n(mid[0])} ${n(mid[1])}T${hand[0]} ${hand[1]}`;
}

function arms(mood) {
  return ['L', 'R'].map((side) => {
    const pose = ARMS[mood][side];
    const [x, y] = pose[1];
    return `<g class="arm arm-${side}"><path class="sleeve" d="${armPath(side, pose)}"/><circle class="hand" cx="${x}" cy="${y}" r="12.5"/></g>`;
  }).join('');
}

function star(cx, cy, size, cls = 'gold') {
  const s = size / 2;
  const i = s * 0.38;
  return `<path class="${cls}" d="M${n(cx)} ${n(cy - s)}L${n(cx + i * 0.7)} ${n(cy - i * 0.7)}L${n(cx + s)} ${n(cy)}L${n(cx + i * 0.7)} ${n(cy + i * 0.7)}L${n(cx)} ${n(cy + s)}L${n(cx - i * 0.7)} ${n(cy + i * 0.7)}L${n(cx - s)} ${n(cy)}L${n(cx - i * 0.7)} ${n(cy - i * 0.7)}Z"/>`;
}

function eye(side, uid) {
  const x = side === 'L' ? -EYE_DX : EYE_DX;
  const lid = `M${-R * 1.2} ${n(-R * 0.12)}C${-R * 0.5} ${n(R * 0.14)} ${R * 0.5} ${n(R * 0.14)} ${R * 1.2} ${n(-R * 0.12)}L${R * 1.2} ${-R * 3.4}L${-R * 1.2} ${-R * 3.4}Z`;
  return `<g class="eye eye-${side}" transform="translate(${x} 0)">
<g class="open"><ellipse class="ink" rx="20" ry="21.5"/><ellipse fill="url(#${uid}-sclera)" rx="18.6" ry="20"/>
<g class="look"><ellipse fill="url(#${uid}-iris)" rx="11.8" ry="13"/><ellipse class="pupil" rx="6.2" ry="7"/><circle class="spec" cx="5.2" cy="-6" r="4.2"/><circle class="spec2" cx="-4.8" cy="6" r="1.8"/></g>
<g clip-path="url(#${uid}-clip)"><g class="lid"><path class="lid-skin" d="${lid}"/><path class="lid-line" d="M${-R * 1.2} ${n(-R * 0.12)}Q0 ${n(R * 0.28)} ${R * 1.2} ${n(-R * 0.12)}"/></g></g></g>
<path class="closed" d="M-14 2Q0 -12 14 2"/></g>`;
}

export function bahiSvg({ mood = 'wave', id = 'bahi', label = '', className = '' } = {}) {
  if (!BAHI_MOODS.includes(mood)) throw new Error(`unknown mood ${mood}`);
  const uid = id;
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  const mouths = Object.entries(MOUTHS).map(([name, points]) => `<g class="mouth m-${name}"><path class="lips" d="${closedSmooth(points)}"/><ellipse class="tongue" cy="${TONGUE[name]}" rx="12" ry="6.5" clip-path="url(#${uid}-m-${name})"/></g>`).join('');
  const clips = Object.entries(MOUTHS).map(([name, points]) => `<clipPath id="${uid}-m-${name}"><path d="${closedSmooth(points)}"/></clipPath>`).join('');
  const poses = Object.keys(ARMS).map((name) => `<g class="pose pose-${name}">${arms(name)}</g>`).join('');
  const weave = Array.from({ length: 13 }, (_, k) => `<rect class="weave" x="123" y="${219 + (k - 6) * 14}" width="150" height="1.5"/>`).join('');
  const edges = Array.from({ length: 4 }, (_, k) => `<rect class="edge" x="${n(CX + 80 - k * 2.5)}" y="${133 + k * 3}" width="4" height="${190 - k * 6}" rx="1"/>`).join('');
  const corners = [[-48, -75], [68, -75], [-48, 75], [68, 75]].map(([dx, dy]) => star(CX + dx + 4, 220 + dy, 12)).join('');
  const sparkles = [[62, 92, 30], [340, 80, 24], [352, 206, 18], [48, 218, 16]].map(([x, y, s], k) => star(x, y, s, `spark spark-${k}`)).join('')
    + [[110, 62, 'c1'], [292, 56, 'c2'], [362, 136, 'c3'], [40, 150, 'c4'], [248, 46, 'c5']].map(([x, y, c], k) => `<rect class="confetti ${c} conf-${k}" x="${x - 4}" y="${y - 8}" width="8" height="16" rx="2"/>`).join('');
  return `<svg class="bahi${className ? ` ${className}` : ''}" data-mood="${mood}" viewBox="30 40 340 325" width="340" height="325" ${a11y} focusable="false">
<defs>
<radialGradient id="${uid}-sclera" cx="45%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".7" stop-color="#F7F4EE"/><stop offset="1" stop-color="#DCD6CC"/></radialGradient>
<radialGradient id="${uid}-iris" cx="50%" cy="65%" r="60%"><stop offset="0" stop-color="#2E3B55"/><stop offset="1" stop-color="#19202E"/></radialGradient>
<radialGradient id="${uid}-cover" cx="28%" cy="18%" r="95%"><stop offset="0" stop-color="#E85A4F"/><stop offset=".5" stop-color="#C62828"/><stop offset="1" stop-color="#7E1515"/></radialGradient>
<linearGradient id="${uid}-pages" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF8E6"/><stop offset="1" stop-color="#EADCB8"/></linearGradient>
<linearGradient id="${uid}-spine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6E1010"/><stop offset="1" stop-color="#A51F1F"/></linearGradient>
<linearGradient id="${uid}-string" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F5D06A"/><stop offset="1" stop-color="#C9952C"/></linearGradient>
<radialGradient id="${uid}-cheek"><stop offset="0" stop-color="#FF7A8A" stop-opacity=".6"/><stop offset="1" stop-color="#FF7A8A" stop-opacity="0"/></radialGradient>
<clipPath id="${uid}-clip"><ellipse rx="18.6" ry="20"/></clipPath>
${clips}
</defs>
<ellipse class="shadow" cx="${CX}" cy="354" rx="74" ry="8"/>
<g class="party">${sparkles}</g>
<g class="rig">
<g class="legs"><rect class="leg" x="${CX - 39}" y="318" width="10" height="26" rx="5"/><rect class="leg" x="${CX + 29}" y="318" width="10" height="26" rx="5"/><rect class="foot" x="${CX - 49}" y="338" width="30" height="13" rx="6.5"/><rect class="foot" x="${CX + 19}" y="338" width="30" height="13" rx="6.5"/></g>
<rect class="outline" x="${CX + 4 - 88}" y="${226 - 107}" width="176" height="214" rx="16"/>
<rect fill="url(#${uid}-pages)" x="${CX + 6 - 83}" y="${228 - 102}" width="166" height="204" rx="14"/>
${edges}
<rect fill="url(#${uid}-cover)" x="${CX - 2 - 82}" y="120" width="164" height="200" rx="14"/>
${weave}
<rect fill="url(#${uid}-spine)" x="${CX - 71 - 13}" y="120" width="26" height="200" rx="10"/>
<rect class="band" x="${CX - 84}" y="147" width="26" height="6"/><rect class="band" x="${CX - 84}" y="287" width="26" height="6"/>
<rect class="gold-line" x="${CX + 10 - 58}" y="135" width="116" height="170" rx="10"/>
<rect class="gold-line thin" x="${CX + 10 - 54}" y="139" width="108" height="162" rx="8"/>
${corners}
<rect fill="url(#${uid}-string)" x="${CX + 2 - 92}" y="288.5" width="184" height="7" rx="3"/>
<g class="bow" transform="translate(${CX + 10} 292)"><path class="gold bow-line" d="M0 0C-8 -6 -16 -12 -20 2C-14 4 -6 2 0 0Z"/><path class="gold bow-line" d="M0 0C8 -6 16 -12 20 2C14 4 6 2 0 0Z"/><path class="tail" d="M0 0Q-3 11 -12 20M0 0Q3 11 12 20"/><ellipse class="knot" rx="5" ry="4.5"/></g>
<ellipse class="gloss" cx="170" cy="140" rx="40" ry="13" transform="rotate(-17 170 140)"/>
<g class="body-arms">${poses}</g>
<g class="face" transform="translate(${CX + 10} 192)"><g class="face-shift">
<ellipse class="cheek" cx="-44" cy="32" rx="16" ry="10" fill="url(#${uid}-cheek)"/><ellipse class="cheek" cx="44" cy="32" rx="16" ry="10" fill="url(#${uid}-cheek)"/>
${eye('L', uid)}${eye('R', uid)}
<path class="brow brow-L" d="M-46 -28Q-32 -42 -18 -28"/><path class="brow brow-R" d="M18 -28Q32 -42 46 -28"/>
<g class="mouth-box" transform="translate(0 46)"><g class="talk">${mouths}</g></g>
<g class="sweat" transform="translate(70 -34)"><path d="M0 -10C0 -10 7 -2 7 4C7 9 5 11 0 11C-5 11 -7 9 -7 4C-7 -2 0 -10 0 -10Z"/><ellipse class="spec" cx="-2" cy="3" rx="1.5" ry="2.5"/></g>
</g></g>
</g>
</svg>`;
}

