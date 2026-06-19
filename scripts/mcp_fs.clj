#!/usr/bin/env bb
(require '[cheshire.core :as json])
(require '[babashka.fs :as fs])

(let [input (json/parse-stream *in* true)
      action (:action input)
      file-path (:path input)]
  (try
    (case action
      "readFile"
      (if (fs/exists? file-path)
        (let [content (slurp file-path)]
          (println (json/generate-string {:success true :content content})))
        (println (json/generate-string {:success false :error (str "File not found: " file-path)})))

      "writeFile"
      (let [content (:content input)]
        (when-not (fs/exists? (fs/parent file-path))
          (fs/create-dirs (fs/parent file-path)))
        (spit file-path content)
        (println (json/generate-string {:success true})))

      "listFiles"
      (if (fs/directory? file-path)
        (let [files (map str (fs/list-dir file-path))]
          (println (json/generate-string {:success true :files files})))
        (println (json/generate-string {:success false :error (str "Not a directory: " file-path)})))
      
      (println (json/generate-string {:success false :error "Unknown action"})))
    (catch Exception e
      (println (json/generate-string {:success false :error (.getMessage e)})))))
