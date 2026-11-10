# Reddit destinations

User setup: one local EraOfWave Reddit account, two destinations targeting
`r/EraOfWave` (`contentPolicy: nsfw`) and `r/EraOfWave_SFW` (`sfw`). Reddit
credentials remain on Client. Both destinations use the same localAccountId,
different stable localKeys and distinct target.subreddit values.

Compose accepts an optional boolean `target.sensitive` for Reddit. SFW requires
false. True and false are frozen in the existing target/digest representations;
omission remains omitted for legacy hashes and replay. The client forwards an
explicit boolean to Reddit's submit nsfw field; no silent default is inserted
into historical jobs. Existing Discord/Telegram/Rule34 policy behavior is unchanged.

Node issue #1579 covers target normalization and policy validation. Client owns
multiple subreddit settings/composition and provider flags; its work can run in
parallel against this contract. Node deploys first. Verification covers separate
subreddits on one account, pre-write SFW rejection and frozen replay. No schema
migration is needed beyond the existing content-policy migration.

Verification: 74 targeted PostgreSQL tests and 27 actual Node/PostgreSQL/Kubo
HTTP tests pass with provider transport mocked. The new HTTP case freezes two
subreddit endpoints on one account, rejects unsafe SFW creation before source
writes, and preserves accepted replay. apiDoc and security/scalability inventories
pass. The full suite was not rerun.
