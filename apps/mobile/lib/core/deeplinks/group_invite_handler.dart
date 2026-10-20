import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Opens the "join this group" flow for an invitation token
/// (`lawbid.dev/g/<token>`, a group QR code or a link).
typedef GroupInviteHandler = void Function(String token);

/// The connection point for group invitations (owner 2026-10-20). The
/// groups feature (claude/group-chats-polls) overrides this with its join
/// screen; until it does, the link and QR scanner recognise an invitation
/// but have nothing to open, and say so.
final groupInviteHandlerProvider = Provider<GroupInviteHandler?>((ref) => null);
