import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/features/stories/domain/story_models.dart';
import 'package:lawbid/features/stories/presentation/story_backgrounds.dart';

/// A story is always a 9:16 frame; every size inside it (stickers, text) is
/// a fraction of the frame's width, so it looks the same on any screen.
const double kStoryAspect = 9 / 16;

/// Sticker size at scale 1, as a fraction of the frame's width.
const double kStoryStickerBase = 0.14;

/// The font size of a text story's card for a text of [length] characters
/// (short text big, long text small), as a fraction of the frame's width.
double storyTextFactor(int length) {
  if (length <= 30) return 0.105;
  if (length <= 80) return 0.082;
  if (length <= 160) return 0.064;
  return 0.052;
}

/// Fits a 9:16 box into [available].
Size storyFrameSize(Size available) {
  final byHeight = available.height * kStoryAspect;
  return byHeight <= available.width
      ? Size(byHeight, available.height)
      : Size(available.width, available.width / kStoryAspect);
}

/// One sticker, drawn at [frame] size (centre at x, y; scale; rotation).
class StoryStickerView extends StatelessWidget {
  const StoryStickerView({required this.overlay, required this.frameWidth, super.key});

  final StoryOverlay overlay;
  final double frameWidth;

  @override
  Widget build(BuildContext context) => Transform.rotate(
        angle: overlay.rotation,
        child: Text(
          overlay.emoji,
          textScaler: TextScaler.noScaling,
          textDirection: TextDirection.ltr,
          style: TextStyle(
            fontSize: frameWidth * kStoryStickerBase * overlay.scale,
            height: 1,
          ),
        ),
      );
}

/// Places [child] with its centre at the fractions ([x], [y]) of the frame.
class StoryAnchored extends StatelessWidget {
  const StoryAnchored({
    required this.frame,
    required this.x,
    required this.y,
    required this.child,
    super.key,
  });

  final Size frame;
  final double x;
  final double y;
  final Widget child;

  @override
  Widget build(BuildContext context) => Positioned(
        left: x * frame.width,
        top: y * frame.height,
        child: FractionalTranslation(
          translation: const Offset(-0.5, -0.5),
          child: child,
        ),
      );
}

/// A photo in the 9:16 frame: whole (never cropped), on a blurred, darkened
/// copy of itself.
class StoryPhotoLayer extends StatelessWidget {
  const StoryPhotoLayer({required this.image, super.key});

  final ImageProvider image;

  @override
  Widget build(BuildContext context) => Stack(
        fit: StackFit.expand,
        children: [
          ColoredBox(color: Colors.black.withValues(alpha: 0.35)),
          ImageFiltered(
            imageFilter: ui.ImageFilter.blur(sigmaX: 28, sigmaY: 28),
            child: Image(image: image, fit: BoxFit.cover),
          ),
          ColoredBox(color: Colors.black.withValues(alpha: 0.35)),
          Image(
            image: image,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ],
      );
}

/// The text card: centred, auto-sized, white on the chosen gradient.
class StoryTextCard extends StatelessWidget {
  const StoryTextCard({
    required this.text,
    required this.background,
    required this.frameWidth,
    super.key,
  });

  final String text;
  final String? background;
  final double frameWidth;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(gradient: storyBackgroundGradient(background)),
      child: Center(
        child: Padding(
          padding: EdgeInsets.all(frameWidth * 0.09),
          child: Text(
            text,
            textAlign: TextAlign.center,
            textScaler: TextScaler.noScaling,
            style: storyTextStyle(type, frameWidth, text.characters.length),
          ),
        ),
      ),
    );
  }
}

TextStyle storyTextStyle(AppTypographyTokens type, double frameWidth, int len) =>
    type.titleLarge.copyWith(
      color: Colors.white,
      fontSize: frameWidth * storyTextFactor(len),
      height: 1.25,
    );

/// The caption of a photo / video story, over a soft dark band.
class StoryCaption extends StatelessWidget {
  const StoryCaption({required this.text, required this.frameWidth, super.key});

  final String text;
  final double frameWidth;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Align(
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
          padding: EdgeInsets.fromLTRB(
            frameWidth * 0.06,
            frameWidth * 0.12,
            frameWidth * 0.06,
            frameWidth * 0.06,
          ),
          child: SizedBox(
            width: double.infinity,
            child: Text(
              text,
              textAlign: TextAlign.center,
              textScaler: TextScaler.noScaling,
              style: type.body.copyWith(
                color: Colors.white,
                fontSize: frameWidth * 0.048,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// A story as the viewer sees it: the content, the caption, the stickers.
/// [video] is the live player of a video story (null: its cover).
class StoryFrame extends StatelessWidget {
  const StoryFrame({required this.story, this.video, super.key});

  final Story story;
  final Widget? video;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, c) {
        final size = c.biggest;
        final caption = story.kind == StoryKind.text ? null : story.text;
        return ClipRect(
          child: ColoredBox(
            color: Colors.black,
            child: Stack(
              fit: StackFit.expand,
              children: [
                _content(size),
                if (caption != null && caption.trim().isNotEmpty)
                  StoryCaption(text: caption, frameWidth: size.width),
                for (final o in story.overlays)
                  StoryAnchored(
                    frame: size,
                    x: o.x,
                    y: o.y,
                    child: StoryStickerView(
                      overlay: o,
                      frameWidth: size.width,
                    ),
                  ),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget _content(Size size) {
    switch (story.kind) {
      case StoryKind.text:
        return StoryTextCard(
          text: story.text ?? '',
          background: story.background,
          frameWidth: size.width,
        );
      case StoryKind.video:
        final cover = story.video?.thumbnailUrl;
        return Stack(
          fit: StackFit.expand,
          children: [
            if (cover != null)
              Image(
                image: appNetworkImage(cover, 720),
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ?video,
          ],
        );
      case StoryKind.photo:
        final url = story.mediaUrl;
        return url == null
            ? const SizedBox.shrink()
            : StoryPhotoLayer(image: appNetworkImage(url, 1080));
    }
  }
}
