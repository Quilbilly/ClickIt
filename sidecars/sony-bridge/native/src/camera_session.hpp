#pragma once

#include "device_callback.hpp"

#include <cstdint>
#include <mutex>
#include <optional>
#include <string>
#include <vector>

namespace clickit {

struct CameraStatus {
  bool connected = false;
  bool capturing = false;
  std::string model = "ILCE-7RM5";
  std::optional<int> battery_percent;
  std::string message = "Disconnected";
};

class CameraSession {
 public:
  CameraSession();
  ~CameraSession();

  CameraSession(const CameraSession&) = delete;
  CameraSession& operator=(const CameraSession&) = delete;

  CameraStatus status();
  // Enumerate USB cameras, connect the first (prefer ILCE-7RM5), enable live view.
  bool connect(std::string* error);
  bool disconnect(std::string* error);
  bool live_jpeg(std::vector<std::uint8_t>* out, std::string* error);
  bool capture_jpeg(std::vector<std::uint8_t>* out, std::string* error, std::string* saved_path);

 private:
  bool ensure_sdk_(std::string* error);
  bool pick_camera_(SCRSDK::ICrEnumCameraObjectInfo* list, const SCRSDK::ICrCameraObjectInfo** out,
                    std::string* error);
  bool enable_live_view_(std::string* error);
  bool refresh_props_locked_();
  std::string save_dir_() const;

  std::mutex mu_;
  bool sdk_ready_ = false;
  bool connected_ = false;
  bool capturing_ = false;
  SCRSDK::CrDeviceHandle handle_ = 0;
  DeviceCallback callback_;
  std::string model_ = "ILCE-7RM5";
  std::optional<int> battery_percent_;
  std::string message_ = "Disconnected";
};

}  // namespace clickit
