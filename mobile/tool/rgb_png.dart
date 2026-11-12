import 'dart:io';
import 'dart:typed_data';

final List<int> _crcTable = List<int>.generate(256, (n) {
  var c = n;
  for (var k = 0; k < 8; k++) {
    c = (c & 1) != 0 ? 0xEDB88320 ^ (c >> 1) : c >> 1;
  }
  return c;
});

int _crc32(List<int> bytes) {
  var crc = 0xFFFFFFFF;
  for (final byte in bytes) {
    crc = _crcTable[(crc ^ byte) & 0xFF] ^ (crc >> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

Uint8List _chunk(String type, List<int> data) {
  final typed = [...type.codeUnits, ...data];
  final out = ByteData(12 + data.length);
  out.setUint32(0, data.length);
  final bytes = out.buffer.asUint8List();
  bytes.setRange(4, 8 + data.length, typed);
  out.setUint32(8 + data.length, _crc32(typed));
  return bytes;
}

Uint8List rgbPngFromRgba(Uint8List rgba, int width, int height, {int background = 0xFFFFFF}) {
  final rowLength = 1 + width * 3;
  final raw = Uint8List(rowLength * height);
  final backgroundChannels = [(background >> 16) & 0xFF, (background >> 8) & 0xFF, background & 0xFF];
  for (var y = 0; y < height; y++) {
    final row = y * rowLength;
    for (var x = 0; x < width; x++) {
      final source = (y * width + x) * 4;
      final alpha = rgba[source + 3];
      for (var channel = 0; channel < 3; channel++) {
        final value = rgba[source + channel];
        raw[row + 1 + x * 3 + channel] = (value * alpha + backgroundChannels[channel] * (255 - alpha)) ~/ 255;
      }
    }
  }
  final header = ByteData(13)
    ..setUint32(0, width)
    ..setUint32(4, height)
    ..setUint8(8, 8)
    ..setUint8(9, 2);
  final png = BytesBuilder()
    ..add([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    ..add(_chunk('IHDR', header.buffer.asUint8List()))
    ..add(_chunk('IDAT', ZLibEncoder(level: 9).convert(raw)))
    ..add(_chunk('IEND', const []));
  return png.toBytes();
}
