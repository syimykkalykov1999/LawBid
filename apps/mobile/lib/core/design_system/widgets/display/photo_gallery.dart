import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/physics.dart' show SpringSimulation;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/widgets/bars/system_nav_band.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/design_system/widgets/feedback/app_snackbar.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/core/media/photo_saver.dart';
import 'package:lawbid/core/text/bidi.dart';

/// Tests draw the photos without the network cache.
@visibleForTesting
Widget Function(String url)? debugGalleryImage;

/// Owner 2026-09-30: full-screen photos — swipe between them, pinch to
/// zoom, a counter and a close button. Owner 2026-10-07: double tap zooms
/// in and back, a swipe down closes. Used by every photo in the app
/// (posts, reels, cases, chats, tasks, reviews, profile photos).
Future<void> showPhotoGallery(
  BuildContext context, {
  required List<String> urls,
  int initial = 0,
  String closeLabel = 'Close',
  List<String>? previews,
}) {
  // Owner row 88: the photo grows out of the picture that was tapped
  // (a [GalleryHero] around it), as in Telegram, WhatsApp and Instagram.
  final heroes = context.reduceMotion
      ? null
      : [for (final u in urls) GalleryHero.tagFor(context, u)];
  return Navigator.of(context, rootNavigator: true).push(
    PageRouteBuilder<void>(
      opaque: false,
      barrierColor: Colors.transparent,
      pageBuilder: (_, __, ___) => _Gallery(
        urls: urls,
        previews: previews,
        initial: initial,
        closeLabel: closeLabel,
        heroes: heroes,
      ),
      // Owner row 88 (2026-11-13): the app's page timing and curves
      // instead of Flutter's default 300 ms straight-line fade.
      transitionDuration: AppMotion.pageEnter,
      reverseTransitionDuration: AppMotion.pageExit,
      transitionsBuilder: (_, a, __, child) => FadeTransition(
        opacity: CurvedAnimation(
          parent: a,
          curve: AppMotion.enterCurve,
          reverseCurve: AppMotion.exitCurve,
        ),
        child: child,
      ),
    ),
  );
}

/// Owner row 88 (2026-11-13): wrap a photo's thumbnail in this, and
/// [showPhotoGallery] opened from the same screen with the same [url]
/// zooms the photo out of it and back into it on close (Flutter `Hero`,
/// BSD-3). Each thumbnail has its own tag, so two copies of one photo on a
/// screen never clash; the newest one on screen wins.
class GalleryHero extends StatefulWidget {
  const GalleryHero({required this.url, required this.child, super.key});

  /// The full photo's address, the one passed to [showPhotoGallery].
  final String url;
  final Widget child;

  static final Map<Route<Object?>, Map<String, Object>> _byRoute = {};

  /// The tag of the thumbnail of [url] on [context]'s screen, if any.
  static Object? tagFor(BuildContext context, String url) {
    final route = ModalRoute.of(context);
    return route == null ? null : _byRoute[route]?[url];
  }

  @override
  State<GalleryHero> createState() => _GalleryHeroState();
}

class _GalleryHeroState extends State<GalleryHero> {
  final Object _tag = Object();
  Route<Object?>? _route;
  String? _url;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _register();
  }

  @override
  void didUpdateWidget(GalleryHero oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.url != widget.url) _register();
  }

  void _register() {
    final route = ModalRoute.of(context);
    if (identical(route, _route) && _url == widget.url) return;
    _unregister();
    _route = route;
    _url = widget.url;
    if (route != null) {
      (GalleryHero._byRoute[route] ??= {})[widget.url] = _tag;
    }
  }

  void _unregister() {
    final route = _route;
    if (route == null) return;
    final map = GalleryHero._byRoute[route];
    if (map != null && identical(map[_url], _tag)) {
      map.remove(_url);
      if (map.isEmpty) GalleryHero._byRoute.remove(route);
    }
    _route = null;
  }

  @override
  void dispose() {
    _unregister();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Hero(tag: _tag, child: widget.child);
}

class _Gallery extends StatefulWidget {
  const _Gallery({
    required this.urls,
    required this.initial,
    required this.closeLabel,
    this.previews,
    this.heroes,
  });

  final List<String> urls;

  /// The [GalleryHero] tag of each photo's thumbnail (null = none).
  final List<Object?>? heroes;

