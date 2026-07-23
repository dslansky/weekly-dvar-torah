// Ashkenazi transliteration throughout. Keys are lowercased, hyphen-insensitive
// (spaces and hyphens both collapse to a single space) for lookup matching.

const PARSHIYOS = [
  // Bereishis
  ['Bereishis', 'בראשית', 'Bereishis'],
  ['Noach', 'נח', 'Bereishis'],
  ['Lech Lecha', 'לך לך', 'Bereishis'],
  ['Vayeira', 'וירא', 'Bereishis'],
  ['Chayei Sarah', 'חיי שרה', 'Bereishis'],
  ['Toldos', 'תולדות', 'Bereishis'],
  ['Vayeitzei', 'ויצא', 'Bereishis'],
  ['Vayishlach', 'וישלח', 'Bereishis'],
  ['Vayeishev', 'וישב', 'Bereishis'],
  ['Mikeitz', 'מקץ', 'Bereishis'],
  ['Vayigash', 'ויגש', 'Bereishis'],
  ['Vayechi', 'ויחי', 'Bereishis'],

  // Shemos
  ['Shemos', 'שמות', 'Shemos'],
  ['Vaeira', 'וארא', 'Shemos'],
  ['Bo', 'בא', 'Shemos'],
  ['Beshalach', 'בשלח', 'Shemos'],
  ['Yisro', 'יתרו', 'Shemos'],
  ['Mishpatim', 'משפטים', 'Shemos'],
  ['Terumah', 'תרומה', 'Shemos'],
  ['Tetzaveh', 'תצוה', 'Shemos'],
  ['Ki Sisa', 'כי תשא', 'Shemos'],
  ['Vayakhel', 'ויקהל', 'Shemos'],
  ['Pekudei', 'פקודי', 'Shemos'],
  ['Vayakhel-Pekudei', 'ויקהל פקודי', 'Shemos'],

  // Vayikra
  ['Vayikra', 'ויקרא', 'Vayikra'],
  ['Tzav', 'צו', 'Vayikra'],
  ['Shmini', 'שמיני', 'Vayikra'],
  ['Tazria', 'תזריע', 'Vayikra'],
  ['Metzora', 'מצורע', 'Vayikra'],
  ['Tazria-Metzora', 'תזריע מצורע', 'Vayikra'],
  ['Acharei Mos', 'אחרי מות', 'Vayikra'],
  ['Kedoshim', 'קדושים', 'Vayikra'],
  ['Acharei Mos-Kedoshim', 'אחרי מות קדושים', 'Vayikra'],
  ['Emor', 'אמור', 'Vayikra'],
  ['Behar', 'בהר', 'Vayikra'],
  ['Bechukosai', 'בחקתי', 'Vayikra'],
  ['Behar-Bechukosai', 'בהר בחקתי', 'Vayikra'],

  // Bamidbar
  ['Bamidbar', 'במדבר', 'Bamidbar'],
  ['Naso', 'נשא', 'Bamidbar'],
  ['Behaaloscha', 'בהעלתך', 'Bamidbar'],
  ['Shlach', 'שלח', 'Bamidbar'],
  ['Korach', 'קרח', 'Bamidbar'],
  ['Chukas', 'חקת', 'Bamidbar'],
  ['Balak', 'בלק', 'Bamidbar'],
  ['Chukas-Balak', 'חקת בלק', 'Bamidbar'],
  ['Pinchas', 'פינחס', 'Bamidbar'],
  ['Matos', 'מטות', 'Bamidbar'],
  ['Masei', 'מסעי', 'Bamidbar'],
  ['Matos-Masei', 'מטות מסעי', 'Bamidbar'],

  // Devarim
  ['Devarim', 'דברים', 'Devarim'],
  ['Vaeschanan', 'ואתחנן', 'Devarim'],
  ['Eikev', 'עקב', 'Devarim'],
  ["Re'eh", 'ראה', 'Devarim'],
  ['Reeh', 'ראה', 'Devarim'],
  ['Shoftim', 'שופטים', 'Devarim'],
  ['Ki Seitzei', 'כי תצא', 'Devarim'],
  ['Ki Savo', 'כי תבוא', 'Devarim'],
  ['Nitzavim', 'נצבים', 'Devarim'],
  ['Vayeilech', 'וילך', 'Devarim'],
  ['Nitzavim-Vayeilech', 'נצבים וילך', 'Devarim'],
  ['Haazinu', 'האזינו', 'Devarim'],
  ["V'Zos HaBerachah", 'וזאת הברכה', 'Devarim'],
  ['Vzos Haberachah', 'וזאת הברכה', 'Devarim'],

  // Yamim Tovim / Moadim (common ones; freeform entries also allowed)
  ['Rosh Hashanah', 'ראש השנה', 'Moadim'],
  ['Yom Kippur', 'יום כיפור', 'Moadim'],
  ['Sukkos', 'סוכות', 'Moadim'],
  ['Shemini Atzeres', 'שמיני עצרת', 'Moadim'],
  ['Simchas Torah', 'שמחת תורה', 'Moadim'],
  ['Chanukah', 'חנוכה', 'Moadim'],
  ['Tu BiShvat', 'טו בשבט', 'Moadim'],
  ['Purim', 'פורים', 'Moadim'],
  ['Pesach', 'פסח', 'Moadim'],
  ['Sefiras HaOmer', 'ספירת העומר', 'Moadim'],
  ['Lag BaOmer', 'לג בעומר', 'Moadim'],
  ['Shavuos', 'שבועות', 'Moadim'],
  ['Tisha BAv', 'תשעה באב', 'Moadim'],
];

function normalize(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[-\s]+/g, ' ');
}

const LOOKUP = new Map(PARSHIYOS.map(([en, he, sefer]) => [normalize(en), { parshaHebrew: he, sefer }]));

// Look up Hebrew name + sefer for a given (English/transliterated) parsha display name.
// Falls back to sefer "Moadim" and no Hebrew name for anything not recognized
// (e.g. freeform Yom Tov entries), per spec.
function lookupParsha(displayName) {
  const hit = LOOKUP.get(normalize(displayName));
  if (hit) return hit;
  return { parshaHebrew: '', sefer: 'Moadim' };
}

// Ordering used to group the archive site + sort within a sefer.
const SEFER_ORDER = ['Bereishis', 'Shemos', 'Vayikra', 'Bamidbar', 'Devarim', 'Moadim'];

export { PARSHIYOS, lookupParsha, normalize, SEFER_ORDER };
