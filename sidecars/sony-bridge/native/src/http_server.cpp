#include "http_server.hpp"

#include "util.hpp"

#include <iostream>
#include <sstream>
#include <thread>
#include <vector>

#if !defined(_WIN32)
#error "clickit-sony-bridge currently targets Windows x64 only"
#endif

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <winsock2.h>
#include <ws2tcpip.h>

#pragma comment(lib, "Ws2_32.lib")

namespace clickit {
namespace {

std::string http_response(int status, const char* status_text, const std::string& content_type,
                          const std::string& body, const char* extra_headers = "") {
  std::ostringstream oss;
  oss << "HTTP/1.1 " << status << ' ' << status_text << "\r\n"
      << "Content-Type: " << content_type << "\r\n"
      << "Content-Length: " << body.size() << "\r\n"
      << "Connection: close\r\n"
      << extra_headers << "\r\n"
      << body;
  return oss.str();
}

std::string json_response(int status, const char* status_text, const std::string& json) {
  return http_response(status, status_text, "application/json", json);
}

bool parse_request(const std::string& raw, std::string* method, std::string* path,
                   std::string* body) {
  const auto line_end = raw.find("\r\n");
  if (line_end == std::string::npos) return false;
  std::istringstream line(raw.substr(0, line_end));
  std::string version;
  if (!(line >> *method >> *path >> version)) return false;

  const auto headers_end = raw.find("\r\n\r\n");
  if (headers_end == std::string::npos) {
    *body = {};
    return true;
  }
  *body = raw.substr(headers_end + 4);
  return true;
}

}  // namespace

HttpServer::HttpServer(CameraSession& session) : session_(session) {}

HttpServer::~HttpServer() { stop(); }

void HttpServer::stop() {
  running_ = false;
  if (listen_socket_ != 0) {
    closesocket(static_cast<SOCKET>(listen_socket_));
    listen_socket_ = 0;
  }
}

std::string HttpServer::handle_request_(const std::string& method, const std::string& path,
                                        const std::string& /*body*/) {
  if (method == "GET" && path == "/status") {
    const auto st = session_.status();
    std::ostringstream json;
    json << "{"
         << "\"connected\":" << (st.connected ? "true" : "false") << ","
         << "\"capturing\":" << (st.capturing ? "true" : "false") << ","
         << "\"model\":\"" << json_escape(st.model) << "\",";
    if (st.battery_percent) {
      json << "\"batteryPercent\":" << *st.battery_percent << ",";
    } else {
      json << "\"batteryPercent\":null,";
    }
    json << "\"message\":\"" << json_escape(st.message) << "\","
         << "\"bridge\":\"sony-crsdk-windows\""
         << "}";
    return json_response(200, "OK", json.str());
  }

  if (method == "POST" && path == "/connect") {
    std::string err;
    if (!session_.connect(&err)) {
      std::ostringstream json;
      json << "{\"error\":\"" << json_escape(err) << "\",\"code\":\"CONNECT_FAILED\"}";
      return json_response(503, "Service Unavailable", json.str());
    }
    const auto st = session_.status();
    std::ostringstream json;
    json << "{\"connected\":true,\"model\":\"" << json_escape(st.model)
         << "\",\"message\":\"Ready\"}";
    return json_response(200, "OK", json.str());
  }

  if (method == "POST" && path == "/disconnect") {
    std::string err;
    session_.disconnect(&err);
    return json_response(200, "OK", "{\"connected\":false,\"message\":\"Disconnected\"}");
  }

  if (method == "GET" && path == "/live.jpg") {
    std::vector<std::uint8_t> jpeg;
    std::string err;
    if (!session_.live_jpeg(&jpeg, &err)) {
      const bool not_connected = err == "Not connected";
      std::ostringstream json;
      json << "{\"error\":\"" << json_escape(err) << "\",\"code\":\""
           << (not_connected ? "NOT_CONNECTED" : "LIVE_FAILED") << "\"}";
      return json_response(not_connected ? 503 : 500, not_connected ? "Service Unavailable" : "Error",
                          json.str());
    }
    std::string body(reinterpret_cast<const char*>(jpeg.data()), jpeg.size());
    return http_response(200, "OK", "image/jpeg", body, "Cache-Control: no-store\r\n");
  }

  if (method == "POST" && path == "/capture") {
    std::vector<std::uint8_t> jpeg;
    std::string err;
    std::string saved;
    if (!session_.capture_jpeg(&jpeg, &err, &saved)) {
      const bool not_connected = err == "Not connected";
      std::ostringstream json;
      json << "{\"error\":\"" << json_escape(err) << "\",\"code\":\""
           << (not_connected ? "NOT_CONNECTED" : "CAPTURE_FAILED") << "\"}";
      return json_response(not_connected ? 503 : 500, not_connected ? "Service Unavailable" : "Error",
                          json.str());
    }
    std::ostringstream json;
    json << "{\"jpegBase64\":\"" << base64_encode(jpeg) << "\"";
    if (!saved.empty()) {
      json << ",\"path\":\"" << json_escape(saved) << "\"";
    }
    json << "}";
    return json_response(200, "OK", json.str());
  }

  return json_response(404, "Not Found", "{\"error\":\"Not found\"}");
}

void HttpServer::serve_client_(unsigned long long raw_socket) {
  SOCKET client = static_cast<SOCKET>(raw_socket);
  std::string raw;
  char buf[8192];
  while (raw.find("\r\n\r\n") == std::string::npos) {
    const int n = recv(client, buf, sizeof(buf), 0);
    if (n <= 0) {
      closesocket(client);
      return;
    }
    raw.append(buf, buf + n);
    if (raw.size() > 1 << 20) break;
  }

  // If Content-Length asks for more body, read the rest.
  const auto headers_end = raw.find("\r\n\r\n");
  if (headers_end != std::string::npos) {
    std::size_t content_length = 0;
    const auto cl_pos = raw.find("Content-Length:");
    if (cl_pos != std::string::npos && cl_pos < headers_end) {
      content_length = static_cast<std::size_t>(std::strtoul(raw.c_str() + cl_pos + 15, nullptr, 10));
    }
    while (raw.size() - (headers_end + 4) < content_length) {
      const int n = recv(client, buf, sizeof(buf), 0);
      if (n <= 0) break;
      raw.append(buf, buf + n);
    }
  }

  std::string method, path, body;
  std::string response;
  if (!parse_request(raw, &method, &path, &body)) {
    response = json_response(400, "Bad Request", "{\"error\":\"Bad request\"}");
  } else {
    try {
      response = handle_request_(method, path, body);
    } catch (const std::exception& ex) {
      std::ostringstream json;
      json << "{\"error\":\"" << json_escape(ex.what()) << "\"}";
      response = json_response(500, "Error", json.str());
    }
  }

  send(client, response.data(), static_cast<int>(response.size()), 0);
  closesocket(client);
}

bool HttpServer::listen_and_serve(const std::string& host, int port, std::string* error) {
  WSADATA wsa;
  if (WSAStartup(MAKEWORD(2, 2), &wsa) != 0) {
    if (error) *error = "WSAStartup failed";
    return false;
  }

  SOCKET listen_sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (listen_sock == INVALID_SOCKET) {
    if (error) *error = "socket() failed";
    WSACleanup();
    return false;
  }

  BOOL yes = TRUE;
  setsockopt(listen_sock, SOL_SOCKET, SO_REUSEADDR, reinterpret_cast<const char*>(&yes), sizeof(yes));

  sockaddr_in addr{};
  addr.sin_family = AF_INET;
  addr.sin_port = htons(static_cast<u_short>(port));
  if (host == "0.0.0.0") {
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
  } else if (InetPtonA(AF_INET, host.c_str(), &addr.sin_addr) != 1) {
    // Default booth binding.
    InetPtonA(AF_INET, "127.0.0.1", &addr.sin_addr);
  }

  if (bind(listen_sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == SOCKET_ERROR) {
    if (error) *error = "bind() failed — is port " + std::to_string(port) + " already in use?";
    closesocket(listen_sock);
    WSACleanup();
    return false;
  }

  if (::listen(listen_sock, SOMAXCONN) == SOCKET_ERROR) {
    if (error) *error = "listen() failed";
    closesocket(listen_sock);
    WSACleanup();
    return false;
  }

  listen_socket_ = static_cast<unsigned long long>(listen_sock);
  running_ = true;
  std::cerr << "[sony-bridge] listening on http://" << host << ":" << port << "\n";

  while (running_) {
    SOCKET client = accept(listen_sock, nullptr, nullptr);
    if (client == INVALID_SOCKET) {
      if (!running_) break;
      continue;
    }
    std::thread(&HttpServer::serve_client_, this, static_cast<unsigned long long>(client)).detach();
  }

  closesocket(listen_sock);
  listen_socket_ = 0;
  WSACleanup();
  return true;
}

}  // namespace clickit
