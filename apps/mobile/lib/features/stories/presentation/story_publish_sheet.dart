import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/stories/application/story_publish_job.dart';

/// The caption of the publish phase ("Uploading…").
String storyPhaseLabel(Translator t, StoryPublishPhase phase) =>
    switch (phase) {
      StoryPublishPhase.compressing => t.t('story.publish.compressing'),
      StoryPublishPhase.uploading => t.t('story.publish.uploading'),
      StoryPublishPhase.processing => t.t('story.publish.processing'),
      StoryPublishPhase.posting => t.t('story.publish.posting'),
      _ => t.t('story.publish.posting'),
    };

/// Where the story being posted is, with "Cancel"; after a failure the
/// reason with "Try again" / "Discard". Used by the creator and by the
/// sheet the tray opens.
class StoryPublishPanel extends ConsumerWidget {
  const StoryPublishPanel({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final s = ref.watch(storyPublishJobProvider);
    final job = ref.read(storyPublishJobProvider.notifier);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final failed = s.phase == StoryPublishPhase.failed;
    final determinate = s.phase == StoryPublishPhase.compressing ||
        s.phase == StoryPublishPhase.uploading;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          failed
              ? errorText(t, s.error ?? Object())
              : storyPhaseLabel(t, s.phase),
          style: type.body.copyWith(color: failed ? colors.dangerText : null),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: AppSpacing.md),
        if (s.busy)
          Semantics(
            label: storyPhaseLabel(t, s.phase),
            value: determinate ? '${(s.progress * 100).round()}%' : null,
            child: ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              child: LinearProgressIndicator(
                value: determinate ? s.progress : null,
                minHeight: AppSizes.progressSegment,
                color: colors.gold,
                backgroundColor: colors.border,
              ),
            ),
          ),
        if (s.busy) const SizedBox(height: AppSpacing.md),
        if (s.busy)
          AppButton(
            label: t.t('story.publish.cancel'),
            variant: AppButtonVariant.secondary,
            onPressed: job.cancel,
          ),
        if (failed) ...[
          AppButton(
            label: t.t('common.retry'),
            onPressed: () => job.retry().ignore(),
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            label: t.t('story.publish.discard'),
            variant: AppButtonVariant.secondary,
            onPressed: job.dismiss,
          ),
        ],
      ],
    );
  }
}

/// The tray's sheet over the posting story; it closes by itself when the
/// job ends or is dismissed.
Future<void> showStoryPublishSheet(BuildContext context) =>
    showAppBottomSheet<void>(
      context: context,
      builder: (_) => const _PublishSheet(),
    );

class _PublishSheet extends ConsumerWidget {
  const _PublishSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen(storyPublishJobProvider, (_, next) {
      if (next.phase == StoryPublishPhase.idle ||
          next.phase == StoryPublishPhase.done) {
        Navigator.of(context).maybePop();
      }
    });
    return const SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.md,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppSheetHandle(),
            SizedBox(height: AppSpacing.md),
            StoryPublishPanel(),
          ],
        ),
      ),
    );
  }
}