  /// Owner 2026-11-04 (R-405): the smaller picture already on screen for
  /// each of [urls] (an avatar's 256 px preview) — shown, fitted, while the
  /// full one loads, like Telegram; null or '' = plain black.
  final List<String>? previews;
  final int initial;
  final String closeLabel;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery>
    with SingleTickerProviderStateMixin {
  late final _controller = PageController(initialPage: widget.initial);

  /// Owner row 88: let go above the line, the photo springs back (Flutter
  /// SpringSimulation, BSD-3; AppMotion.snapBackSpring) instead of jumping.
  /// The spring runs from 1 (where it was let go) to 0 (in place).
  late final AnimationController _snap = AnimationController.unbounded(
    vsync: this,
  )..addListener(() => setState(() => _drag = _released * _snap.value));
  Offset _released = Offset.zero;
  Offset _start = Offset.zero;
  late int _page = widget.initial;

  /// The shown photo is zoomed in: no page swipes, no swipe-down close.
  bool _zoomed = false;

  /// Owner row 88 (Telegram, Instagram; `dismissible_page`, MIT, idea):
  /// a vertical swipe starts it, then the photo follows the finger in
  /// every direction, shrinks a little and the black fades; past a
  /// threshold (or flung) it closes.
  Offset _drag = Offset.zero;

  @override
  void dispose() {
    _snap.dispose();
    _controller.dispose();
    super.dispose();
  }

  void _dragEnd(DragEndDetails d) {
    final velocity = d.velocity.pixelsPerSecond;
    final distance = _drag.distance;
    if (distance > 120 || velocity.distance > 700) {
      Navigator.of(context).pop();
    } else if (context.reduceMotion || distance == 0) {
      setState(() => _drag = Offset.zero);
    } else {
      // The release speed towards the rest point, in units of the distance.
      final toward = -(velocity.dx * _drag.dx + velocity.dy * _drag.dy) /
          (distance * distance);
      _released = _drag;
      _snap.value = 1;
      _snap
          .animateWith(
        SpringSimulation(AppMotion.snapBackSpring, 1, 0, -toward),
      )
          .whenCompleteOrCancel(() {
        if (mounted && !_snap.isAnimating) {
          setState(() => _drag = Offset.zero);
        }
      });
    }
  }

  /// Shrinks to 85 % at a third of the screen's height away.
  double _scaleFor(double distance, double height) =>
      (1 - 0.15 * distance / (height / 3)).clamp(0.85, 1.0);

  @override
  Widget build(BuildContext context) {
    final distance = _drag.distance;
    final fade = (1 - distance / 400).clamp(0.3, 1.0);
    final height = MediaQuery.sizeOf(context).height;
    return SystemNavBandColor(
      color: Colors.black,
      child: Scaffold(
        backgroundColor: Colors.black.withValues(alpha: fade),
        body: Stack(
          children: [
            GestureDetector(
              onVerticalDragStart: _zoomed
                  ? null
                  : (d) {
                      _snap.stop();
                      _start = d.globalPosition - _drag;
                    },
              onVerticalDragUpdate: _zoomed
                  ? null
                  : (d) => setState(() => _drag = d.globalPosition - _start),
              onVerticalDragEnd: _zoomed ? null : _dragEnd,
              child: Transform.translate(
                offset: _drag,
                child: Transform.scale(
                  scale: _scaleFor(distance, height),
                  child: PageView.builder(
                    controller: _controller,
                    physics: _zoomed
                        ? const NeverScrollableScrollPhysics()
                        : const PageScrollPhysics(),
                    itemCount: widget.urls.length,
                    onPageChanged: (i) => setState(() {
                      _page = i;
                      _zoomed = false;
                    }),
                    itemBuilder: (_, i) {
                      final photo = _ZoomablePhoto(
                        key: ValueKey('gallery-photo-$i'),
                        url: widget.urls[i],
                        preview: i < (widget.previews?.length ?? 0)
                            ? widget.previews![i]
                            : null,
                        onZoomed: (z) {
                          if (z != _zoomed) setState(() => _zoomed = z);
                        },
                      );
                      final tag = i < (widget.heroes?.length ?? 0)
                          ? widget.heroes![i]
                          : null;
                      if (tag == null) return photo;
                      // Only the photo that was opened flies back into its
                      // thumbnail; after a swipe to another one, it fades.
                      return HeroMode(
                        enabled: i == _page && i == widget.initial,
                        child: Hero(tag: tag, child: photo),
                      );
                    },
                  ),
                ),
              ),
            ),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  children: [
                    IconButton(
                      tooltip: widget.closeLabel,
                      icon: const AppIcon(
                        AppIcons.closeRounded,
                        color: Colors.white,
                      ),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    const Spacer(),
                    if (widget.urls.length > 1)
                      Padding(
                        padding: const EdgeInsetsDirectional.only(end: 12),
                        child: Text(
                          ltrIsolate('${_page + 1} / ${widget.urls.length}'),
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    _SavePhotoButton(url: widget.urls[_page]),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Owner 2026-11-05: «Скачать» in the viewer's top bar.
class _SavePhotoButton extends ConsumerStatefulWidget {
  const _SavePhotoButton({required this.url});

  final String url;

  @override
  ConsumerState<_SavePhotoButton> createState() => _SavePhotoButtonState();
}

class _SavePhotoButtonState extends ConsumerState<_SavePhotoButton> {
  bool _busy = false;

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    final result = await savePhoto(widget.url);
    if (!mounted) return;
    setState(() => _busy = false);
    // The browser's own download bar says it; nothing to add there.
    if (result == PhotoSaveResult.saved && kIsWeb) return;
    showAppSnackBar(
      context,
      t.t(
        switch (result) {
          PhotoSaveResult.saved => 'qr.save.done',
          PhotoSaveResult.noAccess => 'gallery.accessDenied',
          PhotoSaveResult.failed => 'gallery.saveFailed',
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return IconButton(
      key: const ValueKey('gallery-save'),
      tooltip: t.t('cases.files.download'),
      onPressed: _busy ? null : _save,
      icon: _busy
          ? const SizedBox.square(
              dimension: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: Colors.white,
              ),
            )
          : const AppIcon(AppIcons.downloadRounded, color: Colors.white),
    );
  }
}

/// One photo: pinch to zoom (1–5×), double tap zooms in where tapped and
/// back out.
class _ZoomablePhoto extends StatefulWidget {
  const _ZoomablePhoto({
    required this.url,
    required this.onZoomed,
    this.preview,
    super.key,
  });

  final String url;
  final String? preview;
  final ValueChanged<bool> onZoomed;

  @override
  State<_ZoomablePhoto> createState() => _ZoomablePhotoState();
}

class _ZoomablePhotoState extends State<_ZoomablePhoto> {
  final _transform = TransformationController();
  Offset _tap = Offset.zero;

  @override
  void initState() {
    super.initState();
    _transform.addListener(_changed);
  }

  @override
  void dispose() {
    _transform
      ..removeListener(_changed)
      ..dispose();
    super.dispose();
  }

  void _changed() =>
      widget.onZoomed(_transform.value.getMaxScaleOnAxis() > 1.01);

  void _doubleTap() {
    if (_transform.value.getMaxScaleOnAxis() > 1.01) {
      _transform.value = Matrix4.identity();
    } else {
      const scale = 2.5;
      _transform.value = Matrix4.identity()
        ..translateByDouble(
          -_tap.dx * (scale - 1),
          -_tap.dy * (scale - 1),
          0,
          1,
        )
        ..scaleByDouble(scale, scale, 1, 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final preview = widget.preview;
    final placeholder =
        preview == null || preview.isEmpty || preview == widget.url
            ? null
            : Image(
                image: stableNetworkImage(preview),
                fit: BoxFit.contain,
                // A 256 px preview over the whole screen: smooth, not blocky.
                filterQuality: FilterQuality.high,
                gaplessPlayback: true,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              );
    return GestureDetector(
      onDoubleTapDown: (d) => _tap = d.localPosition,
      onDoubleTap: _doubleTap,
      child: InteractiveViewer(
        transformationController: _transform,
        maxScale: 5,
        child: SizedBox.expand(
          child: debugGalleryImage?.call(widget.url) ??
              CachedNetworkImage(
                imageUrl: widget.url,
                // Owner 2026-10-18 (speed): a signed link changes per
                // response — cached by the file's path.
                cacheKey: stableImageCacheKey(widget.url),
                cacheManager: AppImageCaches.feed,
                fit: BoxFit.contain,
                // R-405: a 1024 px photo on a 1170+ px screen (and any
                // zoom) is upscaled — cubic, not bilinear.
                filterQuality: FilterQuality.high,
                placeholder:
                    placeholder == null ? null : (_, __) => placeholder,
                errorWidget: (_, __, ___) => const Center(
                  child: AppIcon(
                    AppIcons.imageNotSupportedOutlined,
                    color: Colors.white54,
                  ),
                ),
              ),
        ),
      ),
    );
  }
}
