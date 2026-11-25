import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/social/domain/social_models.dart'
    show ReportTarget;
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart'
    show showReportSheet;
import 'package:material_ui/material_ui.dart';

/// «Заблокировать и пожаловаться» for a feature that must not depend on the
/// blocks / social features (owner row 87: the hotline call's «⋯» menu).
/// Wired here, at the app level, like the router: the confirmation and the
/// block of [toggleBlock], then — only after a real block — [onBlocked] and
/// our ordinary report sheet. True when the person was blocked.
typedef BlockAndReport = Future<bool> Function(
  BuildContext context,
  WidgetRef ref, {
  required String userId,
  required String displayName,
  VoidCallback? onBlocked,
});

final blockAndReportProvider = Provider<BlockAndReport>(
  (ref) => (
    context,
    ref, {
    required userId,
    required displayName,
    onBlocked,
  }) async {
    final blocked = await toggleBlock(
      context,
      userId: userId,
      displayName: displayName,
      currentlyBlocked: false,
    );
    if (!blocked) return false;
    onBlocked?.call();
    if (context.mounted) {
      await showReportSheet(context, ref, ReportTarget.user, userId);
    }
    return true;
  },
);
