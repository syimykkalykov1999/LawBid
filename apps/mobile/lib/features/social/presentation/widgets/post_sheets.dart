import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/promotions/presentation/promote_case_card.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';
import 'package:lawbid/features/social/presentation/screens/social_screens.dart'
    show RepostersScreen;
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

String _link(WidgetRef ref, String postId) => SocialFormat.postLink(
      ref.read(appEnvironmentProvider).deepLinkHost,
      postId,
    );

/// §4 "Поделиться" (owner 2026-10-01): the LawBid share sheet — social
/// networks, copy link, the system sheet — with `lawbid.dev/post/:id`.
Future<void> sharePost(BuildContext context, WidgetRef ref, Post post) async {
  final shared = await showShareSheet(
    context,
    t: ref.read(translatorProvider),
    link: _link(ref, post.id),
    text: post.title,
  );
  // OQ-037: count it unless the sheet was just closed.
  if (shared) await ref.read(socialActionsProvider).recordShare(post);
}

/// Owner 2026-10-18: the ↻ button. Not reposted yet → a sheet with
/// «Репост» (quote posts do not exist in the app, so there is only the
/// plain repost); already reposted → a sheet with «Отменить репост».
/// Haptic, optimistic counter, rolled back (with a message) on an error.
Future<void> showRepostSheet(
  BuildContext context,
  WidgetRef ref,
  Post post,
) async {
  final t = ref.read(translatorProvider);
  final current = ref.read(postOverridesProvider)[post.id] ?? post;
  if (current.isMine) {
    // One's own post is never reposted (server rule REPOST_OWN_POST): the
    // button shows who reposted it, or says why there is nothing to do.
    if (current.repostCount > 0) {
      await showRepostersList(context, current.id);
      return;
    }
    final error = await ref.read(socialActionsProvider).toggleRepost(current);
    if (error != null && context.mounted) {
      showAppSnackBar(context, errorText(t, error));
    }
    return;
  }
  final undo = current.repostedByMe;
  final go = await showAppBottomSheet<bool>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              key: ValueKey(undo ? 'repost-sheet-undo' : 'repost-sheet-do'),
              icon: AppIcons.autoModeRounded,
              label: t.t(undo ? 'post.unrepost' : 'post.repost.action'),
              destructive: undo,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop(true),
            ),
          ],
        ),
      ),
    ),
  );
  if (go != true) return;
  unawaited(HapticFeedback.mediumImpact());
  final error = await ref.read(socialActionsProvider).toggleRepost(current);
  if (error != null && context.mounted) {
    showAppSnackBar(context, errorText(t, error));
  }
}

/// The list of people who reposted a post (the counter's tap).
Future<void> showRepostersList(BuildContext context, String postId) =>
    Navigator.of(context).push<void>(
      MaterialPageRoute<void>(builder: (_) => RepostersScreen(postId: postId)),
    );

/// Opens a person's public profile; your own goes to the Profile tab
/// instead of a second copy of it on the stack.
void openProfile(
  BuildContext context,
  WidgetRef ref, {
  required String id,
  required String username,
  bool isClient = false,
}) {
  if (id == ref.read(currentUserIdProvider)) {
    context.go(AppRoutes.profile);
    return;
  }
  context.push(
    isClient ? AppRoutes.client(username) : AppRoutes.lawyer(username),
  );
}

/// [openProfile] for a post's author.
void openAuthorProfile(BuildContext context, WidgetRef ref, PostAuthor a) =>
    openProfile(
      context,
      ref,
      id: a.id,
      username: a.username,
      isClient: a.isClient,
    );

/// Reloads every post list after a block (the blocked person's posts go).
void refreshPostLists(WidgetRef ref) {
  ref
    ..invalidate(feedProvider)
    ..invalidate(latestPostsProvider)
    ..invalidate(explorePostsProvider)
    ..invalidate(filteredPostsProvider)
    ..invalidate(tagPostsProvider)
    ..invalidate(attorneyPostsProvider)
    ..invalidate(attorneyNewsProvider)
    ..invalidate(attorneyPhotoPostsProvider)
    ..invalidate(attorneyReelsProvider);
}

