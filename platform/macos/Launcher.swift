import AppKit
import Foundation

let appID = "io.github.mmasondu114.zhizhi"
let serverURL = URL(string: "http://127.0.0.1:4317")!
struct Health: Decodable, Sendable { let appId: String; let version: String }
final class HealthResult: @unchecked Sendable {
    private let lock = NSLock()
    private var value: Health?
    func store(_ next: Health?) { lock.lock(); defer { lock.unlock() }; value = next }
    func read() -> Health? { lock.lock(); defer { lock.unlock() }; return value }
}
func health() -> Health? {
    let semaphore = DispatchSemaphore(value: 0)
    let result = HealthResult()
    var request = URLRequest(url: serverURL.appendingPathComponent("api/health"))
    request.timeoutInterval = 1
    let task = URLSession.shared.dataTask(with: request) { data, response, _ in
        defer { semaphore.signal() }
        if let data = data, (response as? HTTPURLResponse)?.statusCode == 200 { result.store(try? JSONDecoder().decode(Health.self, from: data)) }
    }
    task.resume()
    if semaphore.wait(timeout: .now() + 2) == .timedOut { task.cancel() }
    return result.read()
}
final class ServerSession {
    var process: Process?
    let resourceRoot: URL
    let dataRoot: URL
    let version: String
    init() throws {
        guard let resources = Bundle.main.resourceURL else { throw NSError(domain: appID, code: 1) }
        resourceRoot = resources
        dataRoot = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Zhizhi", isDirectory: true)
        version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "unknown"
        try FileManager.default.createDirectory(at: dataRoot, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
    }
    func start() throws {
        if let existing = health() {
            if existing.appId == appID && existing.version == version { return }
            throw NSError(domain: appID, code: 2, userInfo: [NSLocalizedDescriptionKey: "端口 4317 已被其他版本占用，请先退出旧版知枝。"])
        }
        let executable = resourceRoot.appendingPathComponent("runtime/bin/node")
        let appRoot = resourceRoot.appendingPathComponent("app", isDirectory: true)
        let log = dataRoot.appendingPathComponent("server.log")
        if !FileManager.default.fileExists(atPath: log.path) { FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600]) }
        let handle = try FileHandle(forWritingTo: log)
        try handle.seekToEnd()
        let child = Process()
        child.executableURL = executable
        child.arguments = [appRoot.appendingPathComponent("server/index.js").path]
        child.currentDirectoryURL = appRoot
        var env = ProcessInfo.processInfo.environment
        env["TREE_DATA_DIR"] = dataRoot.path
        env["TREE_KEYCHAIN_HELPER"] = resourceRoot.appendingPathComponent("zhizhi-keychain").path
        env["PATH"] = executable.deletingLastPathComponent().path + ":/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + (env["PATH"] ?? "")
        env["PORT"] = "4317"
        child.environment = env
        child.standardOutput = handle
        child.standardError = handle
        child.standardInput = FileHandle.nullDevice
        do { try child.run(); process = child; try handle.close() } catch { try? handle.close(); throw error }
    }
    func stop() { if let child = process, child.isRunning { child.terminate(); child.waitUntilExit() }; process = nil }
}
final class Delegate: NSObject, NSApplicationDelegate {
    var session: ServerSession?
    var window: NSWindow?
    var timer: Timer?
    var attempts = 0
    func applicationDidFinishLaunching(_ notification: Notification) {
        let menu = NSMenu()
        let rootItem = NSMenuItem()
        let actions = NSMenu()
        let openItem = NSMenuItem(title: "打开知识树", action: #selector(openTree), keyEquivalent: "o"); openItem.target = self
        actions.addItem(openItem)
        let updateItem = NSMenuItem(title: "查看新版本", action: #selector(openUpdates), keyEquivalent: ""); updateItem.target = self
        actions.addItem(updateItem)
        actions.addItem(.separator())
        actions.addItem(NSMenuItem(title: "退出知枝", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        rootItem.submenu = actions; menu.addItem(rootItem); NSApp.mainMenu = menu
        let panel = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 420, height: 170), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        panel.title = "知枝"
        panel.isReleasedWhenClosed = false
        let label = NSTextField(labelWithString: "正在打开你的知识空间…")
        label.font = .systemFont(ofSize: 20, weight: .medium)
        label.frame = NSRect(x: 30, y: 90, width: 360, height: 30)
        panel.contentView?.addSubview(label)
        let caption = NSTextField(labelWithString: "数据保存在这台 Mac，浏览器即将打开。")
        caption.font = .systemFont(ofSize: 13); caption.textColor = .secondaryLabelColor
        caption.frame = NSRect(x: 30, y: 50, width: 360, height: 24)
        panel.contentView?.addSubview(caption)
        panel.center(); panel.makeKeyAndOrderFront(nil); window = panel
        do { session = try ServerSession(); try session?.start() } catch { showError(error.localizedDescription); return }
        timer = Timer.scheduledTimer(withTimeInterval: 0.35, repeats: true) { [weak self] timer in
            guard let self = self else { return }
            self.attempts += 1
            if let result = health(), result.appId == appID, result.version == self.session?.version {
                timer.invalidate(); self.window?.close(); self.openTree()
            } else if self.attempts > 50 || self.session?.process?.isRunning == false {
                timer.invalidate(); self.showError("本地服务未能启动。请检查端口 4317，或查看 ~/Library/Application Support/Zhizhi/server.log。")
            }
        }
    }
    func showError(_ message: String) { let alert = NSAlert(); alert.messageText = "知枝暂时无法启动"; alert.informativeText = message; alert.addButton(withTitle: "关闭"); alert.runModal(); NSApp.terminate(nil) }
    @objc func openTree() { NSWorkspace.shared.open(serverURL) }
    @objc func openUpdates() { NSWorkspace.shared.open(URL(string: "https://github.com/mmasondu114/zhizhi/releases")!) }
    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool { openTree(); return false }
    func applicationWillTerminate(_ notification: Notification) { timer?.invalidate(); session?.stop() }
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

if CommandLine.arguments.contains("--smoke-test") {
    do {
        let session = try ServerSession(); defer { session.stop() }; try session.start()
        var success = false
        for _ in 0..<50 { if let result = health(), result.appId == appID, result.version == session.version { success = true; break }; Thread.sleep(forTimeInterval: 0.2) }
        if !success { fputs("Mac launcher smoke test failed\n", stderr); exit(1) }
        print("Mac launcher started bundled runtime successfully")
    } catch { fputs("Mac launcher startup failed: \(error.localizedDescription)\n", stderr); exit(1) }
} else {
    let application = NSApplication.shared
    let delegate = Delegate()
    application.delegate = delegate
    application.setActivationPolicy(.regular)
    application.run()
}
