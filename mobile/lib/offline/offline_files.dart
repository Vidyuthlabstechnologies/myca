import 'dart:io';

abstract class OfflineFiles {
  Future<String?> read(String name);
  Future<void> write(String name, String content);
  Future<void> delete(String name);
}

class DirectoryOfflineFiles implements OfflineFiles {
  DirectoryOfflineFiles(this.directory);

  final Future<Directory> Function() directory;

  Future<File> _file(String name) async {
    final dir = await directory();
    final folder = Directory('${dir.path}${Platform.pathSeparator}offline');
    if (!await folder.exists()) await folder.create(recursive: true);
    return File('${folder.path}${Platform.pathSeparator}$name');
  }

  @override
  Future<String?> read(String name) async {
    final file = await _file(name);
    if (await file.exists()) return file.readAsString();
    final staged = File('${file.path}.new');
    if (await staged.exists()) return staged.readAsString();
    return null;
  }

  @override
  Future<void> write(String name, String content) async {
    final file = await _file(name);
    final staged = File('${file.path}.new');
    final handle = await staged.open(mode: FileMode.write);
    try {
      await handle.writeString(content);
      await handle.flush();
    } finally {
      await handle.close();
    }
    await staged.rename(file.path);
  }

  @override
  Future<void> delete(String name) async {
    final file = await _file(name);
    if (await file.exists()) await file.delete();
  }
}

class MemoryOfflineFiles implements OfflineFiles {
  final files = <String, String>{};
  int writes = 0;

  @override
  Future<String?> read(String name) async => files[name];

  @override
  Future<void> write(String name, String content) async {
    writes += 1;
    files[name] = content;
  }

  @override
  Future<void> delete(String name) async {
    files.remove(name);
  }
}
