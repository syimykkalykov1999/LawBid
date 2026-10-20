import 'package:flutter/material.dart';

/// Case tab "Documents": e-signature requests and documents from templates.
class SigningTab extends StatelessWidget {
  const SigningTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
