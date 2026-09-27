import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:drift/native.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_database.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/auth/application/auth_providers.dart';
import 'package:lawbid/features/auth/data/sms_code_retriever.dart';
import 'package:lawbid/features/auth/data/stub_auth_repository.dart';
import 'package:lawbid/features/auth/domain/otp_verify_result.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/onboarding_harness.dart' show FixedUserController;

/// Records every OTP call; no simulated latency.
class RecordingAuthRepository extends StubAuthRepository {
  RecordingAuthRepository({this.verifyResult = const OtpVerifyResult.success(isNewUser: true)});

  OtpVerifyResult verifyResult;
  final List<String> requested = [];
  final List<({String identifier, String code, String channel})> verified = [];
  final List<({String token, String verifier})> verifiedLinks = [];

  @override
  Future<void> requestOtp(String identifier, {String channel = 'phone'}) async {
    requested.add('$channel:$identifier');
  }

  @override
  Future<OtpVerifyResult> verifyOtp({
    required String identifier,
    required String code,
    String channel = 'phone',
  }) async {
    verified.add((identifier: identifier, code: code, channel: channel));
    return verifyResult;
  }

  @override
  Future<OtpVerifyResult> verifyEmailLink({required String token, required String verifier}) async {
    verifiedLinks.add((token: token, verifier: verifier));
    return verifyResult;
  }
}

/// Secure-storage key of `MagicLinkVerifierStore`.
const magicLinkVerifierKey = 'magic_link_verifier';

/// Android-like SMS Retriever: [deliver] plays the incoming SMS.
class FakeSmsCodeRetriever implements SmsCodeRetriever {
  FakeSmsCodeRetriever({this.isSupported = true});

  @override
  final bool isSupported;

  int listens = 0;
  int stops = 0;
  Completer<String?>? _pending;

  void deliver(String? code) => _pending?.complete(code);

  @override
  Future<String?> listenForCode() {
    listens++;
    return (_pending = Completer<String?>()).future;
  }

  @override
  Future<void> stop() async => stops++;

  @override
  Future<String?> appSignature() async => 'FA+9qCX9VSu';
}

Future<List<Override>> authOverrides({
  required RecordingAuthRepository repo,
  SmsCodeRetriever? retriever,
  bool fixedSignedOutUser = true,
  String? magicLinkVerifier,
}) async {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  SharedPreferences.setMockInitialValues({});
  FlutterSecureStorage.setMockInitialValues({
    if (magicLinkVerifier != null) magicLinkVerifierKey: magicLinkVerifier,
  });
  final prefs = await SharedPreferences.getInstance();
  final l10nDb = L10nDatabase(NativeDatabase.memory());
  addTearDown(l10nDb.close);
  return [
    sharedPreferencesProvider.overrideWithValue(prefs),
    l10nDatabaseProvider.overrideWithValue(l10nDb),
    authRepositoryProvider.overrideWithValue(repo),
    smsCodeRetrieverProvider.overrideWithValue(retriever ?? FakeSmsCodeRetriever(isSupported: false)),
    if (fixedSignedOutUser)
      currentUserControllerProvider.overrideWith(
        () => FixedUserController(const CurrentUserState.idle()),
      ),
  ];
}

Widget routedApp(ProviderContainer container, GoRouter router) => UncontrolledProviderScope(
  container: container,
  child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
);
