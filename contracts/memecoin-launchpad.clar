;; Memecoin Launchpad Core Contract v2
;; Integrated with Token Factory

;; Constants
(define-constant contract-owner tx-sender)
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

;; Platform fee (2% in basis points)
(define-constant platform-fee-bps u200)
(define-constant bps-base u10000)

;; Data Variables
(define-data-var launch-counter uint u0)
(define-data-var platform-fee-address principal contract-owner)
(define-data-var token-factory-contract (optional principal) none)

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
    (ok (/ (* stx-amount u1000000) (get price-per-token launch)))
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
      (end-block (+ block-height duration-blocks))
    )
    ;; Validate inputs
    (asserts! (> total-supply u0) err-insufficient-amount)
    (asserts! (> price-per-token u0) err-insufficient-amount)
    (asserts! (> hard-cap soft-cap) err-insufficient-amount)
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
    (print {event: "launch-created", launch-id: launch-id, creator: tx-sender})
    (ok launch-id)
  )
)

;; Buy tokens with STX
(define-public (buy-tokens (launch-id uint) (stx-amount uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      (tokens-to-receive (unwrap! (calculate-tokens-for-stx launch-id stx-amount) err-insufficient-amount))
      (current-contribution (default-to 
        {stx-contributed: u0, tokens-allocated: u0, claimed: false}
        (map-get? user-contributions {launch-id: launch-id, user: tx-sender})
      ))
      (new-total-contribution (+ (get stx-contributed current-contribution) stx-amount))
      (new-total-raised (+ (get total-raised launch) stx-amount))
      (new-tokens-sold (+ (get tokens-sold launch) tokens-to-receive))
    )
    
    ;; Validations
    (asserts! (is-launch-active launch-id) err-launch-not-active)
    (asserts! (>= stx-amount (get min-purchase launch)) err-min-purchase)
    (asserts! (<= new-total-contribution (get max-purchase launch)) err-max-purchase)
    (asserts! (<= new-total-raised (get hard-cap launch)) err-max-supply-reached)
    (asserts! (<= new-tokens-sold (get total-supply launch)) err-max-supply-reached)
    
    ;; Transfer STX to contract (held until finalization)
    (try! (stx-transfer? stx-amount tx-sender (as-contract tx-sender)))
    
    ;; Update user contribution
    (map-set user-contributions
      {launch-id: launch-id, user: tx-sender}
      {
        stx-contributed: new-total-contribution,
        tokens-allocated: (+ (get tokens-allocated current-contribution) tokens-to-receive),
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
    
    (print {event: "tokens-purchased", launch-id: launch-id, buyer: tx-sender, amount: stx-amount})
    (ok {tokens: tokens-to-receive, stx-spent: stx-amount})
  )
)

;; Finalize launch
(define-public (finalize-launch (launch-id uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      (met-soft-cap (>= (get total-raised launch) (get soft-cap launch)))
      (platform-fee (/ (* (get total-raised launch) platform-fee-bps) bps-base))
      (creator-amount (- (get total-raised launch) platform-fee))
    )
    
    ;; Check if launch can be finalized
    (asserts! 
      (or 
        (>= block-height (get end-block launch))
        (>= (get total-raised launch) (get hard-cap launch))
      )
      err-launch-not-ended
    )
    
    (asserts! (not (get is-finalized launch)) err-already-launched)
    
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
    
    (print {event: "launch-finalized", launch-id: launch-id, successful: met-soft-cap})
    (ok met-soft-cap)
  )
)

;; Claim tokens (if launch successful)
(define-public (claim-tokens (launch-id uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      (contribution (unwrap! (map-get? user-contributions {launch-id: launch-id, user: tx-sender}) err-not-found))
    )
    
    ;; Validations
    (asserts! (get is-finalized launch) err-launch-not-ended)
    (asserts! (get is-successful launch) err-soft-cap-not-met)
    (asserts! (not (get claimed contribution)) err-already-claimed)
    
    ;; Mark as claimed
    (map-set user-contributions
      {launch-id: launch-id, user: tx-sender}
      (merge contribution {claimed: true})
    )
    
    (print {event: "tokens-claimed", launch-id: launch-id, user: tx-sender, amount: (get tokens-allocated contribution)})
    (ok (get tokens-allocated contribution))
  )
)

;; Request refund (if launch failed)
(define-public (request-refund (launch-id uint))
  (let
    (
      (launch (unwrap! (map-get? launches launch-id) err-not-found))
      (contribution (unwrap! (map-get? user-contributions {launch-id: launch-id, user: tx-sender}) err-not-found))
      (refund-address tx-sender)
    )
    
    ;; Validations
    (asserts! (get is-finalized launch) err-launch-not-ended)
    (asserts! (not (get is-successful launch)) err-no-refund)
    (asserts! (not (get claimed contribution)) err-already-claimed)
    
    ;; Refund STX
    (try! (as-contract (stx-transfer? (get stx-contributed contribution) tx-sender refund-address)))
    
    ;; Mark as claimed (refunded)
    (map-set user-contributions
      {launch-id: launch-id, user: tx-sender}
      (merge contribution {claimed: true})
    )
    
    (print {event: "refund-processed", launch-id: launch-id, user: tx-sender, amount: (get stx-contributed contribution)})
    (ok (get stx-contributed contribution))
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

(define-public (set-token-factory (factory principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set token-factory-contract (some factory))
    (ok true)
  )
)
