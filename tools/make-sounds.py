#!/usr/bin/env python3
"""Synthesize Battery Buddy's sound effects into sounds/*.wav (standard library only)."""
import math
import pathlib
import random
import struct
import wave

RATE = 22050
OUT = pathlib.Path(__file__).resolve().parent.parent / 'sounds'


def env(i, n, attack=0.02, release=0.08):
    t, d = i / RATE, n / RATE
    return min(1.0, t / attack if attack else 1.0, (d - t) / release if release else 1.0)


def tone(seconds, freq, wave_fn='sine', attack=0.02, release=0.08, vibrato=(0, 0), volume=0.5):
    """freq is a function of progress p (0..1) giving Hz."""
    n = int(seconds * RATE)
    out, phase = [], 0.0
    for i in range(n):
        p = i / n
        f = freq(p) + vibrato[1] * math.sin(2 * math.pi * vibrato[0] * i / RATE)
        phase += 2 * math.pi * f / RATE
        if wave_fn == 'sine':
            v = math.sin(phase)
        elif wave_fn == 'square':
            v = 1.0 if math.sin(phase) >= 0 else -1.0
        elif wave_fn == 'saw':
            v = (phase / math.pi) % 2 - 1
        elif wave_fn == 'triangle':
            v = 2 * abs((phase / math.pi) % 2 - 1) - 1
        else:  # soft, a sine with a few harmonics
            v = math.sin(phase) + 0.4 * math.sin(2 * phase) + 0.2 * math.sin(3 * phase)
            v /= 1.6
        out.append(v * env(i, n, attack, release) * volume)
    return out


def silence(seconds):
    return [0.0] * int(seconds * RATE)


def lowpass(samples, amount):
    out, y = [], 0.0
    for x in samples:
        y += amount * (x - y)
        out.append(y)
    return out


def mix(*tracks):
    n = max(map(len, tracks))
    return [sum(t[i] for t in tracks if i < len(t)) for i in range(n)]


def glide(*points):
    """Piecewise-linear frequency curve through evenly spaced points."""
    def f(p):
        x = p * (len(points) - 1)
        i = min(int(x), len(points) - 2)
        return points[i] + (points[i + 1] - points[i]) * (x - i)
    return f


def save(name, samples):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = min(1.0, 0.8 / peak)
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(s * scale * 32767)) for s in samples))


def main():
    random.seed(7)
    OUT.mkdir(exist_ok=True)

    # Pirate: a gravelly, rolling "arrr"
    arr = tone(0.6, glide(150, 130, 105), 'saw', attack=0.04, release=0.15)
    arr = [s * (0.65 + 0.35 * math.sin(2 * math.pi * 28 * i / RATE)) for i, s in enumerate(arr)]
    save('pirate', lowpass(arr, 0.18))

    # Cat: a rising-then-falling "mew"
    save('cat', tone(0.45, glide(520, 820, 900, 620), 'soft', attack=0.05, release=0.15, vibrato=(7, 12)))

    # Robot: three square-wave beeps
    save('robot', [s for f in (880, 660, 1320) for s in tone(0.08, lambda p, f=f: f, 'square', 0.005, 0.01, volume=0.25) + silence(0.04)])

    # Ghost: a wobbly, theremin-ish "oooOOOooo"
    save('ghost', tone(0.9, glide(280, 380, 300), 'sine', attack=0.25, release=0.3, vibrato=(5, 25)))

    # Dragon: a short roar, low growl plus filtered noise
    n = int(0.7 * RATE)
    noise = lowpass([random.uniform(-1, 1) * env(i, n, 0.05, 0.3) for i in range(n)], 0.08)
    save('dragon', mix(tone(0.7, glide(90, 75, 60), 'saw', 0.05, 0.3, volume=0.4), [s * 3 for s in noise]))

    # Penguin: squeaky chirps
    save('penguin', [s for _ in range(3) for s in tone(0.07, glide(1200, 1800), 'sine', 0.005, 0.02) + silence(0.035)])

    # Fox: two quick yips
    save('fox', [s for _ in range(2) for s in tone(0.12, glide(700, 1400, 900), 'soft', 0.005, 0.04) + silence(0.06)])

    # Owl: "hoo hoo"
    save('owl', tone(0.25, lambda p: 390, 'sine', 0.06, 0.1) + silence(0.08) + tone(0.35, lambda p: 360, 'sine', 0.06, 0.15))

    # Shared: a victory arpeggio and a springy boing
    save('tada', [s for f in (523, 659, 784) for s in tone(0.09, lambda p, f=f: f, 'triangle', 0.005, 0.02)] + tone(0.4, lambda p: 1047, 'triangle', 0.005, 0.3))
    save('boing', tone(0.35, lambda p: 220 + 380 * p + 60 * math.sin(p * 40) * (1 - p), 'sine', 0.005, 0.15))
    print(f'Wrote sounds to {OUT}')


if __name__ == '__main__':
    main()