/// Owner 2026-10-12: a small sheet with three numbers — the slot the post
/// takes at the top of the profile (a taken slot is handed over).
Future<void> showPinSlotSheet(BuildContext context, WidgetRef ref, Post post) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => Consumer(
      builder: (_, ref, __) {
        final colors = Theme.of(sheet).extension<AppColorTokens>()!;
        final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              0,
              AppSpacing.screenSide,
              AppSpacing.lg,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const AppSheetHandle(),
                const SizedBox(height: AppSpacing.md),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    for (final slot in const [1, 2, 3])
                      Semantics(
                        button: true,
                        label: t.t('post.pin.slot', {'n': '$slot'}),
                        excludeSemantics: true,
                        child: AppPressable(
                          key: ValueKey('pin-slot-$slot'),
                          onTap: () async {
                            Navigator.of(sheet).pop();
                            final error = await ref
                                .read(socialActionsProvider)
                                .pinPost(post, slot);
                            if (error != null && context.mounted) {
                              showAppSnackBar(context, errorText(t, error));
                            }
                          },
                          child: Container(
                            width: 64,
                            height: 64,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: colors.surface,
                              border: Border.all(color: colors.gold),
                            ),
                            child: Text(
                              context.digits(slot),
                              style:
                                  type.titleMedium.copyWith(color: colors.text),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    ),
  );
}

/// §2.4 "⋯": your own post — edit, delete; someone else's — the author's
/// profile, unfollow (when following), block, report.
Future<void> showPostMenu(BuildContext context, WidgetRef ref, Post post) {
  final t = ref.read(translatorProvider);
  final following = ref.read(followOverridesProvider)[post.author.id] ??
      post.author.isFollowing;
  return showAppBottomSheet<void>(
    context: context,
    // The whole menu fits (the red rows stay at the bottom, visible).
    isScrollControlled: true,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            // Owner 2026-10-15: the menu sizes to its content and scrolls
            // when the screen is short (nothing is cut off).
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Owner 2026-10-12 (Threads): Save lives in the "⋯" menu.
                    AppListRow(
                      key: const ValueKey('post-menu-save'),
                      icon: post.savedByMe
                          ? AppIcons.bookmarkRounded
                          : AppIcons.bookmarkBorderRounded,
                      label: t.t(post.savedByMe ? 'post.unsave' : 'post.save'),
                      showChevron: false,
                      onTap: () {
                        Navigator.of(sheet).pop();
                        ref.read(socialActionsProvider).toggleSave(post);
                      },
                    ),
                    if (post.isMine) ...[
                      // Audit 2026-10-02: an assistant edits only with
                      // "publish" and
                      // never deletes the attorney's posts.
                      if (ref.read(canDoProvider(AssistantDuty.publish)))
                        AppListRow(
                          icon: AppIcons.editOutlined,
                          label: t.t('post.menu.edit'),
                          showChevron: false,
                          onTap: () {
                            Navigator.of(sheet).pop();
                            showEditPostSheet(context, ref, post);
                          },
                        ),
                      // Owner 2026-10-12: pin to the profile top (1..3).
                      if (!post.isNews &&
                          !post.isArchived &&
                          post.status == 'published' &&
                          ref.read(canDoProvider(AssistantDuty.publish)))
                        AppListRow(
                          key: const ValueKey('post-menu-pin'),
                          icon: post.pinSlot == null
                              ? AppIcons.pushPinOutlined
                              : AppIcons.pushPin,
                          label: t.t(
                            post.pinSlot == null
                                ? 'post.menu.pin'
                                : 'post.menu.unpin',
                          ),
                          showChevron: false,
                          onTap: () async {
                            Navigator.of(sheet).pop();
                            if (post.pinSlot != null) {
                              final error = await ref
                                  .read(socialActionsProvider)
                                  .unpinPost(post);
                              if (error != null && context.mounted) {
                                showAppSnackBar(context, errorText(t, error));
                              }
                              return;
                            }
                            if (context.mounted) {
                              await showPinSlotSheet(context, ref, post);
                            }
                          },
                        ),
                      // Owner 2026-10-18 (Instagram): comments on / off and
                      // the archive — every author; an assistant with
                      // "publish" for the attorney.
                      if (ref.read(canDoProvider(AssistantDuty.publish))) ...[
                        AppListRow(
                          key: const ValueKey('post-menu-comments'),
                          icon: AppIcons.modeCommentOutlined,
                          label: t.t(
                            post.commentsEnabled
                                ? 'post.menu.commentsOff'
                                : 'post.menu.commentsOn',
                          ),
                          showChevron: false,
                          onTap: () async {
                            Navigator.of(sheet).pop();
                            final enabled = !post.commentsEnabled;
                            final error = await ref
                                .read(socialActionsProvider)
                                .setCommentsEnabled(post, enabled: enabled);
                            if (context.mounted) {
                              showAppSnackBar(
                                context,
                                error == null
                                    ? t.t(
                                        enabled
                                            ? 'post.comments.turnedOn'
                                            : 'post.comments.turnedOff',
                                      )
                                    : errorText(t, error),
                              );
                            }
                          },
                        ),
                        if (post.status != 'processing')
                          AppListRow(
                            key: const ValueKey('post-menu-archive'),
                            icon: post.isArchived
                                ? AppIcons.unarchiveOutlined
                                : AppIcons.inventory2Outlined,
                            label: t.t(
                              post.isArchived
                                  ? 'post.menu.unarchive'
                                  : 'post.menu.archive',
                            ),
                            showChevron: false,
                            onTap: () async {
                              Navigator.of(sheet).pop();
                              final archived = !post.isArchived;
                              final error = await ref
                                  .read(socialActionsProvider)
                                  .setArchived(post, archived: archived);
                              if (context.mounted) {
                                showAppSnackBar(
                                  context,
                                  error == null
                                      ? t.t(
                                          archived
                                              ? 'post.archived'
                                              : 'post.unarchived',
                                        )
                                      : errorText(t, error),
                                );
                              }
                            },
                          ),
                      ],
                      // Owner 2026-10-15 (Instagram): hide the like / view counters.
                      if (ref
                          .read(featureFlagsControllerProvider)
                          .isEnabled('hide_counts')) ...[
                        AppListRow(
                          key: const ValueKey('post-menu-hide-likes'),
                          icon: post.likesHidden
                              ? AppIcons.visibilityOutlined
                              : AppIcons.visibilityOffOutlined,
                          label: t.t(
                            post.likesHidden
                                ? 'post.menu.showLikes'
                                : 'post.menu.hideLikes',
                          ),
                          showChevron: false,
                          onTap: () {
                            Navigator.of(sheet).pop();
                            ref.read(socialActionsProvider).setCounters(
                                  post,
                                  hideLikes: !post.likesHidden,
                                );
                          },
                        ),
                        if (post.video != null)
                          AppListRow(
                            key: const ValueKey('post-menu-hide-views'),
                            icon: post.viewsHidden
                                ? AppIcons.visibilityOutlined
                                : AppIcons.visibilityOffOutlined,
                            label: t.t(
                              post.viewsHidden
                                  ? 'post.menu.showViews'
                                  : 'post.menu.hideViews',
                            ),
                            showChevron: false,
                            onTap: () {
                              Navigator.of(sheet).pop();
                              ref.read(socialActionsProvider).setCounters(
                                    post,
                                    hideViews: !post.viewsHidden,
                                  );
                            },
                          ),
                      ],
                      // Owner 2026-10-05: Instagram-style "Promote" (money: the
                      // account owner, never an assistant); not while archived.
                      if (!ref.read(isAssistantProvider) && !post.isArchived)
                        AppListRow(
                          icon: AppIcons.campaignOutlined,
                          label: t.t('promote.menu'),
                          showChevron: false,
                          onTap: () {
                            Navigator.of(sheet).pop();
                            openPostPromotion(context, ref, post.id);
                          },
                        ),
                      if (!ref.read(isAssistantProvider))
                        AppListRow(
                          icon: AppIcons.deleteOutlineRounded,
                          label: t.t('post.menu.delete'),
                          destructive: true,
                          showChevron: false,
                          onTap: () async {
                            Navigator.of(sheet).pop();
                            final ok = await showConfirmSheet(
                              context,
                              t: t,
                              title: t.t('post.delete.title'),
                              message: t.t('post.delete.message'),
                              confirmLabel: t.t('post.menu.delete'),
                              destructive: true,
                            );
                            if (!ok || !context.mounted) return;
                            final error = await ref
                                .read(socialActionsProvider)
                                .deletePost(post);
                            if (context.mounted) {
                              showAppSnackBar(
                                context,
                                error == null
                                    ? t.t('post.deleted')
                                    : errorText(t, error),
                              );
                            }
                          },
                        ),
                    ] else ...[
                      // Owner 2026-10-01: the "⋯" of someone else's post — the
                      // author's profile, unfollow, block, report ("copy link"
                      // lives in the share sheet behind the paper plane).
                      AppListRow(
                        key: const ValueKey('post-menu-profile'),
                        icon: AppIcons.personOutlineRounded,
                        label: t.t('post.menu.profile'),
                        showChevron: false,
                        onTap: () {
                          Navigator.of(sheet).pop();
                          openAuthorProfile(context, ref, post.author);
                        },
                      ),
                      if (following)
                        AppListRow(
                          key: const ValueKey('post-menu-unfollow'),
                          icon: AppIcons.personOffOutlined,
                          label: t.t('post.menu.unfollow'),
                          showChevron: false,
                          onTap: () async {
                            Navigator.of(sheet).pop();
                            final error = await ref
                                .read(socialActionsProvider)
                                .setFollowing(post.author.id, false);
                            if (context.mounted) {
                              showAppSnackBar(
                                context,
                                error == null
                                    ? t.t(
                                        'post.menu.unfollowed',
                                        {'name': post.author.displayName},
                                      )
                                    : errorText(t, error),
                              );
                            }
                          },
                        ),
                      AppListRow(
                        key: const ValueKey('post-menu-block'),
                        icon: AppIcons.blockFlipped,
                        label: t.t('post.menu.block'),
                        destructive: true,
                        showChevron: false,
                        onTap: () async {
                          Navigator.of(sheet).pop();
                          final done = await toggleBlock(
                            context,
                            ref,
                            userId: post.author.id,
                            displayName: post.author.displayName,
                            currentlyBlocked: false,
                          );
                          // Their posts leave every list.
                          if (done) refreshPostLists(ref);
                        },
                      ),
                      AppListRow(
                        key: const ValueKey('post-menu-report'),
                        icon: AppIcons.flagOutlined,
                        label: t.t('post.menu.report'),
                        destructive: true,
                        showChevron: false,
                        onTap: () {
                          Navigator.of(sheet).pop();
                          showReportSheet(
                            context,
                            ref,
                            ReportTarget.post,
                            post.id,
                          );
                        },
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    ),
  );
}

/// `POST /reports` with a `report_reason` (§4, §12). A repeat by the same
/// user is ignored by the server, so the answer is always "thanks".
Future<void> showReportSheet(
  BuildContext context,
  WidgetRef ref,
  ReportTarget target,
  String id,
) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) {
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
        child: Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const AppSheetHandle(),
                Padding(
                  padding: const EdgeInsets.fromLTRB(
                    AppSpacing.screenSide,
                    AppSpacing.sm,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  child: Text(t.t('report.title'), style: type.titleMedium),
                ),
                for (final reason in ReportReason.values)
                  AppListRow(
                    label: t.t('report.reason.${reason.name}'),
                    showChevron: false,
                    onTap: () async {
                      Navigator.of(sheet).pop();
                      // Owner 2026-10-05 (legal): copyright goes through the
                      // DMCA form (the server files the report itself).
                      if (reason == ReportReason.copyright) {
                        if (context.mounted) {
                          await context.push(
                            AppRoutes.dmcaNoticeFor(
                              targetType: _dmcaTargetType(target),
                              targetId: id,
                            ),
                          );
                        }
                        return;
                      }
                      final error = await ref
                          .read(socialActionsProvider)
                          .report(target, id, reason);
                      if (context.mounted) {
                        showAppSnackBar(
                          context,
                          error == null
                              ? t.t('report.sent')
                              : errorText(t, error),
                        );
                      }
                    },
                  ),
              ],
            ),
          ),
        ),
      );
    },
  );
}

