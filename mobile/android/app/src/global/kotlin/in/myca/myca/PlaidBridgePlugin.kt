package `in`.myca.myca

import android.app.Activity
import android.app.Application
import com.plaid.link.Plaid
import com.plaid.link.PlaidHandler
import com.plaid.link.configuration.LinkTokenConfiguration
import com.plaid.link.result.LinkResultHandler
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.embedding.engine.plugins.activity.ActivityAware
import io.flutter.embedding.engine.plugins.activity.ActivityPluginBinding
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.flutter.plugin.common.PluginRegistry.ActivityResultListener
import android.content.Intent

class PlaidBridgePlugin : FlutterPlugin, MethodChannel.MethodCallHandler, ActivityAware, ActivityResultListener {
    private var channel: MethodChannel? = null
    private var application: Application? = null
    private var activity: Activity? = null
    private var handler: PlaidHandler? = null
    private var pending: MethodChannel.Result? = null

    private val results = LinkResultHandler(
        { success ->
            pending?.success(success.publicToken)
            pending = null
            kotlin.Unit
        },
        { exit ->
            pending?.success(null)
            pending = null
            handler = null
            kotlin.Unit
        },
    )

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        application = binding.applicationContext as Application
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).also {
            it.setMethodCallHandler(this)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
        application = null
    }

    override fun onAttachedToActivity(binding: ActivityPluginBinding) {
        activity = binding.activity
        binding.addActivityResultListener(this)
    }

    override fun onDetachedFromActivityForConfigChanges() {
        activity = null
    }

    override fun onReattachedToActivityForConfigChanges(binding: ActivityPluginBinding) {
        activity = binding.activity
        binding.addActivityResultListener(this)
    }

    override fun onDetachedFromActivity() {
        activity = null
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        return results.onActivityResult(requestCode, resultCode, data)
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        if (call.method != METHOD) {
            result.notImplemented()
            return
        }
        if (pending != null) {
            result.error(BUSY, null, null)
            return
        }
        val token = call.argument<String>(TOKEN)
        val app = application
        val act = activity
        if (token.isNullOrBlank() || app == null || act == null) {
            result.success(null)
            return
        }
        try {
            pending = result
            val config = LinkTokenConfiguration.Builder().token(token).build()
            handler = Plaid.create(app, config)
            handler?.open(act)
        } catch (e: Exception) {
            pending = null
            handler = null
            result.error(CREATE_FAILED, e.message, null)
        }
    }

    companion object {
        const val CHANNEL = "in.myca.myca/plaid_link"
        const val METHOD = "openLink"
        const val TOKEN = "token"
        const val BUSY = "BUSY"
        const val CREATE_FAILED = "CREATE_FAILED"
    }
}
