;; Memestack Launchpad - Fair Launch Protocol
;; The premier memecoin launchpad on Stacks
;; Version 2.0 - Security Hardened & Gas Optimized

;; Constants
(define-constant contract-owner tx-sender)
(define-constant platform-name "memestack")
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-already-launched (err u102))
(define-constant err-launch-not-active (err u103))
(define-constant err-insufficient-amount (err u104))
(define-constant err-max-supply-reached (err u105))
(define-constant err-min-purchase (err u106))
(define-constant err-max-purchase (err u107))
(define-constant err-launch-ended (err u108))
(define-constant err-launch-not-ended (err u109))
(define-constant err-unauthorized (err u110))
(define-constant err-soft-cap-not-met (err u111))
(define-constant err-already-claimed (err u112))
(define-constant err-no-refund (err u113))
(define-constant err-calculation-overflow (err u114))
(define-constant err-contract-paused (err u115))

;; Platform fee (2% in basis points)
(define-constant platform-fee-bps u200)
(define-constant bps-base u10000)

;; Limits
(define-constant max-hard-cap u10000000000000) ;; 10M STX
(define-constant min-soft-cap u1000000) ;; 1 STX
(define-constant max-stx-for-calculation u340282366920938463463374607) ;; Max safe for *1000000

;; Data Variables
(define-data-var launch-counter uint u0)
(define-data-var platform-fee-address principal contract-owner)
(define-data-var token-factory-contract (optional principal) none)
(define-data-var contract-paused bool false)

;; Data Maps
(define-map launches
  uint
  {
    creator: principal,
    token-name: (string-ascii 32),
    token-symbol: (string-ascii 10),
    token-uri: (string-utf8 256),
    total-supply: uint,
    price-per-token: uint,
    soft-cap: uint,
    hard-cap: uint,
    min-purchase: uint,
    max-purchase: uint,
    start-block: uint,
    end-block: uint,
    total-raised: uint,
    tokens-sold: uint,
    is-finalized: bool,
    is-successful: bool,
    token-contract: (optional principal)
  }
)

(define-map user-contributions
  {launch-id: uint, user: principal}
  {
    stx-contributed: uint,
    tokens-allocated: uint,
    claimed: bool
  }
)

;; Read-only functions
(define-read-only (get-platform-info)
  {
    name: platform-name,
    version: "2.0",
    description: "Fair launch protocol for memecoins on Stacks"
  }
)

(define-read-only (get-launch (launch-id uint))
  (map-get? launches launch-id)
)

(define-read-only (get-user-contribution (launch-id uint) (user principal))
  (map-get? user-contributions {launch-id: launch-id, user: user})
)

(define-read-only (get-current-launch-id)
  (var-get launch-counter)
)

(define-read-only (is-launch-active (launch-id uint))
  (match (map-get? launches launch-id)
    launch
    (and
      (>= block-height (get start-block launch))
      (<= block-height (get end-block launch))
      (not (get is-finalized launch))
      (< (get total-raised launch) (get hard-cap launch))
    )
    false
  )
)

(define-read-only (calculate-tokens-for-stx (launch-id uint) (stx-amount uint))
  (match (map-get? launches launch-id)
    launch
    (let
      (
        (price (get price-per-token launch))
      )
      ;; Protect against overflow in multiplication
      (asserts! (<= stx-amount max-stx-for-calculation) err-calculation-overflow)
      (ok (/ (* stx-amount u1000000) price))
    )
    err-not-found
  )
)

(define-read-only (get-launch-stats (launch-id uint))
  (match (map-get? launches launch-id)
    launch
    (ok {
      total-raised: (get total-raised launch),
      tokens-sold: (get tokens-sold launch),
      progress-bps: (if (> (get hard-cap launch) u0)
        (/ (* (get total-raised launch) u10000) (get hard-cap launch))
        u0
      ),
      is-active: (is-launch-active launch-id),
      is-finalized: (get is-finalized launch),
      is-successful: (get is-successful launch)
    })
    err-not-found
  )
)

;; Public functions

