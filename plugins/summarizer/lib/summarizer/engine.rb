# frozen_string_literal: true

module ::Summarizer
  class Engine < ::Rails::Engine
    engine_name PLUGIN_NAME
    isolate_namespace Summarizer
    config.autoload_paths << File.join(config.root, "lib")
  end
end
