// Generated with AI for personal use.
// Hand-drawn vector characters for Battery Buddy. Plain Cairo only, so the same
// code runs inside GNOME Shell (St.DrawingArea) and in prefs (Gtk.DrawingArea).
//
// Every character is drawn facing right inside a 100x100 box with its feet
// near y=94. `s` is the animation state:
//   t       seconds since the character appeared
//   phase   walk cycle (radians, grows with distance walked)
//   moving  true while walking
//   facing  1 = right, -1 = left
//   blink   true while the eyes are closed
//   mood    'high' (excited, sparkles) or 'low' (tired, sweat drop)
//   air     current jump height in pixels (0 on the ground)
// Optional extras (all may be missing):
//   spin     rotation in radians (backflip)
//   dizzy    true for spiral eyes and a wobble
//   heart    0..1 progress of a heart floating up (petting)
//   angry    true for a throbbing anger mark
//   confetti 0..1 progress of a confetti burst
//   season   'winter' | 'newyear' | 'halloween' for an outfit
//   night    true for floating Zzz
//   squash   vertical scale around the feet (<1 squashed, >1 stretched)
//   hot      true for overheating: jitter and sweat
//   accessory 'shades' | 'crown'

const TAU = Math.PI * 2;
const OUTLINE = '#232733';
const ROUND = 1; // Cairo LineCap.ROUND and LineJoin.ROUND

export const CHARACTERS = [
    ['pirate', 'Pirate'], ['cat', 'Cat'], ['robot', 'Robot'], ['ghost', 'Ghost'],
    ['dragon', 'Dragon'], ['penguin', 'Penguin'], ['fox', 'Fox'], ['owl', 'Owl'],
];

function paint(cr, hex, alpha = 1) {
    const n = Number.parseInt(hex.slice(1), 16);
    cr.setSourceRGBA((n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, alpha);
}

function ellipse(cr, cx, cy, rx, ry) {
    cr.newSubPath();
    cr.save();
    cr.translate(cx, cy);
    cr.scale(rx, Math.max(ry, 0.01));
    cr.arc(0, 0, 1, 0, TAU);
    cr.restore();
}

function roundRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function poly(cr, ...pts) {
    cr.newSubPath();
    cr.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) cr.lineTo(pts[i], pts[i + 1]);
    cr.closePath();
}

// Fill a path with a cartoon outline.
function shape(cr, hex, build, line = 2.4, alpha = 1) {
    cr.newPath();
    build();
    paint(cr, hex, alpha);
    if (line > 0) {
        cr.fillPreserve();
        paint(cr, OUTLINE);
        cr.setLineWidth(line);
        cr.stroke();
    } else {
        cr.fill();
    }
}

// A thick outlined stroke, used for legs, arms and tails.
function limb(cr, hex, width, build) {
    for (const [color, w] of [[OUTLINE, width + 2.6], [hex, width]]) {
        cr.newPath();
        build();
        paint(cr, color);
        cr.setLineWidth(w);
        cr.stroke();
    }
}

function bob(s) {
    if (s.air > 1) return 0;
    return s.moving ? -Math.abs(Math.sin(s.phase)) * 3 : Math.sin(s.t * 2.2) * 1.2;
}

function swing(s, offset = 0, amount = 0.55) {
    if (s.air > 1) return offset ? -0.45 : 0.45;
    return s.moving ? Math.sin(s.phase + offset) * amount : 0;
}

function leg(cr, hex, width, hx, hy, len, angle, shoe) {
    const fx = hx + Math.sin(angle) * len, fy = hy + Math.cos(angle) * len;
    limb(cr, hex, width, () => { cr.moveTo(hx, hy); cr.lineTo(fx, fy); });
    if (shoe) shape(cr, shoe, () => ellipse(cr, fx + 2, fy + 1, width * 0.85, width * 0.55), 1.6);
}

function openness(s) {
    if (s.blink) return 0;
    return s.mood === 'low' ? 0.5 : 1;
}

// Swirly eye for when the buddy is dizzy.
function spiral(cr, s, x, y, r, {bg = '#ffffff', fg = OUTLINE} = {}) {
    shape(cr, bg, () => ellipse(cr, x, y, r, r), 1.4);
    paint(cr, fg);
    cr.setLineWidth(Math.max(0.9, r * 0.28));
    cr.newPath();
    for (let i = 0; i <= 36; i++) {
        const a = (i / 36) * TAU * 2 + s.t * 9, rr = r * 0.85 * (i / 36);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        if (i === 0) cr.moveTo(px, py);
        else cr.lineTo(px, py);
    }
    cr.stroke();
}

