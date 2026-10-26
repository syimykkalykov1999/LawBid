import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/tab_reselect.dart';
import 'package:lawbid/features/social/application/fresh_posts.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner 2026-10-19 (Instagram): the feed with the «New posts» pill on top
/// — the quiet check runs when the feed opens and when the app comes back
/// to the foreground (at most every [FreshPosts.minGap]); a tap scrolls
/// up and loads the new posts. The list under it never jumps.
class FreshPostsOverlay extends ConsumerStatefulWidget {
  const FreshPostsOverlay({required this.child, super.key});

  final Widget child;

  @override
  ConsumerState<FreshPostsOverlay> createState() => _FreshPostsOverlayState();
}

class _FreshPostsOverlayState extends ConsumerState<FreshPostsOverlay> {
  late final AppLifecycleListener _life;
  final _list = GlobalKey();

  @override
  void initState() {
    super.initState();
    _life = AppLifecycleListener(onResume: _check);
    WidgetsBinding.instance.addPostFrameCallback((_) => _check());
  }

  @override
  void dispose() {
    _life.dispose();
    super.dispose();
  }

  void _check() {
    if (mounted) unawaited(ref.read(freshPostsProvider.notifier).check());
  }

  Future<void> _open() async {
    unawaited(HapticFeedback.selectionClick());
    final notifier = ref.read(freshPostsProvider.notifier);
    final listContext = _list.currentContext;
    if (listContext != null) {
      await scrollVisibleToTop(
        listContext,
        reduceMotion: context.reduceMotion,
      );
    }
    if (!mounted) return;
    final feed = ref.read(feedProvider.notifier);
    try {
      await feed.refresh();
      // Audit C10: the pill goes only once the new posts really came in.
      notifier.clear();
    } on Object {
      // Quiet: the pill stays and can be tapped again.
    }
  }

  @override
  Widget build(BuildContext context) {
    // A pull-to-refresh took them in: the pill goes.
    ref.listen(feedProvider, (prev, next) {
      final fresh = ref.read(freshPostsProvider);
      final items = next.value?.items;
      if (fresh.isEmpty || items == null) return;
      final ids = {for (final p in items) p.id};
      if (fresh.any((p) => ids.contains(p.id))) {
        ref.read(freshPostsProvider.notifier).clear();
      }
    });
    final fresh = ref.watch(freshPostsProvider);
    final motion = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Stack(
      children: [
        KeyedSubtree(key: _list, child: widget.child),
        Positioned(
          top: AppSpacing.sm,
          left: 0,
          right: 0,
          child: Center(
            child: AnimatedSwitcher(
              duration: motion,
              switchInCurve: AppMotion.enterCurve,
              transitionBuilder: (child, a) => FadeTransition(
                opacity: a,
                child: SlideTransition(
                  position: Tween(
                    begin: const Offset(0, -0.6),
                    end: Offset.zero,
                  ).animate(a),
                  child: child,
                ),
              ),
              child: fresh.isEmpty
                  ? const SizedBox.shrink(key: ValueKey('none'))
                  : _Pill(
                      key: const ValueKey('pill'),
                      avatars: {
                        for (final p in fresh)
                          if (p.author.avatarUrl != null) p.author.avatarUrl!,
                      }.take(3).toList(),
                      onTap: _open,
                    ),
            ),
          ),
        ),
      ],
    );
  }
}

class _Pill extends ConsumerWidget {
  const _Pill({required this.avatars, required this.onTap, super.key});

  final List<String> avatars;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    const avatar = 22.0;
    return Semantics(
      button: true,
      label: t.t('feed.newPosts'),
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: 6,
          ),
          decoration: BoxDecoration(
            color: colors.accent,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            boxShadow: [
              BoxShadow(color: colors.shadow, blurRadius: 12),
            ],
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(
                AppIcons.arrowUpwardRounded,
                size: 16,
                color: colors.onAccent,
              ),
              const SizedBox(width: 6),
              if (avatars.isNotEmpty) ...[
                SizedBox(
                  width: avatar + (avatars.length - 1) * avatar * 0.6,
                  height: avatar,
                  child: Stack(
                    children: [
                      for (var i = 0; i < avatars.length; i++)
                        PositionedDirectional(
                          start: i * avatar * 0.6,
                          child: Container(
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border:
                                  Border.all(color: colors.accent, width: 1.5),
                            ),
                            child: AppAvatar(
                              size: avatar - 3,
                              imageProvider: appNetworkImage(
                                avatars[i],
                                decodeWidthFor(avatar),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: 6),
              ],
              Text(
                t.t('feed.newPosts'),
                style: type.caption.copyWith(
                  color: colors.onAccent,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
