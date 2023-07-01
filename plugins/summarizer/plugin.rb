# frozen_string_literal: true

# name: summarizer
# about: A plugin that automatically summarizes all the posts within a topic and writes it in either the first post if that's a wiki-post, or into a second post that gets updated.
# version: 0.0.1
# authors: derjogi
# url: TODO
# required_version: 2.7.0

enabled_site_setting :summarizer_enabled

module ::Summarizer
  PLUGIN_NAME = "summarizer"
end

require_relative "lib/summarizer/engine"

after_initialize do
  # Code which should run after Rails has finished booting
end
