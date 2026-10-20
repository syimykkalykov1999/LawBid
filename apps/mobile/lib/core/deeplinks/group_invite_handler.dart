import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/navigation/app_router.dart';

/// Opens the "join this group" flow for an invitation token
/// (`lawbid.dev/g/<token>`, a group QR code or a link).
typedef GroupInviteHandler = void Function(String token);

/// The connection point for group invitations (owner 2026-10-20): opens
/// the groups feature's join screen (`/g/<token>`), which has the server
/// validate the token (existence, expiry, ban) before showing or joining
/// anything. The token is untrusted input from a link or a QR code; the
/// app only checks its shape.
final groupInviteHandlerProvider = Provider<GroupInviteHandler?>(
  (ref) => (token) => unawaited(
        ref.read(appRouterProvider).push('/g/${Uri.encodeComponent(token)}'),
      ),
);
