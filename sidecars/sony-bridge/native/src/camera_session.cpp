#include "camera_session.hpp"

#include "util.hpp"

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <filesystem>
#include <iostream>
#include <thread>

#if defined(_WIN32)
#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#endif

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

#if defined(_WIN32)
  // Surface adapter load problems before Init() swallows them.
  {
    HMODULE ptp = LoadLibraryW(L"CrAdapter\\Cr_PTP_USB.dll");
    if (!ptp) {
      char buf[160];
      std::snprintf(buf, sizeof(buf),
                    "Failed to load CrAdapter\\Cr_PTP_USB.dll (GetLastError=%lu). "
                    "Run npm run sony-bridge:verify-dist",
                    static_cast<unsigned long>(GetLastError()));
      std::cerr << "[sony-bridge] " << buf << "\n";
      if (error) *error = buf;
      return false;
    }
    std::cerr << "[sony-bridge] loaded CrAdapter\\Cr_PTP_USB.dll\n";
  }
#endif

  if (!SCRSDK::Init()) {
    if (error) *error = "SCRSDK::Init failed (check Cr_Core.dll / CrAdapter next to the exe)";
    return false;
  }
  sdk_ready_ = true;
  std::cerr << "[sony-bridge] SDK version=" << SCRSDK::GetSDKVersion()
            << " sizeof(CrChar)=" << sizeof(CrChar) << "\n";

#if defined(_WIN32)
  wchar_t exe_path[MAX_PATH];
  if (GetModuleFileNameW(nullptr, exe_path, MAX_PATH) > 0) {
    std::cerr << "[sony-bridge] exe=" << from_cr_chars(exe_path) << "\n";
  }
  wchar_t cwd[MAX_PATH];
  if (GetCurrentDirectoryW(MAX_PATH, cwd) > 0) {
    std::cerr << "[sony-bridge] cwd=" << from_cr_chars(cwd) << "\n";
  }
  const DWORD attr = GetFileAttributesW(L"CrAdapter");
  const bool adapter_ok = attr != INVALID_FILE_ATTRIBUTES && (attr & FILE_ATTRIBUTE_DIRECTORY);
  const DWORD core_attr = GetFileAttributesW(L"Cr_Core.dll");
  std::cerr << "[sony-bridge] Cr_Core.dll beside cwd: "
            << (core_attr != INVALID_FILE_ATTRIBUTES ? "yes" : "NO") << "\n";
  std::cerr << "[sony-bridge] CrAdapter/ beside cwd: " << (adapter_ok ? "yes" : "NO") << "\n";
#endif
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

std::string CameraSession::still_dest_label_(CrInt64u value) {
  if (value == SCRSDK::CrStillImageStoreDestination_HostPC) return "Destination Only (PC)";
  if (value == SCRSDK::CrStillImageStoreDestination_MemoryCard) return "Camera Only";
  if (value == SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard) {
    return "Dest.+Camera (PC+card)";
  }
  return "unknown(" + std::to_string(static_cast<unsigned long long>(value)) + ")";
}

bool CameraSession::apply_save_info_(std::string* error) {
  auto dir = save_dir_();
#if defined(_WIN32)
  if (!dir.empty() && dir.back() != '\\' && dir.back() != '/') dir.push_back('\\');
#else
  if (!dir.empty() && dir.back() != '/') dir.push_back('/');
#endif
  auto cr_dir = to_cr_string<CrChar>(dir);
  auto cr_prefix = to_cr_string<CrChar>("CLK");
  const auto err = SCRSDK::SetSaveInfo(handle_, cr_dir.data(), cr_prefix.data(), 1);
  if (!cr_ok(err)) {
    char buf[192];
    std::snprintf(buf, sizeof(buf), "SetSaveInfo failed (0x%X) for %s",
                  static_cast<unsigned>(err), dir.c_str());
    std::cerr << "[sony-bridge] " << buf << "\n";
    if (error) *error = buf;
    return false;
  }
  std::cerr << "[sony-bridge] SetSaveInfo ok dir=" << dir << " prefix=CLK\n";
  return true;
}