function eye(cr, s, x, y, r, {white = '#ffffff', pupil = '#1b1e27', look = 0.3} = {}) {
    if (s.dizzy) {
        spiral(cr, s, x, y, r * 1.1);
        return;
    }
    const open = openness(s);
    if (open === 0) {
        paint(cr, OUTLINE);
        cr.setLineWidth(1.8);
        cr.newPath();
        cr.moveTo(x - r, y);
        cr.curveTo(x - r / 2, y + r / 2, x + r / 2, y + r / 2, x + r, y);
        cr.stroke();
        return;
    }
    const ry = r * open, dy = (1 - open) * r * 0.5;
    shape(cr, white, () => ellipse(cr, x, y + dy, r, ry), 1.4);
    shape(cr, pupil, () => ellipse(cr, x + r * look, y + dy, r * 0.55, ry * 0.6), 0);
    paint(cr, '#ffffff');
    ellipse(cr, x + r * look + r * 0.2, y + dy - ry * 0.25, r * 0.18, r * 0.18 * open);
    cr.fill();
    if (s.mood === 'low') {
        // Heavy eyelid
        paint(cr, OUTLINE);
        cr.setLineWidth(1.8);
        cr.newPath();
        cr.moveTo(x - r * 1.1, y + dy - ry);
        cr.lineTo(x + r * 1.1, y + dy - ry);
        cr.stroke();
    }
}

function mouth(cr, s, x, y, w, color = OUTLINE) {
    paint(cr, color);
    cr.setLineWidth(1.8);
    cr.newPath();
    if (s.dizzy) {
        // Wavy, queasy mouth
        cr.moveTo(x - w, y);
        cr.curveTo(x - w / 2, y - w / 2, x - w / 4, y + w / 2, x, y);
        cr.curveTo(x + w / 4, y - w / 2, x + w / 2, y + w / 2, x + w, y);
    } else if (s.mood === 'low') {
        cr.moveTo(x - w, y + w * 0.4);
        cr.curveTo(x - w * 0.4, y - w * 0.2, x + w * 0.4, y - w * 0.2, x + w, y + w * 0.4);
    } else {
        cr.moveTo(x - w, y);
        cr.curveTo(x - w * 0.4, y + w * 0.8, x + w * 0.4, y + w * 0.8, x + w, y);
    }
    cr.stroke();
}

function sparkle(cr, x, y, r) {
    const k = r * 0.18;
    cr.newPath();
    cr.moveTo(x, y - r);
    cr.curveTo(x + k, y - k, x + k, y - k, x + r, y);
    cr.curveTo(x + k, y + k, x + k, y + k, x, y + r);
    cr.curveTo(x - k, y + k, x - k, y + k, x - r, y);
    cr.curveTo(x - k, y - k, x - k, y - k, x, y - r);
    paint(cr, '#ffe066');
    cr.fill();
}

// Mood decorations around the head: sparkles when excited, a sweat drop when tired.
function extras(cr, s, head) {
    if (s.mood === 'high') {
        const a = (Math.sin(s.t * 4) + 1) / 2, b = (Math.sin(s.t * 4 + 2) + 1) / 2;
        sparkle(cr, head.x + 20, head.y - 12, 2 + a * 4);
        sparkle(cr, head.x - 22, head.y - 4, 1.5 + b * 3.5);
    }
    if (s.mood === 'low' || s.hot) {
        const d = (s.t * (s.hot ? 1.4 : 0.7)) % 1, x = head.x - 18, y = head.y - 6 + d * 12;
        cr.newPath();
        cr.moveTo(x, y - 5);
        cr.curveTo(x + 4, y + 1, x + 4, y + 4, x, y + 4);
        cr.curveTo(x - 4, y + 4, x - 4, y + 1, x, y - 5);
        paint(cr, '#6cc3ff', 1 - d);
        cr.fill();
    }
}

