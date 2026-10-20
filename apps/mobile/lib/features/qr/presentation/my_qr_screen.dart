import 'dart:io';
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gal/gal.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/platform/web_download.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';
import 'package:lawbid/shared/presentation/qr_code_view.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// The address inside a profile QR code: opens the web profile in any
/// camera app and the profile (or its chat) in LawBid.
String profileQrLink(String host, String username) =>
    'https://$host/u/${Uri.encodeComponent(username)}';

/// `/qr/my` (owner 2026-10-20, WeChat "My QR code"): a card with the photo,
/// the name, the @username and a QR code with the scales in the middle, to
/// share as a picture or save to the gallery, and a button to scan someone
/// else's code.
class MyQrScreen extends ConsumerStatefulWidget {
  const MyQrScreen({super.key});

  @override
  ConsumerState<MyQrScreen> createState() => _MyQrScreenState();
}

class _MyQrScreenState extends ConsumerState<MyQrScreen> {
  final _cardKey = GlobalKey();
  bool _busy = false;

  Future<Uint8List?> _capture() async {
    // One frame so a photo that just loaded is in the picture.
    await WidgetsBinding.instance.endOfFrame;
    final boundary =
        _cardKey.currentContext?.findRenderObject() as RenderRepaintBoundary?;
    if (boundary == null) return null;
    final image = await boundary.toImage(pixelRatio: 3);
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    return data?.buffer.asUint8List();
  }

  Future<void> _run(Future<void> Function() job) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await job();
    } on Object {
      if (mounted) {
        showAppSnackBar(
          context,
          ref.read(translatorProvider).t('qr.save.fail'),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _share(String username, String link) => _run(() async {
        // The share sheet of an iPad points at this screen.
        final box = context.findRenderObject() as RenderBox?;
        final origin = box == null || !box.hasSize
            ? null
            : box.localToGlobal(Offset.zero) & box.size;
        final bytes = await _capture();
        if (bytes == null) throw StateError('no picture');
        final name = 'lawbid-$username.png';
        final XFile file;
        if (kIsWeb) {
          file = XFile.fromData(bytes, mimeType: 'image/png', name: name);
        } else {
          final dir = await getTemporaryDirectory();
          final path = '${dir.path}/$name';
          await File(path).writeAsBytes(bytes, flush: true);
          file = XFile(path, mimeType: 'image/png');
        }
        await SharePlus.instance.share(
          ShareParams(
            files: [file],
            text: link,
            sharePositionOrigin: origin,
          ),
        );
      });

  Future<void> _save(String username) => _run(() async {
        final t = ref.read(translatorProvider);
        final bytes = await _capture();
        if (bytes == null) throw StateError('no picture');
        if (kIsWeb) {
          saveBytesInBrowser(bytes, 'lawbid-$username.png', 'image/png');
        } else {
          await Gal.putImageBytes(bytes, name: 'lawbid-$username');
        }
        if (mounted) showAppSnackBar(context, t.t('qr.save.done'));
      });

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final user = ref.watch(currentUserControllerProvider).user;
    final username =
        user?.attorneyProfile?.username ?? user?.clientProfile?.username;
    final host = ref.watch(appEnvironmentProvider).deepLinkHost;
    final name = [user?.firstName, user?.lastName]
        .whereType<String>()
        .where((s) => s.trim().isNotEmpty)
        .join(' ');

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('qr.my.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.profile),
        ),
      ),
      body: SafeArea(
        top: false,
        child: username == null || user == null
            ? Center(
                child: AppEmptyState(
                  icon: AppIcons.qrCode,
                  message: t.t('empty.default.message'),
                ),
              )
            : Center(
                child: SingleChildScrollView(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.screenSide,
                    vertical: AppSpacing.md,
                  ),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 380),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        RepaintBoundary(
                          key: _cardKey,
                          child: ColoredBox(
                            color: colors.bg,
                            child: Padding(
                              padding: const EdgeInsets.all(AppSpacing.md),
                              child: _QrCard(
                                name: name,
                                username: username,
                                avatarUrl: user.avatarUrl,
                                initials: initialsOf(
                                  user.firstName,
                                  user.lastName,
                                  fallback: username,
                                ),
                                link: profileQrLink(host, username),
                                hint: t.t('qr.my.hint'),
                                label: t.t('qr.my.title'),
                              ),
                            ),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Row(
                          children: [
                            Expanded(
                              child: AppButton(
                                key: const ValueKey('my-qr-share'),
                                label: t.t('profile.action.share'),
                                icon: AppIcons.shareNetworkOutlined,
                                isLoading: _busy,
                                onPressed: () => _share(
                                  username,
                                  profileQrLink(host, username),
                                ),
                              ),
                            ),
                            const SizedBox(width: AppSpacing.sm),
                            Expanded(
                              child: AppButton(
                                key: const ValueKey('my-qr-save'),
                                label: t.t('common.save'),
                                icon: AppIcons.downloadRounded,
                                variant: AppButtonVariant.secondary,
                                isEnabled: !_busy,
                                onPressed: () => _save(username),
                              ),
                            ),
                          ],
                        ),
                        if (!kIsWeb) ...[
                          const SizedBox(height: AppSpacing.sm),
                          AppButton(
                            key: const ValueKey('my-qr-scan'),
                            label: t.t('qr.scan.title'),
                            icon: AppIcons.scan,
                            variant: AppButtonVariant.secondary,
                            onPressed: () => context.push(AppRoutes.qrScan),
                          ),
                        ],
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          profileQrLink(host, username),
                          textAlign: TextAlign.center,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
      ),
    );
  }
}

/// The picture that is shared and saved.
class _QrCard extends StatelessWidget {
  const _QrCard({
    required this.name,
    required this.username,
    required this.avatarUrl,
    required this.initials,
    required this.link,
    required this.hint,
    required this.label,
  });

  final String name;
  final String username;
  final String? avatarUrl;
  final String initials;
  final String link;
  final String hint;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.xl,
        AppSpacing.xl,
        AppSpacing.xl,
        AppSpacing.lg,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.sheet),
        border: Border.all(color: colors.gold.withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: colors.shadow.withValues(alpha: 0.12),
            blurRadius: AppSizes.cardShadowBlur,
            offset: const Offset(0, AppSizes.cardShadowOffsetY),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ProfileAvatar(size: 64, url: avatarUrl, initials: initials),
          const SizedBox(height: AppSpacing.md),
          if (name.isNotEmpty)
            Text(
              name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: typography.titleMedium.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
          Text(
            atHandle(username),
            textAlign: TextAlign.center,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.lg),
          LayoutBuilder(
            builder: (context, box) {
              final side = box.maxWidth.clamp(0.0, 260.0);
              return DecoratedBox(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(AppRadii.roleCard),
                  border: Border.all(color: colors.border),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: QrCodeView(
                    data: link,
                    size: side - AppSpacing.sm * 2 - 2,
                    dotColor: AppColorsLight.accent,
                    plateColor: Colors.white,
                    semanticLabel: label,
                    logo: DecoratedBox(
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        shape: BoxShape.circle,
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(3),
                        child: FittedBox(
                          child: ScalesLogo(
                            size: 60,
                            strokeColor: colors.goldDark,
                          ),
                        ),
                      ),
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            hint,
            textAlign: TextAlign.center,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}
