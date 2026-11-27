import 'package:flutter_test/flutter_test.dart';
import 'package:myca/pos/escpos.dart';
import 'package:myca/pos/latinize.dart';
import 'package:myca/pos/receipt.dart';

void main() {
  test('everyday shop words come out readable', () {
    const expected = {
      'साखर': 'sakhar',
      'रमेश': 'ramesh',
      'कमल': 'kamal',
      'बहुत': 'bahut',
      'दूध': 'doodh',
      'नमक': 'namak',
      'चीनी': 'cheenee',
      'आटा': 'aata',
      'तेल': 'tel',
      'मसाला': 'masala',
      'बिस्कुट': 'biskut',
      'राजू किराना': 'rajoo kirana',
      'गेहूँ': 'gehoon',
    };
    for (final entry in expected.entries) {
      expect(latinizeDevanagari(entry.key), entry.value, reason: entry.key);
    }
  });

  test('digits, a conjunct, a nukta and the sentence mark are handled, and English is left alone', () {
    expect(latinizeDevanagari('१२ किलो'), '12 kilo');
    expect(latinizeDevanagari('Parle-G 250g'), 'Parle-G 250g');
    expect(latinizeDevanagari('Parle-G साखर'), 'Parle-G sakhar');
    expect(latinizeDevanagari('विद्यार्थी'), 'vidyarthee');
    expect(latinizeDevanagari('कपड़ा'), 'kapada');
    expect(latinizeDevanagari('ठीक है।'), 'theek hai.');
    expect(latinizeDevanagari(''), '');
  });

  test('a lone mark or an unknown Devanagari sign never crashes or loops', () {
    for (final text in ['ा', '्', '़', 'ऀ', 'क्', 'ं', 'ॐ', '॥']) {
      expect(() => latinizeDevanagari(text), returnsNormally, reason: text);
    }
  });

  test('a receipt prints a Marathi item and customer in letters, and never as question marks', () {
    expect(EscPos.printable('साखर'), 'sakhar');
    expect(EscPos.printable('₹45 साखर'), 'Rs.45 sakhar');
    expect(EscPos.printable('தமிழ்'), '?????');
    final bytes = receiptBytes(
      invoice: {
        'id': 'INV-1',
        'date': '2026-11-27',
        'partyName': 'रमेश',
        'lines': [
          {'description': 'साखर', 'qty': 2, 'rate': 45, 'gstRate': 5, 'taxable': 90},
        ],
        'taxable': 90,
        'cgst': 2.25,
        'sgst': 2.25,
        'igst': 0,
        'total': 94.5,
      },
      businessName: 'शर्मा किराना',
    );
    final text = String.fromCharCodes(bytes.where((b) => b >= 0x20 && b < 0x7F || b == 0x0A));
    expect(text, contains('sakhar'));
    expect(text, contains('ramesh'));
    expect(text, contains('sharma kirana'));
    expect(text, isNot(contains('????')));
  });
}