function pirate(cr, s) {
    const b = bob(s), flutter = Math.sin(s.t * 7) * 3;
    // Back arm
    const back = -swing(s, 0, 0.6);
    limb(cr, '#c9473f', 5, () => { cr.moveTo(39, 50 + b); cr.lineTo(39 + Math.sin(back) * 16, 50 + b + Math.cos(back) * 16); });
    // Legs and boots
    leg(cr, '#4a3a30', 6, 45, 72 + b, 18, swing(s, 0), '#1f1a17');
    leg(cr, '#4a3a30', 6, 55, 72 + b, 18, swing(s, Math.PI), '#1f1a17');
    // Striped shirt
    const shirt = () => roundRect(cr, 36, 46 + b, 28, 28, 8);
    shape(cr, '#f7f1e3', shirt, 0);
    cr.save();
    cr.newPath();
    shirt();
    cr.clip();
    paint(cr, '#d64545');
    for (let y = 48; y < 76; y += 7) cr.rectangle(30, y + b, 40, 3.2);
    cr.fill();
    cr.restore();
    shape(cr, '#000000', shirt, 2.4, 0);
    // Belt
    shape(cr, '#3a2a20', () => cr.rectangle(36, 66 + b, 28, 5), 1.6);
    shape(cr, '#f2c94c', () => cr.rectangle(53, 65.5 + b, 6, 6), 1.4);
    // Bandana tails flapping behind the head
    shape(cr, '#d63c3c', () => poly(cr, 37, 24 + b, 25, 21 + b + flutter, 28, 28 + b + flutter * 0.6), 1.8);
    shape(cr, '#d63c3c', () => poly(cr, 37, 26 + b, 27, 32 + b - flutter * 0.5, 31, 35 + b - flutter * 0.3), 1.8);
    // Head
    shape(cr, '#f2c48d', () => ellipse(cr, 51, 32 + b, 15, 15));
    // Bandana with dots
    shape(cr, '#d63c3c', () => {
        cr.moveTo(35.5, 30 + b);
        cr.curveTo(36, 13 + b, 66, 13 + b, 66.5, 30 + b);
        cr.curveTo(56, 25 + b, 46, 25 + b, 35.5, 30 + b);
        cr.closePath();
    }, 2);
    paint(cr, '#ffffff');
    for (const [x, y] of [[44, 21], [53, 19], [61, 23]]) { ellipse(cr, x, y + b, 1.6, 1.6); cr.fill(); }
    // Eye patch, strap and one eye
    paint(cr, OUTLINE);
    cr.setLineWidth(1.4);
    cr.newPath();
    cr.moveTo(38, 27 + b);
    cr.lineTo(62, 38 + b);
    cr.stroke();
    shape(cr, '#14161c', () => ellipse(cr, 47, 33 + b, 4.6, 4), 1.2);
    eye(cr, s, 58, 32 + b, 3.4);
    // Nose, mouth, stubble, earring
    shape(cr, '#d9a06a', () => ellipse(cr, 55, 37 + b, 2.6, 2.2), 1.2);
    mouth(cr, s, 52, 41.5 + b, 4);
    shape(cr, '#f2c94c', () => ellipse(cr, 38, 38 + b, 2, 2), 1.2);
    // Front arm with a hook
    const front = swing(s, 0, 0.6);
    const hx = 61 + Math.sin(front) * 16, hy = 50 + b + Math.cos(front) * 16;
    limb(cr, '#c9473f', 5, () => { cr.moveTo(61, 50 + b); cr.lineTo(hx, hy); });
    limb(cr, '#c9ced6', 2.2, () => { cr.arc(hx + 3, hy + 3, 3.2, Math.PI * 0.7, Math.PI * 2.1); });
    return {x: 51, y: 22 + b, eyes: {x: 52.5, y: 32.5 + b, w: 22}};
}

function cat(cr, s) {
    const b = bob(s) * 0.7, wag = Math.sin(s.t * 3) * 6;
    limb(cr, '#f2a541', 5, () => { cr.moveTo(27, 66 + b); cr.curveTo(12, 62 + b, 10 + wag * 0.3, 42 + b, 16 + wag, 32 + b); });
    leg(cr, '#d98a2b', 5, 37, 74 + b, 17, swing(s, Math.PI), '#e9cfa8');
    leg(cr, '#d98a2b', 5, 63, 74 + b, 17, swing(s, 0), '#e9cfa8');
    shape(cr, '#f2a541', () => ellipse(cr, 50, 68 + b, 26, 13));
    paint(cr, '#c7782a');
    cr.setLineWidth(2.4);
    for (const x of [38, 46, 54]) {
        cr.newPath();
        cr.moveTo(x, 56 + b);
        cr.curveTo(x + 2, 59 + b, x + 2, 61 + b, x, 64 + b);
        cr.stroke();
    }
    leg(cr, '#f2a541', 5, 32, 74 + b, 17, swing(s, 0), '#fbe9d0');
    leg(cr, '#f2a541', 5, 68, 74 + b, 17, swing(s, Math.PI), '#fbe9d0');
    // Ears then head
    shape(cr, '#f2a541', () => poly(cr, 63, 46 + b, 65, 29 + b, 75, 38 + b), 2);
    shape(cr, '#f2a541', () => poly(cr, 76, 37 + b, 86, 28 + b, 88, 46 + b), 2);
    shape(cr, '#f5b5c4', () => poly(cr, 66, 41 + b, 66.5, 33 + b, 71, 38 + b), 0);
    shape(cr, '#f5b5c4', () => poly(cr, 80, 37 + b, 85, 32 + b, 85.5, 41 + b), 0);
    shape(cr, '#f2a541', () => ellipse(cr, 76, 51 + b, 15, 13.5));
    eye(cr, s, 70, 49 + b, 3.6);
    eye(cr, s, 82, 49 + b, 3.6);
    shape(cr, '#f08aa0', () => poly(cr, 74, 54 + b, 78, 54 + b, 76, 56.5 + b), 1);
    mouth(cr, s, 76, 58 + b, 3);
    paint(cr, OUTLINE, 0.7);
    cr.setLineWidth(1);
    cr.newPath();
    for (const dy of [-1.5, 1.5]) {
        cr.moveTo(69, 56 + b); cr.lineTo(59, 55 + b + dy * 2);
        cr.moveTo(83, 56 + b); cr.lineTo(94, 55 + b + dy * 2);
    }
    cr.stroke();
    return {x: 76, y: 40 + b, eyes: {x: 76, y: 49 + b, w: 22}};
}

