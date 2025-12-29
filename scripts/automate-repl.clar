;; Clarinet REPL script to automate contract interaction for memestack-contracts

;; 1. Create a new launch
(print "Creating launch...")
(define-constant launch-id (unwrap-panic (create-launch "MemeCoin" "MEME" u"https://memecoin.io" u1000000 u1000 u10000 u100000 u100 u1000 u200)))

;; 2. Buy tokens in the launch
(print "Buying tokens...")
(buy-tokens launch-id u1000)

;; 3. Finalize the launch
(print "Finalizing launch...")
(finalize-launch launch-id)

;; 4. Claim tokens after successful launch
(print "Claiming tokens...")
(claim-tokens launch-id)

;; 5. Request refund after failed launch (will only succeed if launch failed)
(print "Requesting refund...")
(request-refund launch-id)

;; 6. Read launch and user info from contract
(print "Reading launch info...")
(get-launch launch-id)
(get-user-contribution launch-id 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)
(get-platform-info)
(get-launch-stats launch-id)

;; 7. Test memecoin-token SIP-010 transfer, mint, burn
(print "Minting tokens...")
(mint u1000 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5)
(print "Transferring tokens...")
(transfer u100 'ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG none)
(print "Burning tokens...")
(burn u100 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG)

;; 8. Register a deployed token in token-factory
(print "Registering deployed token...")
(register-token launch-id 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.memecoin-token "MemeCoin" "MEME" u1000000 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM)

;; 9. Read deployed token info from token-factory
(print "Reading deployed token info...")
(get-deployed-token launch-id)
(get-token-info 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.memecoin-token)
(get-launch-token-details launch-id)
