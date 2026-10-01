import 'package:flutter/material.dart';

/// App-wide messenger: messages that must show whatever screen is open
/// (e.g. "signed in on another phone" right before the sign-out).
final rootMessengerKey = GlobalKey<ScaffoldMessengerState>();