function fox(cr, s) {
    const b = bob(s) * 0.7, wag = Math.sin(s.t * 2.5) * 5;
    // Bushy tail with white tip
    shape(cr, '#e8742c', () => {
        cr.moveTo(29, 63 + b);
        cr.curveTo(16, 72 + b, 2, 60 + wag, 6, 42 + wag);
        cr.curveTo(16, 44 + wag, 24, 53 + b, 31, 57 + b);
        cr.closePath();
    });
    shape(cr, '#fbf5ec', () => ellipse(cr, 7, 46 + wag, 4.5, 5), 1.6);
    leg(cr, '#4a2c1d', 4.5, 37, 74 + b, 17, swing(s, Math.PI), '#2e1b12');
    leg(cr, '#4a2c1d', 4.5, 63, 74 + b, 17, swing(s, 0), '#2e1b12');
    shape(cr, '#e8742c', () => ellipse(cr, 50, 68 + b, 25, 12));
    shape(cr, '#fbf5ec', () => ellipse(cr, 66, 71 + b, 7, 6), 0);
    leg(cr, '#5a3422', 4.5, 32, 74 + b, 17, swing(s, 0), '#2e1b12');
    leg(cr, '#5a3422', 4.5, 68, 74 + b, 17, swing(s, Math.PI), '#2e1b12');
    // Ears with dark tips
    shape(cr, '#e8742c', () => poly(cr, 62, 44 + b, 63, 25 + b, 72, 38 + b), 2);
    shape(cr, '#e8742c', () => poly(cr, 72, 38 + b, 80, 24 + b, 83, 43 + b), 2);
    shape(cr, '#3a2318', () => poly(cr, 62.6, 31 + b, 63, 25 + b, 66, 29.5 + b), 0);
    shape(cr, '#3a2318', () => poly(cr, 77.5, 28.5 + b, 80, 24 + b, 80.8, 30 + b), 0);
    // Snout then head
    shape(cr, '#e8742c', () => poly(cr, 76, 45 + b, 94, 54 + b, 76, 60 + b), 2);
    shape(cr, '#fbf5ec', () => poly(cr, 78, 56 + b, 92, 55.5 + b, 78, 59.5 + b), 0);
    shape(cr, '#e8742c', () => ellipse(cr, 72, 50 + b, 13, 11.5));
    shape(cr, '#fbf5ec', () => ellipse(cr, 76, 56 + b, 5, 3.5), 0);
    shape(cr, '#1b1e27', () => ellipse(cr, 93.5, 54 + b, 2.4, 2.2), 0);
    eye(cr, s, 69, 47 + b, 3.2);
    eye(cr, s, 79, 47 + b, 3.2);
    mouth(cr, s, 84, 58.5 + b, 3);
    return {x: 72, y: 38 + b, eyes: {x: 74, y: 47 + b, w: 20}};
}

function robot(cr, s) {
    const b = s.air > 1 ? 0 : (s.moving ? -Math.abs(Math.sin(s.phase)) * 2 : 0);
    const glow = s.mood === 'low' ? '#ffb347' : '#5ef2ff';
    leg(cr, '#7d8796', 6, 43, 74 + b, 16, swing(s, 0, 0.4), '#3c4452');
    leg(cr, '#7d8796', 6, 57, 74 + b, 16, swing(s, Math.PI, 0.4), '#3c4452');
    const back = -swing(s, 0, 0.5);
    limb(cr, '#8e9aab', 4.5, () => { cr.moveTo(32, 52 + b); cr.lineTo(32 + Math.sin(back) * 15, 52 + b + Math.cos(back) * 15); });
    shape(cr, '#a9b6c8', () => roundRect(cr, 30, 44 + b, 40, 32, 6));
    shape(cr, '#2c3445', () => roundRect(cr, 38, 52 + b, 24, 13, 3), 1.6);
    for (let i = 0; i < 3; i++) {
        const on = Math.floor(s.t * 3) % 3 === i;
        shape(cr, on ? glow : '#4b5568', () => ellipse(cr, 43 + i * 7, 58.5 + b, 2.2, 2.2), 0);
    }
    shape(cr, '#7d8796', () => cr.rectangle(45, 39 + b, 10, 6), 1.6);
    // Antenna with pulsing light
    limb(cr, '#7d8796', 1.6, () => { cr.moveTo(50, 17 + b); cr.lineTo(50, 8 + b); });
    const pulse = (Math.sin(s.t * 5) + 1) / 2;
    shape(cr, '#ff5a5f', () => ellipse(cr, 50, 6 + b, 3.2, 3.2), 1.6, 0.4 + pulse * 0.6);
    shape(cr, '#c2ccda', () => roundRect(cr, 33, 16 + b, 34, 25, 7));
    shape(cr, '#8e9aab', () => ellipse(cr, 32, 28 + b, 2.6, 4), 1.4);
    shape(cr, '#8e9aab', () => ellipse(cr, 68, 28 + b, 2.6, 4), 1.4);
    shape(cr, '#1d2533', () => roundRect(cr, 37, 20.5 + b, 26, 16, 4), 1.6);
    const open = openness(s);
    for (const x of [44, 56]) {
        if (s.dizzy) {
            spiral(cr, s, x + 1.5, 26 + b, 3.6, {bg: '#1d2533', fg: glow});
        } else if (open === 0) {
            paint(cr, glow);
            cr.rectangle(x - 3 + 1.5, 26 + b, 6, 1.4);
            cr.fill();
        } else {
            paint(cr, glow);
            const h = 6 * open;
            roundRect(cr, x - 3 + 1.5, 23 + b + (6 - h), 6, h, Math.min(1.5, h / 2));
            cr.fill();
        }
    }
    mouth(cr, s, 51.5, 33 + b, 4, glow);
    const front = swing(s, 0, 0.5);
    const fx = 68 + Math.sin(front) * 15, fy = 52 + b + Math.cos(front) * 15;
    limb(cr, '#8e9aab', 4.5, () => { cr.moveTo(68, 52 + b); cr.lineTo(fx, fy); });
    limb(cr, '#5b6575', 1.8, () => { cr.arc(fx, fy + 2, 3, Math.PI * 0.1, Math.PI * 0.9); });
    return {x: 50, y: 18 + b, eyes: {x: 51.5, y: 26 + b, w: 24}};
}

