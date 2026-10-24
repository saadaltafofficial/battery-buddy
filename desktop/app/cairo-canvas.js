// characters.js is written against Cairo's drawing API (as used in GNOME).
// This wraps an HTML canvas 2D context so the exact same drawing code runs here.
// Only the calls characters.js uses are implemented.
const CAPS = ['butt', 'round', 'square'];
const JOINS = ['miter', 'round', 'bevel'];

export function cairoFor(ctx) {
    // Cairo's newSubPath() starts a fresh subpath without a current point:
    // the next arc/lineTo begins there instead of drawing a line to it.
    let fresh = false;
    const color = (r, g, b, a = 1) => {
        const c = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
        ctx.fillStyle = c;
        ctx.strokeStyle = c;
    };
    return {
        save: () => ctx.save(),
        restore: () => ctx.restore(),
        scale: (x, y) => ctx.scale(x, y),
        translate: (x, y) => ctx.translate(x, y),
        rotate: a => ctx.rotate(a),
        setLineCap: c => { ctx.lineCap = CAPS[c] ?? 'butt'; },
        setLineJoin: j => { ctx.lineJoin = JOINS[j] ?? 'miter'; },
        setLineWidth: w => { ctx.lineWidth = w; },
        setSourceRGBA: color,
        setSourceRGB: (r, g, b) => color(r, g, b, 1),
        newPath: () => { ctx.beginPath(); fresh = false; },
        newSubPath: () => { fresh = true; },
        moveTo: (x, y) => { ctx.moveTo(x, y); fresh = false; },
        lineTo: (x, y) => {
            if (fresh) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
            fresh = false;
        },
        curveTo: (x1, y1, x2, y2, x3, y3) => { ctx.bezierCurveTo(x1, y1, x2, y2, x3, y3); fresh = false; },
        arc: (cx, cy, r, a1, a2) => {
            if (fresh) ctx.moveTo(cx + r * Math.cos(a1), cy + r * Math.sin(a1));
            ctx.arc(cx, cy, r, a1, a2);
            fresh = false;
        },
        closePath: () => ctx.closePath(),
        rectangle: (x, y, w, h) => { ctx.rect(x, y, w, h); fresh = false; },
        // Cairo clears the path after fill/stroke/clip; canvas keeps it.
        fill: () => { ctx.fill(); ctx.beginPath(); },
        fillPreserve: () => ctx.fill(),
        stroke: () => { ctx.stroke(); ctx.beginPath(); },
        strokePreserve: () => ctx.stroke(),
        clip: () => { ctx.clip(); ctx.beginPath(); },
        $dispose: () => {},
    };
}
