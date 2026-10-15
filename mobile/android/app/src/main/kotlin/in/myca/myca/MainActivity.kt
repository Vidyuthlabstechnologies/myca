package `in`.myca.myca

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private var pending: Map<String, Any>? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        remember(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        remember(intent)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            if (call.method == "take") {
                val taken = pending
                pending = null
                result.success(taken)
            } else {
                result.notImplemented()
            }
        }
    }

    private fun remember(intent: Intent?) {
        if (intent == null || intent.action != Intent.ACTION_SEND) return
        val uri: Uri = intent.getParcelableExtra(Intent.EXTRA_STREAM) ?: return
        if (uri.scheme != ContentResolver.SCHEME_CONTENT) return
        val authority = uri.authority ?: return
        val owner = packageManager.resolveContentProvider(authority, 0)?.packageName
        if (owner == null || owner == packageName) return
        val mime = contentResolver.getType(uri) ?: return
        if (!ACCEPTED.any { mime.startsWith(it) }) return
        val bytes = try {
            contentResolver.openInputStream(uri)?.use { it.readBytes() } ?: return
        } catch (_: Exception) {
            return
        }
        if (bytes.size > MAX_BYTES) return
        pending = mapOf("name" to nameOf(uri), "mime" to mime, "bytes" to bytes)
        intent.action = null
    }

    private fun nameOf(uri: Uri): String {
        contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            val column = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (column >= 0 && cursor.moveToFirst()) {
                val name = cursor.getString(column)
                if (!name.isNullOrBlank()) return name
            }
        }
        return uri.lastPathSegment ?: "shared"
    }

    companion object {
        const val CHANNEL = "in.myca/share"
        const val MAX_BYTES = 8 * 1024 * 1024
        val ACCEPTED = listOf("image/", "application/pdf", "text/")
    }
}