function ghost(cr, s) {
    const f = Math.sin(s.t * 2.5) * 4 - 6;
    const arm = s.moving ? Math.sin(s.phase) * 3 : Math.sin(s.t * 2) * 1.5;
    shape(cr, '#e9edfb', () => ellipse(cr, 24, 58 + f + arm, 6, 4), 2, 0.95);
    shape(cr, '#e9edfb', () => ellipse(cr, 76, 58 + f - arm, 6, 4), 2, 0.95);
    shape(cr, '#f4f6ff', () => {
        cr.moveTo(24, 80 + f);
        cr.lineTo(24, 42 + f);
        cr.arc(50, 42 + f, 26, Math.PI, TAU);
        cr.lineTo(76, 80 + f);
        for (let i = 0; i < 4; i++) {
            const x0 = 76 - 13 * i, w = Math.sin(s.t * 6 + i * 1.3) * 3;
            cr.curveTo(x0 - 3, 88 + f + w, x0 - 10, 88 + f + w, x0 - 13, 80 + f);
        }
        cr.closePath();
    }, 2.4, 0.95);
    shape(cr, '#ffb3c6', () => ellipse(cr, 40, 49 + f, 4, 2.4), 0, 0.7);
    shape(cr, '#ffb3c6', () => ellipse(cr, 66, 49 + f, 4, 2.4), 0, 0.7);
    eye(cr, s, 45, 40 + f, 4.4, {white: '#2a2d3a', pupil: '#2a2d3a', look: 0.1});
    eye(cr, s, 60, 40 + f, 4.4, {white: '#2a2d3a', pupil: '#2a2d3a', look: 0.1});
    if (s.mood === 'low') mouth(cr, s, 52.5, 52 + f, 4);
    else shape(cr, '#2a2d3a', () => ellipse(cr, 52.5, 52 + f, 3.2, 3.8 + Math.sin(s.t * 3) * 0.8), 0);
    return {x: 50, y: 22 + f, eyes: {x: 52.5, y: 40 + f, w: 26}};
}

function dragon(cr, s) {
    const b = bob(s);
    const flap = Math.sin(s.t * (s.moving || s.air > 1 ? 12 : 4)) * 0.35;
    // Tail with spade
    limb(cr, '#58b368', 6, () => { cr.moveTo(32, 76 + b); cr.curveTo(18, 84 + b, 8, 80 + b, 9, 66 + b); });
    shape(cr, '#3d9a5b', () => poly(cr, 9, 58 + b, 14, 66 + b, 9, 70 + b, 4, 66 + b), 1.8);
    // Wing behind the body
    cr.save();
    cr.translate(42, 52 + b);
    cr.rotate(-flap);
    shape(cr, '#79c98a', () => poly(cr, 0, 0, -6, -28, -14, -18, -24, -22, -24, -6, -30, -2), 2);
    cr.restore();
    leg(cr, '#3d9a5b', 7, 42, 78 + b, 13, swing(s, Math.PI, 0.45), '#2f7a47');
    shape(cr, '#58b368', () => ellipse(cr, 48, 66 + b, 21, 19));
    shape(cr, '#f5d77a', () => ellipse(cr, 55, 70 + b, 11, 13), 1.6);
    paint(cr, '#d9b552');
    cr.setLineWidth(1.4);
    cr.newPath();
    for (const y of [63, 68, 73, 78]) { cr.moveTo(47, y + b); cr.lineTo(63, y + b); }
    cr.stroke();
    for (const [x, y] of [[31, 56], [36, 50], [43, 47]])
        shape(cr, '#f0a35e', () => poly(cr, x - 3, y + 3 + b, x - 4, y - 5 + b, x + 3, y + b), 1.6);
    leg(cr, '#58b368', 7, 54, 78 + b, 13, swing(s, 0, 0.45), '#2f7a47');
    limb(cr, '#58b368', 4.5, () => { cr.moveTo(60, 60 + b); cr.lineTo(67, 65 + b + swing(s, 0, 2)); });
    // Head
    shape(cr, '#fff2c8', () => poly(cr, 55, 30 + b, 57, 19 + b, 62, 27 + b), 1.6);
    shape(cr, '#fff2c8', () => poly(cr, 64, 27 + b, 69, 18 + b, 70, 29 + b), 1.6);
    shape(cr, '#58b368', () => ellipse(cr, 76, 45 + b, 11, 8));
    shape(cr, '#58b368', () => ellipse(cr, 63, 40 + b, 14, 13));
    shape(cr, '#2f7a47', () => ellipse(cr, 83, 43 + b, 1.3, 1.6), 0);
    shape(cr, '#2f7a47', () => ellipse(cr, 85.5, 44.5 + b, 1.3, 1.6), 0);
    eye(cr, s, 60, 37 + b, 3.8);
    eye(cr, s, 69, 36 + b, 3.8);
    mouth(cr, s, 77, 49 + b, 4);
    // Little fire puff when excited and standing still
    const cycle = s.t % 5;
    if (s.mood === 'high' && !s.moving && cycle < 0.9) {
        const k = Math.sin((cycle / 0.9) * Math.PI);
        shape(cr, '#ff8a3d', () => ellipse(cr, 92, 44 + b, 6 * k + 0.5, 4 * k + 0.5), 0, 0.9);
        shape(cr, '#ffe066', () => ellipse(cr, 91, 44 + b, 3.4 * k + 0.3, 2.2 * k + 0.3), 0);
    }
    return {x: 63, y: 26 + b, eyes: {x: 64.5, y: 36.5 + b, w: 20}};
}

