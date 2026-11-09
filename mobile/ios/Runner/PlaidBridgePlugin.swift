import Flutter
import LinkKit
import UIKit

public class PlaidBridgePlugin: NSObject, FlutterPlugin {
  private var linkHandler: Handler?
  private var pending: FlutterResult?

  public static func register(with registry: FlutterPluginRegistry) {
    let registrar = registry.registrar(forPlugin: "PlaidBridge")!
    let channel = FlutterMethodChannel(
      name: "in.myca.myca/plaid_link",
      binaryMessenger: registrar.messenger()
    )
    let instance = PlaidBridgePlugin()
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    guard call.method == "openLink" else {
      result(FlutterMethodNotImplemented)
      return
    }
    guard pending == nil else {
      result(FlutterError(code: "BUSY", message: nil, details: nil))
      return
    }
    guard let args = call.arguments as? [String: Any],
      let token = args["token"] as? String,
      !token.isEmpty,
      let presenter = topViewController()
    else {
      result(nil)
      return
    }
    pending = result
    var configuration = LinkTokenConfiguration(
      token: token,
      onSuccess: { [weak self] success in
        self?.finish(with: success.publicToken, presenter: presenter)
      }
    )
    configuration.onExit = { [weak self] _ in
      self?.finish(with: nil, presenter: presenter)
    }
    configuration.onEvent = { _ in }
    switch Plaid.create(configuration) {
    case .success(let handler):
      linkHandler = handler
      handler.open(presentUsing: .viewController(presenter))
    case .failure(let error):
      let pendingResult = pending
      pending = nil
      linkHandler = nil
      pendingResult?(
        FlutterError(
          code: "CREATE_FAILED", message: error.localizedDescription, details: nil))
    }
  }

  private func finish(with publicToken: String?, presenter: UIViewController) {
    guard pending != nil else { return }
    if presenter.presentedViewController != nil {
      presenter.dismiss(animated: true, completion: nil)
    }
    linkHandler = nil
    let pendingResult = pending
    pending = nil
    pendingResult?(publicToken)
  }

  private func topViewController() -> UIViewController? {
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    for scene in scenes {
      for window in scene.windows where window.isKeyWindow {
        var top = window.rootViewController
        while let presented = top?.presentedViewController {
          top = presented
        }
        if top != nil {
          return top
        }
      }
    }
    return nil
  }
}