bool CameraSession::ensure_pc_still_destination_(std::string* /*error*/) {
  SCRSDK::CrDeviceProperty* props = nullptr;
  CrInt32 nprops = 0;
  auto err = SCRSDK::GetDeviceProperties(handle_, &props, &nprops);
  if (!cr_ok(err) || !props) {
    std::cerr << "[sony-bridge] GetDeviceProperties failed while setting still save dest\n";
    return false;
  }

  bool found = false;
  bool wrote = false;
  for (CrInt32 i = 0; i < nprops; ++i) {
    auto& prop = props[i];
    if (prop.GetCode() != SCRSDK::CrDeviceProperty_StillImageStoreDestination) continue;
    found = true;
    const auto before = prop.GetCurrentValue();
    still_save_dest_ = static_cast<int>(before);
    std::cerr << "[sony-bridge] StillImageStoreDestination before="
              << still_dest_label_(before) << " setEnable="
              << (prop.IsSetEnableCurrentValue() ? "yes" : "no") << "\n";

    // Camera Only never calls OnCompleteDownload — force a PC destination.
    const CrInt64u targets[] = {
        SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard,
        SCRSDK::CrStillImageStoreDestination_HostPC,
    };
    for (const auto target : targets) {
      if (before == target) {
        wrote = true;
        break;
      }
      SCRSDK::CrDeviceProperty set = prop;
      set.SetCurrentValue(target);
      err = SCRSDK::SetDeviceProperty(handle_, &set);
      std::cerr << "[sony-bridge] Set StillImageStoreDestination -> " << still_dest_label_(target)
                << " result=0x" << std::hex << err << std::dec << "\n";
      if (cr_ok(err)) {
        still_save_dest_ = static_cast<int>(target);
        wrote = true;
        break;
      }
    }
    break;
  }

  SCRSDK::ReleaseDeviceProperties(handle_, props);

  if (!found) {
    std::cerr << "[sony-bridge] StillImageStoreDestination property not reported by camera\n";
  }

  // Re-read to confirm what the body actually kept.
  props = nullptr;
  nprops = 0;
  err = SCRSDK::GetDeviceProperties(handle_, &props, &nprops);
  if (cr_ok(err) && props) {
    for (CrInt32 i = 0; i < nprops; ++i) {
      const auto& prop = props[i];
      if (prop.GetCode() != SCRSDK::CrDeviceProperty_StillImageStoreDestination) continue;
      still_save_dest_ = static_cast<int>(prop.GetCurrentValue());
      std::cerr << "[sony-bridge] StillImageStoreDestination after="
                << still_dest_label_(prop.GetCurrentValue()) << "\n";
      break;
    }
    SCRSDK::ReleaseDeviceProperties(handle_, props);
  }

  if (still_save_dest_ == static_cast<int>(SCRSDK::CrStillImageStoreDestination_MemoryCard)) {
    std::cerr << "[sony-bridge] WARNING: stills are Camera Only — PC download will time out.\n"
              << "[sony-bridge] On the a7R V set: MENU → Network → Cnct./Remote Sht. → "
                 "Remote Shoot Setting → Still Img. Save Dest. → Dest.+Camera (or Destination Only)\n";
    return false;
  }
  return wrote || still_save_dest_ == static_cast<int>(SCRSDK::CrStillImageStoreDestination_HostPC) ||
         still_save_dest_ ==
             static_cast<int>(SCRSDK::CrStillImageStoreDestination_HostPCAndMemoryCard);
}

