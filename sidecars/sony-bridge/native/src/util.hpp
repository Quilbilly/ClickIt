#pragma once

#include <cstdio>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

namespace clickit {

inline std::string json_escape(std::string_view in) {
  std::string out;
  out.reserve(in.size() + 8);
  for (unsigned char c : in) {
    switch (c) {
      case '\\': out += "\\\\"; break;
      case '"': out += "\\\""; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buf[8];
          std::snprintf(buf, sizeof(buf), "\\u%04x", c);
          out += buf;
        } else {
          out.push_back(static_cast<char>(c));
        }
    }
  }
  return out;
}

inline std::string base64_encode(const std::uint8_t* data, std::size_t len) {
  static constexpr char kTable[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve(((len + 2) / 3) * 4);
  std::size_t i = 0;
  while (i + 2 < len) {
    const std::uint32_t n = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
    out.push_back(kTable[(n >> 18) & 63]);
    out.push_back(kTable[(n >> 12) & 63]);
    out.push_back(kTable[(n >> 6) & 63]);
    out.push_back(kTable[n & 63]);
    i += 3;
  }
  if (i < len) {
    const std::uint32_t n = data[i] << 16 | (i + 1 < len ? data[i + 1] << 8 : 0);
    out.push_back(kTable[(n >> 18) & 63]);
    out.push_back(kTable[(n >> 12) & 63]);
    out.push_back(i + 1 < len ? kTable[(n >> 6) & 63] : '=');
    out.push_back('=');
  }
  return out;
}

inline std::string base64_encode(const std::vector<std::uint8_t>& bytes) {
  return base64_encode(bytes.data(), bytes.size());
}

#if defined(_WIN32)
inline std::string narrow(const wchar_t* wide) {
  if (!wide || !*wide) return {};
  const int needed = WideCharToMultiByte(CP_UTF8, 0, wide, -1, nullptr, 0, nullptr, nullptr);
  if (needed <= 1) return {};
  std::string out(static_cast<std::size_t>(needed - 1), '\0');
  WideCharToMultiByte(CP_UTF8, 0, wide, -1, out.data(), needed, nullptr, nullptr);
  return out;
}

inline std::wstring widen(std::string_view utf8) {
  if (utf8.empty()) return {};
  const int needed = MultiByteToWideChar(
      CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), nullptr, 0);
  if (needed <= 0) return {};
  std::wstring out(static_cast<std::size_t>(needed), L'\0');
  MultiByteToWideChar(
      CP_UTF8, 0, utf8.data(), static_cast<int>(utf8.size()), out.data(), needed);
  return out;
}
#endif

// Sony CrChar is wchar_t in some SDK builds and char in others — support both.
inline std::string narrow(const char* s) { return s ? std::string(s) : std::string{}; }

#if defined(_WIN32)
// Detect UTF-16LE ASCII-ish payloads mistakenly typed as char* (e.g. "I\0L\0C\0E\0").
inline bool looks_like_utf16le(const char* s) {
  if (!s) return false;
  const auto* u = reinterpret_cast<const unsigned char*>(s);
  if (u[0] == 0) return false;
  // First code unit looks like ASCII wchar: lo-byte nonzero, hi-byte zero.
  if (u[1] != 0) return false;
  // Second code unit present and also ASCII wchar, or immediate terminator.
  if (u[2] == 0 && u[3] == 0) return true;
  return u[2] != 0 && u[3] == 0;
}
#endif

template <typename CrCharT>
inline std::string from_cr_chars(const CrCharT* s) {
  if (!s) return {};
  if constexpr (sizeof(CrCharT) == sizeof(wchar_t)) {
#if defined(_WIN32)
    return narrow(reinterpret_cast<const wchar_t*>(s));
#else
    // Unlikely path on non-Windows.
    std::string out;
    for (const CrCharT* p = s; *p; ++p) out.push_back(static_cast<char>(*p));
    return out;
#endif
  } else {
#if defined(_WIN32)
    const auto* as_chars = reinterpret_cast<const char*>(s);
    if (looks_like_utf16le(as_chars)) {
      return narrow(reinterpret_cast<const wchar_t*>(s));
    }
#endif
    return narrow(reinterpret_cast<const char*>(s));
  }
}

template <typename CrCharT>
inline std::basic_string<CrCharT> to_cr_string(std::string_view utf8) {
  std::basic_string<CrCharT> out;
  if constexpr (sizeof(CrCharT) == sizeof(wchar_t)) {
#if defined(_WIN32)
    const auto wide = widen(utf8);
    out.assign(reinterpret_cast<const CrCharT*>(wide.data()), wide.size());
#else
    out.assign(utf8.begin(), utf8.end());
#endif
  } else {
#if defined(_WIN32)
    // If the active SDK build still typedefs CrChar as char but the DLL is the
    // UNICODE Windows build, callers must compile with UNICODE so CrChar is
    // wchar_t. Passing UTF-8 narrow paths into a wide SetSaveInfo breaks downloads.
#endif
    out.assign(utf8.begin(), utf8.end());
  }
  return out;
}

inline std::string read_file_bytes_as_string(const std::string& path) {
  FILE* f = nullptr;
#if defined(_WIN32)
  const auto wpath = widen(path);
  _wfopen_s(&f, wpath.c_str(), L"rb");
#else
  f = std::fopen(path.c_str(), "rb");
#endif
  if (!f) return {};
  std::string data;
  char buf[1 << 15];
  while (true) {
    const auto n = std::fread(buf, 1, sizeof(buf), f);
    if (n == 0) break;
    data.append(buf, buf + n);
  }
  std::fclose(f);
  return data;
}

}  // namespace clickit
