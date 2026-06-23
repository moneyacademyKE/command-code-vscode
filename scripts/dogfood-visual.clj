(require '[clojure.java.shell :refer [sh]])

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
  (let [res (sh "screencapture" "-x" "-o" filename)]
    (if (zero? (:exit res))
      (println "Screenshot saved successfully.")
      (println "Failed to save screenshot:" (:err res)))))

(defn run-dogfood []
  (println "=== Starting CMD Lite Visual UI Dogfooding Run ===")

  ;; Step 1: Activate Antigravity IDE and start/restart session
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    delay 2
    tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Start/Restart session to clean state
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 4 -- Wait for session initialization
    end tell")

  ;; Step 2: Focus the webview chat input via our new focus command
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
        keystroke \"In src/util/util.ts, add a utility function truncateString(str: string, maxLength: number): string that truncates a string and appends '...' if it exceeds maxLength. Add tests for it in a new test file src/tests/util.test.ts.\"
        delay 2
        key code 36 -- Press Enter to submit
    end tell")

  (println "Prompt submitted to chat webview. Waiting for CMD Lite to process the coding task...")
  (Thread/sleep 45000) ;; Wait 45 seconds for CMD Lite agent to complete execution and write files

  ;; Step 3: Capture visual verification screenshot
  (capture-screenshot "scripts/dogfood-visual.png")
  (println "=== CMD Lite Visual UI Dogfooding Run Complete ==="))

(run-dogfood)
