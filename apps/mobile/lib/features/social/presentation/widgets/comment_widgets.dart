import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/platform/web_context_menu.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/social/application/comment_sender.dart';
import 'package:lawbid/features/social/application/social_drafts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';
import 'package:lawbid/features/translation/presentation/translatable_text.dart';
import 'package:material_ui/material_ui.dart';

/// Who a new comment answers (§5.1: one level; a reply to a reply goes to
/// the top-level comment, the server prefixes "@username").
/// [parentId]: the thread (top-level comment) the reply lands under;
/// [replyToId]: the comment actually answered (a reply in that thread or
/// the top one) — the server notifies its author and puts their @handle in
/// front, like Instagram (verify 17.11: the answered person got nothing).
typedef ReplyTarget = ({String parentId, String replyToId, String name});

/// docs/05 §5 comment row: author (attorney by profile, client as
/// "Anna K."), time, text, like, "Ответить", replies on demand.
class CommentTile extends ConsumerStatefulWidget {
  const CommentTile({
    required this.comment,
    required this.onReply,
    this.isReply = false,
    this.threads = false,
    super.key,
  });

  final Comment comment;
  final void Function(ReplyTarget target) onReply;
  final bool isReply;

  /// Owner 2026-10-12 (Threads): the reply as a Threads one — avatar with a
  /// thread line, name row with "…", like and reply under the text.
  final bool threads;

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

  /// Not on the server yet: nothing to like, answer or delete.
  bool get _pending => isPendingComment(_c);

