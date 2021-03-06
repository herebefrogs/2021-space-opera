// Based on Crystal Parker's https://github.com/Vertfromage/miniPiano,
// which is based on Maxime Euziere's https://xem.github.io/js1k19/miniSynth/


// overlapping notes sound better when played by separate Audio Context
const NB_AUDIO_CTX = 10;
let audioCtx = [];
let VOLUME = 0.3;
// cache computation expensive audio data, indexed by note + hold
const memoNoteToData = {};
let timerId;

// public interface

export function initAudioContext(songs) {
  start = performance.now();
  for (i=0; i<NB_AUDIO_CTX; i++) {
    audioCtx[i]= new AudioContext;
  }
  end = performance.now();
}


export function playSong(song, done) {
  let n = 0;
  timerId = setTimeout(function run() {
    // TODO I don't like n++, refactor to
    // - play current note first
    // - decide what should be enqueued and when
    if (n==song.length) {
        if (done) {
          done();
        } else {
          timerId = setTimeout(() => { playSong(song) }, song[0].next);
        }
    } else {
      note = song[n];
      playNote(note, n);
      timerId = setTimeout(run, note.next);
      n++;
    }
  }, 0);
}

export function stopSong(song) {
  clearTimeout(timerId);

  song.forEach(note => {
    if (note.source) {
      note.source.stop();
    }
  });
}

export function pauseSong() {
  audioCtx.forEach(ctx => ctx.suspend());
}

export function resumeSong() {
  audioCtx.forEach(ctx => ctx.resume());
}

// add an audio buffer to each note of the song, matching the note parameters
export function generateBufferDataForSong(songData) {
  songData.forEach(generateBufferDataForNote);
}

// private implementation

function generateBufferDataForNote(note) {
  note.buffer = audioCtx[0].createBuffer(1, 1e6, 44100);
  note.buffer.getChannelData(0).set(getD(note.key, note.hold));
}

function playNote(note, n) {
  // rotate through the audio contexts
  const aCtx = audioCtx[n%NB_AUDIO_CTX];
  const source = aCtx.createBufferSource();
  source.buffer = note.buffer;
  const gain = aCtx.createGain();
  gain.gain.value = VOLUME;
  source.connect(gain);
  gain.connect(aCtx.destination);
  source.start();
  note.source = source;
  note.startTime = performance.now();
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
      s = (freq, tt, aa, tick) => Math.sin(freq / tt * 6.28 * aa + tick),
      
      // Piano synthesis
      w = (freq, tt) =>
         Math.sin(freq / 44100 * tt * 6.28 + s(freq, 44100, tt, 0) ** 2 + .75 * s(freq, 44100, tt, .25) + .1 * s(freq, 44100, tt, .5)),
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
