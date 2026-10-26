import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/content_column_frame.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show commentThreadSlivers;
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Owner 2026-10-07: comments open as a sheet that slides up from the
/// comment icon (Instagram): drag up for the whole screen, down to close;
/// the field to write sits at the bottom of the sheet.
Future<void> showCommentsSheet(
  BuildContext context, {
  required String postId,
  required bool commentsEnabled,
}) {
  // Owner 2026-10-22 (guest browsing): comments need an account.
  if (!requireSignInFromContext(context)) return Future.value();
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    constraints: contentColumnSheetConstraints(context),
    // Over the nav bar too, like Instagram.
    useRootNavigator: true,
    useSafeArea: true,
    backgroundColor: sheetRouteColor(context, colors.sheet),
    elevation: sheetDrawnByColumn(context) ? 0 : null,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
    ),
    builder: (_) => ContentColumnFrame(
      surface: colors.sheet,
      radius: const BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
      child: CommentsSheet(
        postId: postId,
        commentsEnabled: commentsEnabled,
      ),
    ),
  );
}

class CommentsSheet extends ConsumerStatefulWidget {
  const CommentsSheet({
    required this.postId,
    required this.commentsEnabled,
    super.key,
  });

  final String postId;
  final bool commentsEnabled;

  @override
  ConsumerState<CommentsSheet> createState() => _CommentsSheetState();
}

class _CommentsSheetState extends ConsumerState<CommentsSheet> {
  ReplyTarget? _replyTo;
  final _focus = FocusNode();

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  void _reply(ReplyTarget target) {
    setState(() => _replyTo = target);
    _focus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final comments = ref.watch(commentsProvider(widget.postId));
    return Padding(
      // The field rides above the keyboard.
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: DraggableScrollableSheet(
        expand: false,
        // Owner 2026-10-12: opens at about half the screen, drags up to the
        // top, down to close.
        initialChildSize: 0.55,
        minChildSize: 0.3,
        snap: true,
        snapSizes: const [0.55],
        builder: (context, controller) => DeferFirstFrame(
          child: Column(
            children: [
              const SizedBox(height: AppSpacing.sm),
              const AppSheetHandle(),
              Text(
                t.t('post.comments'),
                style: type.titleMedium.copyWith(
                  color: colors.text,
                  fontFamily: type.body.fontFamily,
                  fontWeight: FontWeight.w700,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              Divider(height: 1, color: colors.border),
              Expanded(
                child: CustomScrollView(
                  controller: controller,
                  slivers: commentThreadSlivers(
                    context,
                    ref,
                    widget.postId,
                    comments,
                    _reply,
                  ),
                ),
              ),
              if (widget.commentsEnabled)
                CommentComposer(
                  postId: widget.postId,
                  replyTo: _replyTo,
                  focusNode: _focus,
                  onClearReply: () => setState(() => _replyTo = null),
                )
              else
                SafeArea(
                  top: false,
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.lg),
                    child: Text(
                      t.t('post.comments.off'),
                      textAlign: TextAlign.center,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
