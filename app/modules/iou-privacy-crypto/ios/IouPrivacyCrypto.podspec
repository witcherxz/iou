Pod::Spec.new do |s|
  s.name           = 'IouPrivacyCrypto'
  s.version        = '1.0.0'
  s.summary        = 'Native PIN derivation for IoU'
  s.description    = 'Runs PBKDF2-HMAC-SHA256 outside the JavaScript thread.'
  s.author         = 'IoU'
  s.homepage       = 'https://github.com/witcherxz/iou'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :git => 'https://github.com/witcherxz/iou.git' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,mm,swift}'
end
