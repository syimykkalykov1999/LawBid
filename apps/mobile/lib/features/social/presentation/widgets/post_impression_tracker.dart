import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/features/social/application/post_insights_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';

/// Owner 2026-10-18: the post a widget belongs to — a profile opened from
/// inside it (`openAuthorProfile`) counts as a profile visit from this post.
class PostSourceScope extends InheritedWidget {
  const PostSourceScope({
    required this.postId,
    required super.child,
    super.key,
  });

  final String postId;

  /// The nearest post around [context], or null outside any post.
  static String? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<PostSourceScope>()?.postId;

  @override
  bool updateShouldNotify(PostSourceScope old) => old.postId != postId;
}

/// Owner 2026-10-18: wraps a post card in a feed / profile list — an
/// impression once the card is at least half on screen for [dwell]; never
/// for the viewer's own posts. Also a [PostSourceScope] for the card.
class PostImpressionTracker extends ConsumerStatefulWidget {
  const PostImpressionTracker({
    required this.post,
    required this.child,
    super.key,
  });

  final Post post;
  final Widget child;

  static const dwell = Duration(seconds: 1);
  static const minVisible = 0.5;

  @override
  ConsumerState<PostImpressionTracker> createState() =>
      _PostImpressionTrackerState();
}

class _PostImpressionTrackerState extends ConsumerState<PostImpressionTracker> {
  Timer? _timer;
  bool _counted = false;
  final _positions = <ScrollPosition>[];
  bool _checkQueued = false;

  /// False inside a hidden tab (an offstage page of the shell).
  bool _active = true;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _active = TickerMode.valuesOf(context).enabled;
    _listen();
    _queueCheck();
  }

  /// Every scroll view around the card moves it on screen.
  void _listen() {
    _unlisten();
    if (widget.post.isMine || _counted) return;
    var ctx = context;
    for (var depth = 0; depth < 4; depth++) {
      final s = Scrollable.maybeOf(ctx);
      if (s == null) break;
      _positions.add(s.position..addListener(_queueCheck));
      ctx = s.context;
    }
  }

  void _unlisten() {
    for (final p in _positions) {
      p.removeListener(_queueCheck);
    }
    _positions.clear();
  }

  void _queueCheck() {
    if (_checkQueued || _counted || !mounted) return;
    _checkQueued = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _checkQueued = false;
      _check();
    });
    WidgetsBinding.instance.ensureVisualUpdate();
  }

  /// The share of the card inside every scroll view around it and the
  /// screen.
  double _visibleFraction() {
    final box = context.findRenderObject();
    if (box is! RenderBox || !box.hasSize || !box.attached) return 0;
    final size = box.size;
    if (size.isEmpty) return 0;
    var rect = box.localToGlobal(Offset.zero) & size;
    final view = View.maybeOf(context);
    if (view != null) {
      final screen = Offset.zero & (view.physicalSize / view.devicePixelRatio);
      rect = rect.intersect(screen);
    }
    for (final p in _positions) {
      final o = p.context.notificationContext?.findRenderObject();
      if (o is RenderBox && o.hasSize && o.attached) {
        rect = rect.intersect(o.localToGlobal(Offset.zero) & o.size);
      }
    }
    if (rect.width <= 0 || rect.height <= 0) return 0;
    return (rect.width * rect.height) / (size.width * size.height);
  }

  void _check() {
    if (!mounted || _counted || widget.post.isMine) return;
    final route = ModalRoute.of(context);
    final shown = (route == null || route.isCurrent) &&
        _active &&
        _visibleFraction() >= PostImpressionTracker.minVisible;
    if (shown) {
      _timer ??= Timer(PostImpressionTracker.dwell, () {
        _timer = null;
        if (!mounted || _counted) return;
        if (_visibleFraction() < PostImpressionTracker.minVisible) return;
        _counted = true;
        _unlisten();
        ref.read(postEventsQueueProvider).impression(widget.post.id);
      });
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  @override
  void didUpdateWidget(PostImpressionTracker old) {
    super.didUpdateWidget(old);
    if (old.post.id != widget.post.id) {
      _timer?.cancel();
      _timer = null;
      _counted = false;
      _listen();
      _queueCheck();
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _unlisten();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      PostSourceScope(postId: widget.post.id, child: widget.child);
}
