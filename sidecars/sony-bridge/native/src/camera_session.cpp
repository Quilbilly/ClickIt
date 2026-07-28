#include "camera_session.hpp"

#include "util.hpp"

#include <algorithm>
#include <chrono>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <thread>

namespace fs = std::filesystem;

namespace clickit {
namespace {

bool cr_ok(SCRSDK::CrError err) { return err == SCRSDK::CrError_None; }

std::string model_from_info(const SCRSDK::ICrCameraObjectInfo* info) {
  if (!info) return "ILCE-7RM5";
  auto model = from_cr_chars(info->GetModel());
  return model.empty() ? "ILCE-7RM5" : model;
}

int battery_percent_from_remain(CrInt64u value) {
  // CrDeviceProperty_BatteryRemain is typically 0–100; 0xFFFF means unknown.
  if (value == 0xFFFF) return -1;
  if (value > 100) return static_cast<int>(std::min<CrInt64u>(value, 100));
  return static_cast<int>(value);
}

}  // namespace

CameraSession::CameraSession() = default;

CameraSession::~CameraSession() {
  std::string ignore;
  disconnect(&ignore);
  if (sdk_ready_) {
    SCRSDK::Release();
    sdk_ready_ = false;
  }
}

bool CameraSession::ensure_sdk_(std::string* error) {
  if (sdk_ready_) return true;
  if (!SCRSDK::Init()) {
    if (error) *error = "SCRSDK::Init failed (check Cr_Core.dll / CrAdapter next to the exe)";
    return false;
  }
  sdk_ready_ = true;
  std::cerr << "[sony-bridge] SDK version=" << SCRSDK::GetSDKVersion() << "\n";
  return true;
}

bool CameraSession::pick_camera_(SCRSDK::ICrEnumCameraObjectInfo* list,
                                 const SCRSDK::ICrCameraObjectInfo** out, std::string* error) {
  if (!list) {
    if (error) *error = "No camera enumeration list";
    return false;
  }
  const auto count = list->GetCount();
  if (count <= 0) {
    if (error) {
      *error =
          "No Sony cameras found. Put the ILCE-7RM5 in USB: PC Remote mode and reconnect the cable.";
    }
    return false;
  }

  int preferred = -1;
  for (CrInt32u i = 0; i < count; ++i) {
    const auto* info = list->GetCameraObjectInfo(i);
    if (!info) continue;
    const auto model = model_from_info(info);
    std::cerr << "[sony-bridge] found camera[" << i << "] model=" << model << "\n";
    if (preferred < 0) preferred = static_cast<int>(i);
    if (model.find("ILCE-7RM5") != std::string::npos || model.find("7RM5") != std::string::npos) {
      preferred = static_cast<int>(i);
      break;
    }
  }

  if (preferred < 0) {
    if (error) *error = "Camera list was empty after enumeration";
    return false;
  }

  *out = list->GetCameraObjectInfo(static_cast<CrInt32u>(preferred));
  return *out != nullptr;
}

bool CameraSession::enable_live_view_(std::string* error) {
  SCRSDK::CrDeviceProperty* props = nullptr;
  CrInt32 nprops = 0;
  auto err = SCRSDK::GetDeviceProperties(handle_, &props, &nprops);
  if (!cr_ok(err) || !props) {
    // Live view may still work without an explicit enable on some bodies.
    return true;
  }

  for (CrInt32 i = 0; i < nprops; ++i) {
    auto& prop = props[i];
    const auto code = prop.GetCode();

    // Prefer saving stills to the host so OnCompleteDownload fires for /capture.
    if (code == SCRSDK::CrDeviceProperty_StillImageStoreDestination &&
        prop.IsSetEnableCurrentValue()) {
      SCRSDK::CrDeviceProperty set = prop;
      set.SetCurrentValue(SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard);
      SCRSDK::SetDeviceProperty(handle_, &set);
      continue;
    }

    if (code != SCRSDK::CrDeviceProperty_LiveViewStatus) continue;
    if (!prop.IsSetEnableCurrentValue()) continue;

    SCRSDK::CrDeviceProperty set = prop;
    set.SetCurrentValue(SCRSDK::CrLiveView_Enable);
    err = SCRSDK::SetDeviceProperty(handle_, &set);
    if (!cr_ok(err) && error) {
      *error = "Failed to enable live view";
    }
  }

  SCRSDK::ReleaseDeviceProperties(handle_, props);
  return true;
}

bool CameraSession::refresh_props_locked_() {
  if (!connected_ || !handle_) return false;

  SCRSDK::CrDeviceProperty* props = nullptr;
  CrInt32 nprops = 0;
  auto err = SCRSDK::GetDeviceProperties(handle_, &props, &nprops);
  if (!cr_ok(err) || !props) return false;

  for (CrInt32 i = 0; i < nprops; ++i) {
    const auto& prop = props[i];
    switch (prop.GetCode()) {
      case SCRSDK::CrDeviceProperty_ModelName: {
        // Model name is often already known from enumeration; keep battery path primary.
        break;
      }
      case SCRSDK::CrDeviceProperty_BatteryRemain: {
        const int pct = battery_percent_from_remain(prop.GetCurrentValue());
        if (pct >= 0) battery_percent_ = pct;
        break;
      }
      default:
        break;
    }
  }

  SCRSDK::ReleaseDeviceProperties(handle_, props);
  return true;
}

std::string CameraSession::save_dir_() const {
  fs::path dir = fs::temp_directory_path() / "clickit-sony-captures";
  std::error_code ec;
  fs::create_directories(dir, ec);
  return dir.string();
}

CameraStatus CameraSession::status() {
  std::lock_guard<std::mutex> lock(mu_);
  if (connected_) {
    refresh_props_locked_();
    // Keep callback truth in sync (USB unplug path).
    if (!callback_.connected()) {
      connected_ = false;
      handle_ = 0;
      message_ = "Disconnected";
    } else {
      message_ = "Ready";
    }
  }

  CameraStatus st;
  st.connected = connected_;
  st.capturing = capturing_;
  st.model = model_;
  st.battery_percent = battery_percent_;
  st.message = message_;
  return st;
}

bool CameraSession::connect(std::string* error) {
  std::lock_guard<std::mutex> lock(mu_);
  if (connected_) {
    message_ = "Ready";
    return true;
  }
  if (!ensure_sdk_(error)) return false;

  SCRSDK::ICrEnumCameraObjectInfo* list = nullptr;
  auto err = SCRSDK::EnumCameraObjects(&list, 3);
  if (!cr_ok(err) || !list) {
    if (error) *error = "EnumCameraObjects failed (is CrAdapter beside the executable?)";
    return false;
  }

  const SCRSDK::ICrCameraObjectInfo* camera = nullptr;
  if (!pick_camera_(list, &camera, error)) {
    list->Release();
    return false;
  }

  model_ = model_from_info(camera);
  callback_.reset_connection_state();

  SCRSDK::CrDeviceHandle handle = 0;
  // Prefer the 5-arg form (openMode + reconnect). Extra auth/fingerprint args default to null.
  err = SCRSDK::Connect(const_cast<SCRSDK::ICrCameraObjectInfo*>(camera), &callback_, &handle,
                        SCRSDK::CrSdkControlMode_Remote, SCRSDK::CrReconnecting_ON);

  // Keep enum alive until connect returns; SDK retains what it needs afterwards.
  list->Release();
  list = nullptr;

  if (!cr_ok(err) || handle == 0) {
    if (error) *error = "Connect failed — confirm USB: PC Remote mode on the ILCE-7RM5";
    return false;
  }

  handle_ = handle;
  if (!callback_.wait_connected(12000) || !callback_.connected()) {
    SCRSDK::Disconnect(handle_);
    SCRSDK::ReleaseDevice(handle_);
    handle_ = 0;
    if (error) *error = "Camera did not finish the connect handshake";
    return false;
  }

  const auto dir = save_dir_();
  auto cr_dir = to_cr_string<CrChar>(dir);
  auto cr_prefix = to_cr_string<CrChar>("CLK");
  err = SCRSDK::SetSaveInfo(handle_, cr_dir.data(), cr_prefix.data(), 1);
  if (!cr_ok(err)) {
    std::cerr << "[sony-bridge] SetSaveInfo failed; captures may not download to disk\n";
  }

  enable_live_view_(error);
  connected_ = true;
  capturing_ = false;
  message_ = "Ready";
  refresh_props_locked_();
  std::cerr << "[sony-bridge] tethered to " << model_ << "\n";
  return true;
}

bool CameraSession::disconnect(std::string* error) {
  std::lock_guard<std::mutex> lock(mu_);
  if (!connected_ && handle_ == 0) {
    message_ = "Disconnected";
    return true;
  }

  if (handle_ != 0) {
    auto err = SCRSDK::Disconnect(handle_);
    if (!cr_ok(err) && error) *error = "Disconnect failed";
    err = SCRSDK::ReleaseDevice(handle_);
    if (!cr_ok(err) && error && error->empty()) *error = "ReleaseDevice failed";
    handle_ = 0;
  }

  connected_ = false;
  capturing_ = false;
  battery_percent_.reset();
  message_ = "Disconnected";
  callback_.reset_connection_state();
  return true;
}

bool CameraSession::live_jpeg(std::vector<std::uint8_t>* out, std::string* error) {
  std::lock_guard<std::mutex> lock(mu_);
  if (!connected_ || !handle_) {
    if (error) *error = "Not connected";
    return false;
  }

  SCRSDK::CrImageInfo info;
  auto err = SCRSDK::GetLiveViewImageInfo(handle_, &info);
  if (!cr_ok(err)) {
    if (error) *error = "GetLiveViewImageInfo failed";
    return false;
  }

  const CrInt32u buf_size = info.GetBufferSize();
  if (buf_size < 1) {
    if (error) *error = "Live view buffer not ready";
    return false;
  }

  auto* block = new SCRSDK::CrImageDataBlock();
  auto* buff = new CrInt8u[buf_size];
  block->SetSize(buf_size);
  block->SetData(buff);

  err = SCRSDK::GetLiveViewImage(handle_, block);
  if (!cr_ok(err) || block->GetImageSize() == 0) {
    delete[] buff;
    delete block;
    if (error) {
      *error = (err == SCRSDK::CrWarning_Frame_NotUpdated) ? "Live view frame not updated"
                                                           : "GetLiveViewImage failed";
    }
    return false;
  }

  const auto* jpeg = block->GetImageData();
  const auto jpeg_size = block->GetImageSize();
  out->assign(jpeg, jpeg + jpeg_size);

  delete[] buff;
  delete block;
  return true;
}

bool CameraSession::capture_jpeg(std::vector<std::uint8_t>* out, std::string* error,
                                 std::string* saved_path) {
  std::unique_lock<std::mutex> lock(mu_);
  if (!connected_ || !handle_) {
    if (error) *error = "Not connected";
    return false;
  }

  capturing_ = true;
  message_ = "Capturing";
  callback_.begin_download_wait();

  auto err = SCRSDK::SendCommand(handle_, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Down);
  if (!cr_ok(err)) {
    capturing_ = false;
    message_ = "Ready";
    if (error) *error = "Shutter down failed";
    return false;
  }

  // Release the session lock while waiting so /status can still answer.
  lock.unlock();
  std::this_thread::sleep_for(std::chrono::milliseconds(35));
  lock.lock();

  if (!connected_ || !handle_) {
    capturing_ = false;
    message_ = "Disconnected";
    if (error) *error = "Disconnected during capture";
    return false;
  }

  err = SCRSDK::SendCommand(handle_, SCRSDK::CrCommandId_Release, SCRSDK::CrCommandParam_Up);
  if (!cr_ok(err)) {
    capturing_ = false;
    message_ = "Ready";
    if (error) *error = "Shutter up failed";
    return false;
  }

  lock.unlock();
  std::string path;
  const bool got = callback_.wait_download(20000, &path);
  lock.lock();

  capturing_ = false;
  if (!got) {
    message_ = "Ready";
    if (error) {
      *error =
          "Capture timed out waiting for download. Check Still Save Destination includes PC "
          "Remote.";
    }
    return false;
  }

  auto bytes = read_file_bytes_as_string(path);
  if (bytes.empty()) {
    message_ = "Ready";
    if (error) *error = "Downloaded capture file was empty: " + path;
    return false;
  }

  out->assign(bytes.begin(), bytes.end());
  if (saved_path) *saved_path = path;
  message_ = "Ready";
  refresh_props_locked_();
  return true;
}

}  // namespace clickit
