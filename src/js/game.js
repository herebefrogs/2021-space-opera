import { isMobile } from './mobile';
import { checkMonetization, isMonetizationEnabled } from './monetization';
import { initAudio, generateBufferDataForNote, playSong, stopSong } from './sound';
import { save, load } from './storage';
import { ALIGN_LEFT, ALIGN_CENTER, ALIGN_RIGHT, CHARSET_SIZE, initCharset, renderText, renderBitmapText } from './text';
import { choice, clamp, getRandSeed, setRandSeed, lerp, loadImg, rand, randInt } from './utils';


const konamiCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65];
let konamiIndex = 0;

// GAMEPLAY VARIABLES

const TITLE_SCREEN = 0;
const GAME_SCREEN = 1;
const END_SCREEN = 2;
let screen = TITLE_SCREEN;


const PLANETS = [
  // format
  // {
  //   name: song name
  //   song: [
  //     {
  //       key: magic value of the piano key representing the note, for instrument synthesis
  //       hold: duration of the note (?)
  //       next: delay until the next note plays (ms)
  //     }
  //     ...
  //   ]
  // }

  {
    name: '2001 a space odyssey',
    hint: 'I\'m afraid I can\'t do that, Dave',
    // 5 notes
    song: [
      { key:  9, hold: 12,   next: 2000 },
      { key: 16, hold: 12,   next: 2000 },
      { key: 21, hold: 12,   next: 2000 },
      { key: 25, hold:  3.5, next:  250 },
      { key: 24, hold:  8,   next: 3000 }
    ],
  },
  {
    name: 'the force theme',
    hint: 'may it be with you, always',
    // 7 notes
    song: [
      { key: 12, hold: 3.5, next:  350 },
      { key: 17, hold: 8,   next: 1000 },
      { key: 19, hold: 8,   next: 1000 },
      { key: 20, hold: 2.5, next:  250 },
      { key: 22, hold: 2.5, next:  250 },
      { key: 20, hold: 8,   next:  800 },
      { key: 12, hold: 8,   next: 2000 }
    ],
  },
  // Lost in space (7 notes)
  // https://www.youtube.com/watch?v=--5Z-gwwzzw
  // Star Trek theme (8 notes)
  // [
  //   keys: 11,16,21,20,16,13,18,23
  // ],
  {
    name: 'darth vader theme',
    hint: 'he is your father',
    // 9 notes
    song: [
      { key:  4, hold: 8,   next: 1000 },
      { key:  4, hold: 8,   next: 1000 },
      { key:  4, hold: 8,   next: 1000 },
      { key:  0, hold: 8,   next:  800 },
      { key:  7, hold: 5,   next:  350 },
      { key:  4, hold: 3.5, next: 1000 },
      { key:  0, hold: 8,   next:  800 },
      { key:  7, hold: 5,   next:  350 },
      { key:  4, hold: 3.5, next: 2000 }
    ]
  }
];

const DISTANCE_TO_TARGET_RANGE = 5; // click/touch tolerance in pixel between crosshair and ring
const BASE_RADIUS = 25; // in pixel, inner space for planet
const HUE_HOVER = 300;  // Purple HSL hue in degree, when crosshair over a ring
let s;            // current song index
var currentSong = []; // current song data


const planet = {};
let crosshair; // coordinate in viewport space (add viewportOffset to convert to map space)
let wellPlacedNotes;


// RENDER VARIABLES

// visible canvas (size will be readjusted on load and on resize)
const [CTX] = createCanvas(768, 1024, c);
// full map, rendered off screen
const [MAP_CTX, MAP] = createCanvas(480, 640);
// visible portion of the map, seen from camera
const [VIEWPORT_CTX, VIEWPORT] = createCanvas(480, 640);


let canvasX;
let scaleToFit;


// LOOP VARIABLES

let currentTime;
let elapsedTime;
let lastTime;
let requestId;
let running = true;

