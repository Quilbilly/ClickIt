#include "device_callback.hpp"

#include "util.hpp"

#include <chrono>
#include <iostream>

namespace clickit {
namespace {

std::string path_from_crchar(CrChar* filename) {
  return from_cr_chars(filename);
}

}  // namespace

void DeviceCallback::OnConnected(SCRSDK::DeviceConnectionVersioin /*version*/) {
  {
    std::lock_guard<std::mutex> lock(mu_);
    connected_ = true;
    connection_settled_ = true;
    last_error_ = 0;
  }
  cv_.notify_all();
  std::cerr << "[sony-bridge] camera connected\n";
}

void DeviceCallback::OnDisconnected(CrInt32u error) {
  {
    std::lock_guard<std::mutex> lock(mu_);
    connected_ = false;
    connection_settled_ = true;
    last_error_ = error;
    download_waiting_ = false;
    download_done_ = false;
  }
  cv_.notify_all();
  std::cerr << "[sony-bridge] camera disconnected error=0x" << std::hex << error << std::dec << "\n";
}

void DeviceCallback::OnPropertyChanged() {}
void DeviceCallback::OnPropertyChangedCodes(CrInt32u, CrInt32u*) {}
void DeviceCallback::OnLvPropertyChanged() {}
void DeviceCallback::OnLvPropertyChangedCodes(CrInt32u, CrInt32u*) {}

void DeviceCallback::OnCompleteDownload(CrChar* filename, CrInt32u /*type*/) {
  const auto path = path_from_crchar(filename);
  {
    std::lock_guard<std::mutex> lock(mu_);
    last_download_path_ = path;
    if (download_waiting_) {
      download_done_ = true;
      download_waiting_ = false;
    }
  }
  cv_.notify_all();
  std::cerr << "[sony-bridge] download complete: " << path << "\n";
}

void DeviceCallback::OnNotifyContentsTransfer(CrInt32u notify, SCRSDK::CrContentHandle /*handle*/,
                                              CrChar* filename) {
  // Some firmware paths deliver stills through contents-transfer notifications.
  if (filename && (notify == 0 || notify == 1)) {
    OnCompleteDownload(filename, 0);
  }
}

void DeviceCallback::OnWarning(CrInt32u warning) {
  std::cerr << "[sony-bridge] warning=0x" << std::hex << warning << std::dec << "\n";
}

void DeviceCallback::OnError(CrInt32u error) {
  {
    std::lock_guard<std::mutex> lock(mu_);
    last_error_ = error;
    connection_settled_ = true;
  }
  cv_.notify_all();
  std::cerr << "[sony-bridge] error=0x" << std::hex << error << std::dec << "\n";
}

bool DeviceCallback::wait_connected(int timeout_ms) {
  std::unique_lock<std::mutex> lock(mu_);
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  while (!connection_settled_) {
    if (cv_.wait_until(lock, deadline) == std::cv_status::timeout) {
      return connected_;
    }
  }
  return connected_;
}

void DeviceCallback::begin_download_wait() {
  std::lock_guard<std::mutex> lock(mu_);
  download_waiting_ = true;
  download_done_ = false;
  last_download_path_.clear();
}

bool DeviceCallback::wait_download(int timeout_ms, std::string* out_path) {
  std::unique_lock<std::mutex> lock(mu_);
  const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(timeout_ms);
  while (!download_done_ && connected_) {
    if (cv_.wait_until(lock, deadline) == std::cv_status::timeout) {
      break;
    }
  }
  if (!download_done_ || last_download_path_.empty()) return false;
  if (out_path) *out_path = last_download_path_;
  return true;
}

void DeviceCallback::reset_connection_state() {
  std::lock_guard<std::mutex> lock(mu_);
  connected_ = false;
  connection_settled_ = false;
  last_error_ = 0;
  download_waiting_ = false;
  download_done_ = false;
  last_download_path_.clear();
}

bool DeviceCallback::connected() const {
  std::lock_guard<std::mutex> lock(mu_);
  return connected_;
}

CrInt32u DeviceCallback::last_error() const {
  std::lock_guard<std::mutex> lock(mu_);
  return last_error_;
}

}  // namespace clickit
