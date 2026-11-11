#pragma once

#include "camera_session.hpp"

#include <atomic>
#include <string>

namespace clickit {

class HttpServer {
 public:
  explicit HttpServer(CameraSession& session);
  ~HttpServer();

  bool listen_and_serve(const std::string& host, int port, std::string* error);
  void stop();

 private:
  void serve_client_(unsigned long long socket);
  std::string handle_request_(const std::string& method, const std::string& path,
                              const std::string& body);

  CameraSession& session_;
  std::atomic<bool> running_{false};
  unsigned long long listen_socket_ = 0;
};

}  // namespace clickit
