#!/usr/bin/env bb

(let [user-agent (System/getenv "npm_config_user_agent")]
  (when (and user-agent (not (clojure.string/includes? (clojure.string/lower-case user-agent) "pnpm")))
    (println "=========================================================")
    (println "🚫 ERROR: This project is configured to use pnpm!")
    (println "Please run 'pnpm install' instead of npm/yarn/bun.")
    (println "=========================================================")
    (System/exit 1)))
