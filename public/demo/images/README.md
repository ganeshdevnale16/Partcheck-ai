Demo photos live here after running `npm run images` (or put your own here).

manifest.json maps a photo key to a file name, e.g. { "p-base": "my-base-photo.jpg" }.
Keys: p-base, p-elev, p-plat, p-ladder (PASS scaffold views), f-base, f-elev, f-plat, f-ladder (FAIL scaffold views),
x-site (home / login background), x-net (QR scanner background).
The scaffold tag close-ups (p-tag, f-tag) are drawn by the app so they always show the right tag ID and date.
If a key is missing here the app loads the Wikimedia Commons photo, and draws a fallback image when offline.