// GAMEPLAY HANDLERS

// map piano key [0-35] to hue [225(blue/cold) > 120 (green) > 0 (red/warm) > 270 (violet/hot)] in degree
const keyToHue = key => ((360 - key*10) + 225)%360;

const mainColor = note => `hsl(${note.hover ? HUE_HOVER : note.hue} ${note.dragged ? 10 : 90}% ${lerp(90, 50, (currentTime - note.startTime)/(note.hold*500))}%)`;
const trailColor = note => `hsl(${note.hue} 40% 15%)`;
const dragColor = note => `hsl(${note.hue} 90% 60%)`;


function startGame() {
  // setRandSeed(getRandSeed());
  konamiIndex = 0;

  renderMap();
  
  crosshair = {
    x: -10,
    y: -10
  };

  screen = GAME_SCREEN;

  s = 0;
  startPuzzle(s);
}

function startPuzzle(s) {
  crosshair.enabled = true;

  // TODO pull this out of PLANETS
  planet.width = 2; // number of BASE_RADIUS
  planet.x = VIEWPORT.width - (2+planet.width)*BASE_RADIUS;
  planet.y = VIEWPORT.height - (2+planet.width)*BASE_RADIUS;

  // clone the current song, that can altered at will without damaging the original template
  currentSong = PLANETS[s].song.map(note => ({...note}));
  
  if (s === 0) {
    // make it easy to pass
    moveRing(3, 4);
  } else {
    randomizeCurrentSong();
  }

  updateNotesDisplayAttributes();

  // HACK: notes will be used as entities

  playSong(currentSong);     
};

function randomizeCurrentSong() {
  wellPlacedNotes = currentSong.length;

  // TODO based on the difficulty, randomization threshold could be lower
  while (wellPlacedNotes > currentSong.length / 2) {
    let src = randInt(0, currentSong.length - 1);
    let dest = src;
    while (dest === src) {
      dest = randInt(0, currentSong.length - 1);
    }
    moveRing(src, dest);
  };
}


function updateNotesDisplayAttributes() {
  // use reduceRight like a right-to-left forEach
  currentSong.reduceRight(
    (currentRadius, note) => {
      // set some rendering
      note.hue = keyToHue(note.key);
      note.radius = currentRadius + BASE_RADIUS;
      note.width = note.next/100;
      note.startTime = 0;

      return note.radius;
    },
    (2+planet.width)*BASE_RADIUS
  );
}

function updateWellPlacedNotes() {
  const templateSong = PLANETS[s].song;
  // count how many notes have the same key/hold/next values than their counterpart in the template song
  wellPlacedNotes = currentSong.reduce(
    (sum, note, n) => sum + (note.key === templateSong[n].key && note.hold === templateSong[n].hold && note.next === templateSong[n].next ? 1 : 0),
    0
  );
}

function moveRing(src, dest) {
  const start = Math.min(src, dest);
  const end = Math.max(src, dest);

  // only keep the keys between start and end, since hold/next and other attributes stay in place
  const shiftedKeys = currentSong.slice(start, end+1).map(note => note.key);

  // move src key in dest's position, shifting all keys in between toward src's original position
  // this allows shifting an entire range of keys
  if (src === start) {
    const srcKey = shiftedKeys.shift();
    shiftedKeys.push(srcKey);
  } else {
    const srcKey = shiftedKeys.pop();
    shiftedKeys.unshift(srcKey);
  }

  // now that the series of keys is properly ordered, apply them to their notes
  // and regenerate the audio buffer data based on the new key/hold pair
  shiftedKeys.forEach((key, n) => {
    currentSong[start + n].key = key;
    generateBufferDataForNote(currentSong[start + n]);
  });

  // swap src and dest, leaving all notes in between in place... is this more natural?
  // const srcKey = currentSong[src].key;
  // currentSong[src].key = currentSong[dest].key;
  // currentSong[dest].key = srcKey;
  // generateBufferDataForNote(currentSong[src]);
  // generateBufferDataForNote(currentSong[dest]);

  updateWellPlacedNotes();
}

