import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/request_flags.dart';
import 'package:lawbid/features/verification/data/verification_mapper.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// `/verification/*` on top of the generated client driven by the app's
/// [Dio] (interceptors: headers, auth refresh, Idempotency-Key, retry).
class VerificationRepositoryImpl implements VerificationRepository {
  VerificationRepositoryImpl(Dio dio)
      : _dio = dio,
        _client = api.VerificationClient(dio);

  final Dio _dio;
  final api.VerificationClient _client;

  /// Resource-creating POSTs carry an Idempotency-Key (the API replays a
  /// retried call instead of applying it twice).
  static const Map<String, dynamic> _creates = {
    RequestFlags.createsResource: true,
  };

  Future<VerificationRequest> _req(
    Future<api.VerificationRequestEnvelope> Function() call,
  ) async =>
      VerificationMapper.request((await guardApiCall(call)).data);

  @override
  Future<VerificationOverview> overview() async => VerificationMapper.overview(
        (await guardApiCall(_client.getVerificationOverview)).data,
      );

  @override
  Future<VerificationRequest> create() =>
      _req(() => _client.createVerificationRequest(extras: _creates));

  @override
  Future<VerificationRequest> get(String requestId) =>
      _req(() => _client.getVerificationRequest(id: requestId));

  /// Sent as a plain map, not the generated `AddLicenseDto`: its
  /// `expiresAt` is a `DateTime` serialized as a full ISO timestamp, while
  /// the API accepts only `YYYY-MM-DD` (AddLicenseDto `@Matches`) — see the
  /// stage 3.8 changelog. The response is still the generated envelope.
  @override
  Future<VerificationRequest> addLicense(
    String requestId, {
    required String stateCode,
    required String barNumber,
    DateTime? expiresAt,
  }) async {
    final response = await guardApiCall(
      () => _dio.post<Map<String, dynamic>>(
        '/verification/requests/$requestId/licenses',
        data: {
          'stateCode': stateCode,
          'barNumber': barNumber,
          if (expiresAt != null) 'expiresAt': isoDay(expiresAt),
        },
        options: RequestFlags.createOptions(),
      ),
    );
    return guardApiCall(
      () async => VerificationMapper.request(
        api.VerificationRequestEnvelope.fromJson(response.data!).data,
      ),
    );
  }

  @override
  Future<VerificationRequest> removeLicense(
    String requestId,
    String licenseId,
  ) =>
      _req(
        () => _client.removeVerificationLicense(
          id: requestId,
          licenseId: licenseId,
        ),
      );

  @override
  Future<VerificationRequest> attach(
    String requestId, {
    required String fileId,
    required DocSlot slot,
  }) =>
      _req(
        () => _client.attachVerificationDocument(
          id: requestId,
          body: api.AttachDocumentDto(
            fileId: fileId,
            docType: VerificationMapper.wireDocType(slot.kind),
            side: switch (slot.side) {
              DocSide.front => api.AttachDocumentDtoSide.front,
              DocSide.back => api.AttachDocumentDtoSide.back,
              null => null,
            },
            stateCode: slot.stateCode,
          ),
          extras: _creates,
        ),
      );

  @override
  Future<VerificationRequest> removeDocument(
    String requestId,
    String documentId,
  ) =>
      _req(
        () => _client.removeVerificationDocument(
          id: requestId,
          documentId: documentId,
        ),
      );

  @override
  Future<VerificationRequest> updateComment(String requestId, String comment) =>
      _req(
        () => _client.updateVerificationRequest(
          id: requestId,
          body: api.UpdateVerificationRequestDto(applicantComment: comment),
        ),
      );

  @override
  Future<VerificationRequest> submit(String requestId, {String? comment}) =>
      _req(
        () => _client.submitVerificationRequest(
          id: requestId,
          body: api.SubmitVerificationRequestDto(applicantComment: comment),
          // Not retried blindly: a replay after a lost response would hit
          // VERIFICATION_INVALID_STATUS; the user sees the result instead.
          extras: const {RequestFlags.noRetry: true},
        ),
      );
}

/// `YYYY-MM-DD` of a calendar date.
String isoDay(DateTime d) => '${d.year.toString().padLeft(4, '0')}-'
    '${d.month.toString().padLeft(2, '0')}-'
    '${d.day.toString().padLeft(2, '0')}';

/// docs/03 §2.2 pre-signed upload. The storage POST goes through
/// `storageDio` — a bare client WITHOUT the app's interceptors: the bearer
/// token must never reach the storage host, and S3 refuses a POST-policy
/// upload that also carries an Authorization header.
class FileUploadRepositoryImpl implements FileUploadRepository {
  FileUploadRepositoryImpl(Dio dio, this._storageDio)
      : _files = api.FilesClient(dio);

  final api.FilesClient _files;
  final Dio _storageDio;

  @override
  Future<String> presignAndUpload(
    PickedDocument document, {
    required bool selfie,
    required void Function(double progress) onProgress,
    required UploadCancellation cancellation,
  }) async {
    if (cancellation.isCancelled) throw const UploadCancelledException();
    final presigned = (await guardApiCall(
      () => _files.presign(
        body: api.PresignFileDto(
          purpose: selfie
              ? api.FilePurpose.verificationSelfie
              : api.FilePurpose.verificationDocument,
          mime: document.mime,
          sizeBytes: document.sizeBytes,
          sha256: sha256.convert(document.bytes).toString(),
        ),
        extras: const {RequestFlags.createsResource: true},
      ),
    ))
        .data;
    if (cancellation.isCancelled) throw const UploadCancelledException();

    final token = CancelToken();
    cancellation.onCancel(token.cancel);
    final form = FormData.fromMap({
      ...presigned.upload.fields,
      // The file must be the last field of a POST-policy upload.
      'file': MultipartFile.fromBytes(
        document.bytes,
        filename: document.name,
        contentType: DioMediaType.parse(document.mime),
      ),
    });
    try {
      await _storageDio.post<void>(
        presigned.upload.url,
        data: form,
        cancelToken: token,
        onSendProgress: (sent, total) {
          if (total > 0) onProgress(sent / total);
        },
      );
    } on DioException catch (e) {
      if (CancelToken.isCancel(e)) throw const UploadCancelledException();
      throw const ApiException(
        code: ApiErrorCodes.fileNotUploaded,
        message: 'Upload to storage failed.',
      );
    }
    return presigned.fileId;
  }

  @override
  Future<ScanState> confirm(String fileId) async => VerificationMapper.scan(
        (await guardApiCall(() => _files.confirm(id: fileId))).data.scanStatus,
      );

  @override
  Future<ScanState> scanStatus(String fileId) async => VerificationMapper.scan(
        (await guardApiCall(() => _files.getFilesId(id: fileId)))
            .data
            .scanStatus,
      );
}
