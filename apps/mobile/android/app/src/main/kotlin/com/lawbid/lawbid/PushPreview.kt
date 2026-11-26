package com.lawbid.lawbid

import android.content.Context
import android.util.Base64
import com.google.crypto.tink.HybridDecrypt
import com.google.crypto.tink.KeyTemplates
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.hybrid.HpkePublicKey
import com.google.crypto.tink.hybrid.HybridConfig
import com.google.crypto.tink.integration.android.AndroidKeysetManager

/**
 * Third pass M12 (owner 26.11: the text of an end-to-end encrypted message
 * in its push, like WhatsApp / Signal).
 *
 * The phone's push-preview key pair lives in a Tink keyset (Google Tink,
 * Apache-2.0) kept in the app's SharedPreferences and wrapped by an Android
 * Keystore master key, as Tink's own "AndroidKeysetManager" guide shows.
 * Only the public half goes to the server. A sender seals a short preview
 * to it with HPKE (RFC 9180, DHKEM(X25519, HKDF-SHA256) / HKDF-SHA256 /
 * ChaCha20-Poly1305, Tink's RAW layout `enc || ciphertext`, context info
 * "lawbid push preview v1"; lib/features/chat/e2ee/push_preview_hpke.dart);
 * ChatNotifications opens it here. Anything that fails — a phone not
 * unlocked since it started, a changed blob — keeps the server's text
 * («Новое сообщение»).
 */
object PushPreview {
    private const val KEYSET = "lawbid_push_preview_keyset"
    private const val PREFS = "lawbid_push_preview"
    private const val MASTER_KEY = "android-keystore://lawbid_push_preview_master"
    private const val TEMPLATE = "DHKEM_X25519_HKDF_SHA256_HKDF_SHA256_CHACHA20_POLY1305_RAW"
    private val INFO = "lawbid push preview v1".toByteArray(Charsets.UTF_8)

    /** The longest preview shown (the sender cuts at 120 characters). */
    private const val MAX_CHARS = 200

    @Volatile private var cached: KeysetHandle? = null

    @Synchronized
    private fun keyset(context: Context): KeysetHandle {
        cached?.let { return it }
        HybridConfig.register()
        val handle = AndroidKeysetManager.Builder()
            .withSharedPref(context.applicationContext, KEYSET, PREFS)
            .withKeyTemplate(KeyTemplates.get(TEMPLATE))
            .withMasterKeyUri(MASTER_KEY)
            .build()
            .keysetHandle
        cached = handle
        return handle
    }

    /** The raw X25519 public key, base64; made on the first call. */
    fun publicKeyBase64(context: Context): String? = try {
        val key = keyset(context).publicKeysetHandle.primary.key as HpkePublicKey
        Base64.encodeToString(key.publicKeyBytes.toByteArray(), Base64.NO_WRAP)
    } catch (e: Exception) {
        null
    }

    /** The preview text inside [sealedBase64], or null. */
    fun open(context: Context, sealedBase64: String): String? = try {
        val sealed = Base64.decode(sealedBase64, Base64.NO_WRAP)
        if (sealed.size <= 48) {
            null
        } else {
            val decrypt = keyset(context)
                .getPrimitive(RegistryConfiguration.get(), HybridDecrypt::class.java)
            String(decrypt.decrypt(sealed, INFO), Charsets.UTF_8)
                .trim()
                .take(MAX_CHARS)
                .ifEmpty { null }
        }
    } catch (e: Exception) {
        null
    }
}
