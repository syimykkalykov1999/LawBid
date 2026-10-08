import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/widgets/bars/system_nav_band.dart';

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
}) =>
    Navigator.of(context, rootNavigator: true).push(
      PageRouteBuilder<void>(
        opaque: false,
        barrierColor: Colors.transparent,
        pageBuilder: (_, __, ___) => _Gallery(
          urls: urls,
          initial: initial,
          closeLabel: closeLabel,
        ),
        transitionsBuilder: (_, a, __, child) =>
            FadeTransition(opacity: a, child: child),
      ),
    );

class _Gallery extends StatefulWidget {
  const _Gallery({
    required this.urls,
    required this.initial,
    required this.closeLabel,
  });

  final List<String> urls;
  final int initial;
  final String closeLabel;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  late final _controller = PageController(initialPage: widget.initial);
  late int _page = widget.initial;

  /// The shown photo is zoomed in: no page swipes, no swipe-down close.
  bool _zoomed = false;

  /// Swipe-down distance; the photo follows the finger and the black
  /// fades, past a threshold it closes.
  double _drag = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _dragEnd(DragEndDetails d) {
    if (_drag > 120 || (d.primaryVelocity ?? 0) > 700) {
      Navigator.of(context).pop();
    } else {
      setState(() => _drag = 0);
    }
  }

  @override
  Widget build(BuildContext context) {
    final fade = (1 - _drag / 400).clamp(0.3, 1.0);
    return SystemNavBandColor(
      color: Colors.black,
      child: Scaffold(
        backgroundColor: Colors.black.withValues(alpha: fade),
        body: Stack(
          children: [
            GestureDetector(
              onVerticalDragUpdate: _zoomed
                  ? null
                  : (d) => setState(
                        () => _drag = (_drag + d.delta.dy).clamp(0, 2000),
                      ),
              onVerticalDragEnd: _zoomed ? null : _dragEnd,
              child: Transform.translate(
                offset: Offset(0, _drag),
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
                  itemBuilder: (_, i) => _ZoomablePhoto(
                    key: ValueKey('gallery-photo-$i'),
                    url: widget.urls[i],
                    onZoomed: (z) {
                      if (z != _zoomed) setState(() => _zoomed = z);
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
                          '${_page + 1} / ${widget.urls.length}',
                          style: const TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
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

/// One photo: pinch to zoom (1–5×), double tap zooms in where tapped and
/// back out.
class _ZoomablePhoto extends StatefulWidget {
  const _ZoomablePhoto({
    required this.url,
    required this.onZoomed,
    super.key,
  });

  final String url;
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
  Widget build(BuildContext context) => GestureDetector(
        onDoubleTapDown: (d) => _tap = d.localPosition,
        onDoubleTap: _doubleTap,
        child: InteractiveViewer(
          transformationController: _transform,
          maxScale: 5,
          child: SizedBox.expand(
            child: debugGalleryImage?.call(widget.url) ??
                CachedNetworkImage(
                  imageUrl: widget.url,
                  fit: BoxFit.contain,
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
