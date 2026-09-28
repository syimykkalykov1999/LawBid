import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/verification/data/verification_repository_impl.dart';
import 'package:lawbid/features/verification/domain/verification_repository.dart';

final verificationRepositoryProvider = Provider<VerificationRepository>(
  (ref) => VerificationRepositoryImpl(ref.watch(dioProvider)),
);

/// Bare HTTP client for the direct upload to private storage (docs/03
/// §2.2 pre-signed POST). Deliberately NOT [dioProvider]: that one adds
/// the bearer token and API headers, which must never be sent to the
/// storage host. Long send timeout: files are up to 10 MB.
final storageUploadDioProvider = Provider<Dio>(
  (ref) => Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(minutes: 2),
      receiveTimeout: const Duration(seconds: 30),
    ),
  ),
);

final fileUploadRepositoryProvider = Provider<FileUploadRepository>(
  (ref) => FileUploadRepositoryImpl(
    ref.watch(dioProvider),
    ref.watch(storageUploadDioProvider),
  ),
);

/// How the wizard waits for the antivirus scan after confirm
/// (`GET /files/:id` until `scanStatus` leaves `pending`).
class ScanPolling {
  const ScanPolling({
    this.interval = const Duration(milliseconds: 1500),
    this.maxPolls = 40,
  });

  final Duration interval;
  final int maxPolls;
}

final scanPollingProvider = Provider<ScanPolling>((ref) => const ScanPolling());
