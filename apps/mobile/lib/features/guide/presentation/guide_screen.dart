import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-18: «Справочник» — the «i» left of the search in the case
/// lists (client and attorney). How LawBid works, in sections that open on
/// a tap; the texts are `guide.s<n>.title` / `guide.s<n>.body`.
class GuideScreen extends ConsumerWidget {
  const GuideScreen({super.key});

  static const sectionCount = 8;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    // Owner 2026-10-18: the admin switches each section on or off
    // (flags `guide_section_<n>`, on by default).
    final flags = ref.watch(featureFlagsControllerProvider);
    final shown = [
      for (var i = 1; i <= sectionCount; i++)
        if (flags.isEnabled('guide_section_$i')) i,
    ];
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('guide.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          key: const ValueKey('guide-list'),
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            Text(
              t.t('guide.intro'),
              style: type.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            for (final i in shown) ...[
              _GuideSection(
                key: ValueKey('guide-s$i'),
                title: t.t('guide.s$i.title'),
                body: t.t('guide.s$i.body'),
              ),
              const SizedBox(height: AppSpacing.sm),
            ],
          ],
        ),
      ),
    );
  }
}

class _GuideSection extends StatefulWidget {
  const _GuideSection({
    required this.title,
    required this.body,
    super.key,
  });

  final String title;
  final String body;

  @override
  State<_GuideSection> createState() => _GuideSectionState();
}

class _GuideSectionState extends State<_GuideSection> {
  bool _open = false;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            button: true,
            expanded: _open,
            child: AppPressable(
              onTap: () => setState(() => _open = !_open),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        widget.title,
                        style: type.titleMedium.copyWith(color: colors.text),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    AnimatedRotation(
                      turns: _open ? 0.5 : 0,
                      duration: motion,
                      child: AppIcon(
                        AppIcons.expandMoreRounded,
                        color: colors.goldDark,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          // A zero-length AnimatedSize re-dirties its own layout, so under
          // reduce-motion the body just appears.
          _MaybeAnimatedSize(
            duration: motion,
            child: _open
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.lg,
                      0,
                      AppSpacing.lg,
                      AppSpacing.lg,
                    ),
                    child: SelectableText(
                      widget.body,
                      style: type.body.copyWith(color: colors.text),
                    ),
                  )
                : const SizedBox(width: double.infinity),
          ),
        ],
      ),
    );
  }
}

/// AnimatedSize, or the plain child under reduce-motion.
class _MaybeAnimatedSize extends StatelessWidget {
  const _MaybeAnimatedSize({required this.duration, required this.child});

  final Duration duration;
  final Widget child;

  @override
  Widget build(BuildContext context) => duration == Duration.zero
      ? child
      : AnimatedSize(
          duration: duration,
          alignment: Alignment.topCenter,
          child: child,
        );
}
