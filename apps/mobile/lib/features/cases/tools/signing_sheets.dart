import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/cases/tools/signature_pad.dart';
import 'package:lawbid/features/cases/tools/signing_data.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: the sheets of the Docs tab — ask for signatures, sign,
/// decline and verify. A sheet that sends something shows the server's answer
/// inside itself and closes with `true` only when it went through.

String roleName(Translator t, String role) =>
    t.t(role == 'attorney' ? 'sign.role.attorney' : 'sign.role.client');

/// Handle, title, and a body that scrolls above the keyboard.
class SigningSheetFrame extends StatelessWidget {
  const SigningSheetFrame({
    required this.title,
    required this.child,
    super.key,
  });

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return SafeArea(
      child: Padding(
        padding: EdgeInsetsDirectional.only(
          start: AppSpacing.screenSide,
          end: AppSpacing.screenSide,
          top: AppSpacing.md,
          bottom: inset + AppSpacing.lg,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Semantics(
                header: true,
                child: Text(title, style: type.titleMedium),
              ),
              const SizedBox(height: AppSpacing.lg),
              child,
            ],
          ),
        ),
      ),
    );
  }
}

class _ErrorLine extends StatelessWidget {
  const _ErrorLine(this.message);

  final String? message;

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m == null) return const SizedBox.shrink();
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Semantics(
        liveRegion: true,
        child:
            Text(m, style: type.bodySmall.copyWith(color: colors.dangerText)),
      ),
    );
  }
}

// ------------------------------------------------------------- request

Future<bool?> showRequestSheet(BuildContext context, String caseId) =>
    showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _RequestSheet(caseId: caseId),
    );

class _RequestSheet extends ConsumerStatefulWidget {
  const _RequestSheet({required this.caseId});

  final String caseId;

  @override
  ConsumerState<_RequestSheet> createState() => _RequestSheetState();
}

