import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// Who a new comment answers (§5.1: one level; a reply to a reply goes to
/// the top-level comment, the server prefixes "@username").
typedef ReplyTarget = ({String parentId, String name});

/// docs/05 §5 comment row: author (attorney by profile, client as
/// "Anna K."), time, text, like, "Ответить", replies on demand.
class CommentTile extends ConsumerStatefulWidget {
  const CommentTile({
    required this.comment,
    required this.onReply,
    this.isReply = false,
    super.key,
  });

  final Comment comment;
  final void Function(ReplyTarget target) onReply;
  final bool isReply;

  @override
  ConsumerState<CommentTile> createState() => _CommentTileState();
}

class _CommentTileState extends ConsumerState<CommentTile> {
  bool _showReplies = false;
  late Comment _c = widget.comment;
  bool _busy = false;

  @override
  void didUpdateWidget(CommentTile old) {
    super.didUpdateWidget(old);
    if (old.comment != widget.comment) _c = widget.comment;
  }

  Future<void> _toggleLike() async {
    if (_busy) return;
    final before = _c;
    final liked = !before.likedByMe;
    HapticFeedback.selectionClick();
    setState(() {
      _busy = true;
      _c = before.copyWith(
        likedByMe: liked,
        likeCount: (before.likeCount + (liked ? 1 : -1)).clamp(0, 1 << 31),
      );
    });
    try {
      await ref
          .read(socialRepositoryProvider)
          .setCommentLiked(before.id, liked: liked);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _c = before);
      showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _menu() async {
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (_c.canDelete)
              AppListRow(
                icon: Icons.delete_outline_rounded,
                label: t.t('comment.delete'),
                destructive: true,
                showChevron: false,
                onTap: () async {
                  Navigator.of(sheet).pop();
                  final ok = await showConfirmSheet(
                    context,
                    t: t,
                    title: t.t('comment.delete.title'),
                    message: t.t('comment.delete.message'),
                    confirmLabel: t.t('comment.delete'),
                    destructive: true,
                  );
                  if (!ok || !mounted) return;
                  try {
                    await ref
                        .read(socialRepositoryProvider)
                        .deleteComment(_c.id);
                    if (!mounted) return;
                    ref.invalidate(commentsProvider(_c.postId));
                    if (_c.parentId != null) {
                      ref.invalidate(repliesProvider(_c.parentId!));
                    }
                  } on Object catch (e) {
                    if (mounted) showAppSnackBar(context, errorText(t, e));
                  }
                },
              ),
            if (!_c.isMine)
              AppListRow(
                icon: Icons.flag_outlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showReportSheet(context, ref, ReportTarget.comment, _c.id);
                },
              ),
            const SizedBox(height: AppSpacing.md),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = _c.author;
    final avatarSize = widget.isReply ? 28.0 : 36.0;
    return Padding(
      padding: EdgeInsets.only(
        left:
            widget.isReply ? AppSpacing.screenSide + 44 : AppSpacing.screenSide,
        right: AppSpacing.md,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onLongPress: _menu,
            behavior: HitTestBehavior.opaque,
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppPressable(
                  onTap: a.isAttorney && a.username != null
                      ? () => context.push(AppRoutes.lawyer(a.username!))
                      : () {},
                  child: GoldRingAvatar(
                    url: a.avatarUrl,
                    initials: a.displayName.isEmpty
                        ? '?'
                        : a.displayName.substring(0, 1).toUpperCase(),
                    size: avatarSize,
                    ring: a.verified,
                  ),
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(
                              // OQ-034: the client is anonymous under a
                              // case — "Case owner" / "Client".
                              a.isCaseOwner
                                  ? t.t('cases.comments.owner')
                                  : a.isAttorney
                                      ? a.displayName
                                      : (isCaseRef(_c.id)
                                          ? t.t('person.client')
                                          : a.displayName),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: type.bodySmall.copyWith(
                                  color: colors.text,
                                  fontWeight: FontWeight.w600),
                            ),
                          ),
                          if (a.verified) ...[
                            const SizedBox(width: 3),
                            VerifiedCheck(
                                label: t.t('post.verified'), size: 13),
                          ],
                          const SizedBox(width: AppSpacing.sm),
                          Text(
                            SocialFormat.ago(t, f, _c.createdAt),
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      // OQ-042: #tags and @mentions are tappable.
                      PostBodyText(
                        body: _c.body,
                        expanded: true,
                        mentions: _c.mentions,
                        height: 1.4,
                      ),
                      Row(
                        children: [
                          TextButton(
                            onPressed: () => widget.onReply((
                              parentId: _c.parentId ?? _c.id,
                              name: a.username ?? a.displayName,
                            )),
                            style: TextButton.styleFrom(
                              padding: EdgeInsets.zero,
                              minimumSize: const Size(0, AppSizes.touchTarget),
                              foregroundColor: colors.textSecondary,
                            ),
                            child: Text(t.t('comment.reply')),
                          ),
                          if (!widget.isReply && _c.replyCount > 0) ...[
                            const SizedBox(width: AppSpacing.lg),
                            TextButton(
                              onPressed: () =>
                                  setState(() => _showReplies = !_showReplies),
                              style: TextButton.styleFrom(
                                padding: EdgeInsets.zero,
                                minimumSize:
                                    const Size(0, AppSizes.touchTarget),
                                foregroundColor: colors.textSecondary,
                              ),
                              child: Text(t.t(
                                _showReplies
                                    ? 'comment.hideReplies'
                                    : 'comment.showReplies',
                                {
                                  'count': SocialFormat.count(
                                      ref.watch(l10nFormatsProvider),
                                      _c.replyCount),
                                },
                              )),
                            ),
                          ],
                        ],
                      ),
                    ],
                  ),
                ),
                Column(
                  children: [
                    BounceIcon(
                      active: _c.likedByMe,
                      icon: Icons.favorite_border_rounded,
                      activeIcon: Icons.favorite_rounded,
                      activeColor: colors.danger,
                      size: 18,
                      label: t.t(_c.likedByMe ? 'post.unlike' : 'post.like'),
                      onTap: _toggleLike,
                    ),
                    if (_c.likeCount > 0)
                      Text(
                        SocialFormat.count(f, _c.likeCount),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ],
            ),
          ),
          if (_showReplies) _Replies(commentId: _c.id, onReply: widget.onReply),
        ],
      ),
    );
  }
}

