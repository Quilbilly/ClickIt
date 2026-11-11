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
bool get_exe_dir(wchar_t* out, size_t out_count) {
  const DWORD n = GetModuleFileNameW(nullptr, out, static_cast<DWORD>(out_count));
  if (n == 0 || n >= out_count) return false;
  for (DWORD i = n; i > 0; --i) {
    if (out[i - 1] == L'\\' || out[i - 1] == L'/') {
      out[i - 1] = L'\0';
      return true;
    }
  }
  return false;
}

// Force-load the Cr_Core.dll that sits beside this exe (and its CrAdapter deps).
// Without this, Windows may bind a different Cr_Core.dll from Imaging Edge / PATH
// before main() runs, and EnumCameraObjects returns an empty/null list.
bool preload_local_cr_core() {
  wchar_t dir[MAX_PATH];
  if (!get_exe_dir(dir, MAX_PATH)) {
    std::cerr << "[sony-bridge] could not resolve exe directory\n";
    return false;
  }

  SetCurrentDirectoryW(dir);
  SetDllDirectoryW(dir);

  wchar_t core_path[MAX_PATH];
  if (swprintf_s(core_path, L"%s\\Cr_Core.dll", dir) < 0) return false;

  HMODULE mod = LoadLibraryExW(core_path, nullptr, LOAD_WITH_ALTERED_SEARCH_PATH);
  if (!mod) {
    std::cerr << "[sony-bridge] LoadLibraryEx failed for " << clickit::from_cr_chars(core_path)
              << " GetLastError=" << GetLastError() << "\n";
    return false;
  }
  std::cerr << "[sony-bridge] preloaded " << clickit::from_cr_chars(core_path) << "\n";
  return true;
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
  const DWORD ptp_attr = GetFileAttributesW(L"CrAdapter\\Cr_PTP_USB.dll");
  const bool adapter_ok =
      adapter_attr != INVALID_FILE_ATTRIBUTES && (adapter_attr & FILE_ATTRIBUTE_DIRECTORY);

  std::cerr << "[sony-bridge] Cr_Core.dll: "
            << (core_attr != INVALID_FILE_ATTRIBUTES ? "yes" : "NO") << "\n";
  std::cerr << "[sony-bridge] CrAdapter/: " << (adapter_ok ? "yes" : "NO") << "\n";
  std::cerr << "[sony-bridge] CrAdapter/Cr_PTP_USB.dll: "
            << (ptp_attr != INVALID_FILE_ATTRIBUTES ? "yes" : "NO") << "\n";
}
#endif

}  // namespace

int main() {
#if defined(_WIN32)
  if (!preload_local_cr_core()) {
    std::cerr << "[sony-bridge] refusing to start without local Cr_Core.dll\n";
    return 1;
  }
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
