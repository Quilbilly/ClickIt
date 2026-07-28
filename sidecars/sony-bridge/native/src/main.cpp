#include "camera_session.hpp"
#include "http_server.hpp"
#include "util.hpp"

#include <cstdlib>
#include <iostream>
#include <string>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace {

int env_int(const char* name, int fallback) {
  const char* v = std::getenv(name);
  if (!v || !*v) return fallback;
  return std::atoi(v);
}

std::string env_string(const char* name, const char* fallback) {
  const char* v = std::getenv(name);
  if (!v || !*v) return fallback;
  return v;
}

#if defined(_WIN32)
// CrSDK resolves CrAdapter relative to the running executable.
void ensure_cwd_is_exe_dir() {
  wchar_t path[MAX_PATH];
  const DWORD n = GetModuleFileNameW(nullptr, path, MAX_PATH);
  if (n == 0 || n >= MAX_PATH) return;
  for (DWORD i = n; i > 0; --i) {
    if (path[i - 1] == L'\\' || path[i - 1] == L'/') {
      path[i - 1] = L'\0';
      SetCurrentDirectoryW(path);
      break;
    }
  }
}

void log_runtime_files() {
  wchar_t exe_path[MAX_PATH];
  if (GetModuleFileNameW(nullptr, exe_path, MAX_PATH) > 0) {
    std::cerr << "[sony-bridge] exe=" << clickit::from_cr_chars(exe_path) << "\n";
  }
  wchar_t cwd[MAX_PATH];
  if (GetCurrentDirectoryW(MAX_PATH, cwd) > 0) {
    std::cerr << "[sony-bridge] cwd=" << clickit::from_cr_chars(cwd) << "\n";
  }
  const DWORD core_attr = GetFileAttributesW(L"Cr_Core.dll");
  const DWORD adapter_attr = GetFileAttributesW(L"CrAdapter");
  const bool adapter_ok =
      adapter_attr != INVALID_FILE_ATTRIBUTES && (adapter_attr & FILE_ATTRIBUTE_DIRECTORY);
  std::cerr << "[sony-bridge] Cr_Core.dll beside cwd: "
            << (core_attr != INVALID_FILE_ATTRIBUTES ? "yes" : "NO") << "\n";
  std::cerr << "[sony-bridge] CrAdapter/ beside cwd: " << (adapter_ok ? "yes" : "NO") << "\n";
}
#endif

}  // namespace

int main() {
#if defined(_WIN32)
  ensure_cwd_is_exe_dir();
  log_runtime_files();
#endif

  const int port = env_int("SONY_BRIDGE_PORT", 8791);
  const std::string host = env_string("SONY_BRIDGE_HOST", "127.0.0.1");

  clickit::CameraSession session;
  clickit::HttpServer server(session);

  std::string error;
  if (!server.listen_and_serve(host, port, &error)) {
    std::cerr << "[sony-bridge] failed to start: " << error << "\n";
    return 1;
  }
  return 0;
}