class _Replies extends ConsumerWidget {
  const _Replies({required this.commentId, required this.onReply});

  final String commentId;
  final void Function(ReplyTarget target) onReply;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final value = ref.watch(repliesProvider(commentId));
    return value.when(
      skipLoadingOnReload: true,
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.md),
        child: Center(
          child: SizedBox.square(
            dimension: AppSizes.footerSpinner,
            child: CircularProgressIndicator(
                strokeWidth: AppSizes.footerSpinnerStroke),
          ),
        ),
      ),
      error: (e, _) => TextButton(
        onPressed: () => ref.invalidate(repliesProvider(commentId)),
        child: Text(t.t('error.retry')),
      ),
      data: (page) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final r in page.items)
            CommentTile(
              key: ValueKey(r.id),
              comment: r,
              isReply: true,
              onReply: onReply,
            ),
          if (page.canLoadMore)
            TextButton(
              onPressed: () =>
                  ref.read(repliesProvider(commentId).notifier).loadMore(),
              child: Text(t.t('comment.moreReplies')),
            ),
        ],
      ),
    );
  }
}

/// The comment field pinned under the post screen (1–1000 chars, §5.1).
class CommentComposer extends ConsumerStatefulWidget {
  const CommentComposer({
    required this.postId,
    required this.replyTo,
    required this.onClearReply,
    required this.focusNode,
    super.key,
  });