function penguin(cr, s) {
    const tilt = s.air > 1 ? 0 : (s.moving ? Math.sin(s.phase) * 0.13 : Math.sin(s.t * 1.5) * 0.03);
    const lift = i => (s.moving ? Math.max(0, Math.sin(s.phase + i * Math.PI)) * 3 : 0);
    cr.save();
    cr.translate(50, 94);
    cr.rotate(tilt);
    cr.translate(-50, -94);
    shape(cr, '#f59e2c', () => ellipse(cr, 43, 92 - lift(0), 7, 3), 1.6);
    shape(cr, '#f59e2c', () => ellipse(cr, 59, 92 - lift(1), 7, 3), 1.6);
    const wave = s.moving ? Math.sin(s.phase) * 0.4 : Math.sin(s.t * 2) * 0.06;
    cr.save();
    cr.translate(31, 54);
    cr.rotate(0.3 - wave);
    shape(cr, '#2b3040', () => ellipse(cr, 0, 12, 5, 13));
    cr.restore();
    shape(cr, '#2b3040', () => ellipse(cr, 50, 60, 22, 32));
    shape(cr, '#fbfbf7', () => ellipse(cr, 54, 65, 15, 24), 1.4);
    shape(cr, '#2a8fd1', () => roundRect(cr, 33, 49, 36, 6, 3), 1.6);
    shape(cr, '#2a8fd1', () => roundRect(cr, 36, 52, 6, 13, 3), 1.6);
    eye(cr, s, 50, 41, 3.4);
    eye(cr, s, 61, 41, 3.4);
    shape(cr, '#f59e2c', () => poly(cr, 59, 45, 71, 47.5, 59, 50), 1.6);
    shape(cr, '#ffb3c6', () => ellipse(cr, 66, 51, 3, 1.8), 0, 0.6);
    cr.save();
    cr.translate(69, 54);
    cr.rotate(-0.3 + wave);
    shape(cr, '#2b3040', () => ellipse(cr, 0, 12, 5, 13));
    cr.restore();
    cr.restore();
    return {x: 55, y: 30, eyes: {x: 55.5, y: 41, w: 20}};
}

function owl(cr, s) {
    const b = bob(s);
    const flap = s.moving || s.air > 1 ? Math.sin(s.t * 14) * 0.6 : Math.sin(s.t * 1.2) * 0.05;
    shape(cr, '#f59e2c', () => poly(cr, 40, 89, 46, 89, 43, 94), 1.4);
    shape(cr, '#f59e2c', () => poly(cr, 54, 89, 60, 89, 57, 94), 1.4);
    shape(cr, '#7d5230', () => poly(cr, 32, 38 + b, 29, 22 + b, 43, 31 + b), 2);
    shape(cr, '#7d5230', () => poly(cr, 68, 38 + b, 71, 22 + b, 57, 31 + b), 2);
    shape(cr, '#9c6a3c', () => ellipse(cr, 50, 60 + b, 24, 30));
    shape(cr, '#e6c79a', () => ellipse(cr, 50, 70 + b, 15, 17), 1.4);
    paint(cr, '#b68a5a');
    cr.setLineWidth(1.4);
    cr.newPath();
    for (const [x, y] of [[44, 63], [52, 63], [48, 70], [56, 70], [44, 77], [52, 77]]) {
        cr.moveTo(x - 2.5, y + b); cr.lineTo(x, y + 2.5 + b); cr.lineTo(x + 2.5, y + b);
    }
    cr.stroke();
    shape(cr, '#f0dcb8', () => { ellipse(cr, 41, 45 + b, 10, 10); ellipse(cr, 59, 45 + b, 10, 10); }, 1.6);
    eye(cr, s, 41, 45 + b, 6.5, {white: '#ffd54a', look: 0.25});
    eye(cr, s, 59, 45 + b, 6.5, {white: '#ffd54a', look: 0.25});
    shape(cr, '#f59e2c', () => poly(cr, 47, 52 + b, 53, 52 + b, 50, 59 + b), 1.4);
    for (const [x, dir] of [[27, -1], [73, 1]]) {
        cr.save();
        cr.translate(x, 50 + b);
        cr.rotate(dir * (0.12 + flap));
        shape(cr, '#7d5230', () => ellipse(cr, 0, 14, 7, 16));
        cr.restore();
    }
    return {x: 50, y: 30 + b, eyes: {x: 50, y: 45 + b, w: 34}};
}

