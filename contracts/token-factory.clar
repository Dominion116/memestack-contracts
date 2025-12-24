;; Token Factory Contract
;; Deploys new memecoin tokens and links them to launches

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-found (err u101))
(define-constant err-unauthorized (err u102))
(define-constant err-already-deployed (err u103))
(define-constant err-deployment-failed (err u104))

;; Data Variables
(define-data-var launchpad-contract principal contract-owner)
(define-data-var token-deployment-counter uint u0)

;; Maps
(define-map deployed-tokens
  uint ;; launch-id
  {
    token-contract: principal,
    deployer: principal,
    deployed-at: uint,
    name: (string-ascii 32),
    symbol: (string-ascii 10)
  }
)

(define-map token-metadata
  principal ;; token contract
  {
    launch-id: uint,
    total-supply: uint,
    creator: principal,
    verified: bool
  }
)

;; Read-only functions

(define-read-only (get-deployed-token (launch-id uint))
  (map-get? deployed-tokens launch-id)
)

(define-read-only (get-token-info (token-contract principal))
  (map-get? token-metadata token-contract)
)

(define-read-only (get-launchpad-contract)
  (var-get launchpad-contract)
)

(define-read-only (get-deployment-count)
  (var-get token-deployment-counter)
)

;; Public functions

;; Register a deployed token (called by launchpad after manual deployment)
(define-public (register-token
    (launch-id uint)
    (token-contract principal)
    (token-name (string-ascii 32))
    (token-symbol (string-ascii 10))
    (total-supply uint)
    (creator principal)
  )
  (begin
    ;; Only launchpad contract can register
    (asserts! (is-eq tx-sender (var-get launchpad-contract)) err-unauthorized)
    
    ;; Check if already registered
    (asserts! (is-none (map-get? deployed-tokens launch-id)) err-already-deployed)
    
    ;; Register token
    (map-set deployed-tokens launch-id
      {
        token-contract: token-contract,
        deployer: creator,
        deployed-at: block-height,
        name: token-name,
        symbol: token-symbol
      }
    )
    
    ;; Store metadata
    (map-set token-metadata token-contract
      {
        launch-id: launch-id,
        total-supply: total-supply,
        creator: creator,
        verified: true
      }
    )
    
    ;; Increment counter
    (var-set token-deployment-counter (+ (var-get token-deployment-counter) u1))
    
    (ok token-contract)
  )
)

;; Verify a token contract belongs to a launch
(define-read-only (verify-token (launch-id uint) (token-contract principal))
  (match (map-get? deployed-tokens launch-id)
    deployment
    (ok (is-eq (get token-contract deployment) token-contract))
    (ok false)
  )
)

;; Get all token details for a launch
(define-read-only (get-launch-token-details (launch-id uint))
  (match (map-get? deployed-tokens launch-id)
    deployment
    (match (map-get? token-metadata (get token-contract deployment))
      metadata
      (ok {
        token-contract: (get token-contract deployment),
        name: (get name deployment),
        symbol: (get symbol deployment),
        total-supply: (get total-supply metadata),
        creator: (get creator metadata),
        deployed-at: (get deployed-at deployment),
        verified: (get verified metadata)
      })
      err-not-found
    )
    err-not-found
  )
)

;; Admin: Set launchpad contract
(define-public (set-launchpad-contract (new-launchpad principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set launchpad-contract new-launchpad)
    (ok true)
  )
)

;; Admin: Mark token as verified
(define-public (verify-token-metadata (token-contract principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (match (map-get? token-metadata token-contract)
      metadata
      (begin
        (map-set token-metadata token-contract
          (merge metadata {verified: true})
        )
        (ok true)
      )
      err-not-found
    )
  )
)

;; Helper: Get token contract for launch
(define-read-only (get-token-contract-for-launch (launch-id uint))
  (match (map-get? deployed-tokens launch-id)
    deployment
    (ok (some (get token-contract deployment)))
    (ok none)
  )
)