const crosshairDistanceFromPlanet = () => Math.sqrt(Math.pow(planet.x - crosshair.x, 2) + Math.pow(planet.y - crosshair.y, 2));

const ringUnderCrosshair = () => currentSong.findIndex(
  note => crosshair.enabled && Math.abs(note.radius - note.width/2 - crosshairDistanceFromPlanet()) <= Math.max(note.width, DISTANCE_TO_TARGET_RANGE)
);

function update() {
  switch (screen) {
    case GAME_SCREEN:
      currentSong.forEach(note => { note.hover = 0 });

      const n = ringUnderCrosshair()
      if (n >= 0 && !currentSong[n].dragged) {
        currentSong[n].hover = currentTime;
      }

      if (wellPlacedNotes === currentSong.length && crosshair.enabled) {
        crosshair.enabled = false;
        // halt current playback
        stopSong(currentSong);
        // play the song one time from start to finish
        playSong(currentSong, () => {
          s += 1;
          if (s < PLANETS.length) {
            startPuzzle(s);
          } else {
            screen = END_SCREEN;
          }
        })
      }
      
      break;
  }
};

// RENDER HANDLERS

function createCanvas(width, height, canvas, ctx) {
  canvas = canvas || c.cloneNode();
  canvas.width = width;
  canvas.height = height;
  ctx = canvas.getContext('2d');
  return [ctx, canvas];
}

function blit() {
  // copy backbuffer onto visible canvas, scaling it to screen dimensions
  CTX.drawImage(
    VIEWPORT,
    0, 0, VIEWPORT.width, VIEWPORT.height,
    0, 0, c.width, c.height
  );
};

const SPACE = 2*CHARSET_SIZE;
function render() {
  VIEWPORT_CTX.fillStyle = '#000';
  VIEWPORT_CTX.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

  switch (screen) {
    case TITLE_SCREEN:
      renderBitmapText(
        '2021',
        VIEWPORT.width / 2, SPACE, ALIGN_CENTER, 8);
      renderBitmapText(
        'a space opera',
        VIEWPORT.width / 2, 6*SPACE, ALIGN_CENTER, 4);

      renderBitmapText(
        'space no longer sounds its old self...',
        SPACE, 18*SPACE, ALIGN_LEFT, 2);
      renderBitmapText(
        'bring harmony to the cosmic microwave',
        SPACE, 20*SPACE, ALIGN_LEFT, 2);
      renderBitmapText(
        'background!',
        SPACE, 22*SPACE, ALIGN_LEFT, 2);
      renderBitmapText(
        "drag each planet's rings in the right",
        SPACE, 26*SPACE, ALIGN_LEFT, 2);
      renderBitmapText(
        'order to their iconic tunes...',
        SPACE, 28*SPACE, ALIGN_LEFT, 2);

      renderBitmapText(
        'click/tap to start',
        VIEWPORT.width / 2, 43*SPACE, ALIGN_CENTER, 2);
      renderBitmapText(
        'jerome lecomte - js13kgames 2021',
        VIEWPORT.width / 2, VIEWPORT.height - 2*SPACE, ALIGN_CENTER, 2);
      break;
    case GAME_SCREEN:
      VIEWPORT_CTX.drawImage(
        MAP,
        // adjust x/y offset
        0, 0, VIEWPORT.width, VIEWPORT.height,
        0, 0, VIEWPORT.width, VIEWPORT.height
      );
      currentSong.forEach(note => renderRing(note));
      renderDraggedRing(currentSong.find(note => note.dragged));
      renderCrosshair();

      // HUD
      renderBitmapText(
        `planets: ${s + 1}/${PLANETS.length}`,
        SPACE, SPACE, ALIGN_LEFT, 2
      );
      renderBitmapText(
        `notes: ${wellPlacedNotes}/${currentSong.length}`,
        VIEWPORT.width - SPACE, SPACE, ALIGN_RIGHT, 2
      );
      if (!crosshair.enabled) {
        renderBitmapText(
          PLANETS[s].name,
          SPACE, 8*SPACE, ALIGN_LEFT, 2
        )
      }
      break;
    case END_SCREEN:
      renderBitmapText(
        'thank you for playing',
        SPACE, 28*SPACE, ALIGN_LEFT, 2);
      break;
  }

  blit();
};