/// The DMCA form's `targetType` for a report target; null for targets the
/// notice cannot name (a user, a sticker pack) — the form then asks for a URL.
String? _dmcaTargetType(ReportTarget target) => switch (target) {
      ReportTarget.post => 'post',
      ReportTarget.comment => 'comment',
      ReportTarget.message => 'message',
      ReportTarget.user || ReportTarget.stickerPack => null,
    };

/// Owner 2026-09-30: "Edit" opens the "+" form with the post's title,
/// text and qualification (photos stay as published).
Future<void> showEditPostSheet(BuildContext context, WidgetRef ref, Post post) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => webPageRoute(CreatePostScreen(editing: post)),
    ),
  );
}

/// Multi-line post text with a live "n / 2200" counter. Owner 2026-10-18:
/// [singleLine] = the post's title (one line, cut at [maxChars]).
class PostTextField extends ConsumerWidget {
  const PostTextField({
    required this.controller,
    this.autofocus = false,
    this.hint,
    this.maxChars = kPostMaxChars,
    this.limitHint,
    this.singleLine = false,
    this.textInputAction,
    this.onSubmitted,
    this.focusNode,
    this.fieldKey,
    super.key,
  });

  /// One line, no more than [maxChars] (the title field).
  final bool singleLine;
  final TextInputAction? textInputAction;
  final ValueChanged<String>? onSubmitted;
  final FocusNode? focusNode;

