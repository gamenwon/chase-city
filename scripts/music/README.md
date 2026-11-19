# CHASE CITY music

`compose.mjs` is the source of the background music "Getaway Club": the
whole arrangement (drums, bass, rhythm synth, lead, arpeggios, effects) is
written and synthesized in that file, deterministically.

Rebuild the game file:

    node scripts/music/compose.mjs /tmp/bgm.wav
    ffmpeg -i /tmp/bgm.wav -codec:a libmp3lame -b:a 160k public/audio/chase-city-bgm.mp3

76.8 s (48 bars at 150 BPM), loops seamlessly (the tail is folded onto the
start; the game loops it sample-exactly, see MUSIC in src/audio/sound.js).