// ---- Outfits and overlays -------------------------------------------------

function santaHat(cr, x, y) {
    shape(cr, '#d62f3a', () => {
        cr.moveTo(x - 12, y);
        cr.curveTo(x - 9, y - 14, x + 4, y - 22, x + 17, y - 14);
        cr.curveTo(x + 11, y - 13, x + 10, y - 8, x + 12, y);
        cr.closePath();
    }, 2);
    shape(cr, '#ffffff', () => ellipse(cr, x + 17.5, y - 13.5, 3.6, 3.6), 1.6);
    shape(cr, '#ffffff', () => roundRect(cr, x - 14, y - 3, 28, 6.5, 3.2), 1.8);
}

function partyHat(cr, x, y) {
    const hat = () => poly(cr, x - 8, y + 1, x + 8, y + 1, x + 2, y - 20);
    shape(cr, '#7c5cff', hat, 0);
    cr.save();
    cr.newPath();
    hat();
    cr.clip();
    paint(cr, '#ffe066');
    for (let i = -24; i < 6; i += 7) cr.rectangle(x - 12, y + i, 28, 3);
    cr.fill();
    cr.restore();
    shape(cr, '#000000', hat, 2, 0);
    shape(cr, '#ff6fa8', () => ellipse(cr, x + 2, y - 20, 3, 3), 1.6);
}

function pumpkin(cr, s, x, y) {
    shape(cr, '#3d9a5b', () => roundRect(cr, x - 1.5, y - 11, 3, 5, 1), 1.4);
    shape(cr, '#f28c28', () => {
        ellipse(cr, x - 4, y, 6, 7);
        ellipse(cr, x + 4, y, 6, 7);
        ellipse(cr, x, y, 6, 7.5);
    }, 1.8);
    // Flickering jack-o'-lantern face
    paint(cr, '#ffd23f', 0.75 + Math.sin(s.t * 13) * 0.25);
    poly(cr, x - 5, y - 1, x - 2, y - 1, x - 3.5, y - 4);
    poly(cr, x + 2, y - 1, x + 5, y - 1, x + 3.5, y - 4);
    poly(cr, x - 5, y + 2, x - 2.5, y + 3.5, x, y + 2, x + 2.5, y + 3.5, x + 5, y + 2, x + 2.5, y + 5, x - 2.5, y + 5);
    cr.fill();
}

function crown(cr, x, y) {
    shape(cr, '#ffd23f', () => poly(cr, x - 12, y + 1, x - 13, y - 11, x - 6.5, y - 4, x, y - 14, x + 6.5, y - 4, x + 13, y - 11, x + 12, y + 1), 2);
    paint(cr, '#e8a800');
    cr.rectangle(x - 12, y - 2.5, 24, 2.2);
    cr.fill();
    shape(cr, '#ff4f7b', () => ellipse(cr, x, y - 6, 2.2, 2.2), 1.2);
    shape(cr, '#5ef2ff', () => ellipse(cr, x - 7, y - 3.5, 1.6, 1.6), 1);
    shape(cr, '#5ef2ff', () => ellipse(cr, x + 7, y - 3.5, 1.6, 1.6), 1);
}

function shades(cr, {x, y, w}) {
    const rx = w * 0.25, ry = w * 0.18, dx = w * 0.27;
    paint(cr, OUTLINE);
    cr.setLineWidth(1.8);
    cr.newPath();
    cr.moveTo(x - dx + rx * 0.8, y - ry * 0.4);
    cr.lineTo(x + dx - rx * 0.8, y - ry * 0.4);
    cr.stroke();
    for (const cx of [x - dx, x + dx]) {
        shape(cr, '#1b1e27', () => roundRect(cr, cx - rx, y - ry, rx * 2, ry * 2, ry * 0.9), 1.6);
        paint(cr, '#ffffff', 0.55);
        cr.newPath();
        cr.moveTo(cx - rx * 0.55, y - ry * 0.35);
        cr.lineTo(cx - rx * 0.1, y - ry * 0.7);
        cr.setLineWidth(1.2);
        cr.stroke();
    }
}

function heart(cr, x, y, r, alpha) {
    cr.newPath();
    cr.moveTo(x, y + r);
    cr.curveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.5, x, y - r * 0.5);
    cr.curveTo(x + r * 0.8, y - r * 1.5, x + r * 1.6, y - r * 0.2, x, y + r);
    paint(cr, '#ff4f7b', alpha);
    cr.fillPreserve();
    paint(cr, OUTLINE, alpha);
    cr.setLineWidth(1.4);
    cr.stroke();
}

