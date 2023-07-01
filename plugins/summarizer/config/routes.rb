# frozen_string_literal: true

Summarizer::Engine.routes.draw do
  get "/examples" => "examples#index"
  # define routes here
end

Discourse::Application.routes.draw { mount ::Summarizer::Engine, at: "summarizer" }
