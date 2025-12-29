;; SIP-010 Fungible Token Template for Memecoins
;; This template will be used by the factory to create new tokens

(impl-trait .sip-010-trait-v2.sip-010-trait)

;; Constants
(define-constant contract-owner tx-sender)
(define-constant err-owner-only (err u100))
(define-constant err-not-token-owner (err u101))
(define-constant err-insufficient-balance (err u102))
(define-constant err-unauthorized (err u103))

;; SIP-010 required constants
(define-fungible-token memecoin)

;; Data Variables
(define-data-var token-name (string-ascii 32) "")
(define-data-var token-symbol (string-ascii 10) "")
(define-data-var token-decimals uint u6)
(define-data-var token-uri (optional (string-utf8 256)) none)

;; Authorization
(define-data-var contract-authorized principal contract-owner)

;; Initialize token (called once after deployment)
(define-public (initialize
    (name (string-ascii 32))
    (symbol (string-ascii 10))
    (decimals uint)
    (uri (string-utf8 256))
    (initial-owner principal)
    (initial-supply uint)
  )
  (begin
    ;; Can only be called once by contract owner
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (asserts! (is-eq (var-get token-name) "") err-owner-only)
    
    ;; Set token metadata
    (var-set token-name name)
    (var-set token-symbol symbol)
    (var-set token-decimals decimals)
    (var-set token-uri (some uri))
    
    ;; Mint initial supply to initial owner
    (try! (ft-mint? memecoin initial-supply initial-owner))
    
    (ok true)
  )
)

;; SIP-010 Functions

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (or (is-eq tx-sender sender) (is-eq tx-sender (var-get contract-authorized))) err-not-token-owner)
    (try! (ft-transfer? memecoin amount sender recipient))
    (match memo to-print (print to-print) 0x)
    (ok true)
  )
)

(define-read-only (get-name)
  (ok (var-get token-name))
)

(define-read-only (get-symbol)
  (ok (var-get token-symbol))
)

(define-read-only (get-decimals)
  (ok (var-get token-decimals))
)

(define-read-only (get-balance (who principal))
  (ok (ft-get-balance memecoin who))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply memecoin))
)

(define-read-only (get-token-uri)
  (ok (var-get token-uri))
)

;; Additional functions for launchpad integration

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get contract-authorized)) err-unauthorized)
    (ft-mint? memecoin amount recipient)
  )
)

(define-public (burn (amount uint) (owner principal))
  (begin
    (asserts! (or 
      (is-eq tx-sender owner) 
      (is-eq tx-sender (var-get contract-authorized))
    ) err-not-token-owner)
    (ft-burn? memecoin amount owner)
  )
)

(define-public (set-contract-authorized (new-authorized principal))
  (begin
    (asserts! (is-eq tx-sender contract-owner) err-owner-only)
    (var-set contract-authorized new-authorized)
    (ok true)
  )
)

(define-read-only (get-contract-authorized)
  (ok (var-get contract-authorized))
)