// Cartoon "throbbing vein" anger mark.
function angerMark(cr, s, x, y) {
    const r = 4.5 + Math.abs(Math.sin(s.t * 6)) * 1.5;
    paint(cr, '#e5383b');
    cr.setLineWidth(2);
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2 + Math.PI / 4;
        const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
        cr.newPath();
        cr.arc(cx, cy, r * 0.7, a + Math.PI * 0.75, a + Math.PI * 1.25);
        cr.stroke();
    }
}

function zzz(cr, s, x, y) {
    paint(cr, '#a5b4fc');
    cr.setLineWidth(1.6);
    for (let i = 0; i < 3; i++) {
        const p = (s.t * 0.4 + i / 3) % 1, z = 2.5 + p * 3.5;
        const zx = x + 4 + p * 12, zy = y - 2 - p * 22;
        paint(cr, '#a5b4fc', Math.sin(p * Math.PI));
        cr.newPath();
        cr.moveTo(zx - z, zy - z);
        cr.lineTo(zx + z, zy - z);
        cr.lineTo(zx - z, zy + z);
        cr.lineTo(zx + z, zy + z);
        cr.stroke();
    }
}

const CONFETTI = ['#ff5a5f', '#ffe066', '#5ef2ff', '#7c5cff', '#58b368', '#ff9f1c'];
const noise = n => { const v = Math.sin(n * 12.9898) * 43758.5453; return v - Math.floor(v); };

function confetti(cr, p) {
    const time = p * 1.6;
    for (let i = 0; i < 28; i++) {
        const vx = (noise(i) - 0.5) * 70, vy = -55 - noise(i + 50) * 45;
        const x = 50 + vx * time, y = 50 + vy * time + 65 * time * time;
        cr.save();
        cr.translate(x, y);
        cr.rotate(time * (4 + noise(i + 9) * 8));
        paint(cr, CONFETTI[i % CONFETTI.length], p > 0.75 ? (1 - p) * 4 : 1);
        cr.rectangle(-2, -1, 4, 2.2);
        cr.fill();
        cr.restore();
    }
}

function rotateAround(cr, x, y, angle) {
    cr.translate(x, y);
    cr.rotate(angle);
    cr.translate(-x, -y);
}

const DRAW = {pirate, cat, robot, ghost, dragon, penguin, fox, owl};

export function drawCharacter(cr, name, size, s) {
    cr.save();
    cr.scale(size / 100, size / 100);
    cr.setLineCap(ROUND);
    cr.setLineJoin(ROUND);
    // Ground shadow fades while airborne
    const up = Math.min(1, (s.air ?? 0) / 120);
    paint(cr, '#000000', 0.2 * (1 - up * 0.7));
    ellipse(cr, 50, 96, 24 * (1 - up * 0.4), 3.4);
    cr.fill();

    cr.save();
    if (s.squash && s.squash !== 1) {
        cr.translate(50, 94);
        cr.scale(1 / Math.sqrt(s.squash), s.squash);
        cr.translate(-50, -94);
    }
    if (s.hot) cr.translate(Math.sin(s.t * 70) * 0.7, Math.cos(s.t * 53) * 0.4);
    if (s.dizzy) rotateAround(cr, 50, 94, Math.sin(s.t * 7) * 0.16);
    if (s.spin) rotateAround(cr, 50, 58, s.spin);
    if (s.facing < 0) {
        cr.translate(100, 0);
        cr.scale(-1, 1);
    }
    const head = (DRAW[name] ?? DRAW.pirate)(cr, s);
    extras(cr, s, head);
    if (s.accessory === 'shades' && head.eyes) shades(cr, head.eyes);
    if (s.accessory === 'crown') crown(cr, head.x, head.y);
    else if (s.season === 'winter') santaHat(cr, head.x, head.y);
    else if (s.season === 'newyear') partyHat(cr, head.x, head.y);
    if (s.season === 'halloween') pumpkin(cr, s, 86, 87);
    cr.restore();

    // Overlays are drawn unflipped so letters and hearts stay the right way round.
    const hx = s.facing < 0 ? 100 - head.x : head.x;
    if (s.night && !s.dizzy) zzz(cr, s, hx + 6, head.y);
    if (s.angry && !s.dizzy) angerMark(cr, s, hx - 16, head.y + 2);
    if (s.heart !== null && s.heart !== undefined) heart(cr, hx, head.y - 6 - s.heart * 20, 5 + s.heart * 2, 1 - s.heart);
    if (s.confetti !== null && s.confetti !== undefined) confetti(cr, s.confetti);
    cr.restore();
}

// Which outfit the calendar calls for, if any.
export function seasonFor(date) {
    const m = date.getMonth() + 1, d = date.getDate();
    if ((m === 12 && d === 31) || (m === 1 && d === 1)) return 'newyear';
    if (m === 12) return 'winter';
    if (m === 10 && d >= 20) return 'halloween';
    return null;
}

export function isNight(date) {
    const h = date.getHours();
    return h >= 0 && h < 5;
}
