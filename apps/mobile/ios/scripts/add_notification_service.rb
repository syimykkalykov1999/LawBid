# Adds the NotificationService (Communication Notifications) extension to
# Runner.xcodeproj, as described in docs/runbooks/IOS_CHAT_NOTIFICATIONS.md.
# Idempotent: running it twice changes nothing.
#
#   R=/opt/homebrew/Cellar/cocoapods/<ver>/libexec
#   GEM_HOME=$R GEM_PATH=$R:$(ruby -e 'print Gem.default_dir') \
#     ruby apps/mobile/ios/scripts/add_notification_service.rb
require 'xcodeproj'

IOS = File.expand_path('..', __dir__)
project = Xcodeproj::Project.open(File.join(IOS, 'Runner.xcodeproj'))
runner = project.targets.find { |t| t.name == 'Runner' } or abort 'no Runner'

NAME = 'NotificationService'
ext = project.targets.find { |t| t.name == NAME }
if ext.nil?
  ext = project.new_target(:app_extension, NAME, :ios, '15.5', nil, :swift)
  # new_target creates Debug/Release only; mirror the project's configurations.
  ext.build_configuration_list.build_configurations.clear
  project.build_configurations.each do |pc|
    c = project.new(Xcodeproj::Project::Object::XCBuildConfiguration)
    c.name = pc.name
    c.build_settings = {}
    ext.build_configuration_list.build_configurations << c
  end
end

group = project.main_group.children.find { |g| g.display_name == NAME } ||
        project.main_group.new_group(NAME, NAME)
swift = group.files.find { |f| f.path == 'NotificationService.swift' } ||
        group.new_file('NotificationService.swift')
%w[Info.plist NotificationService.entitlements].each do |p|
  group.new_file(p) unless group.files.any? { |f| f.path == p }
end
ext.source_build_phase.add_file_reference(swift, true) unless
  ext.source_build_phase.files_references.include?(swift)

common = project.files.find { |f| f.path == 'Flutter/Common.xcconfig' || (f.path == 'Common.xcconfig' && f.parent.display_name == 'Flutter') } ||
         project.main_group['Flutter'].new_file('Common.xcconfig')

runner_cfg = runner.build_configuration_list.build_configurations.to_h { |c| [c.name, c] }
ext.build_configuration_list.build_configurations.each do |c|
  rc = runner_cfg.fetch(c.name)
  app_id = rc.build_settings['PRODUCT_BUNDLE_IDENTIFIER']
  c.base_configuration_reference = common
  c.build_settings.merge!(
    'PRODUCT_NAME' => '$(TARGET_NAME)',
    'PRODUCT_BUNDLE_IDENTIFIER' => "#{app_id}.#{NAME}",
    'APP_GROUP_ID' => "group.#{app_id}",
    'INFOPLIST_FILE' => "#{NAME}/Info.plist",
    'GENERATE_INFOPLIST_FILE' => 'NO',
    'CODE_SIGN_ENTITLEMENTS' => "#{NAME}/#{NAME}.entitlements",
    'CODE_SIGN_STYLE' => 'Automatic',
    'DEVELOPMENT_TEAM' => rc.build_settings['DEVELOPMENT_TEAM'],
    'IPHONEOS_DEPLOYMENT_TARGET' => '15.5',
    'SWIFT_VERSION' => '5.0',
    'TARGETED_DEVICE_FAMILY' => '1,2',
    'SKIP_INSTALL' => 'YES',
    'LD_RUNPATH_SEARCH_PATHS' => ['$(inherited)', '@executable_path/Frameworks',
                                  '@executable_path/../../Frameworks'],
    'SWIFT_OPTIMIZATION_LEVEL' => c.name.start_with?('Debug') ? '-Onone' : '-O',
    'DEBUG_INFORMATION_FORMAT' => 'dwarf-with-dsym',
  )
  rc.build_settings['APP_GROUP_ID'] = "group.#{app_id}"
end

runner.add_dependency(ext) unless runner.dependencies.any? { |d| d.target == ext }

embed = runner.copy_files_build_phases.find { |p| p.symbol_dst_subfolder_spec == :plug_ins }
unless embed
  embed = runner.new_copy_files_build_phase('Embed Foundation Extensions')
  embed.symbol_dst_subfolder_spec = :plug_ins
end
unless embed.files_references.include?(ext.product_reference)
  bf = embed.add_file_reference(ext.product_reference, true)
  bf.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end
# Flutter's cycle: the embed phase must run before "Thin Binary".
thin = runner.build_phases.find { |p| p.respond_to?(:name) && p.name == 'Thin Binary' }
if thin
  runner.build_phases.delete(embed)
  runner.build_phases.insert(runner.build_phases.index(thin), embed)
end

project.save
puts "#{NAME}: #{ext.build_configuration_list.build_configurations.map(&:name).join(', ')}"