  Future<void> _toggleLike() async {
    if (_busy || _pending) return;
    final before = _c;
    final liked = !before.likedByMe;
    // ignore: unawaited_futures
    AppHaptics.selection();
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
      // Audit C12: the list keeps the new state (a rebuilt tile would
      // otherwise show the old one).
      if (mounted) {
        final parent = _c.parentId;
        if (parent != null) {
          if (ref.read(repliesProvider(parent).exists)) {
            ref.read(repliesProvider(parent).notifier).replace(_c);
          }
        } else if (ref.read(commentsProvider(_c.postId).exists)) {
          ref.read(commentsProvider(_c.postId).notifier).replace(_c);
        }
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _c = before);
      showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Row 109 (Instagram «Comment deleted · Undo»): the comment goes from
  /// the list at once; the server is asked when the undo window ends, and
  /// not at all after «Undo». Runs on after this tile is gone.
  void _deleteWithUndo(Translator t) {
    final c = _c;
    final container = ProviderScope.containerOf(context, listen: false);
    final hidden = container.read(deletedCommentsProvider.notifier)..add(c.id);
    final messenger = ScaffoldMessenger.maybeOf(context);
    showUndoSnackBar(
      context,
      message: t.t('comment.deleted'),
      undoLabel: t.t('tasks.undo'),
      window: ClientTuning.undoWindow,
      onUndo: () => hidden.remove(c.id),
      onTimeout: () => unawaited(() async {
        try {
          await container.read(socialRepositoryProvider).deleteComment(c.id);
          container.invalidate(commentsProvider(c.postId));
          if (c.parentId != null) {
            container.invalidate(repliesProvider(c.parentId!));
          }
          // Audit 2026-10-02: the post's count drops too (the server
          // removes the comment with its replies).
          if (!isCaseRef(c.postId)) {
            await syncPostCountsIn(container, c.postId);
          }
        } on Object catch (e) {
          // Not deleted: the comment comes back and the reason is shown.
          hidden.remove(c.id);
          if (messenger != null && messenger.mounted) {
            showAppSnackBar(messenger.context, errorText(t, e));
          }
        }
      }()),
    );
  }

  Future<void> _menu() async {
    if (_pending) return;
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            // Audit 2026-10-02: assistants never delete in the attorney's name.
            if (_c.canDelete && !ref.read(isAssistantProvider))
              AppListRow(
                icon: AppIcons.deleteOutlineRounded,
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
                  _deleteWithUndo(t);
                },
              ),
            if (!_c.isMine)
              AppListRow(
                icon: AppIcons.flagOutlined,
                label: t.t('post.menu.report'),
                destructive: true,
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
    // Row 109: deleted, the undo window still open.
    if (ref.watch(deletedCommentsProvider.select((d) => d.contains(_c.id)))) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = _c.author;
    if (widget.threads) return _threadsTile(context, t, f, colors, type);
    final avatarSize = widget.isReply ? 28.0 : 36.0;
    return Padding(
      padding: EdgeInsetsDirectional.only(
        start:
            widget.isReply ? AppSpacing.screenSide + 44 : AppSpacing.screenSide,
        end: AppSpacing.md,
        top: AppSpacing.sm,
        bottom: AppSpacing.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Owner row 113: a right-click on the website opens the same menu
          // as the long press (Telegram Web: a comment is a message).
          WebRightClickMenu(
            onMenu: _menu,
            child: GestureDetector(
              onLongPress: _menu,
              behavior: HitTestBehavior.opaque,
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Owner row 111: a 48 pt touch area, same look.
                  AppTapTarget(
                    child: AppPressable(
                      onTap: _openAuthor,
                      child: GoldRingAvatar(
                        url: a.avatarUrl,
                        initials: a.displayName.isEmpty
                            ? '?'
                            : avatarInitials(a.displayName),
                        size: avatarSize,
                        ring: a.verified,
                      ),
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
                              // Owner row 111: a 48 pt touch area, same look.
                              child: AppTapTarget(
                                child: GestureDetector(
                                  onTap: _openAuthor,
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
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            if (a.verified) ...[
                              const SizedBox(width: 3),
                              VerifiedCheck(
                                label: t.t('post.verified'),
                                size: 13,
                                gold: !a.isAttorney,
                              ),
                            ],
                            const SizedBox(width: AppSpacing.sm),
                            Flexible(
                              child: Text(
                                SocialFormat.ago(t, f, _c.createdAt),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: type.caption.copyWith(
                                  color: colors.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 2),
                        // OQ-042: #tags and @mentions are tappable.
                        // Owner 2026-10-05: «Перевести» (posts zone).
                        TranslatableText(
                          kind: TranslatableKind.comment,
                          id: _c.id,
                          text: _c.body,
                          enabled: !_c.isMine,
                          builder: (context, body) => PostBodyText(
                            body: body,
                            expanded: true,
                            mentions: _c.mentions,
                            height: 1.4,
                          ),
                        ),
                        // One row; long translations shrink, nothing moves.
                        Row(
                          children: [
                            Flexible(
                              child: TextButton(
                                onPressed: _pending ? null : _replyToThis,
                                style: TextButton.styleFrom(
                                  padding: EdgeInsets.zero,
                                  minimumSize: const Size(
                                    0,
                                    AppSizes.touchTarget,
                                  ),
                                  foregroundColor: colors.textSecondary,
                                ),
                                child: FitText(t.t('comment.reply')),
                              ),
                            ),
                            if (!widget.isReply && _c.replyCount > 0) ...[
                              const SizedBox(width: AppSpacing.lg),
                              Flexible(
                                child: TextButton(
                                  onPressed: () => setState(
                                    () => _showReplies = !_showReplies,
                                  ),
                                  style: TextButton.styleFrom(
                                    padding: EdgeInsets.zero,
                                    minimumSize: const Size(
                                      0,
                                      AppSizes.touchTarget,
                                    ),
                                    foregroundColor: colors.textSecondary,
                                  ),
                                  child: FitText(
                                    t.t(
                                      _showReplies
                                          ? 'comment.hideReplies'
                                          : 'comment.showReplies',
                                      {
                                        'count': SocialFormat.count(
                                          ref.watch(l10nFormatsProvider),
                                          _c.replyCount,
                                        ),
                                      },
                                    ),
                                  ),
                                ),
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
                        icon: AppIcons.favoriteBorderRounded,
                        activeIcon: AppIcons.favoriteRounded,
                        activeColor: colors.danger,
                        size: 18,
                        label: t.t(_c.likedByMe ? 'post.unlike' : 'post.like'),
                        onTap: _toggleLike,
                      ),
                      if (_c.likeCount > 0)
                        Text(
                          SocialFormat.count(f, _c.likeCount),
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          if (_showReplies) _Replies(commentId: _c.id, onReply: widget.onReply),
        ],
      ),
    );
  }

  /// R-387 (owner 04.11, Instagram): a tap on a comment author's photo or
  /// name opens their profile — an attorney's or a client's — through
  /// [openProfile], like a post author (my own comment → my Profile tab).
  /// A client under a case stays anonymous (OQ-034): no tap there. The page
  /// goes on the root navigator, over the comments sheet; back returns to
  /// the comments.
  VoidCallback? get _openAuthor {
    final a = _c.author;
    final u = a.username;
    if (u == null || u.isEmpty) return null;
    if (!a.isAttorney && isCaseRef(_c.id)) return null;
    return () => openProfile(
          context,
          ref,
          id: _c.isMine
              ? (ref.read(currentUserIdProvider) ?? '')
              : (a.attorneyId ?? ''),
          username: u,
          isClient: !a.isAttorney,
        );
  }

  void _replyToThis() {
    if (_pending) return;
    final a = _c.author;
    widget.onReply(
      (
        parentId: _c.parentId ?? _c.id,
        replyToId: _c.id,
        name: a.username ?? a.displayName,
      ),
    );
  }

  Widget _threadsTile(
    BuildContext context,
    Translator t,
    L10nFormats f,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) {
    final a = _c.author;
    final name = a.isCaseOwner
        ? t.t('cases.comments.owner')
        : a.isAttorney
            ? a.displayName
            : (isCaseRef(_c.id) ? t.t('person.client') : a.displayName);
    final hasReplies = !widget.isReply && _c.replyCount > 0;
    final line = _showReplies && hasReplies;
    Widget action(Widget icon, int count) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            icon,
            if (count > 0)
              Padding(
                padding: const EdgeInsetsDirectional.only(end: AppSpacing.md),
                child: Text(
                  SocialFormat.count(f, count),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
          ],
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Padding(
          padding: const EdgeInsetsDirectional.only(
            start: AppSpacing.screenSide,
            end: AppSpacing.sm,
            top: AppSpacing.md,
          ),
          // Owner row 128: the thread line is a positioned layer from under
          // the avatar to the bottom of the row (was IntrinsicHeight +
          // stretch: a second, speculative layout pass per comment).
          child: Stack(
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  SizedBox(
                    width: 36,
                    // Owner row 111: a 48 pt touch area, same look.
                    child: AppTapTarget(
                      child: AppPressable(
                        onTap: _openAuthor,
                        child: GoldRingAvatar(
                          url: a.avatarUrl,
                          initials: a.displayName.isEmpty
                              ? '?'
                              : avatarInitials(a.displayName),
                          size: 36,
                          ring: a.verified,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Row(
                                children: [
                                  Flexible(
                                    // Owner row 111: 48 pt touch area.
                                    child: AppTapTarget(
                                      child: GestureDetector(
                                        onTap: _openAuthor,
                                        child: Text(
                                          name,
                                          maxLines: 1,
                                          overflow: TextOverflow.ellipsis,
                                          style: type.bodySmall.copyWith(
                                            color: colors.text,
                                            fontWeight: FontWeight.w700,
                                          ),
                                        ),
                                      ),
                                    ),
                                  ),
                                  if (a.verified) ...[
                                    const SizedBox(width: 3),
                                    VerifiedCheck(
                                      label: t.t('post.verified'),
                                      size: 13,
                                      gold: !a.isAttorney,
                                    ),
                                  ],
                                  const SizedBox(width: AppSpacing.sm),
                                  Text(
                                    SocialFormat.ago(t, f, _c.createdAt),
                                    maxLines: 1,
                                    style: type.caption.copyWith(
                                      color: colors.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            AppIconButton(
                              icon: const AppIcon(
                                AppIcons.moreHorizRounded,
                                size: 18,
                              ),
                              semanticLabel: t.t('post.menu'),
                              onPressed: _menu,
                            ),
                          ],
                        ),
                        TranslatableText(
                          kind: TranslatableKind.comment,
                          id: _c.id,
                          text: _c.body,
                          enabled: !_c.isMine,
                          builder: (context, body) => PostBodyText(
                            body: body,
                            expanded: true,
                            mentions: _c.mentions,
                            height: 1.4,
                          ),
                        ),
                        Row(
                          children: [
                            action(
                              BounceIcon(
                                active: _c.likedByMe,
                                icon: AppIcons.favoriteBorderRounded,
                                activeIcon: AppIcons.favoriteRounded,
                                activeColor: colors.danger,
                                size: 20,
                                label: t.t(
                                  _c.likedByMe ? 'post.unlike' : 'post.like',
                                ),
                                onTap: _toggleLike,
                              ),
                              _c.likeCount,
                            ),
                            action(
                              BounceIcon(
                                active: false,
                                icon: AppIcons.modeCommentOutlined,
                                activeIcon: AppIcons.modeCommentOutlined,
                                size: 20,
                                label: t.t('comment.reply'),
                                onTap: _replyToThis,
                              ),
                              0,
                            ),
                          ],
                        ),
                        if (hasReplies)
                          Align(
                            alignment: AlignmentDirectional.centerStart,
                            child: TextButton(
                              onPressed: () =>
                                  setState(() => _showReplies = !_showReplies),
                              style: TextButton.styleFrom(
                                padding: EdgeInsets.zero,
                                minimumSize: const Size(
                                  0,
                                  AppSizes.touchTarget,
                                ),
                                textStyle: type.bodySmall,
                                foregroundColor: colors.textSecondary,
                              ),
                              child: FitText(
                                t.t(
                                  _showReplies
                                      ? 'comment.hideReplies'
                                      : 'comment.showReplies',
                                  {
                                    'count': SocialFormat.count(
                                      f,
                                      _c.replyCount,
                                    ),
                                  },
                                ),
                              ),
                            ),
                          )
                        else
                          const SizedBox(height: AppSpacing.sm),
                      ],
                    ),
                  ),
                ],
              ),
              if (line)
                PositionedDirectional(
                  start: 17,
                  width: 2,
                  top: 36 + AppSpacing.xs,
                  bottom: 0,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: colors.border,
                      borderRadius: BorderRadius.circular(1),
                    ),
                  ),
                ),
            ],
          ),
        ),
        if (_showReplies)
          _Replies(commentId: _c.id, onReply: widget.onReply, threads: true),
        Divider(height: 1, color: colors.border),
      ],
    );
  }
}

class _Replies extends ConsumerWidget {
  const _Replies({
    required this.commentId,
    required this.onReply,
    this.threads = false,
  });

  final String commentId;
  final void Function(ReplyTarget target) onReply;
  final bool threads;

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
              strokeWidth: AppSizes.footerSpinnerStroke,
            ),
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
            AppInsertMotion(
              key: ValueKey(r.id),
              animate: AppInsertMotion.fresh(r.createdAt),
              child: CommentTile(
                comment: r,
                isReply: true,
                threads: threads,
                onReply: onReply,
              ),
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
  bool get _isCase => widget.postId.startsWith(kCaseThreadPrefix);

  // Row 109 (Instagram, YouTube): the half-typed comment of this post
  // comes back when the comments open again.
  late final _text = TextEditingController(
    text: ref.read(commentDraftsProvider)[widget.postId] ?? '',
  )..addListener(_keepDraft);
  late final CommentDrafts _drafts = ref.read(commentDraftsProvider.notifier);
  bool _sending = false;

  void _keepDraft() => _drafts.set(widget.postId, _text.text);

  @override
  void dispose() {
    _text
      ..removeListener(_keepDraft)
      ..dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final body = _text.text.trim();
    if (body.isEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    setState(() => _sending = true);
    final reply = widget.replyTo;
    // Audit 2026-10-02: the approval request needs "posts" (or "cases" in a
    // case thread) — say so before the text is lost to a 403.
    if (ref.read(isAssistantProvider) &&
        !ref.read(canDoProvider(AssistantDuty.publish)) &&
        !ref.read(
          canDoProvider(
            isCaseRef(widget.postId)
                ? AssistantDuty.cases
                : AssistantDuty.posts,
          ),
        )) {
      setState(() => _sending = false);
      showAppSnackBar(
        context,
        errorText(
          t,
          const ApiException(
            code: ApiErrorCodes.assistantNotAllowed,
            message: 'duty',
          ),
        ),
      );
      return;
    }
    // OQ-048: an assistant's comment waits for the attorney's approval.
    if (ref.read(isAssistantProvider) &&
        !ref.read(canDoProvider(AssistantDuty.publish))) {
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
            if (reply != null) 'parentId': reply.replyToId,
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
    // SPEED_MATRIX 2026-11-09 §3 №14 (Instagram): the comment is under the
    // post at once and the field is free for the next one; the server's
    // row replaces the pending one, a refusal takes it away and brings the
    // words back into the field.
    _text.clear();
    widget.onClearReply();
    setState(() => _sending = false);
    final sender = ref.read(commentSenderProvider.notifier);
    try {
      await sender.send(
        postId: widget.postId,
        body: body,
        parentId: reply?.parentId,
        replyToId: reply?.replyToId,
      );
      if (!mounted) return;
      if (reply != null) {
        // The parent's reply count lives in the comments page (no event
        // for it yet): that list is read again.
        ref.invalidate(commentsProvider(widget.postId));
      }
      // Case threads (OQ-034) have no post to bump. Audit 2026-10-02: the
      // count also updates when the post isn't cached (commenting from the
      // feed) — re-read it from the server.
      if (!isCaseRef(widget.postId)) {
        await syncPostCounts(ref, widget.postId);
      }
    } on Object catch (e) {
      if (!mounted) return;
      if (_text.text.trim().isEmpty) _text.text = body;
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reply = widget.replyTo;
    // The send button is part of the field: tapping it keeps the keyboard.
    return TextFieldTapRegion(
      child: Material(
        color: colors.surface,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Divider(height: 1, color: colors.border),
              if (reply != null)
                Padding(
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.sm,
                    0,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          t.t('comment.replyingTo', {'name': reply.name}),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                      AppIconButton(
                        icon: const AppIcon(AppIcons.closeRounded, size: 18),
                        semanticLabel: t.t('common.cancel'),
                        onPressed: widget.onClearReply,
                      ),
                    ],
                  ),
                ),
              // OQ-042: "@…" suggests people to mention.
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: MentionSuggestions(controller: _text),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: Row(
                  children: [
                    // Owner 2026-10-12: a live "n/1000" while typing;
                    // 2026-10-19: inside the field, bottom right.
                    Expanded(
                      child: ListenableBuilder(
                        listenable: _text,
                        builder: (context, _) => InsideCounter(
                          controller: _text,
                          max: kCommentMaxChars,
                          showFrom: 1,
                          end: AppSpacing.lg,
                          bottom: 5,
                          // Row 110 (desktop web): Enter sends,
                          // Shift+Enter is a new line.
                          child: DesktopSendOnEnter(
                            onSend: () => unawaited(_send()),
                            controller: _text,
                            child: TextField(
                              onTapOutside: hideKeyboardOnTapOutside,
                              controller: _text,
                              focusNode: widget.focusNode,
                              minLines: 1,
                              maxLines: 4,
                              maxLength: kCommentMaxChars,
                              buildCounter: noFieldCounter,
                              textCapitalization: TextCapitalization.sentences,
                              style: type.body.copyWith(color: colors.text),
                              decoration: InputDecoration(
                                // Owner 2026-10-15: under a case: «Ask a
                                // question…».
                                hintText: _isCase
                                    ? t.t('cases.comments.ask')
                                    : t.t('comment.hint'),
                                isDense: true,
                                // M3 dense outline padding + room for the
                                // counter once there is text.
                                contentPadding: EdgeInsetsDirectional.fromSTEB(
                                  12,
                                  16,
                                  12,
                                  8 +
                                      (_text.text.isEmpty
                                          ? 0
                                          : kInsideCounterRoom),
                                ),
                                filled: true,
                                fillColor: colors.bg,
                                border: OutlineInputBorder(
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                  borderSide: BorderSide(color: colors.border),
                                ),
                                enabledBorder: OutlineInputBorder(
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                  borderSide: BorderSide(color: colors.border),
                                ),
                                focusedBorder: OutlineInputBorder(
                                  borderRadius:
                                      BorderRadius.circular(AppRadii.pill),
                                  borderSide: BorderSide(color: colors.gold),
                                ),
                              ),
                            ),
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
                          icon: AppIcon(
                            AppIcons.arrowUpwardRounded,
                            color: enabled
                                ? colors.iconTint
                                : colors.textSecondary,
                          ),
                          isLoading: _sending,
                          semanticLabel: _isCase
                              ? t.t('cases.comments.send')
                              : t.t('comment.send'),
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
      ),
    );
  }
}

/// Audit 2026-10-02: re-reads a post after a comment change so every card
/// shows the server's comment count (keeps the viewer's like/save state).
Future<void> syncPostCounts(WidgetRef ref, String postId) => _syncPostCounts(
      ref.read(socialRepositoryProvider),
      () => ref.read(postOverridesProvider),
      ref.read(postOverridesProvider.notifier),
      postId,
    );

/// [syncPostCounts] for work that outlives its widget (row 109 undo).
Future<void> syncPostCountsIn(ProviderContainer container, String postId) =>
    _syncPostCounts(
      container.read(socialRepositoryProvider),
      () => container.read(postOverridesProvider),
      container.read(postOverridesProvider.notifier),
      postId,
    );

Future<void> _syncPostCounts(
  SocialRepository repo,
  Map<String, Post> Function() current,
  PostOverrides overrides,
  String postId,
) async {
  try {
    final fresh = await repo.post(postId);
    final known = current()[postId];
    overrides.put(
      known == null
          ? fresh
          : fresh.copyWith(
              likedByMe: known.likedByMe,
              savedByMe: known.savedByMe,
            ),
    );
  } on Object {
    // Offline: the next refresh corrects it.
  }
}
