import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:image_picker/image_picker.dart' show XFile;
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

/// A picked file as file_picker 13 hands it over (row 149): the size the
/// picker reported, the bytes only when read.
final class _Picked extends PlatformFile {
  _Picked(this.name, {this.size, this.bytes, this.reads, this.fails = false});

  @override
  final String name;
  final int? size;
  final Uint8List? bytes;
  final List<String>? reads;
  final bool fails;

  @override
  Uri get uri => Uri.file('/tmp/$name');

  @override
  XFile get xFile => XFile(uri.toFilePath());

  @override
  int? lengthSync() => size;

  @override
  Future<int?> length() async => size ?? bytes?.length;

  @override
  Future<Uint8List> readAsBytes() async {
    reads?.add(name);
    if (fails) throw StateError('gone');
    return bytes ?? Uint8List(0);
  }

  @override
  Stream<Uint8List> readAsByteStream() async* {
    yield await readAsBytes();
  }
}

void main() {
  test('D8: files are read from disk one by one; too big ones never read',
      () async {
    final reads = <String>[];
    final pdf = Uint8List.fromList('%PDF-1.7 test'.codeUnits);
    _Picked file(String name, int size) =>
        _Picked(name, size: size, bytes: pdf, reads: reads);
    final r = await readPickedFiles(
      [
        file('a.pdf', pdf.length),
        file('huge.mp4', 900 << 20),
        file('b.pdf', pdf.length),
        file('c.pdf', pdf.length),
      ],
      maxBytes: 50 << 20,
      maxCount: 2,
    );
    expect(reads, ['a.pdf', 'b.pdf'], reason: 'no read over size');
    expect([for (final f in r.files) f.name], ['a.pdf', 'b.pdf']);
    expect(r.skipped, 1);
  });

  test('a file of unknown size is skipped, never read', () async {
    final reads = <String>[];
    final r = await readPickedFiles(
      [_Picked('odd.pdf', reads: reads)],
      maxBytes: 50 << 20,
    );
    expect(reads, isEmpty);
    expect(r.skipped, 1);
  });

  test('a file that cannot be read is skipped, not thrown', () async {
    final r =
        await readPickedFiles([_Picked('gone.pdf', size: 10, fails: true)]);
    expect(r.files, isEmpty);
    expect(r.skipped, 1);
  });

  test('C7: a picture from «Files» is shrunk to JPEG without its location',
      () async {
    final photo = _jpegWithGps(800, 400);
    final r = await readPickedFiles(
      [_Picked('scan.JPG', size: photo.length, bytes: photo)],
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
