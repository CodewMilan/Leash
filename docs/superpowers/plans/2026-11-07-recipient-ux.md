# Recipient UX refinement

Continue the approved guided gift UX on the receiving end, preserving the existing visual language, passkey and link-secret authorization, card issuance, and settlement.

- [x] Make passkey → claim → card a sequence with one primary action at a time.
- [x] Show chosen design, exact amount, and browser-decrypted personal note; keep secrets in the link.
- [x] Explain missing links, deadlines, passkeys, confirmation and return states.
- [x] Keep action errors through polling; guard duplicate actions and stale polling responses.
- [x] Bring claimed cards above the secondary, expandable receipt history.
- [x] Verify real browser passkey registration and claim submission against an isolated DB, mock error paths and recipient states, inspect desktop/mobile, run static checks/build.

Validation: 88 unit/integration tests passed, lint and TypeScript passed, production build passed, and all 9 browser tests passed against a disposable database. Browser coverage includes actual virtual-authenticator registration, server verification/replay rejection, claim submission, missing-link recovery, encrypted note/design rendering, persistent action errors through polling, and mobile card states. Desktop and mobile inspected together; final confirmation removes wallet navigation and conflicting duplicate card status. No real gifts or card purchases submitted.

Follow-up card polish: available balance precedes the smaller masked card; secure details and sandbox shop are grouped above expandable budget/activity. Refresh is a secondary utility. Production build, lint, and all 9 browser tests passed; mobile action visibility and activity disclosure checked.
