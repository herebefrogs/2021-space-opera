import { initAudio, playSong, stopSong, swapNotesInSong } from './sound';

songs = [
    // key: magic value of the piano key representing the note, for instrument synthesis
    // hold: duration of the note (?)
    // next: delay until the next note plays (ms)

  [ // Darth Vader theme
    { key:  4, hold: 8,   next: 1000 },
    { key:  4, hold: 8,   next: 1000 },
    { key:  4, hold: 8,   next: 1000 },
    { key:  0, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  4, hold: 3.5, next: 1000 },
    { key:  0, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  4, hold: 3.5, next: 2000 },
    { key: 11, hold: 8,   next: 1000 },
    { key: 11, hold: 8,   next: 1000 },
    { key: 11, hold: 8,   next: 1000 },
    { key: 12, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  3, hold: 3.5, next: 1000 },
    { key:  0, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  4, hold: 3.5, next: 2000 }
  ]
]


let s = 0;            // current song index
var currentSong = []; // current song data

// TODO song randomization function
// TODO song comparison function

let on = true;

onclick = () => {
  if (on) {
    // make a shallow clone of the current song, that can be altered to recompose the original song
    currentSong = songs[s].map(note => note);
    // TODO randomize the song

    // play the song
    playSong(currentSong);
  } else {
    stopSong(currentSong);
  }
  on = !on;
}

onkeyup = e => {
  // TODO this is temporary until the swaps are intentional rather then random
  i = e.key;
  let j;

  do {
    j = Math.floor(Math.random() * songs[s].length);
  } while (j == i);

  swapNotesInSong(i, j, currentSong);
}

onload = () => {
  initAudio(songs);
}
