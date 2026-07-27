#pragma once

#include "CameraRemote_SDK.h"

#include <condition_variable>
#include <mutex>
#include <string>

namespace clickit {

// Implements the modern IDeviceCallback surface used by recent CrSDK builds
// that support ILCE-7RM5.
class DeviceCallback final : public SCRSDK::IDeviceCallback {
 public:
  void OnConnected(SCRSDK::DeviceConnectionVersioin version) override;
  void OnDisconnected(CrInt32u error) override;
  void OnPropertyChanged() override;
  void OnLvPropertyChanged() override;
  void OnCompleteDownload(CrChar* filename, CrInt32u type) override;
  void OnWarning(CrInt32u warning) override;
  void OnError(CrInt32u error) override;
  void OnPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override;
  void OnLvPropertyChangedCodes(CrInt32u num, CrInt32u* codes) override;
  void OnNotifyContentsTransfer(CrInt32u notify, SCRSDK::CrContentHandle handle,
                                CrChar* filename) override;
  void OnWarningExt(CrInt32u warning, CrInt32 param1, CrInt32 param2, CrInt32 param3) override;
  void OnNotifyFTPTransferResult(CrInt32u notify, CrInt32u numOfSuccess, CrInt32u numOfFail) override;
  void OnNotifyRemoteTransferResult(CrInt32u notify, CrInt32u per, CrChar* filename) override;
  void OnNotifyRemoteTransferResult(CrInt32u notify, CrInt32u per, CrInt8u* data, CrInt64u size) override;
  void OnNotifyRemoteTransferContentsListChanged(CrInt32u notify, CrInt32u slotNumber,
                                                 CrInt32u addSize) override;
  void OnNotifyRemoteFirmwareUpdateResult(CrInt32u notify, const void* param) override;
  void OnReceivePlaybackTimeCode(CrInt32u timeCode) override;
  void OnReceivePlaybackData(CrInt8u mediaType, CrInt32 dataSize, CrInt8u* data, CrInt64 pts,
                             CrInt64 dts, CrInt32 param1, CrInt32 param2) override;
  void OnNotifyMonitorUpdated(CrInt32u type, CrInt32u frameNo) override;

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
