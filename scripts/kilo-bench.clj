#!/usr/bin/env bb

;; Rich Hickey style parallel agent simulation
;; Decomplecting execution from state mutation via futures and immutable values.

(require '[babashka.fs :as fs])

(def workspace-dir "mock-workspace")
(def taste-file (str workspace-dir "/taste.md"))
(def merge-queue (atom []))

;; Setup mock environment
(defn setup! []
  (println "Setting up mock workspace...")
  (fs/create-dirs workspace-dir)
  (spit taste-file "Taste: Prefer pure functions. Avoid mutation."))

(defn cleanup! []
  (println "Cleaning up...")
  (fs/delete-tree workspace-dir))

;; Simulated Agent Function
(defn run-agent [agent-name task]
  (let [taste-content (slurp taste-file)
        start-time (System/currentTimeMillis)]
    (println (format "[%s] Started task: %s" agent-name task))
    
    ;; Simulate work (thinking, generating code)
    (Thread/sleep (+ 1000 (rand-int 1500))) 
    
    (let [end-time (System/currentTimeMillis)
          duration (- end-time start-time)
          ;; Agent produces a "proposal" instead of mutating directly
          proposal {:agent agent-name
                    :task task
                    :duration duration
                    :proposal-data (format "Proposed implementation for %s adhering to [%s]" task taste-content)}]
      (println (format "[%s] Completed in %d ms" agent-name duration))
      proposal)))

;; Coordinator
(defn run-parallel-agents []
  (setup!)
  (println "\n--- Starting Parallel Agents ---")
  
  (let [tasks [{:name "Agent-Impl" :task "Implement core logic"}
               {:name "Agent-Test" :task "Write unit tests"}
               {:name "Agent-Doc"  :task "Write documentation"}]
        
        ;; Launch agents in parallel using futures
        ;; Each agent reads immutable state (the taste-file)
        futures (doall (map (fn [{:keys [name task]}]
                              (future (run-agent name task)))
                            tasks))
        
        ;; Wait for all agents to produce their proposals
        results (map deref futures)]
    
    (println "\n--- All Agents Completed ---")
    (println "Merging proposals into queue...\n")
    
    (doseq [res results]
      (swap! merge-queue conj res)
      (println (format "Merged proposal from %s: %s" (:agent res) (:proposal-data res))))
    
    (println "\nSuccess: State remains consistent. Concurrency decomplected from mutation.")
    (cleanup!)))

(run-parallel-agents)