  /// Key of the inner [TextField] (tests).
  final Key? fieldKey;

  /// Shown small and red under the counter once the text is over the limit
  /// of a post with files (Owner 2026-10-12).
  final String? limitHint;

  /// 5000 for a text-only thread, 2200 with files.
  final int maxChars;

  final TextEditingController controller;
  final bool autofocus;
  final String? hint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        TextField(
          key: fieldKey,
          onTapOutside: hideKeyboardOnTapOutside,
          controller: controller,
          focusNode: focusNode,
          autofocus: autofocus,
          minLines: singleLine ? 1 : 4,
          maxLines: singleLine ? 1 : 10,
          maxLength: maxChars,
          maxLengthEnforcement: singleLine
              ? MaxLengthEnforcement.enforced
              : MaxLengthEnforcement.none,
          textInputAction: textInputAction,
          onSubmitted: onSubmitted,
          buildCounter: (
            _, {
            required currentLength,
            required isFocused,
            maxLength,
          }) =>
              null,
          style: type.body.copyWith(color: colors.text),
          decoration: InputDecoration(
            hintText: hint,
            filled: true,
            fillColor: colors.bg,
            border: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.border),
            ),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.border),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(AppRadii.field),
              borderSide: BorderSide(color: colors.gold, width: 1.5),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.xs),
        ValueListenableBuilder<TextEditingValue>(
          valueListenable: controller,
          builder: (context, v, _) {
            final n = v.text.characters.length;
            final near = n > maxChars * 0.9;
            final over = n > maxChars;
            return Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  ltrIsolate('$n / $maxChars'),
                  style: type.caption.copyWith(
                    color: over
                        ? colors.danger
                        : (near ? colors.warning : colors.textSecondary),
                  ),
                ),
                if (over && limitHint != null)
                  Text(
                    limitHint!,
                    style: type.caption.copyWith(
                      color: colors.danger,
                      fontSize: 11,
                    ),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}
