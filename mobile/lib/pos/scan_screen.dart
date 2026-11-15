import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

typedef BarcodeScan = Future<String?> Function(BuildContext context);

Future<String?> scanBarcodeWithCamera(BuildContext context) => Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => const ScanScreen()));

class ScanScreen extends StatefulWidget {
  const ScanScreen({super.key});

  @override
  State<ScanScreen> createState() => _ScanScreenState();
}

class _ScanScreenState extends State<ScanScreen> {
  final _controller = MobileScannerController(detectionSpeed: DetectionSpeed.noDuplicates);
  bool _done = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _found(BarcodeCapture capture) {
    if (_done) return;
    for (final barcode in capture.barcodes) {
      final value = barcode.rawValue?.trim() ?? '';
      if (value.isNotEmpty) {
        _done = true;
        Navigator.of(context).pop(value);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan a barcode'),
        actions: [
          IconButton(tooltip: 'Torch', icon: const Icon(Icons.flashlight_on_outlined), onPressed: () => _controller.toggleTorch()),
        ],
      ),
      body: Stack(
        children: [
          MobileScanner(controller: _controller, onDetect: _found),
          Align(
            alignment: Alignment.bottomCenter,
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Text('Point the camera at the barcode on the pack.', style: Theme.of(context).textTheme.bodyLarge?.copyWith(color: Colors.white), textAlign: TextAlign.center),
            ),
          ),
        ],
      ),
    );
  }
}
