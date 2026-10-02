import 'package:flutter/material.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/blocks/presentation/block_actions.dart';
import 'package:lawbid/features/social/presentation/screens/create_post_screen.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

String _link(WidgetRef ref, String postId) => SocialFormat.postLink(
      ref.read(appEnvironmentProvider).deepLinkHost,
      postId,
    );

/// §4 "Поделиться" (owner 2026-10-01): the LawBid share sheet — social
/// networks, copy link, the system sheet — with `lawbid.app/post/:id`.
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

/// Reloads every post list after a block (the blocked person's posts go).
void refreshPostLists(WidgetRef ref) {
  ref
    ..invalidate(feedProvider)
    ..invalidate(latestPostsProvider)
    ..invalidate(explorePostsProvider)
    ..invalidate(filteredPostsProvider)
    ..invalidate(tagPostsProvider)
    ..invalidate(attorneyPostsProvider)
    ..invalidate(attorneyNewsProvider);
}

/// §2.4 "⋯": your own post — edit, delete; someone else's — the author's
/// profile, unfollow (when following), block, report.
Future<void> showPostMenu(BuildContext context, WidgetRef ref, Post post) {
  final t = ref.read(translatorProvider);
  final following = ref.read(followOverridesProvider)[post.author.id] ??
      post.author.isFollowing;
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Padding(
        padding: const EdgeInsets.only(bottom: AppSpacing.md),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            if (post.isMine) ...[
              // Audit 2026-10-02: an assistant edits only with "publish" and
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
                  final error =
                      await ref.read(socialActionsProvider).deletePost(post);
                  if (context.mounted) {
                    showAppSnackBar(
                        context,
                        error == null
                            ? t.t('post.deleted')
                            : errorText(t, error));
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
                  final a = post.author;
                  context.push(a.isClient
                      ? AppRoutes.client(a.username)
                      : AppRoutes.lawyer(a.username));
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
                            ? t.t('post.menu.unfollowed',
                                {'name': post.author.displayName})
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
                  // Their posts leave every list (the server hides them).
                  if (done) refreshPostLists(ref);
                },
              ),
              AppListRow(
                key: const ValueKey('post-menu-report'),
                icon: AppIcons.flagOutlined,
                label: t.t('post.menu.report'),
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  showReportSheet(context, ref, ReportTarget.post, post.id);
                },
              ),
            ],
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
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide,
                    AppSpacing.sm, AppSpacing.screenSide, AppSpacing.md),
                child: Text(t.t('report.title'), style: type.titleMedium),
              ),
              for (final reason in ReportReason.values)
                AppListRow(
                  label: t.t('report.reason.${reason.name}'),
                  showChevron: false,
                  onTap: () async {
                    Navigator.of(sheet).pop();
                    final error = await ref
                        .read(socialActionsProvider)
                        .report(target, id, reason);
                    if (context.mounted) {
                      showAppSnackBar(
                          context,
                          error == null
                              ? t.t('report.sent')
                              : errorText(t, error));
                    }
                  },
                ),
            ],
          ),
        ),
      );
    },
  );
}

/// Owner 2026-09-30: "Edit" opens the "+" form with the post's title,
/// text and qualification (photos stay as published).
Future<void> showEditPostSheet(BuildContext context, WidgetRef ref, Post post) {
  return Navigator.of(context).push<void>(
    MaterialPageRoute(
      fullscreenDialog: true,
      builder: (_) => CreatePostScreen(editing: post),
    ),
  );
}

/// Multi-line post text with a live "n / 2200" counter.
class PostTextField extends ConsumerWidget {
  const PostTextField({
    required this.controller,
    this.autofocus = false,
    this.hint,
    super.key,
  });

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
          onTapOutside: hideKeyboardOnTapOutside,
          controller: controller,
          autofocus: autofocus,
          minLines: 4,
          maxLines: 10,
          maxLength: kPostMaxChars,
          maxLengthEnforcement: MaxLengthEnforcement.enforced,
          buildCounter: (_,
                  {required currentLength, required isFocused, maxLength}) =>
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
            final near = n > kPostMaxChars * 0.9;
            return Text(
              '$n / $kPostMaxChars',
              style: type.caption.copyWith(
                color: near ? colors.warning : colors.textSecondary,
              ),
            );
          },
        ),
      ],
    );
  }
}