function renderCrosshair() {
  // should be a hand
  VIEWPORT_CTX.strokeStyle = '#fff';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(crosshair.x - 1, crosshair.y - 1, 2, 2);
  VIEWPORT_CTX.strokeRect(crosshair.x - 6, crosshair.y - 6, 12, 12);
}

function renderRing(entity, ctx = VIEWPORT_CTX) {
  ctx.save();
  
  // trail (not sure if keeping it)
  ctx.beginPath();
  ctx.lineWidth = BASE_RADIUS - entity.width;
  ctx.arc(planet.x, planet.y, entity.radius - entity.width - ctx.lineWidth/2, 0, 2 * Math.PI);
  ctx.strokeStyle = trailColor(entity);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.stroke();
  ctx.closePath();

  // ring
  ctx.beginPath();
  ctx.shadowBlur = Math.max(10, entity.width);
  ctx.lineWidth = entity.width;
  ctx.arc(planet.x, planet.y, entity.radius - entity.width/2, 0, 2 * Math.PI);
  ctx.strokeStyle = mainColor(entity);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.stroke();
  ctx.closePath();
  ctx.restore();
}

function renderDraggedRing(entity, ctx = VIEWPORT_CTX) {
  if (entity) {
    ctx.save();
  
    ctx.beginPath();
    ctx.shadowBlur = 5;
    ctx.lineWidth = entity.width;
    ctx.arc(planet.x, planet.y, crosshairDistanceFromPlanet() - entity.width/2, 0, 2 * Math.PI);
    ctx.strokeStyle = dragColor(entity);
    ctx.shadowColor = ctx.strokeStyle;
    ctx.stroke();
    ctx.closePath();
    
    ctx.restore();
  }
};

function renderMap() {
  MAP_CTX.fillStyle = '#000';
  MAP_CTX.fillRect(0, 0, MAP.width, MAP.height);
  // TODO render star field
};


// LOOP HANDLERS

function loop() {
  if (running) {
    requestId = requestAnimationFrame(loop);
    currentTime = performance.now();
    elapsedTime = (currentTime - lastTime) / 1000;
    update();
    render();
    lastTime = currentTime;
  }
};

function toggleLoop(value) {
  running = value;
  if (running) {
    lastTime = performance.now();
    loop();
    // TODO resume music
  } else {
    cancelAnimationFrame(requestId);
    // TODO pause music
  }
};

// EVENT HANDLERS

onload = async (e) => {
  // the real "main" of the game
  document.title = '2021: a Space Opera';

  onresize();
  checkMonetization();

  initAudio(PLANETS.map(planet => planet.song));

  await initCharset(VIEWPORT_CTX);

  toggleLoop(true);
};

onresize = onrotate = function() {
  // scale canvas to fit screen while maintaining aspect ratio
  scaleToFit = Math.min(innerWidth / VIEWPORT.width, innerHeight / VIEWPORT.height);
  c.width = VIEWPORT.width * scaleToFit;
  c.height = VIEWPORT.height * scaleToFit;
  // disable smoothing on image scaling
  CTX.imageSmoothingEnabled = VIEWPORT_CTX.imageSmoothingEnabled = MAP_CTX.imageSmoothingEnabled = false;

  canvasX = (window.innerWidth - c.width) / 2;
  // fix key events not received on itch.io when game loads in full screen
  window.focus();
};

// UTILS

