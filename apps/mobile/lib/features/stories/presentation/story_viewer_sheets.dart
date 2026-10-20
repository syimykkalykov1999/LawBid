import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_navigation.dart';

/// Asks, then deletes the story (`DELETE /stories/:id`). True when it is
/// gone; a failure is shown and counts as "not deleted".
Future<bool> confirmDeleteStory(
  BuildContext context,
  WidgetRef ref,
  Story story,
) async {
  final t = ref.read(translatorProvider);
  final ok = await showDialog<bool>(
    context: context,
    builder: (dialog) => AppAlertDialog(
      title: Text(t.t('story.delete.title')),
      content: Text(t.t('story.delete.body')),
      actions: [
        AppButton(
          label: t.t('common.delete'),
          variant: AppButtonVariant.danger,
          onPressed: () => Navigator.of(dialog).pop(true),
        ),
        AppButton(
          label: t.t('story.cancel'),
          variant: AppButtonVariant.secondary,
          onPressed: () => Navigator.of(dialog).pop(false),
        ),
      ],
    ),
  );
  if (ok != true) return false;
  try {
    await ref.read(storiesRepositoryProvider).remove(story.id);
    return true;
  } on Object catch (e) {
    if (context.mounted) showAppSnackBar(context, errorText(t, e));
    return false;
  }
}

/// "⋯" of the viewer: mine — settings and delete; someone else's — report.
/// Returns true when the story was deleted.
Future<bool> showStoryMenu(
  BuildContext context,
  WidgetRef ref,
  Story story,
) async {
  final t = ref.read(translatorProvider);
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          if (story.isMine) ...[
            AppListRow(
              label: t.t('story.menu.settings'),
              icon: AppIcons.settingsOutlined,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('settings'),
            ),
            AppListRow(
              label: t.t('common.delete'),
              icon: AppIcons.deleteOutlineRounded,
              destructive: true,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('delete'),
            ),
          ] else
            AppListRow(
              label: t.t('story.menu.report'),
              icon: AppIcons.flagOutlined,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('report'),
            ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (!context.mounted) return false;
  switch (choice) {
    case 'settings':
      await openStorySettings(context);
    case 'delete':
      return confirmDeleteStory(context, ref, story);
    case 'report':
      await showStoryReportSheet(context, ref, story);
  }
  return false;
}

/// The reasons a story can be reported for (`POST /reports`, `story`).
const List<String> _reasons = [
  'spam',
  'abuse',
  'misinformation',
  'impersonation',
  'inappropriate',
  'fraud',
  'other',
];

Future<void> showStoryReportSheet(
  BuildContext context,
  WidgetRef ref,
  Story story,
) {
  final t = ref.read(translatorProvider);
  return showAppBottomSheet<void>(
    context: context,
    builder: (sheet) {
      final type = Theme.of(sheet).extension<AppTypographyTokens>()!;
      return SafeArea(
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
              for (final reason in _reasons)
                AppListRow(
                  label: t.t('report.reason.$reason'),
                  showChevron: false,
                  onTap: () async {
                    Navigator.of(sheet).pop();
                    try {
                      await ref
                          .read(storiesRepositoryProvider)
                          .report(story.id, reason);
                      if (context.mounted) {
                        showAppSnackBar(context, t.t('report.sent'));
                      }
                    } on Object catch (e) {
                      if (context.mounted) {
                        showAppSnackBar(context, errorText(t, e));
                      }
                    }
                  },
                ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      );
    },
  );
}

/// Who saw my story (`GET /stories/:id/viewers`, paged), with delete.
/// Returns true when the story was deleted from the sheet.
Future<bool> showStoryViewersSheet(
  BuildContext context,
  WidgetRef ref,
  Story story,
) async {
  final deleted = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _ViewersSheet(story: story),
  );
  return deleted ?? false;
}

class _ViewersSheet extends ConsumerStatefulWidget {
  const _ViewersSheet({required this.story});

  final Story story;

  @override
  ConsumerState<_ViewersSheet> createState() => _ViewersSheetState();
}

class _ViewersSheetState extends ConsumerState<_ViewersSheet> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 240) {
        ref.read(storyViewersProvider(widget.story.id).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final id = widget.story.id;
    final viewers = ref.watch(storyViewersProvider(id));
    final height = MediaQuery.sizeOf(context).height * 0.7;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsetsDirectional.only(
                start: AppSpacing.screenSide,
                end: AppSpacing.xs,
                bottom: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Icon(AppIcons.visibilityOutlined, color: colors.text),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      t.plural(
                        'story.viewer.views',
                        widget.story.viewCount,
                        {'count': formats.number(widget.story.viewCount)},
                      ),
                      style: type.titleMedium,
                    ),
                  ),
                  _SheetIconButton(
                    icon: AppIcons.deleteOutlineRounded,
                    label: t.t('common.delete'),
                    color: colors.danger,
                    onTap: () async {
                      final gone = await confirmDeleteStory(
                        context,
                        ref,
                        widget.story,
                      );
                      if (gone && context.mounted) {
                        Navigator.of(context).pop(true);
                      }
                    },
                  ),
                ],
              ),
            ),
            Expanded(
              child: viewers.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('common.retry'),
                  onRetry: () => ref.invalidate(storyViewersProvider(id)),
                ),
                data: (list) => list.items.isEmpty
                    ? AppEmptyState(
                        message: t.t('story.viewers.empty'),
                        icon: AppIcons.visibilityOffOutlined,
                      )
                    : ListView.builder(
                        controller: _scroll,
                        itemCount: list.items.length,
                        itemBuilder: (context, i) {
                          final v = list.items[i];
                          return _PersonRow(
                            user: v.user,
                            trailing: SocialFormat.ago(
                              t,
                              formats,
                              v.viewedAt,
                            ),
                          );
                        },
                      ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _SheetIconButton extends StatelessWidget {
  const _SheetIconButton({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) => AppTapTarget(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: SizedBox(
              width: AppSizes.touchTarget,
              height: AppSizes.touchTarget,
              child: Icon(icon, color: color),
            ),
          ),
        ),
      );
}

/// Avatar, name (+ badge), @username and an optional trailing text/widget.
class StoryPersonRow extends StatelessWidget {
  const StoryPersonRow({
    required this.user,
    this.trailing,
    this.trailingText,
    this.onTap,
    super.key,
  });

  final StoryUser user;
  final Widget? trailing;
  final String? trailingText;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => _PersonRow(
        user: user,
        trailing: trailingText,
        trailingWidget: trailing,
        onTap: onTap,
      );
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.user,
    this.trailing,
    this.trailingWidget,
    this.onTap,
  });

  final StoryUser user;
  final String? trailing;
  final Widget? trailingWidget;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final url = user.avatarUrl;
    return InkWell(
      onTap: onTap,
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.touchTarget + 12),
        child: Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              AppAvatar(
                initials: user.initials,
                imageProvider: url == null
                    ? null
                    : appNetworkImage(url, decodeWidthFor(AppSizes.cardAvatar)),
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
                            user.displayName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ),
                        if (user.verified) ...[
                          const SizedBox(width: AppSpacing.xs),
                          Icon(
                            AppIcons.verifiedRounded,
                            size: AppSizes.iconSm - 4,
                            color: colors.gold,
                          ),
                        ],
                      ],
                    ),
                    Text(
                      '@${user.username}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              if (trailing != null) ...[
                const SizedBox(width: AppSpacing.sm),
                Text(
                  trailing!,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
              if (trailingWidget != null) ...[
                const SizedBox(width: AppSpacing.sm),
                trailingWidget!,
              ],
            ],
          ),
        ),
      ),
    );
  }
}
