(require '[clojure.java.shell :refer [sh]])
(require '[clojure.string :as str])

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

(defn run-test []
  (println "=== Starting CMD Lite Visual UI Automation Test ===")

  ;; Step 1: Activate Antigravity IDE and focus Chat View
  (run-applescript
   "tell application \"Antigravity IDE\" to activate
    delay 2
    tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Search for Chat View focus command
        keystroke \"View: Focus on Chat View\"
        delay 1
        key code 36 -- Press Enter
        delay 2
    end tell")

  ;; Step 2: Start a new Command Code session
  (run-applescript
   "tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Trigger session start command
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 5
    end tell")
  (capture-screenshot "scripts/visual-1-start.png")

  ;; Step 3: Send a long query to trigger streaming and scrolling
  (run-applescript
   "tell application \"System Events\"
        -- Focus chat view input again to be sure
        keystroke \"p\" using {command down, shift down}
        delay 1
        keystroke \"View: Focus on Chat View\"
        delay 1
        key code 36 -- Press Enter
        delay 1
        
        -- Type a prompt that produces long output to force scrolling
        keystroke \"Write a very long poem about gravity and Clojure containing at least 4 stanzas.\"
        delay 1
        key code 36 -- Press Enter to submit
        delay 15 -- Wait for streaming logs to fill viewport and auto-scroll
    end tell")
  (capture-screenshot "scripts/visual-2-streaming.png")

  ;; Step 4: Test resilient keyboard scrolling (PageUp to scroll away from bottom)
  (run-applescript
   "tell application \"System Events\"
        -- Press PageUp key multiple times to scroll up
        key code 116 -- PageUp
        delay 0.5
        key code 116 -- PageUp
        delay 0.5
        key code 116 -- PageUp
        delay 1
    end tell")
  (capture-screenshot "scripts/visual-3-scrolled-up.png")

  ;; Step 5: Test Session Reset (triggering start command again should clear everything)
  (run-applescript
   "tell application \"System Events\"
        -- Open command palette
        keystroke \"p\" using {command down, shift down}
        delay 1
        -- Restart/Reset session
        keystroke \"Command Code: Start Command Code Session\"
        delay 1
        key code 36 -- Press Enter
        delay 3
    end tell")
  (capture-screenshot "scripts/visual-4-reset-complete.png")

  (println "=== CMD Lite Visual UI Automation Test Complete ==="))

(run-test)
