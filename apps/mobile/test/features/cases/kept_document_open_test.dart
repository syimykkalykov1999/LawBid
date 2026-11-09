import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/open_local_file.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';

class _Storage implements HttpClientAdapter {
  int requests = 0;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    requests++;
    const body = [1, 2, 3, 4];
    return ResponseBody(
      Stream.value(Uint8List.fromList(body)),
      200,
      headers: {
        HttpHeaders.contentLengthHeader: ['${body.length}'],
      },
    );
  }

  @override
  void close({bool force = false}) {}
}

/// Owner 2026-11-08 (speed features everywhere, SPEED_MATRIX §3 №1): a
/// document of a post, a template or the chat's files list is downloaded
/// once and opened from the phone, like a case file; a second tap does not
/// download it again.
void main() {
  late Directory root;
  late _Storage storage;
  late ResumableDownload realDownload;
  final opened = <String>[];

  setUp(() {
    root = Directory.systemTemp.createTempSync('keptdocs');
    CaseFileCache.debugRoot = () async => root;
    storage = _Storage();
    realDownload = ResumableDownload.instance;
    ResumableDownload.instance = ResumableDownload(
      dio: Dio()..httpClientAdapter = storage,
    );
    opened.clear();
    debugOpenLocalFile = (path, mime) async {
      opened.add(path);
      return OpenLocalResult.opened;
    };
  });

  tearDown(() {
    ResumableDownload.instance = realDownload;
    CaseFileCache.debugRoot = null;
    debugOpenLocalFile = null;
    root.deleteSync(recursive: true);
  });

  test('a post document: downloaded once, then opened from the disk', () async {
    const url = 'https://cdn.test/post-doc-1?Signature=a';
    await openKeptDocument(
      fileId: 'post-doc-1',
      url: url,
      mime: 'application/pdf',
    );
    // The second open comes with a fresh signed link: the file is named by
    // its id, so the link does not matter.
    await openKeptDocument(
      fileId: 'post-doc-1',
      url: 'https://cdn.test/post-doc-1?Signature=b',
      mime: 'application/pdf',
    );
    expect(storage.requests, 1);
    expect(opened, hasLength(2));
    expect(opened.first, endsWith('post-doc-1.pdf'));
  });

  test('a template keeps its own name on the disk, by type', () async {
    await openKeptDocument(
      fileId: 'template-t1',
      url: 'https://cdn.test/t1',
      mime:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(storage.requests, 1);
    expect(opened.single, endsWith('template-t1.docx'));
    expect(File(opened.single).readAsBytesSync(), [1, 2, 3, 4]);
  });

  test('a chat file without a known type is still kept and opened', () async {
    await openKeptDocument(fileId: 'f-9', url: 'https://cdn.test/f-9');
    await openKeptDocument(fileId: 'f-9', url: 'https://cdn.test/f-9');
    expect(storage.requests, 1);
    expect(opened, hasLength(2));
  });
}
