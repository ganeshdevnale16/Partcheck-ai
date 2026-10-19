/* Inspection AI – tiny QR code encoder (no internet, no library).
   Byte mode, error correction M (falls back to L for long text), versions 1-40, automatic mask choice.
   QRGen.matrix(text) -> boolean[][]   QRGen.toDataURL(text, size, dark, light) -> PNG data URL */
(() => {
  'use strict';
  const ECC = {
    L: { bits: 1, cw: [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
      blocks: [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25] },
    M: { bits: 0, cw: [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
      blocks: [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49] },
  };

  function rawModules(v) {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  }
  const dataCodewords = (v, e) => Math.floor(rawModules(v) / 8) - ECC[e].cw[v] * ECC[e].blocks[v];

  function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z & 0xff; }
  function rsDivisor(deg) {
    const r = new Array(deg).fill(0); r[deg - 1] = 1; let root = 1;
    for (let i = 0; i < deg; i++) { for (let j = 0; j < deg; j++) { r[j] = gfMul(r[j], root); if (j + 1 < deg) r[j] ^= r[j + 1]; } root = gfMul(root, 2); }
    return r;
  }
  function rsRemainder(data, div) {
    const r = div.map(() => 0);
    for (const b of data) { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= gfMul(c, f); }); }
    return r;
  }
  function alignPositions(v, size) {
    if (v === 1) return [];
    const n = Math.floor(v / 7) + 2;
    const step = v === 32 ? 26 : Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2;
    const r = [6];
    for (let p = size - 7; r.length < n; p -= step) r.splice(1, 0, p);
    return r;
  }

  function encode(text, ecl = 'M') {
    const bytes = Array.from(new TextEncoder().encode(String(text)));
    let v = 1;
    for (; v <= 40; v++) { const cc = v <= 9 ? 8 : 16; if (4 + cc + bytes.length * 8 <= dataCodewords(v, ecl) * 8) break; }
    if (v > 40) { if (ecl === 'M') return encode(text, 'L'); throw new Error('Text too long for a QR code'); }
    // --- data bits ---
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(4, 4); put(bytes.length, v <= 9 ? 8 : 16); bytes.forEach((b) => put(b, 8));
    const cap = dataCodewords(v, ecl) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // --- error correction + interleave ---
    const nb = ECC[ecl].blocks[v], ecLen = ECC[ecl].cw[v], raw = Math.floor(rawModules(v) / 8);
    const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
    const div = rsDivisor(ecLen);
    const blocks = [];
    for (let i = 0, k = 0; i < nb; i++) {
      const dat = data.slice(k, k + shortLen - ecLen + (i < nShort ? 0 : 1)); k += dat.length;
      const ec = rsRemainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ec));
    }
    const all = [];
    for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecLen || j >= nShort) all.push(b[i]); });

    // --- modules ---
    const size = v * 4 + 17;
    const mod = [...Array(size)].map(() => new Array(size).fill(false));
    const fn = [...Array(size)].map(() => new Array(size).fill(false));
    const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); const xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = alignPositions(v, size);
    al.forEach((ay, i) => al.forEach((ax, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }));
    const drawFormat = (mask) => {
      const d = (ECC[ecl].bits << 3) | mask;
      let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      const bit = (i) => ((b >>> i) & 1) !== 0;
      for (let i = 0; i <= 5; i++) set(8, i, bit(i));
      set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
      set(8, size - 8, true);
    };
    drawFormat(0);
    if (v >= 7) {
      let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const b = (v << 12) | r;
      for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0; const a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
    }
    // zig-zag data placement
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < all.length * 8) { mod[y][x] = ((all[i >>> 3] >>> (7 - (i & 7))) & 1) !== 0; i++; }
      }
    }
    // --- masks ---
    const MASKS = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    const applyMask = (m) => { for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[m](x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0;
      const line = (get) => {
        for (let a = 0; a < size; a++) {
          let run = 1;
          for (let b = 1; b <= size; b++) {
            if (b < size && get(a, b) === get(a, b - 1)) run++;
            else { if (run >= 5) p += 3 + (run - 5); run = 1; }
          }
          for (let b = 0; b + 10 < size; b++) {
            const s = [...Array(11)].map((_, k) => (get(a, b + k) ? 1 : 0)).join('');
            if (s === '10111010000' || s === '00001011101') p += 40;
          }
        }
      };
      line((a, b) => mod[a][b]); line((a, b) => mod[b][a]);
      let dark = 0;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (mod[y][x]) dark++;
        if (x < size - 1 && y < size - 1) { const c = mod[y][x]; if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3; }
      }
      const total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    let best = 0, bestP = Infinity;
    for (let m = 0; m < 8; m++) { applyMask(m); drawFormat(m); const pp = penalty(); if (pp < bestP) { bestP = pp; best = m; } applyMask(m); }
    applyMask(best); drawFormat(best);
    return mod;
  }

  function toDataURL(text, size = 512, dark = '#000000', light = '#ffffff') {
    const m = encode(text);
    const n = m.length, quiet = 4, cells = n + quiet * 2;
    const scale = Math.max(1, Math.floor(size / cells));
    const c = document.createElement('canvas');
    c.width = c.height = cells * scale;
    const ctx = c.getContext('2d');
    ctx.fillStyle = light; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = dark;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (m[y][x]) ctx.fillRect((x + quiet) * scale, (y + quiet) * scale, scale, scale);
    return c.toDataURL('image/png');
  }

  window.QRGen = { matrix: encode, toDataURL };
})();
