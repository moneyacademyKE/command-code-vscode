#!/usr/bin/env bb

(require '[clojure.test :refer [deftest is run-tests testing]])

;; This script tests the Rich Hickey "Thin Glass" UI event payload generation.
;; The CLI is the source of truth and emits discrete rendering events to the Webview.

(defn make-ui-event [type payload]
  {:jsonrpc "2.0"
   :method "webview/dispatchEvent"
   :params {:type type :payload payload}})

(defn render-message [id role content]
  (make-ui-event "RenderMessage" {:id id :role role :content content}))

(defn update-tokens [prompt completion]
  (make-ui-event "UpdateTokens" {:prompt prompt :completion completion :total (+ prompt completion)}))

(defn model-changed [model-id]
  (make-ui-event "ModelChanged" {:modelId model-id}))

(defn claim-ui-lock []
  {:type "request"
   :id "lock-req-1"
   :payload {:action "claimUiLock"}})

(deftest ui-payload-tests
  (testing "RenderMessage event generation"
    (let [evt (render-message "msg-1" "user" "Math calculation: 1+1")]
      (is (= "webview/dispatchEvent" (:method evt)))
      (is (= "RenderMessage" (-> evt :params :type)))
      (is (= "msg-1" (-> evt :params :payload :id)))
      (is (= "user" (-> evt :params :payload :role)))
      (is (= "Math calculation: 1+1" (-> evt :params :payload :content)))))

  (testing "UpdateTokens event generation"
    (let [evt (update-tokens 14800 262100)]
      (is (= "UpdateTokens" (-> evt :params :type)))
      (is (= 276900 (-> evt :params :payload :total)))))
      
  (testing "ModelChanged event generation"
    (let [evt (model-changed "Nex-N2-Pro")]
      (is (= "ModelChanged" (-> evt :params :type)))
      (is (= "Nex-N2-Pro" (-> evt :params :payload :modelId)))))
      
  (testing "CLAIM_UI_LOCK request generation"
    (let [evt (claim-ui-lock)]
      (is (= "request" (:type evt)))
      (is (= "claimUiLock" (-> evt :payload :action))))))

(let [results (run-tests)]
  (when (pos? (+ (:fail results) (:error results)))
    (System/exit 1)))

(println "Rich Hickey Quality Check: All UI Event generation tests passed.")
