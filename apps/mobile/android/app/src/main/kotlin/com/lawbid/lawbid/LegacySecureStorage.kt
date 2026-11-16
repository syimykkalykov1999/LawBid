package com.lawbid.lawbid

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Row 149 (14.11): flutter_secure_storage 9 kept the app's secrets in
 * Jetpack Security's EncryptedSharedPreferences (file "FlutterSecureStorage",
 * option `encryptedSharedPreferences: true`); version 11 removed that backend
 * and cannot read them, so the update would sign every Android user out.
 *
 * This reads the old values with the same library and settings version 9
 * used (androidx.security:security-crypto, Apache-2.0; the MasterKey spec and
 * key prefix are copied from flutter_secure_storage 9.2.4
 * FlutterSecureStorage.java, BSD-3) and hands them to Dart, which writes them
 * through version 11 (core/session/legacy_secure_storage.dart). Only after
 * Dart has read them back are the old entries removed ([forget]). Version 11
 * never touches these entries: their names are encrypted, so they never
 * carry its key prefix, and its wrapped keys live in another file.
 */
object LegacySecureStorage {
    private const val TAG = "LegacySecureStorage"
    private const val FILE = "FlutterSecureStorage"

    /** flutter_secure_storage 9's default key prefix (`ELEMENT_PREFERENCES_KEY_PREFIX`). */
    private const val PREFIX = "VGhpcyBpcyB0aGUgcHJlZml4IGZvciBhIHNlY3VyZSBzdG9yYWdlCg_"
    private const val KEY_KEYSET = "__androidx_security_crypto_encrypted_prefs_key_keyset__"
    private const val VALUE_KEYSET = "__androidx_security_crypto_encrypted_prefs_value_keyset__"

    private fun hasLegacy(context: Context): Boolean {
        val raw = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
        return raw.contains(KEY_KEYSET) || raw.contains(VALUE_KEYSET)
    }

    private fun open(context: Context) = EncryptedSharedPreferences.create(
        context,
        FILE,
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    /** The old values of [keys] that still exist; empty when there is nothing old or it cannot be read. */
    fun read(context: Context, keys: List<String>): Map<String, String> {
        if (!hasLegacy(context)) return emptyMap()
        return try {
            val prefs = open(context)
            buildMap {
                for (key in keys) {
                    prefs.getString(PREFIX + key, null)?.let { put(key, it) }
                }
            }
        } catch (e: Throwable) {
            Log.w(TAG, "old secure storage unreadable", e)
            emptyMap()
        }
    }

    /**
     * Removes the old entries of [keys], then the old key sets. The app's own
     * keys are the only ones version 9 ever held. (No `getAll()`: it would try
     * to decrypt version 11's plain entry names in the same file and throw.)
     */
    fun forget(context: Context, keys: List<String>): Boolean {
        if (!hasLegacy(context)) return true
        return try {
            val prefs = open(context)
            val editor = prefs.edit()
            for (key in keys) editor.remove(PREFIX + key)
            if (!editor.commit()) return false
            context.getSharedPreferences(FILE, Context.MODE_PRIVATE).edit()
                .remove(KEY_KEYSET).remove(VALUE_KEYSET).commit()
        } catch (e: Throwable) {
            Log.w(TAG, "old secure storage not removed", e)
            false
        }
    }
}
