import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/idempotency_interceptor.dart';
import 'package:lawbid/features/verification/data/verification_repository_impl.dart';
import 'package:lawbid/features/verification/domain/verification_models.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';

import '../../helpers/fake_http_adapter.dart';

Map<String, dynamic> _request({
  String status = 'draft',
  List<Map<String, dynamic>> documents = const [],
}) =>
    {
      'id': '11111111-1111-1111-1111-111111111111',
      'status': status,
      'applicantComment': null,
      'infoRequestMessage': null,
      'rejectionCode': null,
      'rejectionReason': null,
      'submittedAt': null,
      'reviewedAt': null,
      'createdAt': '2026-09-27T10:00:00.000Z',
      'licenses': [
        {
          'id': 'l1',
          'state': {'code': 'NY', 'name': 'New York'},
          'barNumber': 'AB123',
          'status': 'pending',
          'expiresAt': '2027-03-31',
          'rejectionCode': null,
          'rejectionNote': null,
        },
      ],
      'documents': documents,
    };

void main() {
  late FakeHttpAdapter adapter;
  late Dio dio;

  setUp(() {
    adapter = FakeHttpAdapter((o) async => ok(_request()));
    dio = Dio(BaseOptions(baseUrl: 'https://api.test'))
      ..httpClientAdapter = adapter
      ..interceptors.add(IdempotencyInterceptor(keyFactory: () => 'key-1'));
  });

  test('overview maps status, request and budget', () async {
    adapter.handler = (o) async => ok({
          'verificationStatus': 'pending',
          'request': _request(
            status: 'needs_more_info',
            documents: [
              {
                'id': 'd1',
                'docType': 'drivers_license',
                'side': 'back',
                'stateCode': null,
                'fileId': 'f1',
                'createdAt': '2026-09-27T10:00:00.000Z',
              },
            ],
          ),
          'identityRequired': true,
          'submissionsLast30Days': 2,
          'maxSubmissions30Days': 5,
        });
    final o = await VerificationRepositoryImpl(dio).overview();
    expect(o.status, VerificationStatus.pending);
    expect(o.request!.status, RequestStatus.needsMoreInfo);
    expect(o.request!.licenses.single.expiresAt, DateTime(2027, 3, 31));
    expect(o.request!.documents.single.kind, DocKind.driversLicense);
    expect(o.request!.documents.single.side, DocSide.back);
    expect(o.submissionsLast30Days, 2);
    expect(adapter.requests.single.path, '/verification/me');
  });

  test('addLicense sends expiresAt as YYYY-MM-DD with an Idempotency-Key',
      () async {
    await VerificationRepositoryImpl(dio).addLicense(
      'req',
      stateCode: 'NY',
      barNumber: 'AB123',
      expiresAt: DateTime(2027, 3, 31),
    );
    final r = adapter.requests.single;
    expect(r.method, 'POST');
    expect(r.path, '/verification/requests/req/licenses');
    expect(r.data, {
      'stateCode': 'NY',
      'barNumber': 'AB123',
      'expiresAt': '2027-03-31',
    });
    expect(r.headers['Idempotency-Key'], 'key-1');
  });

  test('attach sends docType/side/stateCode', () async {
    await VerificationRepositoryImpl(dio).attach(
      'req',
      fileId: 'f1',
      slot: DocSlot.identity(IdDocumentType.stateId, DocSide.back),
    );
    final r = adapter.requests.single;
    expect(r.path, '/verification/requests/req/documents');
    expect(r.data, {'fileId': 'f1', 'docType': 'state_id', 'side': 'back'});
    expect(r.headers['Idempotency-Key'], 'key-1');
  });

  test('submit error keeps the API code and details', () async {
    adapter.handler = (o) async => apiError(400, 'VERIFICATION_INCOMPLETE', {
          'missing': ['selfie'],
        });
    await expectLater(
      VerificationRepositoryImpl(dio).submit('req', comment: 'hi'),
      throwsA(
        isA<ApiException>()
            .having((e) => e.code, 'code', 'VERIFICATION_INCOMPLETE')
            .having((e) => e.details?['missing'], 'missing', ['selfie']),
      ),
    );
  });

  group('FileUploadRepositoryImpl', () {
    late FakeHttpAdapter storage;
    late Dio storageDio;

    setUp(() {
      adapter.handler = (o) async {
        if (o.path == '/files/presign') {
          return jsonBody(
            {
              'data': {
                'fileId': 'file-1',
                'upload': {
                  'url': 'https://storage.test/bucket',
                  'fields': {'key': 'k', 'policy': 'p'},
                },
                'expiresAt': '2026-09-27T10:05:00.000Z',
              },
            },
            201,
          );
        }
        return ok({
          'id': 'file-1',
          'purpose': 'verification_selfie',
          'mime': 'image/jpeg',
          'sizeBytes': 3,
          'width': null,
          'height': null,
          'scanStatus': o.path.endsWith('/confirm') ? 'pending' : 'infected',
          'url': null,
          'createdAt': '2026-09-27T10:00:00.000Z',
        });
      };
      storage = FakeHttpAdapter((o) async => ResponseBody.fromString('', 204));
      storageDio = Dio()..httpClientAdapter = storage;
    });

    test(
        'presign (sha256, purpose) → storage POST without the app auth '
        '→ fileId; confirm/poll map scan status', () async {
      final repo = FileUploadRepositoryImpl(dio, storageDio);
      final progress = <double>[];
      final id = await repo.presignAndUpload(
        PickedDocument(
          name: 'selfie.jpg',
          mime: 'image/jpeg',
          bytes: Uint8List.fromList([1, 2, 3]),
        ),
        selfie: true,
        onProgress: progress.add,
        cancellation: UploadCancellation(),
      );
      expect(id, 'file-1');
      final presign = adapter.requests.first;
      final body = presign.data as Map<String, dynamic>;
      expect(body['purpose'], 'verification_selfie');
      expect(body['sizeBytes'], 3);
      expect(
        body['sha256'],
        '039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81',
      );
      final upload = storage.requests.single;
      expect(upload.uri.toString(), 'https://storage.test/bucket');
      expect(upload.headers.containsKey('Authorization'), isFalse);
      expect(upload.data, isA<FormData>());
      final form = upload.data as FormData;
      expect(form.fields.map((f) => f.key), ['key', 'policy']);
      expect(form.files.single.key, 'file');

      expect(await repo.confirm(id), ScanState.pending);
      expect(await repo.scanStatus(id), ScanState.infected);
    });

    test('a cancelled upload throws UploadCancelledException', () async {
      final c = UploadCancellation()..cancel();
      await expectLater(
        FileUploadRepositoryImpl(dio, storageDio).presignAndUpload(
          PickedDocument(
            name: 'a.pdf',
            mime: 'application/pdf',
            bytes: Uint8List(1),
          ),
          selfie: false,
          onProgress: (_) {},
          cancellation: c,
        ),
        throwsA(isA<UploadCancelledException>()),
      );
    });
  });

  test('mimeForFileName', () {
    expect(mimeForFileName('A.JPG'), 'image/jpeg');
    expect(mimeForFileName('x.heic'), 'image/heic');
    expect(mimeForFileName('bar.pdf'), 'application/pdf');
    expect(mimeForFileName('noext'), isNull);
  });
}
