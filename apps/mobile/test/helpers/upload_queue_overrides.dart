import 'dart:io';

import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_files_io.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Records what the persistent upload queue sends to storage; [fail] makes
/// the next uploads throw.
class FakeStorageUploader extends StorageUploader {
  FakeStorageUploader()
      : super(
          apiDio: Dio(),
          transport: DioStorageTransport(Dio()),
        );

  final uploads = <({api.FilePurpose purpose, int size, String? taskId})>[];
  ApiException? fail;

  @override
  Future<String> upload({
    required api.FilePurpose purpose,
    required UploadBody body,
    required String mime,
    String filename = 'file',
    void Function(double progress)? onProgress,
    CancelToken? cancel,
    int? scanMaxPolls,
    StorageTransport? transport,
    String? taskId,
  }) async {
    final f = fail;
    if (f != null) throw f;
    uploads.add((purpose: purpose, size: await body.length(), taskId: taskId));
    onProgress?.call(1);
    return 'file-${uploads.length}';
  }
}

/// The queue for a test: a Drift database in RAM, files in a temp folder,
/// [owner] as the signed-in account and [uploader] instead of the network.
List<Override> uploadQueueOverrides({
  String owner = 'me',
  FakeStorageUploader? uploader,
  UploadQueueDatabase? db,
  UploadFiles? files,
}) =>
    [
      uploadQueueDatabaseProvider.overrideWith((ref) {
        final d = db ?? UploadQueueDatabase(NativeDatabase.memory());
        if (db == null) ref.onDispose(d.close);
        return d;
      }),
      uploadFilesProvider.overrideWithValue(
        files ??
            IoUploadFiles(root: () => Directory.systemTemp.createTemp('q')),
      ),
      uploadQueueOwnerProvider.overrideWithValue(owner),
      uploadQueueUploaderProvider
          .overrideWithValue(uploader ?? FakeStorageUploader()),
    ];