bool CameraSession::configure_remote_shoot_(std::string* error) {
  apply_save_info_(error);
  ensure_pc_still_destination_(error);

  SCRSDK::CrDeviceProperty* props = nullptr;
  CrInt32 nprops = 0;
  auto err = SCRSDK::GetDeviceProperties(handle_, &props, &nprops);
  if (!cr_ok(err) || !props) {
    // Live view may still work without an explicit enable on some bodies.
    return true;
  }

  for (CrInt32 i = 0; i < nprops; ++i) {
    auto& prop = props[i];
    if (prop.GetCode() != SCRSDK::CrDeviceProperty_LiveViewStatus) continue;
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
      case SCRSDK::CrDeviceProperty_StillImageStoreDestination: {
        still_save_dest_ = static_cast<int>(prop.GetCurrentValue());
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
  st.still_save_dest = still_save_dest_;
  st.still_save_dest_label =
      still_save_dest_ < 0 ? "unknown"
                           : still_dest_label_(static_cast<CrInt64u>(still_save_dest_));
  st.save_dir = save_dir_();
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
  // Give USB enumeration a bit longer — some bodies need more than 3s after plug-in.
  auto err = SCRSDK::EnumCameraObjects(&list, 10);
  if (!cr_ok(err)) {
    char buf[192];
    std::snprintf(
        buf, sizeof(buf),
        "EnumCameraObjects failed (0x%X). Check CrAdapter beside the exe, USB cable, and PC Remote mode.",
        static_cast<unsigned>(err));
    std::cerr << "[sony-bridge] " << buf << "\n";
    if (error) *error = buf;
    return false;
  }
  if (!list) {
    const char* msg =
        "No camera list returned. Confirm ILCE-7RM5 is powered on, USB-C data cable, and "
        "USB Connection Mode = PC Remote (not Mass Storage). Close Imaging Edge.";
    std::cerr << "[sony-bridge] " << msg << "\n";
    if (error) *error = msg;
    return false;
  }

  const auto count = list->GetCount();
  std::cerr << "[sony-bridge] EnumCameraObjects ok, cameras=" << count << "\n";
  if (count == 0) {
    list->Release();
    const char* msg =
        "No Sony cameras found. Set USB Connection Mode to PC Remote, close Imaging Edge / "
        "Remote Camera, replug USB, then retry connect.";
    std::cerr << "[sony-bridge] " << msg << "\n";
    if (error) *error = msg;
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

  configure_remote_shoot_(error);
  connected_ = true;
  capturing_ = false;
  message_ = "Ready";
  refresh_props_locked_();
  std::cerr << "[sony-bridge] tethered to " << model_ << " stillSaveDest="
            << (still_save_dest_ < 0 ? "unknown"
                                     : still_dest_label_(static_cast<CrInt64u>(still_save_dest_)))
            << "\n";
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

  // Re-assert PC save path + destination before each shutter.
  apply_save_info_(nullptr);
  ensure_pc_still_destination_(nullptr);
  if (still_save_dest_ == static_cast<int>(SCRSDK::CrStillImageStoreDestination_MemoryCard)) {
    if (error) {
      *error =
          "Still Img. Save Dest. is Camera Only. On the a7R V: MENU → Network → "
          "Cnct./Remote Sht. → Remote Shoot Setting → Still Img. Save Dest. → Dest.+Camera "
          "(or Destination Only), then reconnect.";
    }
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
  // ILCE-7RM5 full-res USB transfer can exceed 20s on busy hosts.
  const bool got = callback_.wait_download(90000, &path);
  lock.lock();

  capturing_ = false;
  if (!got) {
    message_ = "Ready";
    if (error) {
      *error =
          "Capture timed out waiting for download. On the a7R V set MENU → Network → "
          "Cnct./Remote Sht. → Remote Shoot Setting → Still Img. Save Dest. → Dest.+Camera "
          "(not Camera Only), then POST /connect again. Also use JPEG (not RAW-only).";
    }
    return false;
  }

  if (saved_path) *saved_path = path;

  // Prefer path-only handoff for large stills — skip loading 30–80MB into RAM when
  // the caller can read the file from disk.
  if (out && !saved_path) {
    auto bytes = read_file_bytes_as_string(path);
    if (bytes.empty()) {
      message_ = "Ready";
      if (error) *error = "Downloaded capture file was empty: " + path;
      return false;
    }
    out->assign(bytes.begin(), bytes.end());
  }

  message_ = "Ready";
  refresh_props_locked_();
  return true;
}

}  // namespace clickit