;; Create a new token launch
(define-public (create-launch
    (token-name (string-ascii 32))
    (token-symbol (string-ascii 10))
    (token-uri (string-utf8 256))
    (total-supply uint)
    (price-per-token uint)
    (soft-cap uint)
    (hard-cap uint)
    (min-purchase uint)
    (max-purchase uint)
    (duration-blocks uint)
  )
  (let
    (
      (launch-id (+ (var-get launch-counter) u1))
      (start-block (+ block-height u10))
      (end-block (+ (+ block-height u10) duration-blocks))
    )
    ;; Validate inputs
    (asserts! (> total-supply u0) err-insufficient-amount)
    (asserts! (> price-per-token u0) err-insufficient-amount)
    (asserts! (>= soft-cap min-soft-cap) err-insufficient-amount)
    (asserts! (> hard-cap soft-cap) err-insufficient-amount)
    (asserts! (<= hard-cap max-hard-cap) err-max-purchase)
    (asserts! (<= max-purchase hard-cap) err-max-purchase)
    (asserts! (< min-purchase max-purchase) err-min-purchase)
    (asserts! (> duration-blocks u10) err-insufficient-amount)
    
    ;; Create launch
    (map-set launches launch-id
      {
        creator: tx-sender,
        token-name: token-name,
        token-symbol: token-symbol,
        token-uri: token-uri,
        total-supply: total-supply,
        price-per-token: price-per-token,
        soft-cap: soft-cap,
        hard-cap: hard-cap,
        min-purchase: min-purchase,
        max-purchase: max-purchase,
        start-block: start-block,
        end-block: end-block,
        total-raised: u0,
        tokens-sold: u0,
        is-finalized: false,
        is-successful: false,
        token-contract: none
      }
    )
    
    (var-set launch-counter launch-id)
    (print {event: "launch-created", platform: "memestack", launch-id: launch-id, creator: tx-sender})
    (ok launch-id)
  )
)

;; Buy tokens with STX
(define-public (buy-tokens (launch-id uint) (stx-amount uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      ;; Cache frequently accessed values
      (price (get price-per-token launch))
      (min-purchase (get min-purchase launch))
      (max-purchase (get max-purchase launch))
      (hard-cap (get hard-cap launch))
      (total-supply (get total-supply launch))
      (total-raised (get total-raised launch))
      (tokens-sold (get tokens-sold launch))
      (current-contribution (default-to 
        {stx-contributed: u0, tokens-allocated: u0, claimed: false}
        (map-get? user-contributions {launch-id: launch-id, user: tx-sender})
      ))
      (current-stx (get stx-contributed current-contribution))
      (current-tokens (get tokens-allocated current-contribution))
    )
    
    ;; Fast-fail validations (cheapest first)
    (asserts! (not (var-get contract-paused)) err-contract-paused)
    (asserts! (>= stx-amount min-purchase) err-min-purchase)
    (asserts! (<= stx-amount max-stx-for-calculation) err-calculation-overflow)
    
    ;; Calculate tokens inline (avoid redundant map-get)
    (let
      (
        (tokens-to-receive (/ (* stx-amount u1000000) price))
        (new-total-contribution (+ current-stx stx-amount))
        (new-total-raised (+ total-raised stx-amount))
        (new-tokens-sold (+ tokens-sold tokens-to-receive))
      )
      ;; Remaining validations
      (asserts! (is-launch-active launch-id) err-launch-not-active)
      (asserts! (<= new-total-contribution max-purchase) err-max-purchase)
      (asserts! (<= new-total-raised hard-cap) err-max-supply-reached)
      (asserts! (<= new-tokens-sold total-supply) err-max-supply-reached)
    
      ;; Transfer STX to contract (held until finalization)
      (try! (stx-transfer? stx-amount tx-sender (as-contract tx-sender)))
      
      ;; Update user contribution
      (map-set user-contributions
        {launch-id: launch-id, user: tx-sender}
        {
          stx-contributed: new-total-contribution,
          tokens-allocated: (+ current-tokens tokens-to-receive),
          claimed: false
        }
      )
      
      ;; Update launch data
      (map-set launches launch-id
        (merge launch {
          total-raised: new-total-raised,
          tokens-sold: new-tokens-sold
        })
      )
      
      (print {event: "tokens-purchased", platform: "memestack", launch-id: launch-id, buyer: tx-sender, amount: stx-amount})
      (ok {tokens: tokens-to-receive, stx-spent: stx-amount})
    )
  )
)