class _RequestSheetState extends ConsumerState<_RequestSheet> {
  final _title = TextEditingController();
  PlatformFile? _file;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _title.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final t = ref.read(translatorProvider);
    final result = await FilePicker.pickFiles(
      cancelUploadOnWindowBlur: false,
      type: FileType.custom,
      allowedExtensions: const ['pdf'],
      withData: true,
    );
    if (!mounted) return;
    final f = result?.files.firstOrNull;
    if (f == null) return;
    if (f.bytes == null || !isPdfName(f.name)) {
      setState(() => _error = t.t('sign.pdfOnly'));
      return;
    }
    setState(() {
      _file = f;
      _error = null;
      if (_title.text.trim().isEmpty) _title.text = titleFromFileName(f.name);
    });
  }

  Future<void> _send() async {
    final f = _file;
    if (f == null || f.bytes == null || _busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(caseSigningActionsProvider).requestFromBytes(
            widget.caseId,
            bytes: f.bytes!,
            fileName: f.name,
            title: _title.text.trim(),
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = signingErrorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return SigningSheetFrame(
      title: t.t('sign.request'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppCard(
            onTap: _busy ? null : _pick,
            child: Row(
              children: [
                AppIcon(
                  _file == null
                      ? AppIcons.uploadFileOutlined
                      : AppIcons.pictureAsPdfOutlined,
                  color: colors.iconTint,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Text(
                    _file?.name ?? t.t('sign.pdfOnly'),
                    style: type.body,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          AppTextField(
            controller: _title,
            label: t.t('sign.docTitle'),
            hintText: t.t('sign.docTitleHint'),
            maxLength: 160,
            enabled: !_busy,
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.md),
          _ErrorLine(_error),
          AppButton(
            label: t.t('sign.request'),
            icon: AppIcons.editNoteRounded,
            isLoading: _busy,
            isEnabled: _file != null && _title.text.trim().isNotEmpty,
            disabledHint: t.t('sign.pdfOnly'),
            onPressed: _send,
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------- sign

Future<bool?> showSignSheet(
  BuildContext context, {
  required String caseId,
  required api.SignRequestDto request,
}) =>
    showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _SignSheet(caseId: caseId, request: request),
    );

class _SignSheet extends ConsumerStatefulWidget {
  const _SignSheet({required this.caseId, required this.request});

  final String caseId;
  final api.SignRequestDto request;

  @override
  ConsumerState<_SignSheet> createState() => _SignSheetState();
}

class _SignSheetState extends ConsumerState<_SignSheet> {
  final _name = TextEditingController();
  final _pad = SignatureController();
  int _tab = 0;
  bool _consent = false;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _pad.dispose();
    super.dispose();
  }

  bool get _nameOk => _name.text.trim().length >= 2;

  Future<void> _submit() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final drawn = _tab == 0;
      final png = drawn ? await _pad.toBase64() : null;
      if (!mounted) return;
      if (drawn && png == null) {
        setState(() {
          _busy = false;
          _error = t.t('sign.drawFirst');
        });
        return;
      }
      await ref.read(caseSigningActionsProvider).sign(
            widget.caseId,
            widget.request.id,
            method: drawn ? api.SignDtoMethod.drawn : api.SignDtoMethod.typed,
            name: _name.text,
            imagePngBase64: png,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = signingErrorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SigningSheetFrame(
      title: widget.request.title,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            controller: _name,
            label: t.t('sign.name'),
            maxLength: 120,
            enabled: !_busy,
            textCapitalization: TextCapitalization.words,
            autofillHints: const [AutofillHints.name],
            onChanged: (_) => setState(() {}),
          ),
          const SizedBox(height: AppSpacing.sm),
          FilterChips<int>(
            value: _tab,
            padding: EdgeInsets.zero,
            options: [(0, t.t('sign.draw')), (1, t.t('sign.type'))],
            onChanged: (v) => setState(() => _tab = v),
          ),
          const SizedBox(height: AppSpacing.md),
          if (_tab == 0)
            ListenableBuilder(
              listenable: _pad,
              builder: (context, _) => SignaturePad(
                controller: _pad,
                hint: t.t('sign.padHint'),
                clearLabel: t.t('sign.clear'),
                semanticLabel: t.t('sign.padLabel'),
              ),
            )
          else
            Container(
              constraints: const BoxConstraints(minHeight: 120),
              alignment: AlignmentDirectional.center,
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border.all(color: colors.border),
                borderRadius: BorderRadius.circular(AppRadii.card),
              ),
              child: Text(
                _name.text.trim().isEmpty
                    ? t.t('sign.nameShort')
                    : _name.text.trim(),
                textAlign: TextAlign.center,
                style: type.titleLarge.copyWith(
                  fontStyle: FontStyle.italic,
                  color: _name.text.trim().isEmpty
                      ? colors.textSecondary
                      : colors.text,
                ),
              ),
            ),
          const SizedBox(height: AppSpacing.sm),
          CheckboxListTile(
            value: _consent,
            onChanged:
                _busy ? null : (v) => setState(() => _consent = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            title: Text(t.t('sign.consent'), style: type.bodySmall),
          ),
          Text(
            t.t('sign.note'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          _ErrorLine(_error),
          ListenableBuilder(
            listenable: _pad,
            builder: (context, _) {
              final ready = _nameOk && _consent && (_tab == 1 || !_pad.isEmpty);
              return AppButton(
                label: t.t('sign.submit'),
                icon: AppIcons.editNoteRounded,
                isLoading: _busy,
                isEnabled: ready,
                disabledHint: !_nameOk
                    ? t.t('sign.nameShort')
                    : (_tab == 0 && _pad.isEmpty)
                        ? t.t('sign.drawFirst')
                        : t.t('sign.consentFirst'),
                onPressed: _submit,
              );
            },
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- decline

Future<bool?> showDeclineSheet(
  BuildContext context, {
  required String caseId,
  required api.SignRequestDto request,
}) =>
    showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _DeclineSheet(caseId: caseId, request: request),
    );

class _DeclineSheet extends ConsumerStatefulWidget {
  const _DeclineSheet({required this.caseId, required this.request});

  final String caseId;
  final api.SignRequestDto request;

  @override
  ConsumerState<_DeclineSheet> createState() => _DeclineSheetState();
}

class _DeclineSheetState extends ConsumerState<_DeclineSheet> {
  final _reason = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(caseSigningActionsProvider).decline(
            widget.caseId,
            widget.request.id,
            reason: _reason.text,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = signingErrorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    return SigningSheetFrame(
      title: t.t('sign.declineTitle'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          AppTextField(
            controller: _reason,
            label: t.t('sign.reason'),
            maxLines: 4,
            maxLength: 300,
            enabled: !_busy,
            textCapitalization: TextCapitalization.sentences,
          ),
          const SizedBox(height: AppSpacing.md),
          _ErrorLine(_error),
          AppButton(
            label: t.t('sign.decline'),
            variant: AppButtonVariant.danger,
            isLoading: _busy,
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}

// -------------------------------------------------------------- verify

Future<void> showVerifySheet(
  BuildContext context, {
  required String caseId,
  required api.SignRequestDto request,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _VerifySheet(caseId: caseId, request: request),
    );

class _VerifySheet extends ConsumerWidget {
  const _VerifySheet({required this.caseId, required this.request});

  final String caseId;
  final api.SignRequestDto request;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(
      signVerifyProvider((caseId: caseId, requestId: request.id)),
    );
    return SigningSheetFrame(
      title: t.t('sign.v.title'),
      child: value.when(
        loading: () => const AppSkeleton(height: 120),
        error: (e, _) => Text(signingErrorText(t, e)),
        data: (v) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            VerifyRow(label: t.t('sign.v.source'), ok: v.sourceOk, t: t),
            VerifyRow(
              label: t.t('sign.v.final'),
              ok: v.finalOk,
              t: t,
            ),
            VerifyRow(label: t.t('sign.v.journal'), ok: v.journalOk, t: t),
            Padding(
              padding: const EdgeInsets.only(bottom: AppSpacing.md),
              child: Text(
                t.t('sign.v.sigs', {'n': formats.digits(v.journalSignatures)}),
                style: type.bodySmall,
              ),
            ),
            if (request.signatures.isNotEmpty) ...[
              Text(
                t.t('sign.v.signers'),
                style: type.bodySmall.copyWith(fontWeight: FontWeight.w700),
              ),
              for (final s in request.signatures)
                Text(
                  t.t('sign.signedBy', {
                    'name': s.name,
                    'role': roleName(t, s.role.json ?? ''),
                    'date': formats.dateTime(s.signedAt.toLocal()),
                  }),
                  style: type.bodySmall,
                ),
              const SizedBox(height: AppSpacing.md),
            ],
            HashRow(label: t.t('sign.original'), hash: v.sourceSha256, t: t),
            if (v.finalSha256 != null)
              HashRow(
                label: t.t('sign.signedPdf'),
                hash: v.finalSha256!,
                t: t,
              ),
          ],
        ),
      ),
    );
  }
}

/// One check of a verification: an icon and a word, never colour alone.
class VerifyRow extends StatelessWidget {
  const VerifyRow({
    required this.label,
    required this.ok,
    required this.t,
    super.key,
  });

  final String label;

  /// Null: not applicable (the document is not finished).
  final bool? ok;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final (icon, color, word) = switch (ok) {
      true => (AppIcons.checkCircleRounded, colors.successText, 'sign.v.ok'),
      false => (AppIcons.cancelRounded, colors.dangerText, 'sign.v.bad'),
      null => (
          AppIcons.hourglassEmptyRounded,
          colors.textSecondary,
          'sign.v.na'
        ),
    };
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Semantics(
        container: true,
        label: '$label: ${t.t(word)}',
        excludeSemantics: true,
        child: Row(
          children: [
            AppIcon(icon, size: 20, color: color),
            const SizedBox(width: AppSpacing.sm),
            Expanded(child: Text(label, style: type.body)),
            const SizedBox(width: AppSpacing.sm),
            Text(
              t.t(word),
              style: type.bodySmall.copyWith(
                color: color,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A SHA-256 with a "Copy hash" button.
class HashRow extends StatelessWidget {
  const HashRow({
    required this.label,
    required this.hash,
    required this.t,
    super.key,
  });

  final String label;
  final String hash;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label · ${t.t('sign.v.hash')}',
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          SelectableText(hash, style: type.bodySmall),
          const SizedBox(height: AppSpacing.xs),
          AppChip(
            label: t.t('sign.v.copy'),
            onTap: () async {
              await Clipboard.setData(ClipboardData(text: hash));
              if (context.mounted) {
                showAppSnackBar(context, t.t('sign.v.copied'));
              }
            },
          ),
        ],
      ),
    );
  }
}
