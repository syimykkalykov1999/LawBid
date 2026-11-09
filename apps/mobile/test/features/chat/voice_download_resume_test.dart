import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/features/chat/data/voice_files.dart';

/// A storage that cuts the first transfer half-way (the reply says 8 bytes,
/// 4 arrive), then serves the rest only when asked with `Range`.
class _Storage implements HttpClientAdapter {
  final ranges = <String?>[];

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final range = options.headers[HttpHeaders.rangeHeader] as String?;
    ranges.add(range);
    if (range == null) {
      return ResponseBody(
        Stream.value(Uint8List.fromList([1, 2, 3, 4])),
        200,
        headers: {
          HttpHeaders.contentLengthHeader: ['8'],
        },
      );
    }
    expect(range, 'bytes=4-');
    return ResponseBody(
      Stream.value(Uint8List.fromList([5, 6, 7, 8])),
      206,
      headers: {
        HttpHeaders.contentLengthHeader: ['4'],
        HttpHeaders.contentRangeHeader: ['bytes 4-7/8'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Owner 2026-11-08 (speed everywhere, SPEED_MATRIX §3 №10): a voice note
/// cut by a lost connection is continued from the bytes already on the
/// phone (`Range`), not downloaded again from zero.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late Directory tmp;
  late _Storage storage;
  late ResumableDownload realDownload;

  setUp(() {
    tmp = Directory.systemTemp.createTempSync('voice_resume_');
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('plugins.flutter.io/path_provider'),
      (call) async => call.method == 'getTemporaryDirectory' ? tmp.path : null,
    );
    storage = _Storage();
    realDownload = ResumableDownload.instance;
    ResumableDownload.instance = ResumableDownload(
      dio: Dio()..httpClientAdapter = storage,
    );
  });

  tearDown(() {
    ResumableDownload.instance = realDownload;
    tmp.deleteSync(recursive: true);
  });

  test('a cut download is continued with Range, not started over', () async {
    const url = 'https://storage.test/voice/m-7.m4a?Signature=x';
    // First try: the connection drops after 4 of 8 bytes — no file yet, the
    // bytes stay in the part file.
    await expectLater(downloadVoiceNote('m-7', url), throwsA(anything));
    final kept = File((await voiceCachePath('m-7'))!);
    expect(kept.existsSync(), isFalse);
    expect(File('${kept.path}.part').lengthSync(), 4);

    // Second try: asks for the rest only and completes the note.
    final path = await downloadVoiceNote('m-7', url);
    expect(path, kept.path);
    expect(kept.readAsBytesSync(), [1, 2, 3, 4, 5, 6, 7, 8]);
    expect(storage.ranges, [null, 'bytes=4-']);

    // Kept: a replay never touches the network.
    expect(await downloadVoiceNote('m-7', url), kept.path);
    expect(storage.ranges, hasLength(2));
  });
}
