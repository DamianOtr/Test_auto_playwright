# Test wszystkich podstron - Playwright

## Test sprawdza:

- dostępność wszystkich podstron, których adresy znajdują się na podstronie "Mapa strony" na każdym ze sklepów Vasco

- statusy HTTP podstron (np. 200, 301, 302, 404, 500)

- liczbę przekierowań (redirect) dla danego URL

- występowanie błędów 404 (strona nie istnieje)

- występowanie błędów serwera (5xx)

- obecność meta title w kodzie HTML strony

- obecność meta description w kodzie HTML strony

- występowanie meta robots noindex

---

Test zbiera wszystkie wykryte problemy i generuje raport HTML z podsumowaniem dla każdego kraju oraz listą URL z wykrytymi problemami.

## Uruchomienie testu

npx playwright test tests/test-podstron-all.spec.js

## Raport HTML w przegladarce

open audit-report.html
