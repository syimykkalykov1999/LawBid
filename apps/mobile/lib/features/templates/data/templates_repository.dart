import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A signed download link (saves under `fileName`).
typedef TemplateDownload = ({String url, String fileName, String mime});

/// Owner 2026-10-05 — the document templates library: list, download
/// link, the file's bytes (for Share) and the one-tap copy into the
/// user's own chat / case attachment.
class TemplatesRepository {
  TemplatesRepository({required Dio apiDio, required Dio storageDio})
      : _api = api.DocumentTemplatesClient(apiDio),
        _storage = storageDio;

  final api.DocumentTemplatesClient _api;
  final Dio _storage;

  Future<CursorPage<DocTemplate>> list(
    TemplatesQuery q, {
    String? cursor,
  }) async {
    final env = await guardApiCall(
      () => _api.listDocumentTemplates(
        q: q.q.trim().isEmpty ? null : q.q.trim(),
        state: q.state,
        sort: q.newest ? api.TemplateSort.valueNew : api.TemplateSort.popular,
        cursor: cursor,
      ),
    );
    return CursorPage(
      items: env.data.map(templateOf).toList(),
      nextCursor: env.meta?.nextCursor,
    );
  }

  Future<TemplateDownload> download(String id) async {
    final d =
        (await guardApiCall(() => _api.downloadDocumentTemplate(id: id))).data;
    return (url: d.url, fileName: d.fileName, mime: d.mime);
  }

  /// The file itself (Share to another app).
  Future<Uint8List> bytes(String url) async {
    try {
      final r = await _storage.get<List<int>>(
        url,
        options: Options(responseType: ResponseType.bytes),
      );
      return Uint8List.fromList(r.data ?? const []);
    } on DioException catch (e) {
      throw ApiException(
        code: ApiException.networkErrorCode,
        message: 'Download failed.',
        statusCode: e.response?.statusCode,
      );
    }
  }

  /// The user's own clean copy; returns its file id.
  Future<String> copy(String id, TemplateTarget target) async =>
      (await guardApiCall(
        () => _api.copyDocumentTemplate(
          id: id,
          body: api.CopyTemplateDto(
            target: target == TemplateTarget.chat
                ? api.TemplateCopyTarget.chatAttachment
                : api.TemplateCopyTarget.caseAttachment,
          ),
          extras: const {RequestFlags.createsResource: true},
        ),
      ))
          .data
          .id;
}

DocTemplate templateOf(api.DocumentTemplateDto d) => DocTemplate(
      id: d.id,
      title: d.title,
      description: d.description,
      fileName: d.fileName,
      mime: d.mime,
      sizeBytes: d.sizeBytes.toInt(),
      practiceKey: d.practiceAreaKey,
      practiceName: d.practiceAreaName,
      state: d.state,
      language: d.language,
      lawyersOnly: d.audience == api.TemplateAudience.lawyers,
      downloadCount: d.downloadCount.toInt(),
      locked: d.locked,
    );
