import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show commentThreadSlivers;
import 'package:lawbid/features/social/presentation/widgets/comment_widgets.dart';

/// Owner 2026-10-07: comments open as a sheet that slides up from the
/// comment icon (Instagram): drag up for the whole screen, down to close;
/// the field to write sits at the bottom of the sheet.
Future<void> showCommentsSheet(
  BuildContext context, {
  required String postId,
  required bool commentsEnabled,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    backgroundColor: colors.surface,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(AppRadii.sheet)),
    ),
    builder: (_) => CommentsSheet(
      postId: postId,
      commentsEnabled: commentsEnabled,
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
        initialChildSize: 0.7,
        minChildSize: 0.4,
        snap: true,
        snapSizes: const [0.7],
        builder: (context, controller) => Column(
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
                    t.t('reels.commentsOff'),
                    textAlign: TextAlign.center,
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
