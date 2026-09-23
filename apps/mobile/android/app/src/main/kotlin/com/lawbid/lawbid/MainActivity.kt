package com.lawbid.lawbid

import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * FlutterFragmentActivity, not FlutterActivity (Phase 4 of the auth
 * networking work, docs/CHANGELOG.md): local_auth's Android implementation
 * (biometric reauth, core/session/biometric_auth_service.dart) needs the
 * host Activity to be a FragmentActivity to show BiometricPrompt — a plain
 * FlutterActivity throws at runtime the first time authenticate() is
 * called. FlutterFragmentActivity is Flutter's drop-in FragmentActivity
 * subclass for exactly this case; no other behavior changes.
 */
class MainActivity : FlutterFragmentActivity()
