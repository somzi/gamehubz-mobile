Pod::Spec.new do |s|
  s.name           = 'GameHubzBroadcast'
  s.version        = '1.0.0'
  s.summary        = 'Starts and stops the GameHubz ReplayKit broadcast and relays its status to JS.'
  s.description    = 'App-side half of the in-app broadcast; the capture itself runs in the broadcast upload extension (targets/broadcast).'
  s.license        = 'UNLICENSED'
  s.author         = 'Codesphere Solutions'
  s.homepage       = 'https://codespheresolutions.dev'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ReplayKit'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
