import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';

/// OQ-043: "Message" on a profile — opens (or starts) the direct chat
/// with [userId]; the first messages go to their "Requests".
Future<void> openDirectChat(
  BuildContext context,
  WidgetRef ref,
  String userId,
) async {
  final t = ref.read(translatorProvider);
  try {
    final conv = await ref.read(chatRepositoryProvider).startDirect(userId);
    if (context.mounted) await context.push(ChatRoutes.conversation(conv.id));
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
  }
}
