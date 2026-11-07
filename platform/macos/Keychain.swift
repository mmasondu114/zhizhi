import Foundation
import Security

let service = "io.github.mmasondu114.zhizhi"
func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(1)
}
let input = FileHandle.standardInput.readDataToEndOfFile()
guard input.count <= 65536,
      let request = try? JSONSerialization.jsonObject(with: input) as? [String: String],
      let operation = request["operation"], let account = request["account"], UUID(uuidString: account) != nil else { fail("Invalid keychain request") }
var query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: account]
var output: [String: Any] = ["ok": true]
switch operation {
case "set":
    guard let value = request["value"], value.utf8.count <= 16000 else { fail("Invalid credential length") }
    query[kSecValueData as String] = Data(value.utf8)
    query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
    let result = SecItemAdd(query as CFDictionary, nil)
    guard result == errSecSuccess else { fail("Keychain save failed (\(result))") }
case "get":
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else { fail("Keychain read failed (\(status)); unlock login keychain or enter the API key again") }
    output["value"] = value
case "delete":
    let result = SecItemDelete(query as CFDictionary)
    guard result == errSecSuccess || result == errSecItemNotFound else { fail("Keychain delete failed (\(result))") }
default: fail("Unsupported keychain operation")
}
guard let encoded = try? JSONSerialization.data(withJSONObject: output) else { fail("Invalid keychain result") }
FileHandle.standardOutput.write(encoded)