document.onvisibilitychange = function(e) {
  // pause loop and game timer when switching tabs
  toggleLoop(!e.target.hidden);
};

// INPUT HANDLERS

onkeydown = function(e) {
  // prevent itch.io from scrolling the page up/down
  e.preventDefault();

  if (!e.repeat) {
    switch (screen) {
      case GAME_SCREEN:
        switch (e.code) {
          case 'KeyP':
            // Pause game as soon as key is pressed
            toggleLoop(!running);
            break;
        }
        break;
    }
  }
};

onkeyup = function(e) {
  switch (screen) {
    case TITLE_SCREEN:
      if (e.which !== konamiCode[konamiIndex] || konamiIndex === konamiCode.length) {
        startGame();
      } else {
        konamiIndex++;
      }
      break;
    case GAME_SCREEN:
      break;
    case END_SCREEN:
      switch (e.code) {
        case 'KeyT':
          open(`https://twitter.com/intent/tweet?text=viral%20marketing%20message%20https%3A%2F%2Fgoo.gl%2F${'some tiny Google url here'}`, '_blank');
          break;
        default:
          screen = TITLE_SCREEN;
          break;
      }
      break;
  }
};

// MOBILE INPUT HANDLERS

// PointerEvent is the main standard now, and has precedence over TouchEvent
// adding onmousedown/move/up triggers a MouseEvent and a PointerEvent on platforms that support both (pointer > mouse || touch)

onpointerdown = function(e) {
  e.preventDefault();
  switch (screen) {
    case GAME_SCREEN:
      crosshair.touchTime = currentTime;

      const n = ringUnderCrosshair();
      if (n >= 0) {
        currentSong[n].dragged = crosshair.touchTime;
      }
      break;
  }
};

onpointermove = function(e) {
  e.preventDefault();
  switch (screen) {
    case GAME_SCREEN:
      const [touchX, touchY] = pointerLocation(e);
      crosshair.x = touchX;
      crosshair.y = touchY;
      break;
  }
}

onpointerup = function(e) {
  e.preventDefault();
  switch (screen) {
    case TITLE_SCREEN:
      startGame();
      break;
    case GAME_SCREEN:
      crosshair.touchTime = 0;

      const src = currentSong.findIndex(note => note.dragged);
      if (src >= 0) {
        currentSong[src].dragged = 0;
      }
      const dest = ringUnderCrosshair();
      if (dest >= 0) {
        moveRing(src, dest);
        updateNotesDisplayAttributes();
      }
      break;
    case END_SCREEN:
      screen = TITLE_SCREEN;
      break;
  }
};

// utilities
function pointerLocation(e) {
  // for multiple pointers, use e.pointerId to differentiate (on desktop, mouse is always 1, on mobile every pointer even has a different id incrementing by 1)
  // for surface area of touch contact, use e.width and e.height (in CSS pixel) mutiplied by window.devicePixelRatio (for device pixels aka canvas pixels)
  // for canvas space coordinate, use e.layerX and .layerY when e.target = c
  // { id: e.pointerId, x: e.x, y: e.y, w: e.width*window.devicePixelRatio, h: e.height*window.devicePixelRatio};
  
  const pointerInCanvas = e.target === c;

  if (pointerInCanvas) {
    // touch/click happened on canvas, layerX/layerY are already in canvas space
    return [
      Math.round(e.layerX / scaleToFit),
      Math.round(e.layerY / scaleToFit)
    ];
  }

  // touch/click happened outside of canvas (which is centered horizontally)
  // x/pageX/y/pageY are in screen space, must be offset by canvas position then scaled down
  // to be converted in canvas space
  return [
    clamp(
      Math.round(((e.x || e.pageX) - canvasX) / scaleToFit),
      0, VIEWPORT.width
    ),
    clamp(
      Math.round((e.y || e.pageY) / scaleToFit),
      0, VIEWPORT.height
    )
  ];
};
