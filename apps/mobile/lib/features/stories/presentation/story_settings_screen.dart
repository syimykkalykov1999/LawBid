import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_creator_screen.dart'
    show storyAudienceLabel;
import 'package:lawbid/features/stories/presentation/story_viewer_sheets.dart';
import 'package:lawbid/features/stories/stories_routes.dart';

/// Owner 2026-10-20: who sees my stories — the default audience, replies,
/// the people they are hidden from — and the archive.
class StorySettingsScreen extends ConsumerWidget {
  const StorySettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final settings = ref.watch(storySettingsProvider);
    final hidden = ref.watch(hiddenStoriesProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('story.close'),
          onPressed: () => context.pop(),
        ),
        title: Text(t.t('story.settings.title')),
      ),
      body: SafeArea(
        top: false,
        child: settings.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('common.retry'),
            onRetry: () => ref.invalidate(storySettingsProvider),
          ),
          data: (s) => ListView(
            padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
            children: [
              _Header(t.t('story.settings.audience'), type, colors),
              for (final a in StoryAudience.values)
                AppListRow(
                  label: storyAudienceLabel(t, a),
                  selected: s.audience == a,
                  showChevron: false,
                  onTap: () => _run(
                    context,
                    ref,
                    () =>
                        ref.read(storySettingsProvider.notifier).setAudience(a),
                  ),
                ),
              const SizedBox(height: AppSpacing.md),
              MergeSemantics(
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                  ),
                  child: Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              t.t('story.settings.replies'),
                              style: type.body,
                            ),
                            Text(
                              t.t('story.settings.replies.hint'),
                              style: type.caption.copyWith(
                                color: colors.textSecondary,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Switch.adaptive(
                        key: const ValueKey('story-replies-switch'),
                        value: s.allowReplies,
                        onChanged: (v) => _run(
                          context,
                          ref,
                          () => ref
                              .read(storySettingsProvider.notifier)
                              .setAllowReplies(value: v),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              _Header(t.t('story.settings.hidden'), type, colors),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: Text(
                  t.t('story.settings.hidden.hint'),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
              AppListRow(
                label: t.t('story.settings.hidden.add'),
                icon: AppIcons.personAddAlt1Rounded,
                showChevron: false,
                onTap: () => unawaited(_pickPeople(context, ref)),
              ),
              hidden.when(
                loading: () => const Padding(
                  padding: EdgeInsets.all(AppSpacing.xl),
                  child: Center(child: CircularProgressIndicator()),
                ),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('common.retry'),
                  onRetry: () => ref.invalidate(hiddenStoriesProvider),
                ),
                data: (list) => list.isEmpty
                    ? Padding(
                        padding: const EdgeInsets.all(AppSpacing.screenSide),
                        child: Text(
                          t.t('story.settings.hidden.empty'),
                          style: type.body.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      )
                    : Column(
                        children: [
                          for (final u in list)
                            StoryPersonRow(
                              key: ValueKey('story-hidden-${u.id}'),
                              user: u,
                              trailing: _TextAction(
                                label: t.t('story.settings.unhide'),
                                onTap: () => _run(
                                  context,
                                  ref,
                                  () => ref
                                      .read(hiddenStoriesProvider.notifier)
                                      .unhide(u),
                                ),
                              ),
                            ),
                        ],
                      ),
              ),
              const SizedBox(height: AppSpacing.md),
              AppListRow(
                label: t.t('story.settings.archive'),
                icon: AppIcons.historyRounded,
                onTap: () => context.push(StoriesRoutes.archive),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _run(
    BuildContext context,
    WidgetRef ref,
    Future<void> Function() action,
  ) async {
    final t = ref.read(translatorProvider);
    try {
      await action();
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _pickPeople(BuildContext context, WidgetRef ref) =>
      showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const _PeoplePicker(),
      );
}

class _Header extends StatelessWidget {
  const _Header(this.text, this.type, this.colors);

  final String text;
  final AppTypographyTokens type;
  final AppColorTokens colors;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xs,
        ),
        child: Text(text, style: type.titleMedium),
      );
}

class _TextAction extends StatelessWidget {
  const _TextAction({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppTapTarget(
      child: Semantics(
        button: true,
        label: label,
        excludeSemantics: true,
        child: GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: ConstrainedBox(
            constraints: const BoxConstraints(
              minHeight: AppSizes.touchTarget,
              maxWidth: 120,
            ),
            child: Center(
              child: Text(
                label,
                maxLines: 2,
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(
                  color: colors.accent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// "Hide my stories from…": search among the people I follow.
class _PeoplePicker extends ConsumerStatefulWidget {
  const _PeoplePicker();

  @override
  ConsumerState<_PeoplePicker> createState() => _PeoplePickerState();
}

class _PeoplePickerState extends ConsumerState<_PeoplePicker> {
  final _search = TextEditingController();
  final _scroll = ScrollController();
  Timer? _debounce;
  String _query = '';

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 240) {
        ref.read(storyFollowingProvider(_query).notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _onChanged(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = v.trim());
    });
  }

  Future<void> _hide(StoryUser u) async {
    final t = ref.read(translatorProvider);
    try {
      await ref.read(hiddenStoriesProvider.notifier).hide(u);
      if (mounted) Navigator.of(context).pop();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final people = ref.watch(storyFollowingProvider(_query));
    final hidden = {
      for (final u in ref.watch(hiddenStoriesProvider).value ?? <StoryUser>[])
        u.id,
    };
    final height = MediaQuery.sizeOf(context).height * 0.75;
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SizedBox(
          height: height,
          child: Column(
            children: [
              const AppSheetHandle(),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                ),
                child: Align(
                  alignment: AlignmentDirectional.centerStart,
                  child: Text(
                    t.t('story.settings.hidden.pick'),
                    style: type.titleMedium,
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.screenSide,
                ),
                child: AppTextField(
                  controller: _search,
                  hintText: t.t('story.settings.hidden.search'),
                  semanticLabel: t.t('story.settings.hidden.search'),
                  textInputAction: TextInputAction.search,
                  onChanged: _onChanged,
                ),
              ),
              Expanded(
                child: people.when(
                  loading: () =>
                      const Center(child: CircularProgressIndicator()),
                  error: (e, _) => AppErrorState(
                    message: errorText(t, e),
                    retryLabel: t.t('common.retry'),
                    onRetry: () =>
                        ref.invalidate(storyFollowingProvider(_query)),
                  ),
                  data: (list) {
                    final rows = [
                      for (final u in list.items)
                        if (!hidden.contains(u.id)) u,
                    ];
                    if (rows.isEmpty) {
                      return AppEmptyState(
                        message: t.t('story.settings.hidden.none'),
                        icon: AppIcons.personOffOutlined,
                      );
                    }
                    return ListView.builder(
                      controller: _scroll,
                      itemCount: rows.length,
                      itemBuilder: (context, i) => StoryPersonRow(
                        key: ValueKey('story-pick-${rows[i].id}'),
                        user: rows[i],
                        onTap: () => unawaited(_hide(rows[i])),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
