//** All the funny variables are because some of the original variable names were in my game, 
//** so I had to change them to keep it from crashing.
//** If someone else uses this code and it won't work they may need to change other variables */
// https://xem.github.io/js1k19/miniSynth/
//***PIANO****


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

// overlapping notes sound better when played by separate Audio Context
const NB_AUDIO_CTX = 10;
var audioCtx = [];
const memoNoteToData = {};  // cache computation expensive audio data, indexed by note + hold
let on = true;
let timerId;


// add an audio buffer to each note of the song, matching the note parameters
function buildsong(songData) {
  console.log("buildsong...");

  songData.forEach(note => {
    note.buffer = audioCtx[0].createBuffer(1, 1e6, 44100);
    note.buffer.getChannelData(0).set(getD(note.key, note.hold));
  });
}

// TODO song randomization function
// TODO song comparison function

function playSong(song) {
  console.log("play song...");
  let n = 0;
  timerId = setTimeout(function run() {
    // TODO I don't like n++, refactor to
    // - play current note first
    // - decide what should be enqueued and when
    if (n==song.length) {
        console.log("reached end");
        timerId = setTimeout(() => { playSong(song) }, song[0].next);
    } else {
      note = song[n];
      playNote(n, note.buffer);
      timerId = setTimeout(run, note.next);
      n++;
    }
  }, 0);
}

function playNote(n, buffer) {
  console.log(n);
  // rotate through the audio contexts
  source = audioCtx[n%NB_AUDIO_CTX].createBufferSource();
  source.buffer = buffer;
  source.connect(audioCtx[n%NB_AUDIO_CTX].destination);
  source.start();
}

function swapNotes(i, j) {
  console.log('swap', i, '->', j);
  let note = currentSong[i];
  currentSong[i] = currentSong[j];
  currentSong[j] = note;
}

const getFrequency = note => 130.81 * 1.06 ** note;

function getD(note, hold) {
    const memoKey = `${note}-${hold}`;
    if (memoNoteToData[memoKey]) {
      return memoNoteToData[memoKey];
    }

    freq = getFrequency(note);
    for(

        // V: note length in seconds
        V = hold,

        // Temp vars for guitar synthesis
        vv = [],
        pp = ch = 0,
        
        // Modulation
        // This function generates the i'th sample of a sinusoidal signal with a specific frequency and amplitude
        b = (freq, tt, aa, tick) => Math.sin(freq / tt * 6.28 * aa + tick),
        
        // Piano synthesis
        w = (freq, tt) =>
           Math.sin(freq / 44100 * tt * 6.28 + b(freq, 44100, tt, 0) ** 2 + .75 * b(freq, 44100, tt, .25) + .1 * b(freq, 44100, tt, .5)),
        D = [],
        
        // Loop on all the samples
        tick = 0;
        tick < 44100 * V;
        tick++
        ){
        
        // Fill the samples array
        D[tick] =
        
          // The first 88 samples represent the note's attack
          tick < 88 
          ? tick / 88.2 * w(tick, freq) 
          
          // The other samples represent the rest of the note
          : (1 - (tick - 88.2) / (44100 * (V - .002))) ** ((.5 * Math.log(1e4 * freq / 44100)) ** 2) * w(tick, freq);
        }

        memoNoteToData[memoKey] = D;
        return D;
}

function init() {
  start = performance.now();
  for(i=0; i<NB_AUDIO_CTX;i++){
    audioCtx[i]= new AudioContext;
  }
  context = performance.now();
  
  // build the song
  buildsong(songs[s]);
  end = performance.now();

  console.log('audio context ' + (context-start)/1000 + 's', 'build song ' + (end - context)/1000 + 's', 'total ' + (end - start)/ 1000 + 's')    

}

onclick = () => {
  if (on) {
    // make a shallow clone of the current song, that can be altered to recompose the original song
    currentSong = songs[s].map(note => note);
    // TODO randomize the song

    // play the song
    playSong(currentSong);
  } else {
    clearTimeout(timerId);
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

  swapNotes(i, j);
}

init();
