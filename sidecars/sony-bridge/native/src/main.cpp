#include "camera_session.hpp"
#include "http_server.hpp"

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
#endif

}  // namespace

int main() {
#if defined(_WIN32)
  ensure_cwd_is_exe_dir();
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
