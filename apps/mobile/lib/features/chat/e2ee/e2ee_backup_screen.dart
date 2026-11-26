import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_providers.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

/// Settings shows the backup row unless the admin's chat.e2ee_mode is Выкл
/// (owner switch rule: what a switched-off feature needs is not shown).
bool e2eeBackupVisible(FeatureFlagsState flags) =>
    flags.appConfig['chat.e2ee_mode'] != 'off';

/// Opens the encrypted backup (Settings → «Зашифрованная резервная копия»).
void openE2eeBackup(BuildContext context) {
  Navigator.of(context).push(
    MaterialPageRoute<void>(builder: (_) => const E2eeBackupScreen()),
  );
}

/// Item 25, PR 4 (copy of WhatsApp's «End-to-end encrypted backup» with
/// its «Use 64-digit encryption key»): the messages this device decrypted
/// go up locked with a 64-digit key that only the person keeps; the server
/// holds one ciphertext file per person and cannot open it. Restore asks
/// for the key on the new phone.
class E2eeBackupScreen extends ConsumerStatefulWidget {
  const E2eeBackupScreen({super.key});

  @override
  ConsumerState<E2eeBackupScreen> createState() => _E2eeBackupScreenState();
}

class _E2eeBackupScreenState extends ConsumerState<E2eeBackupScreen> {
  api.E2eeBackupDto? _last;
  bool _loading = true;

  /// This device holds the key (WhatsApp: the next backup needs no code).
  bool _hasKey = false;
  bool _busy = false;

  /// The new key while it is shown (before «I saved the key»).
  String? _newCode;
  final _input = TextEditingController();

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  @override
  void dispose() {
    _input.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final e2ee = ref.read(e2eeServiceProvider);
    api.E2eeBackupDto? last;
    try {
      last = (await e2ee?.client.getE2eeBackup())?.data;
    } on Object {
      last = null; // 404 = none yet
    }
    final hasKey = await e2ee?.hasBackupKey() ?? false;
    if (!mounted) return;
    setState(() {
      _last = last;
      _hasKey = hasKey;
      _loading = false;
    });
  }

  Future<void> _run(Future<String> Function(E2eeService e2ee) job) async {
    final e2ee = ref.read(e2eeServiceProvider);
    final t = ref.read(translatorProvider);
    if (e2ee == null || _busy) return;
    setState(() => _busy = true);
    String text;
    try {
      text = await job(e2ee);
    } on DioException catch (e) {
      text = errorText(t, ApiException.fromDioException(e));
    } on Object catch (e) {
      text = errorText(t, e);
    }
    if (!mounted) return;
    setState(() => _busy = false);
    showAppSnackBar(context, text);
  }

  /// With a new key just shown ([_newCode]) or, when this device already
  /// holds one, again with the same key (WhatsApp).
  Future<void> _create() => _run((e2ee) async {
        final t = ref.read(translatorProvider);
        final n = await e2ee.createBackup(newCode: _newCode);
        _newCode = null;
        await _load();
        return t.t('chat.e2ee.backupDone', {'count': '$n'});
      });

  void _showNewKey() => setState(() => _newCode = E2eeService.newBackupCode());

  Future<void> _restore() => _run((e2ee) async {
        final t = ref.read(translatorProvider);
        final code = _input.text.replaceAll(RegExp(r'\D'), '');
        if (code.length != 64) return t.t('chat.e2ee.backupWrongKey');
        try {
          final n = await e2ee.restoreBackup(code);
          _input.clear();
          await _load();
          return t.t('chat.e2ee.backupRestored', {'count': '$n'});
        } on E2eeNotReady {
          return t.t('chat.e2ee.backupNone');
        } on Exception catch (e) {
          // AES-GCM refused the tag: not this backup's key.
          if (e is DioException) rethrow;
          return t.t('chat.e2ee.backupWrongKey');
        }
      });

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final formats = ref.watch(l10nFormatsProvider);
    final last = _last;
    final code = _newCode;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => context.safeBack(),
        ),
        title: Text(t.t('chat.e2ee.backupTitle')),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
          : ListView(
              key: const ValueKey('e2ee-backup'),
              padding: const EdgeInsets.all(AppSpacing.xl),
              children: [
                Center(
                  child: Icon(
                    AppIcons.lockOutlineRounded,
                    size: 56,
                    color: colors.textSecondary,
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  t.t('chat.e2ee.backupHint'),
                  style: type.body.copyWith(color: colors.textSecondary),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  last == null
                      ? t.t('chat.e2ee.backupNone')
                      : t.t('chat.e2ee.backupLast', {
                          'date': '${formats.date(last.updatedAt.toLocal())} '
                              '${formats.time(last.updatedAt.toLocal())}',
                        }),
                  style: type.body,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: AppSpacing.xl),
                if (code != null) ...[
                  _KeyDigits(code: code),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    t.t('chat.e2ee.backupKeyHint'),
                    style: type.body.copyWith(color: colors.textSecondary),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Center(
                    child: AppButton(
                      label: t.t('chat.act.copy'),
                      variant: AppButtonVariant.secondary,
                      onPressed: () async {
                        await Clipboard.setData(ClipboardData(text: code));
                        if (context.mounted) {
                          showAppSnackBar(context, t.t('chat.copied'));
                        }
                      },
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Center(
                    child: AppButton(
                      key: const ValueKey('e2ee-backup-saved'),
                      label: t.t('chat.e2ee.backupSaved'),
                      isLoading: _busy,
                      onPressed: _create,
                    ),
                  ),
                ] else ...[
                  Center(
                    child: AppButton(
                      key: const ValueKey('e2ee-backup-create'),
                      label: t.t('chat.e2ee.backupCreate'),
                      isLoading: _busy && _hasKey,
                      onPressed:
                          _busy ? null : (_hasKey ? _create : _showNewKey),
                    ),
                  ),
                  if (_hasKey) ...[
                    const SizedBox(height: AppSpacing.md),
                    Center(
                      child: AppButton(
                        key: const ValueKey('e2ee-backup-new-key'),
                        label: t.t('chat.e2ee.backupNewKey'),
                        variant: AppButtonVariant.secondary,
                        onPressed: _busy ? null : _showNewKey,
                      ),
                    ),
                  ],
                ],
                if (last != null && code == null) ...[
                  const SizedBox(height: AppSpacing.xl * 2),
                  AppTextField(
                    key: const ValueKey('e2ee-backup-key'),
                    controller: _input,
                    label: t.t('chat.e2ee.backupEnterKey'),
                    keyboardType: TextInputType.number,
                    maxLength: 80,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Center(
                    child: AppButton(
                      key: const ValueKey('e2ee-backup-restore'),
                      label: t.t('chat.e2ee.backupRestore'),
                      variant: AppButtonVariant.secondary,
                      isLoading: _busy,
                      onPressed: _restore,
                    ),
                  ),
                ],
              ],
            ),
    );
  }
}

/// The 64 digits as WhatsApp shows the key: 16 groups of 4.
class _KeyDigits extends StatelessWidget {
  const _KeyDigits({required this.code});

  final String code;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.titleMedium.copyWith(
      fontFeatures: const [FontFeature.tabularFigures()],
      letterSpacing: 1.5,
    );
    final groups = [
      for (var i = 0; i < code.length; i += 4) code.substring(i, i + 4),
    ];
    return Column(
      children: [
        for (var row = 0; row < groups.length; row += 4)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                for (final g in groups.skip(row).take(4))
                  SelectableText(g, style: style),
              ],
            ),
          ),
      ],
    );
  }
}
