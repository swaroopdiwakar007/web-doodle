// Phonetic (English-letters → native script) typing for the text tool.
// Covers Hindi, Bengali, Marathi, Telugu, Tamil, Gujarati, Urdu, Kannada,
// Odia, Malayalam (+ Punjabi). Uses an ITRANS-like scheme, e.g.
//   namaste → नमस्ते   bhaarat → भारत   vaNakkam → வணக்கம்   shukriyaa → شکریا
(() => {
  if (globalThis.__psTranslit) return;

  const LANGS = [
    { id: 'en', name: 'English', native: 'Aa' },
    { id: 'hi', name: 'Hindi', native: 'हिन्दी', base: 0x0900 },
    { id: 'bn', name: 'Bengali', native: 'বাংলা', base: 0x0980 },
    { id: 'mr', name: 'Marathi', native: 'मराठी', base: 0x0900 },
    { id: 'te', name: 'Telugu', native: 'తెలుగు', base: 0x0c00, drav: true },
    { id: 'ta', name: 'Tamil', native: 'தமிழ்', base: 0x0b80, drav: true, finalVirama: true },
    { id: 'gu', name: 'Gujarati', native: 'ગુજરાતી', base: 0x0a80 },
    { id: 'ur', name: 'Urdu', native: 'اردو', rtl: true },
    { id: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', base: 0x0c80, drav: true },
    { id: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', base: 0x0b00 },
    { id: 'ml', name: 'Malayalam', native: 'മലയാളം', base: 0x0d00, drav: true, finalVirama: true },
    { id: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', base: 0x0a00 },
  ];

  // ---- Brahmic scripts (offsets inside each Unicode block are parallel) ----
  const VIRAMA = 0x4d, NUKTA = 0x3c;
  const BASE_V = {
    a: [0x05, 0], aa: [0x06, 0x3e], A: [0x06, 0x3e],
    i: [0x07, 0x3f], ii: [0x08, 0x40], ee: [0x08, 0x40], I: [0x08, 0x40],
    u: [0x09, 0x41], uu: [0x0a, 0x42], oo: [0x0a, 0x42], U: [0x0a, 0x42],
    Ri: [0x0b, 0x43],
    e: [0x0f, 0x47], E: [0x0f, 0x47], ai: [0x10, 0x48],
    o: [0x13, 0x4b], O: [0x13, 0x4b], au: [0x14, 0x4c],
  };
  const BASE_C = {
    k: [0x15], kh: [0x16], g: [0x17], gh: [0x18], '~N': [0x19],
    c: [0x1a], ch: [0x1a], chh: [0x1b], Ch: [0x1b], j: [0x1c], jh: [0x1d], '~n': [0x1e],
    T: [0x1f], Th: [0x20], D: [0x21], Dh: [0x22], N: [0x23],
    t: [0x24], th: [0x25], d: [0x26], dh: [0x27], n: [0x28],
    p: [0x2a], ph: [0x2b], f: [0x2b, NUKTA], b: [0x2c], bh: [0x2d], m: [0x2e],
    y: [0x2f], r: [0x30], rr: [0x31], l: [0x32], L: [0x33], zh: [0x34],
    v: [0x35], w: [0x35], sh: [0x36], Sh: [0x37], shh: [0x37], s: [0x38], h: [0x39],
    q: [0x15, NUKTA], z: [0x1c, NUKTA],
    x: [0x15, VIRAMA, 0x37], ksh: [0x15, VIRAMA, 0x37], gy: [0x1c, VIRAMA, 0x1e],
  };
  const BASE_S = { M: 0x02, H: 0x03, '~': 0x01 };

  const TAMIL_MAP = {
    0x16: 0x15, 0x17: 0x15, 0x18: 0x15, 0x1b: 0x1a, 0x1d: 0x1c,
    0x20: 0x1f, 0x21: 0x1f, 0x22: 0x1f, 0x25: 0x24, 0x26: 0x24, 0x27: 0x24,
    0x2b: 0x2a, 0x2c: 0x2a, 0x2d: 0x2a,
  };

  function buildTables(L) {
    const keepNukta = L.id === 'hi' || L.id === 'mr' || L.id === 'pa';
    const V = {}, C = {}, S = { ...BASE_S };
    for (const [k, v] of Object.entries(BASE_V)) V[k] = v.slice();
    if (L.drav) { V.e = [0x0e, 0x46]; V.o = [0x12, 0x4a]; }
    for (const [k, arr] of Object.entries(BASE_C)) {
      if ((k === 'rr' || k === 'zh') && !(L.id === 'ta' || L.id === 'ml')) continue;
      C[k] = arr
        .filter((x) => keepNukta || x !== NUKTA)
        .map((x) => {
          if (L.id === 'ta' && TAMIL_MAP[x]) return TAMIL_MAP[x];
          if ((L.id === 'bn' || L.id === 'or') && x === 0x35) return 0x2c; // va → ba
          if (L.id === 'bn' && x === 0x33) return 0x32;
          if (L.id === 'or' && x === 0x2f) return 0x5f; // Odia ya → ୟ
          if (L.id === 'pa' && x === 0x37) return 0x36;
          return x;
        });
    }
    if (L.id === 'ta' || L.id === 'kn' || L.id === 'ml') S['~'] = 0x02;
    const tokens = [];
    for (const k in V) tokens.push({ key: k, t: 'V', v: V[k] });
    for (const k in C) tokens.push({ key: k, t: 'C', v: C[k] });
    for (const k in S) tokens.push({ key: k, t: 'S', v: S[k] });
    tokens.sort((a, b) => b.key.length - a.key.length);
    return tokens;
  }

  function matchToken(w, i, tokens) {
    for (const tok of tokens) if (w.startsWith(tok.key, i)) return tok;
    const lower = w[i].toLowerCase();
    if (lower !== w[i]) for (const tok of tokens) if (tok.key === lower) return tok;
    return null;
  }

  function translitBrahmic(word, L) {
    if (!L.tokens) L.tokens = buildTables(L);
    const ch = (x) => String.fromCharCode(L.base + x);
    const w = L.id === 'ta' || L.id === 'pa' ? word.replace(/Ri/g, 'ri') : word;
    let out = '', prevC = false, i = 0;
    while (i < w.length) {
      const tok = matchToken(w, i, L.tokens);
      if (!tok) {
        if (prevC && L.finalVirama) out += ch(VIRAMA);
        out += w[i++]; prevC = false; continue;
      }
      i += tok.key.length;
      if (tok.t === 'C') {
        const next = i < w.length ? matchToken(w, i, L.tokens) : null;
        // Punjabi: n/m before a consonant → tippi (ੰ)
        if (L.id === 'pa' && (tok.key === 'n' || tok.key === 'm') && next && next.t === 'C') {
          out += 'ੰ'; prevC = false; continue;
        }
        // Malayalam: word-final m → anusvara (ം)
        if (L.id === 'ml' && tok.key === 'm' && i >= w.length) {
          if (prevC) out += ch(VIRAMA);
          out += ch(0x02); prevC = false; continue;
        }
        if (prevC) out += ch(VIRAMA);
        out += tok.v.map(ch).join('');
        prevC = true;
      } else if (tok.t === 'V') {
        const [ind, mat] = tok.v;
        if (prevC) { if (mat) out += ch(mat); } else out += ch(ind);
        prevC = false;
      } else {
        if (prevC && L.finalVirama) out += ch(VIRAMA);
        if (L.id === 'ta' && tok.key === 'M') out += ch(0x2e) + ch(VIRAMA);
        else out += ch(tok.v);
        prevC = false;
      }
    }
    if (prevC && L.finalVirama) out += ch(VIRAMA);
    return out;
  }

  // ---- Urdu (Roman Urdu → Nastaliq letters, approximate) ----
  const UR_C = {
    kh: 'خ', gh: 'غ', sh: 'ش', ch: 'چ', zh: 'ژ',
    th: 'تھ', Th: 'ٹھ', dh: 'دھ', Dh: 'ڈھ', bh: 'بھ', ph: 'پھ', jh: 'جھ',
    b: 'ب', p: 'پ', t: 'ت', T: 'ٹ', s: 'س', S: 'ص', j: 'ج', h: 'ہ', H: 'ح',
    d: 'د', D: 'ڈ', z: 'ز', Z: 'ظ', r: 'ر', R: 'ڑ', f: 'ف', q: 'ق',
    k: 'ک', c: 'ک', g: 'گ', l: 'ل', m: 'م', n: 'ن', N: 'ں',
    w: 'و', v: 'و', y: 'ی', x: 'کس',
  };
  const UR_V_INITIAL = { aa: 'آ', a: 'ا', ii: 'ای', ee: 'ای', i: 'ا', uu: 'او', oo: 'او', u: 'ا', ai: 'اے', au: 'او', e: 'ای', o: 'او' };
  const UR_V_MID = { aa: 'ا', a: '', ii: 'ی', ee: 'ی', i: '', uu: 'و', oo: 'و', u: '', ai: 'ی', au: 'و', e: 'ی', o: 'و' };
  const UR_V_FINAL = { aa: 'ا', a: 'ا', ii: 'ی', ee: 'ی', i: 'ی', uu: 'و', oo: 'و', u: 'و', ai: 'ے', au: 'و', e: 'ے', o: 'و' };
  const UR_TOKENS = [
    ...Object.keys(UR_C).map((k) => ({ key: k, t: 'C' })),
    ...Object.keys(UR_V_MID).map((k) => ({ key: k, t: 'V' })),
  ].sort((a, b) => b.key.length - a.key.length);

  function translitUrdu(word) {
    let out = '', i = 0;
    while (i < word.length) {
      const tok = matchToken(word, i, UR_TOKENS);
      if (!tok) { out += word[i++]; continue; }
      const start = i === 0;
      i += tok.key.length;
      const end = i >= word.length;
      if (tok.t === 'C') out += UR_C[tok.key];
      else out += (start ? UR_V_INITIAL : end ? UR_V_FINAL : UR_V_MID)[tok.key];
    }
    return out;
  }

  const byId = Object.fromEntries(LANGS.map((l) => [l.id, l]));

  function word(roman, langId) {
    const L = byId[langId];
    if (!L || L.id === 'en' || !roman) return roman;
    return L.id === 'ur' ? translitUrdu(roman) : translitBrahmic(roman, L);
  }

  globalThis.__psTranslit = { LANGS, byId, word };
})();
