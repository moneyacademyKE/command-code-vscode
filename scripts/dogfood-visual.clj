(require '[clojure.java.shell :refer [sh]])
(require '[clojure.string :as str])
(require '[cheshire.core :as json])
(require '[babashka.http-client :as http])

(defn run-applescript [script]
  (println "Executing AppleScript block...")
  (let [res (sh "osascript" "-e" script)]
    (if (zero? (:exit res))
      (println "Success:" (:out res))
      (do
        (println "Error:" (:err res))
        (throw (Exception. (:err res)))))))

(defn capture-screenshot [filename]
  (println "Capturing screenshot:" filename)
  (let [temp-filename-2 (str/replace filename #"\.png$" "-2.png")
        res (sh "screencapture" "-x" "-o" filename temp-filename-2)]
    (if (zero? (:exit res))
      (do
        (println "Screenshot saved successfully.")
        (let [file2 (java.io.File. temp-filename-2)]
          (when (.exists file2)
            (println "Second screen detected. Swapping screen 2 to primary visual check.")
            (sh "mv" temp-filename-2 filename))))
      (println "Failed to save screenshot:" (:err res)))))

(defn wait-for-files [paths max-seconds]
  (println "Waiting for files to be generated:" paths)
  (loop [elapsed 0]
    (let [all-exist? (every? #(let [f (java.io.File. %)]
                                (and (.exists f) (> (.length f) 0)))
                             paths)]
      (cond
        all-exist? (do (println "Target files generated successfully after" elapsed "seconds!") true)
        (>= elapsed max-seconds) (do (println "Timeout waiting for target files.") false)
        :else (do
                (Thread/sleep 1000)
                (recur (inc elapsed)))))))

(defn get-local-cli-version []
  (let [path (str (System/getProperty "user.home")
                  "/Library/Application Support/Antigravity IDE/User/globalStorage/moneyacademyke.cmd-lite/cli/package.json")
        f (java.io.File. path)]
    (if (.exists f)
      (try
        (let [pkg (json/parse-string (slurp f) true)]
          (:version pkg))
        (catch Exception _ nil))
      nil)))

(defn get-latest-registry-version []
  (try
    (let [res (http/get "https://registry.npmjs.org/command-code/latest")
          body (json/parse-string (:body res) true)]
      (:version body))
    (catch Exception e
      (println "Failed to fetch latest registry version:" (.getMessage e))
      nil)))

(defn trigger-cli-update []
  (println "Triggering CLI update via command palette...")
  (run-applescript
   "tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1.5
        -- Trigger CLI Update command
        keystroke \"Command Code: Update Command Code CLI\"
        delay 1.5
        key code 36 -- Press Enter
        delay 2
    end tell"))

(defn wait-for-cli-update [target-version max-seconds]
  (println "Waiting for local CLI to update to version" target-version)
  (loop [elapsed 0]
    (let [local-ver (get-local-cli-version)]
      (cond
        (= local-ver target-version)
        (do
          (println "CLI updated successfully to" local-ver "after" elapsed "seconds!")
          true)
        
        (>= elapsed max-seconds)
        (do
          (println "Timeout waiting for CLI update. Current local version:" local-ver)
          false)
        
        :else
        (do
          (Thread/sleep 1000)
          (recur (inc elapsed)))))))

(defn cleanup-target-files []
  (println "Cleaning up target files for a fresh dogfooding run...")
  (sh "git" "checkout" "src/util/util.ts")
  (sh "rm" "-rf" "src/tests/"))

(defn run-dogfood []
  (println "=== Starting CMD Lite Visual UI Dogfooding Run ===")

  ;; Step 1: Activate Antigravity IDE and focus it
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    tell application \"System Events\"
        set frontmost of process \"Electron\" to true
    end tell
    delay 2
    tell application \"System Events\"
        -- Press Cmd+Option+W to close all editors
        keystroke \"w\" using {command down, option down}
        delay 2
    end tell")

  (cleanup-target-files)

  ;; Check for CLI update and trigger if available
  (let [latest-ver (get-latest-registry-version)
        local-ver (get-local-cli-version)]
    (println "Registry CLI version:" latest-ver "Local CLI version:" local-ver)
    (if (and latest-ver (not= local-ver latest-ver))
      (do
        (trigger-cli-update)
        (wait-for-cli-update latest-ver 45))
      (println "CLI is already at the latest version or registry lookup failed.")))

  ;; Start/Restart session to clean state
  (run-applescript
   "tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Start/Restart session to clean state
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 6 -- Wait for session initialization
    end tell")

  ;; Step 2: Focus the webview chat input via our focus command
  (run-applescript
   "tell application \"System Events\"
         -- Open command palette
         keystroke \"p\" using {command down, shift down}
         delay 1
         -- Trigger Focus Chat Input command
         keystroke \"Command Code: Focus Chat Input\"
         delay 1
         key code 36 -- Press Enter
         delay 2 -- Wait for focus transition
         
         -- Type the coding prompt
         keystroke \"In src/util/util.ts, implement three utility functions: 1. parseJsonLinesDefensive(jsonl: string): Record<string, unknown>[] that parses a JSON Lines string defensively, skipping invalid JSON lines, empty lines, arrays, and primitives. 2. formatJsonLines(records: Record<string, unknown>[]): string that serializes an array of records to a JSON Lines string. If a record is empty or not an object, skip it. 3. filterJsonLines(jsonl: string, predicate: (record: Record<string, unknown>) => boolean): string that parses JSON Lines, filters them with the predicate, and formats them back as JSON Lines. Do NOT use the type 'any' anywhere. Add comprehensive unit tests in a new test file src/tests/jsonl.test.ts verifying all three functions under edge cases.\"
         delay 2
         key code 36 -- Press Enter to submit
     end tell")

  (println "Prompt submitted to chat webview. Waiting for CMD Lite to process the coding task...")
  (wait-for-files ["src/tests/jsonl.test.ts"] 120)

  ;; Step 3: Run verification tests and capture screenshot
  (println "Running workspace tests...")
  (let [test-res (sh "pnpm" "test")]
    (println (:out test-res))
    (when (not (zero? (:exit test-res)))
      (println "Warning: Some tests failed:" (:err test-res))))

  (capture-screenshot "scripts/dogfood-visual.png")
  (println "=== CMD Lite Visual UI Dogfooding Run Complete ==="))

(run-dogfood)
