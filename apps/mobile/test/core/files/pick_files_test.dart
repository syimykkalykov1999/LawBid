import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/files/pick_files.dart';

Uint8List _jpegWithGps(int w, int h) {
  final image = img.Image(width: w, height: h);
  for (final p in image) {
    p
      ..r = 200
      ..g = 120
      ..b = 40;
  }
  image.exif.gpsIfd[0x0001] = img.IfdValueAscii('N');
  return img.encodeJpg(image, quality: 90);
}

void main() {
  test('D8: files are read from disk one by one; too big ones never read',
      () async {
    final reads = <String>[];
    final pdf = Uint8List.fromList('%PDF-1.7 test'.codeUnits);
    final r = await readPickedFiles(
      [
        PlatformFile(name: 'a.pdf', size: pdf.length, path: '/tmp/a.pdf'),
        PlatformFile(name: 'huge.mp4', size: 900 << 20, path: '/tmp/huge.mp4'),
        PlatformFile(name: 'b.pdf', size: pdf.length, path: '/tmp/b.pdf'),
        PlatformFile(name: 'c.pdf', size: pdf.length, path: '/tmp/c.pdf'),
      ],
      maxBytes: 50 << 20,
      maxCount: 2,
      read: (path) async {
        reads.add(path);
        return pdf;
      },
    );
    expect(reads, ['/tmp/a.pdf', '/tmp/b.pdf'], reason: 'no read over size');
    expect([for (final f in r.files) f.name], ['a.pdf', 'b.pdf']);
    expect(r.skipped, 1);
  });

  test('a file that cannot be read is skipped, not thrown', () async {
    final r = await readPickedFiles(
      [PlatformFile(name: 'gone.pdf', size: 10, path: '/tmp/gone.pdf')],
      read: (_) async => throw StateError('gone'),
    );
    expect(r.files, isEmpty);
    expect(r.skipped, 1);
  });

  test('C7: a picture from «Files» is shrunk to JPEG without its location',
      () async {
    final photo = _jpegWithGps(800, 400);
    final r = await readPickedFiles(
      [PlatformFile(name: 'scan.JPG', size: photo.length, bytes: photo)],
      photos: (maxPx: 400, quality: 90),
    );
    final out = r.files.single;
    expect(out.name, 'scan.jpg');
    final decoded = img.decodeJpg(out.bytes)!;
    expect((decoded.width, decoded.height), (400, 200));
    expect(img.decodeJpgExif(out.bytes)?.gpsIfd.isEmpty ?? true, isTrue);
  });

  test('C7: a small picture keeps its pixels and loses only the location',
      () async {
    final photo = _jpegWithGps(100, 50);
    final out = await cleanPickedPicture(
      photo,
      'small.jpg',
      photos: (maxPx: 400, quality: 90),
    );
    expect(out.name, 'small.jpg');
    expect(img.decodeJpgExif(out.bytes)?.gpsIfd.isEmpty ?? true, isTrue);
    expect(img.decodeJpg(out.bytes)!.width, 100);
    final doc = Uint8List.fromList('%PDF-1.4'.codeUnits);
    expect(
      identical((await cleanPickedPicture(doc, 'x.pdf')).bytes, doc),
      isTrue,
    );
  });
}
