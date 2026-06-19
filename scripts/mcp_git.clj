#!/usr/bin/env bb
(require '[cheshire.core :as json])
(require '[babashka.process :refer [sh]])

(let [input (json/parse-stream *in* true)
      cwd (:cwd input ".")]
  (try
    (let [branch-res (sh ["git" "branch" "--show-current"] {:dir cwd :err :out})
          status-res (sh ["git" "status" "-s"] {:dir cwd :err :out})
          log-res (sh ["git" "log" "-n" "5" "--oneline"] {:dir cwd :err :out})]
      (if (not= 0 (:exit branch-res))
        (println (json/generate-string {:success false :error (:out branch-res)}))
        (let [branch (clojure.string/trim (:out branch-res))
              status (clojure.string/trim (:out status-res))
              log (clojure.string/trim (:out log-res))]
          (println (json/generate-string {:success true :branch branch :status status :log log})))))
    (catch Exception e
      (println (json/generate-string {:success false :error (.getMessage e)})))))
