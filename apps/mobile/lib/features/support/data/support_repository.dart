import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-02 — `/support/tickets` (docs: admin "Support" desk).
class SupportRepository {
  SupportRepository(Dio dio, {Dio? storageDio})
      : _api = api.SupportClient(dio),
        _files = api.FilesClient(dio),
        _storage = storageDio ?? dio;

  final api.SupportClient _api;
  final api.FilesClient _files;
  final Dio _storage;

  /// The hard ceiling of the `support` place (the admin's MB is lower).
  static const _ceilingBytes = 100 * 1024 * 1024;
  static const _scanPoll = Duration(milliseconds: 700);
  static const _scanMaxPolls = 40;

  /// Owner 2026-10-18 (OQ-055): presign → upload → confirm → clean scan of
  /// a photo, video or document for a ticket message (purpose
  /// `support_attachment`). Returns the file id to attach.
  Future<String> uploadFile(
    Uint8List bytes,
    String mime, {
    void Function(double progress)? onProgress,
  }) async {
    // The admin's MB for «Поддержка» was checked by the picker; this only
    // stops what no setting allows.
    if (bytes.length > _ceilingBytes) {
      throw const ApiException(
        code: ApiErrorCodes.fileTooLarge,
        message: 'size',
      );
    }
    final target = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: api.FilePurpose.supportAttachment,
          mime: mime,
          sizeBytes: bytes.length,
          sha256: sha256.convert(bytes).toString(),
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    final parts = mime.split('/');
    try {
      await _storage.post<void>(
        target.upload.url,
        data: FormData.fromMap({
          ...target.upload.fields,
          // S3 POST policy: the file must be the LAST field.
          'file': MultipartFile.fromBytes(
            bytes,
            filename: 'file',
            contentType: DioMediaType(parts.first, parts.last),
          ),
        }),
        onSendProgress: (sent, total) {
          if (total > 0) onProgress?.call(sent / total);
        },
      );
    } on DioException catch (e) {
      throw ApiException(
        code: e.response == null
            ? ApiException.networkErrorCode
            : ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
        statusCode: e.response?.statusCode,
      );
    }
    var status = (await guardApiCall(() => _files.confirm(id: target.fileId)))
        .data
        .scanStatus;
    for (var i = 0;
        status == api.ScanStatus.pending && i < _scanMaxPolls;
        i++) {
      await Future<void>.delayed(_scanPoll);
      status = (await guardApiCall(() => _files.getFilesId(id: target.fileId)))
          .data
          .scanStatus;
    }
    if (status != api.ScanStatus.clean) {
      throw const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
      );
    }
    return target.fileId;
  }

  Future<List<SupportTicket>> tickets() async {
    final out = <SupportTicket>[];
    String? cursor;
    // The list is small; read a few pages so nothing is hidden.
    for (var i = 0; i < 5; i++) {
      final env = await guardApiCall(
        () => _api.listMySupportTickets(
          cursor: cursor,
          extras: cursor == null ? cacheFor(const Duration(hours: 1)) : null,
        ),
      );
      out.addAll(env.data.map(_ticket));
      cursor = env.meta?.nextCursor;
      if (cursor == null || cursor.isEmpty) break;
    }
    return out;
  }

  Future<SupportInfo> info() async {
    final d = (await guardApiCall(_api.getSupportInfo)).data;
    return SupportInfo(
      open: d.open,
      expectedReplyMinutes: d.expectedReplyMinutes.round(),
      opensAt: d.opensAt,
    );
  }

  Future<SupportTicket> ticket(String id) async =>
      _detail((await guardApiCall(() => _api.getMySupportTicket(id: id))).data);

  Future<SupportTicket> create({
    required SupportCategory category,
    required String subject,
    required String body,
    List<SupportAttachment> attachments = const [],
    SupportClientContext? context,
  }) async =>
      _detail(
        (await guardApiCall(
          () => _api.createSupportTicket(
            body: api.CreateSupportTicketDto(
              subject: subject,
              category: api.CreateSupportTicketDtoCategory.fromJson(
                category.wire,
              ),
              body: body,
              attachments: _inputs(attachments),
              context: context == null ? null : _contextDto(context),
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<SupportMessage> reply(
    String id,
    String body, {
    List<SupportAttachment> attachments = const [],
  }) async =>
      _message(
        (await guardApiCall(
          () => _api.replyToSupportTicket(
            id: id,
            body: api.SupportMessageBodyDto(
              body: body,
              attachments: _inputs(attachments),
            ),
            extras: const {RequestFlags.createsResource: true},
          ),
        ))
            .data,
      );

  Future<void> close(String id) =>
      guardApiCall(() => _api.closeMySupportTicket(id: id));

  static SupportTicket _ticket(api.SupportTicketDto d) => SupportTicket(
        id: d.id,
        subject: d.subject,
        category: SupportCategory.from(d.category.json),
        status: SupportStatus.from(d.status.json),
        unread: d.unread,
        canReply: d.canReply,
        lastMessageAt: d.lastMessageAt,
        createdAt: d.createdAt,
      );

  static SupportTicket _detail(api.SupportTicketDetailDto d) => SupportTicket(
        id: d.id,
        subject: d.subject,
        category: SupportCategory.from(d.category.json),
        status: SupportStatus.from(d.status.json),
        unread: d.unread,
        canReply: d.canReply,
        lastMessageAt: d.lastMessageAt,
        createdAt: d.createdAt,
        messages: d.messages.map(_message).toList(),
      );

  static List<api.SupportAttachmentInputDto>? _inputs(
    List<SupportAttachment> files,
  ) =>
      files.isEmpty
          ? null
          : [
              for (final f in files)
                api.SupportAttachmentInputDto(fileId: f.fileId, name: f.name),
            ];

  static api.SupportClientContextInputDto _contextDto(
    SupportClientContext c,
  ) =>
      api.SupportClientContextInputDto(
        appVersion: c.appVersion,
        buildNumber: c.buildNumber,
        platform: c.platform == null
            ? null
            : api.SupportClientContextInputDtoPlatform.fromJson(c.platform!),
        osVersion: c.osVersion,
        deviceModel: c.deviceModel,
        language: c.language,
        theme: c.theme,
        timezone: c.timezone,
        route: c.route,
      );

  static SupportAttachment _attachment(api.SupportAttachmentDto d) =>
      SupportAttachment(
        fileId: d.id,
        name: d.name,
        mime: d.mime,
        sizeBytes: d.sizeBytes.round(),
        isImage: d.isImage,
        isVideo: d.isVideo,
        url: d.url,
        previewUrl: d.previewUrl,
        width: d.width?.round(),
        height: d.height?.round(),
      );

  static SupportMessage _message(api.SupportMessageDto d) => SupportMessage(
        id: d.id,
        fromTeam: d.author == api.SupportMessageDtoAuthor.support,
        body: d.body,
        createdAt: d.createdAt,
        authorName: d.authorName,
        attachments: d.attachments.map(_attachment).toList(),
      );
}