;; Finalize launch
(define-public (finalize-launch (launch-id uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      (total-raised (get total-raised launch))
      (is-finalized (get is-finalized launch))
      (end-block (get end-block launch))
      (hard-cap (get hard-cap launch))
      (soft-cap (get soft-cap launch))
    )
    ;; Fast-fail: check if already finalized first (cheapest check)
    (asserts! (not is-finalized) err-already-launched)
    
    ;; Check if launch can be finalized
    (asserts! 
      (or 
        (>= block-height end-block)
        (>= total-raised hard-cap)
      )
      err-launch-not-ended
    )
    
    (let
      (
        (met-soft-cap (>= total-raised soft-cap))
        (platform-fee (/ (* total-raised platform-fee-bps) bps-base))
        (creator-amount (- total-raised platform-fee))
      )
    
    
      ;; If successful, distribute STX
      (if met-soft-cap
        (begin
          ;; Transfer platform fee
          (try! (as-contract (stx-transfer? platform-fee tx-sender (var-get platform-fee-address))))
          ;; Transfer to creator
          (try! (as-contract (stx-transfer? creator-amount tx-sender (get creator launch))))
        )
        true
      )
      
      ;; Mark as finalized
      (map-set launches launch-id
        (merge launch {
          is-finalized: true,
          is-successful: met-soft-cap
        })
      )
      
      (print {event: "launch-finalized", platform: "memestack", launch-id: launch-id, successful: met-soft-cap})
      (ok met-soft-cap)
    )
  )
)

;; Claim tokens (if launch successful)
(define-public (claim-tokens (launch-id uint))
  (let
    (
      (contribution (unwrap! (map-get? user-contributions {launch-id: launch-id, user: tx-sender}) err-not-found))
      (claimed (get claimed contribution))
    )
    ;; Fast-fail: check if already claimed first (cheapest check)
    (asserts! (not claimed) err-already-claimed)
    
    (let
      (
        (launch (unwrap! (map-get? launches launch-id) err-not-found))
      )
      ;; Remaining validations
      (asserts! (get is-finalized launch) err-launch-not-ended)
      (asserts! (get is-successful launch) err-soft-cap-not-met)
    
      ;; Mark as claimed
      (map-set user-contributions
        {launch-id: launch-id, user: tx-sender}
        (merge contribution {claimed: true})
      )
      
      (print {event: "tokens-claimed", platform: "memestack", launch-id: launch-id, user: tx-sender, amount: (get tokens-allocated contribution)})
      (ok (get tokens-allocated contribution))
    )
  )
)

;; Request refund (if launch failed)
(define-public (request-refund (launch-id uint))
  (let
    (
      (contribution (unwrap! (map-get? user-contributions {launch-id: launch-id, user: tx-sender}) err-not-found))
      (claimed (get claimed contribution))
      (stx-contributed (get stx-contributed contribution))
    )
    ;; Fast-fail: check if already claimed/refunded first (cheapest check)
    (asserts! (not claimed) err-already-claimed)
    
    (let
      (
        (launch (unwrap! (map-get? launches launch-id) err-not-found))
        (refund-address tx-sender)
      )
      ;; Remaining validations
      (asserts! (get is-finalized launch) err-launch-not-ended)
      (asserts! (not (get is-successful launch)) err-no-refund)
    
      ;; Refund STX
      (try! (as-contract (stx-transfer? stx-contributed tx-sender refund-address)))
      
      ;; Mark as claimed (refunded)
      (map-set user-contributions
        {launch-id: launch-id, user: tx-sender}
        (merge contribution {claimed: true})
      )
      
      (print {event: "refund-processed", platform: "memestack", launch-id: launch-id, user: tx-sender, amount: stx-contributed})
      (ok stx-contributed)
    )
  )
)

;; Link deployed token contract
(define-public (link-token-contract (launch-id uint) (token-contract principal))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
    )
    
    ;; Only creator or contract owner can link
    (asserts! 
      (or (is-eq tx-sender (get creator launch)) (is-eq tx-sender contract-owner))
      err-unauthorized
    )
    
    (map-set launches launch-id
      (merge launch {token-contract: (some token-contract)})
    )
    
    (ok true)
  )
)

;; Admin functions
(define-public (set-platform-fee-address (new-address principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set platform-fee-address new-address)
    (ok true)
  )
)

(define-public (pause-contract (paused bool))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set contract-paused paused)
    (print {event: "contract-paused", platform: "memestack", paused: paused})
    (ok true)
  )
)

(define-public (set-token-factory (factory principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set token-factory-contract (some factory))
    (ok true)
  )
)
