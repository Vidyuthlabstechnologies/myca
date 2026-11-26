const _consonants = <String, String>{
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
};

const _vowels = <String, String>{
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o', 'ऍ': 'e',
};

const _matras = <String, String>{
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o', 'ॅ': 'e',
};

const _signs = <String, String>{'ं': 'n', 'ँ': 'n', 'ः': 'h'};

const _digits = <String, String>{'०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'};

const _virama = '्';
const _nukta = '़';

bool isDevanagari(int code) => code >= 0x0900 && code <= 0x097F;

class _Unit {
  _Unit(this.text, {required this.bare});

  final String text;
  bool bare;
  bool hasVowel = false;
}

String latinizeDevanagari(String input) {
  final out = StringBuffer();
  final word = <String>[];
  void flush() {
    if (word.isEmpty) return;
    out.write(_latinWord(word.join()));
    word.clear();
  }

  for (final rune in input.runes) {
    final ch = String.fromCharCode(rune);
    if (isDevanagari(rune)) {
      word.add(ch);
    } else {
      flush();
      out.write(ch);
    }
  }
  flush();
  return out.toString();
}

String _latinWord(String word) {
  final parts = <Object>[];
  final chars = word.runes.map(String.fromCharCode).toList();
  var i = 0;
  while (i < chars.length) {
    final ch = chars[i];
    if (ch == _nukta) {
      i += 1;
      continue;
    }
    if (_consonants.containsKey(ch)) {
      var j = i + 1;
      while (j < chars.length && chars[j] == _nukta) {
        j += 1;
      }
      final unit = _Unit(_consonants[ch]!, bare: true);
      if (j < chars.length && chars[j] == _virama) {
        unit.bare = false;
        j += 1;
      } else if (j < chars.length && _matras.containsKey(chars[j])) {
        parts.add(_Unit(_consonants[ch]!, bare: false));
        parts.add(_Unit(_matras[chars[j]]!, bare: false)..hasVowel = true);
        i = j + 1;
        continue;
      }
      parts.add(unit);
      i = j;
      continue;
    }
    if (_vowels.containsKey(ch)) {
      parts.add(_Unit(_vowels[ch]!, bare: false)..hasVowel = true);
    } else if (_signs.containsKey(ch)) {
      parts.add(_Unit(_signs[ch]!, bare: false));
    } else if (_digits.containsKey(ch)) {
      parts.add(_Unit(_digits[ch]!, bare: false));
    } else if (ch == '।' || ch == '॥') {
      parts.add(_Unit('.', bare: false));
    }
    i += 1;
  }
  final units = parts.cast<_Unit>();
  final text = StringBuffer();
  for (var k = 0; k < units.length; k += 1) {
    final unit = units[k];
    text.write(unit.text);
    if (!unit.bare) continue;
    final wordEnds = !units.skip(k + 1).any((later) => later.bare || later.hasVowel);
    if (!wordEnds) text.write('a');
  }
  return text.toString();
}