  final String postId;
  final ReplyTarget? replyTo;
  final VoidCallback onClearReply;
  final FocusNode focusNode;

  @override
  ConsumerState<CommentComposer> createState() => _CommentComposerState();
}

class _CommentComposerState extends ConsumerState<CommentComposer> {
  final _text = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    setState(() => _sending = true);
    final reply = widget.replyTo;
    // OQ-048: an assistant's comment waits for the attorney's approval.
    if (ref.read(isAssistantProvider)) {
      try {
        final caseThread = isCaseRef(widget.postId);
        await ref.read(teamRepositoryProvider).createRequest(
          caseThread ? RequestKind.caseComment : RequestKind.comment,
          {
            if (caseThread)
              'caseId': widget.postId.substring(kCaseThreadPrefix.length)
            else
              'postId': widget.postId,
            'body': body,
            if (reply?.parentId != null) 'parentId': reply!.parentId,
          },
        );
        if (!mounted) return;
        _text.clear();
        widget.onClearReply();
        showAppSnackBar(context, t.t('request.sent'));
      } on Object catch (e) {
        if (mounted) showAppSnackBar(context, errorText(t, e));
      } finally {
        if (mounted) setState(() => _sending = false);
      }
      return;
    }
    try {
      final c = await ref.read(socialRepositoryProvider).addComment(
            widget.postId,
            body,
            parentId: reply?.parentId,
          );
      if (!mounted) return;
      _text.clear();
      if (reply == null) {
        ref.read(commentsProvider(widget.postId).notifier).add(c);
      } else {
        ref.invalidate(repliesProvider(reply.parentId));
        ref.invalidate(commentsProvider(widget.postId));
      }
      // Case threads (OQ-034) have no post to bump.
      final post = isCaseRef(widget.postId)
          ? null
          : ref.read(postOverridesProvider)[widget.postId] ??
              ref.read(postProvider(widget.postId)).value;
      if (post != null) {
        ref
            .read(postOverridesProvider.notifier)
            .put(post.copyWith(commentCount: post.commentCount + 1));
      }
      widget.onClearReply();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reply = widget.replyTo;
    return Material(
      color: colors.surface,
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Divider(height: 1, color: colors.border),
            if (reply != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide, AppSpacing.sm, AppSpacing.sm, 0),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.t('comment.replyingTo', {'name': reply.name}),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ),
                    AppIconButton(
                      icon: const Icon(Icons.close_rounded, size: 18),
                      semanticLabel: t.t('common.cancel'),
                      onPressed: widget.onClearReply,
                    ),
                  ],
                ),
              ),
            // OQ-042: "@…" suggests people to mention.
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
              child: MentionSuggestions(controller: _text),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                  AppSpacing.sm, AppSpacing.sm, AppSpacing.sm),
              child: Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _text,
                      focusNode: widget.focusNode,
                      minLines: 1,
                      maxLines: 4,
                      maxLength: kCommentMaxChars,
                      buildCounter: (_,
                              {required currentLength,
                              required isFocused,
                              maxLength}) =>
                          null,
                      textCapitalization: TextCapitalization.sentences,
                      style: type.body.copyWith(color: colors.text),
                      decoration: InputDecoration(
                        hintText: t.t('comment.hint'),
                        isDense: true,
                        filled: true,
                        fillColor: colors.bg,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          borderSide: BorderSide(color: colors.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          borderSide: BorderSide(color: colors.border),
                        ),
                        focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                          borderSide: BorderSide(color: colors.gold),
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _text,
                    builder: (context, v, _) {
                      final enabled = v.text.trim().isNotEmpty && !_sending;
                      return AppIconButton(
                        icon: Icon(
                          Icons.arrow_upward_rounded,
                          color: enabled ? colors.gold : colors.textSecondary,
                        ),
                        isLoading: _sending,
                        semanticLabel: t.t('comment.send'),
                        onPressed: enabled ? _send : null,
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
