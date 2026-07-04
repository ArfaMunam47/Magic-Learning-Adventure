All sounds in Magic Learning Adventure (clicks, correct/incorrect chimes,
victory fanfares, piano notes, animal & nature sounds, calm ambience) are
generated live in the browser with the Web Audio API — see the AudioEngine
object in /script.js.

Why: this keeps the whole app 100% offline and dependency-free (no large
audio files to download, nothing that can go "missing" or 404), while still
giving every child instant, pleasant sound feedback on any device.

If you'd like to swap in recorded audio instead, drop .mp3/.ogg files in this
folder and point AudioEngine.playFile('assets/sounds/yourfile.mp3') at them.
