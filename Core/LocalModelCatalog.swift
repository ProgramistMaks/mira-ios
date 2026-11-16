import Foundation
import LocalLLM

struct LocalModelSpec: Identifiable, Equatable {
    enum Guidance: Equatable { case heavy, compressed, balanced, light, alternative }
    let id: String
    let name: String
    let quantization: String
    let bytes: Int64
    let repository: String
    let revision: String
    let filename: String
    let sha256: String
    let profile: LocalPromptStyle
    let guidance: Guidance
    var title: String { "\(name) · \(quantization)" }
    var sizeLabel: String { String(format: "%.2f", Double(bytes) / 1_000_000_000).replacingOccurrences(of: ".", with: ",") + " ГБ" }
    var requiredDiskBytes: Int64 { bytes + 1_000_000_000 }
    var downloadURL: URL { URL(string: "https://huggingface.co/\(repository)/resolve/\(revision)/\(filename)")! }
    var sourceURL: URL { URL(string: "https://huggingface.co/\(repository)")! }
    func guidanceText(physicalMemory: UInt64) -> String {
        // Physical RAM is only a coarse estimate; iOS grants apps less than the total.
        if physicalMemory < UInt64(bytes + 1_500_000_000) {
            return "⚠️ Мало оперативной памяти: высок риск вылетов"
        }
        switch guidance {
        case .heavy: return "⚠️ Возможны вылеты и медленная работа"
        case .compressed: return "⚠️ Больше шансов запустить; точность ниже Q4"
        case .balanced: return "✅ Лучший выбор по балансу размера и качества"
        case .light: return "ℹ️ Лёгкая, но слабее в сложных задачах"
        case .alternative: return "✅ Альтернатива от Google"
        }
    }
}

enum LocalModelCatalog {
    static let models: [LocalModelSpec] = [
        LocalModelSpec(id: "qwen35-9b-q4", name: "Qwen3.5 9B", quantization: "Q4_K_M",
            bytes: 5680522464, repository: "unsloth/Qwen3.5-9B-GGUF", revision: "3885219b6810b007914f3a7950a8d1b469d598a5",
            filename: "Qwen3.5-9B-Q4_K_M.gguf", sha256: "03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8",
            profile: .qwen35, guidance: .heavy),
        LocalModelSpec(id: "qwen35-9b-q3", name: "Qwen3.5 9B", quantization: "Q3_K_M",
            bytes: 4673643744, repository: "unsloth/Qwen3.5-9B-GGUF", revision: "3885219b6810b007914f3a7950a8d1b469d598a5",
            filename: "Qwen3.5-9B-Q3_K_M.gguf", sha256: "8fed90306e4f019e2bf35f3766470b7bc59ea1a9dae00f5ceb20b43cb5514393",
            profile: .qwen35, guidance: .compressed),
        LocalModelSpec(id: "qwen35-4b-q4", name: "Qwen3.5 4B", quantization: "Q4_K_M",
            bytes: 2740937888, repository: "unsloth/Qwen3.5-4B-GGUF", revision: "e87f176479d0855a907a41277aca2f8ee7a09523",
            filename: "Qwen3.5-4B-Q4_K_M.gguf", sha256: "00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4",
            profile: .qwen35, guidance: .balanced),
        LocalModelSpec(id: "qwen35-2b-q4", name: "Qwen3.5 2B", quantization: "Q4_K_M",
            bytes: 1280835840, repository: "unsloth/Qwen3.5-2B-GGUF", revision: "f6d5376be1edb4d416d56da11e5397a961aca8ae",
            filename: "Qwen3.5-2B-Q4_K_M.gguf", sha256: "aaf42c8b7c3cab2bf3d69c355048d4a0ee9973d48f16c731c0520ee914699223",
            profile: .qwen35, guidance: .light),
        LocalModelSpec(id: "gemma4-e2b-q4", name: "Google Gemma 4 E2B", quantization: "Q4_K_M",
            bytes: 3106738272, repository: "unsloth/gemma-4-E2B-it-GGUF", revision: "0314792d7f1f7e229411f620751375812bb9faf2",
            filename: "gemma-4-E2B-it-Q4_K_M.gguf", sha256: "740185b21d22ceb83a11c3aa62ad5842ef32c70f6096d756bbee85a1e4ec34b8",
            profile: .gemma4, guidance: .alternative)
    ]
    static var defaultModel: LocalModelSpec { models[0] }
    static func find(_ id: String) -> LocalModelSpec? { models.first { $0.id == id } }
}
