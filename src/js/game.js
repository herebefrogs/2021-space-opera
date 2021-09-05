//** All the funny variables are because some of the original variable names were in my game, 
//** so I had to change them to keep it from crashing.
//** If someone else uses this code and it won't work they may need to change other variables */
// https://xem.github.io/js1k19/miniSynth/
//***PIANO****


songs = [
    // note: note magic value for piano synthesis,
    // hold: duration of the note (?)
    // next: delay until the next note plays (ms)

  [ // Darth Vader theme
    { note:  4, hold: 8,   next: 2000 },
    { note:  4, hold: 8,   next: 1000 },
    { note:  4, hold: 8,   next: 1000 },
    { note:  0, hold: 8,   next: 1000 },
    { note:  7, hold: 5,   next:  800 },
    { note:  4, hold: 3.5, next:  350 },
    { note:  0, hold: 8,   next: 1000 },
    { note:  7, hold: 5,   next:  800 },
    { note:  4, hold: 3.5, next:  350 },
    { note: 11, hold: 8,   next: 2000 },
    { note: 11, hold: 8,   next: 1000 },
    { note: 11, hold: 8,   next: 1000 },
    { note: 12, hold: 8,   next: 1000 },
    { note:  7, hold: 5,   next:  800 },
    { note:  3, hold: 3.5, next:  350 },
    { note:  0, hold: 8,   next: 1000 },
    { note:  7, hold: 5,   next:  800 },
    { note:  4, hold: 3.5, next:  350 }
  ]
]
mySong = [4,4,4,0,7,4,0,7,4,11,11,11,12,7,3,0,7,4];
speeds =    [8,8,8,8,5,3.5,8,5,3.5,8,8,8,8,5,3.5,8,5,3.5];
intervals = [2000,1000,1000,1000,800,350,1000,800,350,2000,1000,1000,1000,800,350,1000,800,350];
let s = 0;  // song index

var builtSong =[];
var audioCtx = [];
// overlapping notes sound better when played by separate Audio Context
const NB_AUDIO_CTX = 10;
let init = true;
let on = true;
let timerId;


function buildsong(songData) {
  console.log("buildsong...");
  songData.forEach((element, n) => {
    builtSong.push( audioCtx[n%NB_AUDIO_CTX].createBuffer(1, 1e6, 44100));
    builtSong[n].getChannelData(0).set(getD(element,speeds[n]));
  });
}

function playTheSong(song) {
  console.log("play song...");
  let n = 0;
  timerId = setTimeout(function run() {
    if(n==builtSong.length){
        console.log("reached end");
        timerId = setTimeout(() => {
          playTheSong(song)
        }, intervals[0]);
    }else{
      playTheNote(n);
      n++;
      timerId = setTimeout(run, intervals[n]);
    }
  }, 0);
}

function playTheNote(note){
  console.log(note);
  j = note%NB_AUDIO_CTX;
  source = audioCtx[j].createBufferSource();
  source.buffer = builtSong[note];
  source.connect(audioCtx[j].destination);
  source.start();
}

function getF(i){ return 130.81 * 1.06 ** i;}

function getD(note, len){
    note = getF(note);
    for(

        // V: note length in seconds
        V = len,

        // Temp vars for guitar synthesis
        vv = [],
        pp = ch = 0,
        
        // Modulation
        // This function generates the i'th sample of a sinusoidal signal with a specific frequency and amplitude
        b = (note, tt, aa, tick) => Math.sin(note / tt * 6.28 * aa + tick),
        
        // Piano synthesis
        w = (note, tt) =>
           Math.sin(note / 44100 * tt * 6.28 + b(note, 44100, tt, 0) ** 2 + .75 * b(note, 44100, tt, .25) + .1 * b(note, 44100, tt, .5)),
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
          ? tick / 88.2 * w(tick, note) 
          
          // The other samples represent the rest of the note
          : (1 - (tick - 88.2) / (44100 * (V - .002))) ** ((.5 * Math.log(1e4 * note / 44100)) ** 2) * w(tick, note);
        }
        return D;
}

//How to use in game: Either play a whole song as an array
// ex: mySong = [1,1,1,2,2,3,3,4,28,25,28,23,25,24,21,21,21];
// Use buildSong(song, piano); and playTheSong(builtsong);
// or/and play individual notes
// ex: playNote(getF(32),3,false);
// To use in onClick:

onclick = () => {
  if (init) {
    start = performance.now();
    for(i=0; i<NB_AUDIO_CTX;i++){
      audioCtx[i]= new AudioContext;
    }
    context = performance.now();
    
    // build the song
    buildsong(mySong);
    end = performance.now();
    
    console.log('audio context ' + (context-start)/1000 + 's', 'build song ' + (end - context)/1000 + 's', 'total ' + (end - start)/ 1000 + 's')    
    init = false;
  }

  if (on) {
    // play the song
    playTheSong(builtSong);
  } else {
    clearTimeout(timerId);
  }
  on = !on;
}
