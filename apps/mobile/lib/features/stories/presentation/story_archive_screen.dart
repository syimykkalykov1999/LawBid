import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_backgrounds.dart';
import 'package:lawbid/features/stories/presentation/story_frame.dart';
import 'package:lawbid/features/stories/presentation/story_viewer_screen.dart';

/// Owner 2026-10-20: my expired stories as a grid; a tap plays one
/// read-only (nobody is told, nothing is marked seen).
class StoryArchiveScreen extends ConsumerStatefulWidget {
  const StoryArchiveScreen({super.key});

  @override
  ConsumerState<StoryArchiveScreen> createState() => _StoryArchiveScreenState();
}

class _StoryArchiveScreenState extends ConsumerState<StoryArchiveScreen> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.position.extentAfter < 400) {
        ref.read(storyArchiveProvider.notifier).loadMore();
      }
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _play(List<Story> all, int index) {
    Navigator.of(context, rootNavigator: true).push<void>(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (route) => Scaffold(
          backgroundColor: Colors.black,
          body: StoryPlaybackView(
            stories: all,
            startIndex: index,
            readOnly: true,
            onClose: () => Navigator.of(route).pop(),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final archive = ref.watch(storyArchiveProvider);
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('story.close'),
          onPressed: () => context.pop(),
        ),
        title: Text(t.t('story.archive.title')),
      ),
      body: SafeArea(
        top: false,
        child: archive.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('common.retry'),
            onRetry: () => ref.invalidate(storyArchiveProvider),
          ),
          data: (list) {
            if (list.items.isEmpty) {
              return AppEmptyState(
                message: t.t('story.archive.empty'),
                icon: AppIcons.historyRounded,
              );
            }
            final formats = ref.watch(l10nFormatsProvider);
            return RefreshIndicator(
              onRefresh: () =>
                  ref.read(storyArchiveProvider.notifier).refresh(),
              child: GridView.builder(
                controller: _scroll,
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(AppSpacing.sm),
                gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                  maxCrossAxisExtent: 130,
                  mainAxisSpacing: AppSpacing.sm,
                  crossAxisSpacing: AppSpacing.sm,
                  childAspectRatio: kStoryAspect,
                ),
                itemCount: list.items.length,
                itemBuilder: (context, i) {
                  final s = list.items[i];
                  return Semantics(
                    button: true,
                    label: t.t(
                      'story.archive.item',
                      {'date': formats.dayMonth(s.createdAt)},
                    ),
                    excludeSemantics: true,
                    child: GestureDetector(
                      key: ValueKey('story-archive-${s.id}'),
                      onTap: () => _play(list.items, i),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        child: _Tile(
                          story: s,
                          date: formats.dayMonth(s.createdAt),
                        ),
                      ),
                    ),
                  );
                },
              ),
            );
          },
        ),
      ),
    );
  }
}

class _Tile extends StatelessWidget {
  const _Tile({required this.story, required this.date});

  final Story story;
  final String date;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final cover = switch (story.kind) {
      StoryKind.photo => story.previewUrl ?? story.mediaUrl,
      StoryKind.video => story.video?.thumbnailUrl,
      StoryKind.text => null,
    };
    return Stack(
      fit: StackFit.expand,
      children: [
        if (story.kind == StoryKind.text)
          DecoratedBox(
            decoration: BoxDecoration(
              gradient: storyBackgroundGradient(story.background),
            ),
            child: Center(
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.sm),
                child: Text(
                  story.text ?? '',
                  maxLines: 5,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  textScaler: TextScaler.noScaling,
                  style: type.caption.copyWith(color: Colors.white),
                ),
              ),
            ),
          )
        else ...[
          const ColoredBox(color: Colors.black),
          if (cover != null)
            Image(
              image: appNetworkImage(cover, 320),
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => const SizedBox.shrink(),
            ),
        ],
        if (story.kind == StoryKind.video)
          const Align(
            alignment: AlignmentDirectional.topEnd,
            child: Padding(
              padding: EdgeInsets.all(AppSpacing.xs),
              child: Icon(
                AppIcons.playCircleRounded,
                color: Colors.white,
                size: AppSizes.iconSm,
              ),
            ),
          ),
        Align(
          alignment: Alignment.bottomCenter,
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Colors.black.withValues(alpha: 0),
                  Colors.black.withValues(alpha: 0.6),
                ],
              ),
            ),
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.xs),
              child: SizedBox(
                width: double.infinity,
                child: Text(
                  date,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  textScaler: TextScaler.noScaling,
                  style: type.caption.copyWith(color: Colors.white),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }
}
