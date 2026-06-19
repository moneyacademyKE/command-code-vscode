(ns install-hooks
  (:require [babashka.fs :as fs]
            [clojure.java.io :as io]))

(def hook-file ".git/hooks/pre-commit")

(def hook-content "#!/bin/sh
# Rich Hickey Certified Pre-Commit Hook
echo \"[Pre-Commit] Running Rich Hickey Quality Checks...\"

bb lint
if [ $? -ne 0 ]; then
  echo \"[Pre-Commit] Lint failed. Aborting commit.\"
  exit 1
fi

bb test
if [ $? -ne 0 ]; then
  echo \"[Pre-Commit] Tests failed. Aborting commit.\"
  exit 1
fi

echo \"[Pre-Commit] All checks passed.\"
exit 0
")

(defn -main []
  (if (fs/exists? ".git")
    (do
      (fs/create-dirs ".git/hooks")
      (spit hook-file hook-content)
      (fs/set-posix-file-permissions hook-file "rwxr-xr-x")
      (println "✅ Pre-commit hook installed successfully at" hook-file))
    (println "❌ Error: .git directory not found. Please run this script from the repository root.")))

(when (= *file* (System/getProperty "babashka.file"))
  (-main))
