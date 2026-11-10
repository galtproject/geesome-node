# Reddit destinations

One local account can back independent subreddit destinations, for example
r/EraOfWave with contentPolicy nsfw and r/EraOfWave_SFW with contentPolicy sfw.
They share localAccountId but use different stable localKeys and target.subreddit.
Credentials stay on Client; Node stores only the public destination identities.

Compose authors required top-level contentType sfw/nsfw. The same policy helper
used for every network rejects NSFW→SFW before source writes. Classification is
frozen on jobs and bound by digest v6, independently of subreddit parameters.
The client adapter derives Reddit's provider nsfw boolean at send time.

See [content-policy.md](content-policy.md) for coordinated upgrade, held historical
intent and backup recovery. The previous optional target classification API is
removed; producers must require capabilities.contentTypePublishing before compose.
