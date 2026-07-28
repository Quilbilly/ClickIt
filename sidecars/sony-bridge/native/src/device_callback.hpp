#pragma once

// CameraRemote_SDK.h only forward-declares IDeviceCallback; include the full definition.
#include "CameraRemote_SDK.h"
#if defined(__has_include)
#  if __has_include("IDeviceCallback.h")
#    include "IDeviceCallback.h"
#  elif __has_include("CRSDK/IDeviceCallback.h")
#    include "CRSDK/IDeviceCallback.h"
#  endif
#else
#  include "IDeviceCallback.h"
#endif

#include <condition_variable>
#include <mutex>
#include <string>

namespace clickit {

// Callback surface aligned with CrSDK builds that support ILCE-7RM5
// (same set used by common mid/modern sample wrappers).
class DeviceCallback final : public SCRSDK::IDeviceCallback {
 public:
  void OnConnected(SCRSDK::DeviceConnectionVersioin version) override;
  void OnDisconnected(CrInt32u error) override;
  void OnPropertyChanged() override;
  void OnPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override;
  void OnLvPropertyChanged() override;
  void OnLvPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override;
  void OnCompleteDownload(CrChar* filename, CrInt32u type) override;
  void OnNotifyContentsTransfer(CrInt32u notify, SCRSDK::CrContentHandle handle,
                                CrChar* filename) override;
  void OnWarning(CrInt32u warning) override;
  void OnError(CrInt32u error) override;

  bool wait_connected(int timeout_ms);
  bool wait_download(int timeout_ms, std::string* out_path);
  void begin_download_wait();
  void reset_connection_state();

  bool connected() const;
  CrInt32u last_error() const;

 private:
  mutable std::mutex mu_;
  std::condition_variable cv_;
  bool connected_ = false;
  bool connection_settled_ = false;
  CrInt32u last_error_ = 0;

  bool download_waiting_ = false;
  bool download_done_ = false;
  std::string last_download_path_;
};

}  // namespace clickit
