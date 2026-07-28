cmake_minimum_required(VERSION 3.20)
project(clickit_sony_bridge LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "clickit-sony-bridge is Windows x64 only for now.")
endif()

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreadedDLL")

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_LIST_DIR}/cmake")
find_package(SonyCrSDK REQUIRED)

add_executable(clickit-sony-bridge
  src/main.cpp
  src/camera_session.cpp
  src/device_callback.cpp
  src/http_server.cpp
)

target_include_directories(clickit-sony-bridge PRIVATE
  "${CMAKE_CURRENT_LIST_DIR}/src"
  "${SonyCrSDK_INCLUDE_DIR}"
  "${SonyCrSDK_INCLUDE_DIR}/.."
)

target_link_libraries(clickit-sony-bridge PRIVATE
  "${SonyCrSDK_LIBRARY}"
  ws2_32
  delayimp
)

target_compile_definitions(clickit-sony-bridge PRIVATE
  NOMINMAX
  WIN32_LEAN_AND_MEAN
  _CRT_SECURE_NO_WARNINGS
  # Sony CrSDK Windows headers typedef CrChar to wchar_t when UNICODE is set.
  # Without this, model names become "I" and SetSaveInfo paths are wrong, so
  # still downloads never land on disk.
  UNICODE
  _UNICODE
)

if(MSVC)
  target_compile_options(clickit-sony-bridge PRIVATE /W4 /EHsc /utf-8)
  # Delay-load so main() can LoadLibraryEx the sibling Cr_Core.dll first.
  target_link_options(clickit-sony-bridge PRIVATE "/DELAYLOAD:Cr_Core.dll")
endif()

# Runtime: Cr_Core.dll + CrAdapter must sit next to the executable.
set(_dist_dir "${CMAKE_CURRENT_LIST_DIR}/dist")
set_target_properties(clickit-sony-bridge PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${_dist_dir}"
  RUNTIME_OUTPUT_DIRECTORY_DEBUG "${_dist_dir}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${_dist_dir}"
  RUNTIME_OUTPUT_DIRECTORY_RELWITHDEBINFO "${_dist_dir}"
  RUNTIME_OUTPUT_DIRECTORY_MINSIZEREL "${_dist_dir}"
)

add_custom_command(TARGET clickit-sony-bridge POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E make_directory "${_dist_dir}"
  COMMAND ${CMAKE_COMMAND} -E copy_directory
          "${SonyCrSDK_RUNTIME_DIR}"
          "${_dist_dir}"
  COMMENT "Copying Sony CrSDK runtime directory beside clickit-sony-bridge.exe"
)

if(SonyCrSDK_CORE_DLL)
  add_custom_command(TARGET clickit-sony-bridge POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
            "${SonyCrSDK_CORE_DLL}"
            "${_dist_dir}/Cr_Core.dll"
    COMMENT "Ensuring Cr_Core.dll is beside clickit-sony-bridge.exe"
  )
endif()

if(SonyCrSDK_ADAPTER_DIR)
  add_custom_command(TARGET clickit-sony-bridge POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E remove_directory "${_dist_dir}/CrAdapter"
    COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${SonyCrSDK_ADAPTER_DIR}"
            "${_dist_dir}/CrAdapter"
    COMMENT "Ensuring CrAdapter/ is beside clickit-sony-bridge.exe"
  )
endif()

# Prefer DLLs from the exe directory over any Sony/Imaging Edge copies on PATH.
add_custom_command(TARGET clickit-sony-bridge POST_BUILD
  COMMAND ${CMAKE_COMMAND} -E touch
          "${_dist_dir}/clickit-sony-bridge.exe.local"
  COMMENT "Enabling .exe.local DLL redirection for Cr_Core.dll"
)

install(TARGETS clickit-sony-bridge RUNTIME DESTINATION bin)
