# Locate Sony Camera Remote SDK under vendor/sony-camera-remote-sdk/windows (or SONY_SDK_ROOT).
#
# Sets:
#   SonyCrSDK_FOUND
#   SonyCrSDK_ROOT
#   SonyCrSDK_INCLUDE_DIR   # directory containing CameraRemote_SDK.h
#   SonyCrSDK_LIBRARY       # Cr_Core import library
#   SonyCrSDK_LIBRARY_DIR   # directory containing Cr_Core.lib / Cr_Core.dll
#   SonyCrSDK_RUNTIME_DIR   # directory to copy runtime DLLs / CrAdapter from

cmake_minimum_required(VERSION 3.20)

if(DEFINED ENV{SONY_SDK_ROOT} AND NOT SONY_SDK_ROOT)
  set(SONY_SDK_ROOT "$ENV{SONY_SDK_ROOT}")
endif()

get_filename_component(_clickit_root "${CMAKE_CURRENT_LIST_DIR}/../../../.." ABSOLUTE)
set(_default_windows_sdk "${_clickit_root}/vendor/sony-camera-remote-sdk/windows")

set(SonyCrSDK_ROOT "${SONY_SDK_ROOT}" CACHE PATH "Sony Camera Remote SDK root (Windows extract)")

if(NOT SonyCrSDK_ROOT)
  set(SonyCrSDK_ROOT "${_default_windows_sdk}")
endif()

# Common layouts:
#   <root>/app/CRSDK/CameraRemote_SDK.h + <root>/external/crsdk/Cr_Core.lib
#   <root>/CRSDK/CameraRemote_SDK.h
#   <root>/include/CRSDK/CameraRemote_SDK.h
#   <root>/include/CameraRemote_SDK.h
#   nested CrSDK_v* folder under windows/
file(GLOB_RECURSE _sdk_headers
  LIST_DIRECTORIES FALSE
  "${SonyCrSDK_ROOT}/CameraRemote_SDK.h"
  "${SonyCrSDK_ROOT}/*/CameraRemote_SDK.h"
  "${SonyCrSDK_ROOT}/*/*/CameraRemote_SDK.h"
  "${SonyCrSDK_ROOT}/*/*/*/CameraRemote_SDK.h"
  "${SonyCrSDK_ROOT}/*/*/*/*/CameraRemote_SDK.h"
)

set(_header "")
foreach(_cand IN LISTS _sdk_headers)
  if(_cand MATCHES "CameraRemote_SDK\\.h$")
    set(_header "${_cand}")
    break()
  endif()
endforeach()

if(NOT _header)
  set(SonyCrSDK_FOUND FALSE)
  if(SonyCrSDK_FIND_REQUIRED)
    message(FATAL_ERROR
      "Sony Camera Remote SDK headers not found under:\n"
      "  ${SonyCrSDK_ROOT}\n"
      "Extract the Windows x64 SDK into vendor/sony-camera-remote-sdk/windows "
      "or set SONY_SDK_ROOT / -DSonyCrSDK_ROOT=...")
  endif()
  return()
endif()

get_filename_component(SonyCrSDK_INCLUDE_DIR "${_header}" DIRECTORY)

file(GLOB_RECURSE _sdk_libs
  LIST_DIRECTORIES FALSE
  "${SonyCrSDK_ROOT}/Cr_Core.lib"
  "${SonyCrSDK_ROOT}/*/Cr_Core.lib"
  "${SonyCrSDK_ROOT}/*/*/Cr_Core.lib"
  "${SonyCrSDK_ROOT}/*/*/*/Cr_Core.lib"
  "${SonyCrSDK_ROOT}/*/*/*/*/Cr_Core.lib"
)

if(NOT _sdk_libs)
  file(GLOB_RECURSE _sdk_libs
    LIST_DIRECTORIES FALSE
    "${SonyCrSDK_ROOT}/libCr_Core.lib"
    "${SonyCrSDK_ROOT}/*/libCr_Core.lib"
    "${SonyCrSDK_ROOT}/*/*/libCr_Core.lib"
  )
endif()

list(LENGTH _sdk_libs _lib_count)
if(_lib_count EQUAL 0)
  set(SonyCrSDK_FOUND FALSE)
  if(SonyCrSDK_FIND_REQUIRED)
    message(FATAL_ERROR "Cr_Core.lib not found under ${SonyCrSDK_ROOT}")
  endif()
  return()
endif()

list(GET _sdk_libs 0 SonyCrSDK_LIBRARY)
get_filename_component(SonyCrSDK_LIBRARY_DIR "${SonyCrSDK_LIBRARY}" DIRECTORY)
set(SonyCrSDK_RUNTIME_DIR "${SonyCrSDK_LIBRARY_DIR}")

# Prefer a discovered root that contains both app/ and external/ when present.
get_filename_component(_maybe_external "${SonyCrSDK_LIBRARY_DIR}/.." ABSOLUTE)
get_filename_component(_maybe_root "${_maybe_external}/.." ABSOLUTE)
if(EXISTS "${_maybe_root}/app/CRSDK" OR EXISTS "${_maybe_root}/external/crsdk")
  set(SonyCrSDK_ROOT "${_maybe_root}" CACHE PATH "Sony Camera Remote SDK root (Windows extract)" FORCE)
endif()

include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(SonyCrSDK
  REQUIRED_VARS SonyCrSDK_INCLUDE_DIR SonyCrSDK_LIBRARY SonyCrSDK_LIBRARY_DIR
)

if(SonyCrSDK_FOUND)
  message(STATUS "SonyCrSDK include: ${SonyCrSDK_INCLUDE_DIR}")
  message(STATUS "SonyCrSDK library: ${SonyCrSDK_LIBRARY}")
  message(STATUS "SonyCrSDK runtime: ${SonyCrSDK_RUNTIME_DIR}")
endif()
