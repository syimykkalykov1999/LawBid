import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/files/open_local_file.dart';
import 'package:lawbid/core/files/resumable_download.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';

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

/// Owner 2026-11-08 (speed features everywhere): a chat document is
/// downloaded once and opened from the phone, like a case file; a second
/// tap does not download it again.
void main() {
  late Directory root;
  late _Storage storage;
  late ResumableDownload realDownload;
  final opened = <String>[];

  setUp(() {
    root = Directory.systemTemp.createTempSync('chatdocs');
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

  test('downloaded once, then opened from the disk', () async {
    const a = ChatAttachment(
      fileId: 'doc-1',
      name: 'contract.pdf',
      isImage: false,
      mime: 'application/pdf',
      url: 'https://cdn.test/doc-1?Signature=x',
    );
    await openChatDocument(a);
    await openChatDocument(a);
    expect(storage.requests, 1);
    expect(opened, hasLength(2));
    expect(opened.first, endsWith('doc-1.pdf'));
  });
}
