import { isMobile } from './mobile';
import { checkMonetization, isMonetizationEnabled } from './monetization';
import { initAudio, playSong, stopSong } from './sound';
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


const SONGS = [
  // key: magic value of the piano key representing the note, for instrument synthesis
  // hold: duration of the note (?)
  // next: delay until the next note plays (ms)

  // 2001 a space odyssey (5 notes)
  // [
  //   key: 9,16,21,25,24
  // ],
  // the Force theme (7 notes)
  [
    { key: 12, hold: 3.5, next:  350 },
    { key: 17, hold: 8,   next: 1000 },
    { key: 19, hold: 8,   next: 1000 },
    { key: 20, hold: 2.5, next:  250 },
    { key: 22, hold: 2.5, next:  250 },
    { key: 20, hold: 8,   next:  800 },
    { key: 12, hold: 8,   next: 2000 }
  ],
  // Lost in space (7 notes)
  // https://www.youtube.com/watch?v=--5Z-gwwzzw
  // Star Trek theme (8 notes)
  // [
  //   keys: 11,16,21,20,16,13,18,23
  // ],
  // Darth Vader theme (9 notes - 18 extended)
  [
    { key:  4, hold: 8,   next: 1000 },
    { key:  4, hold: 8,   next: 1000 },
    { key:  4, hold: 8,   next: 1000 },
    { key:  0, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  4, hold: 3.5, next: 1000 },
    { key:  0, hold: 8,   next:  800 },
    { key:  7, hold: 5,   next:  350 },
    { key:  4, hold: 3.5, next: 2000 }
    // { key: 11, hold: 8,   next: 1000 },
    // { key: 11, hold: 8,   next: 1000 },
    // { key: 11, hold: 8,   next: 1000 },
    // { key: 12, hold: 8,   next:  800 },
    // { key:  7, hold: 5,   next:  350 },
    // { key:  3, hold: 3.5, next: 1000 },
    // { key:  0, hold: 8,   next:  800 },
    // { key:  7, hold: 5,   next:  350 },
    // { key:  4, hold: 3.5, next: 2000 }
  ]
];

const BASE_RADIUS = 50;
let s = 0;            // current song index
var currentSong = []; // current song data

// DELETE ME
let on = true;



let crosshair; // coordinate in viewport space (add viewportOffset to convert to map space)
let entities;
let wellPlacedNotes;


// RENDER VARIABLES

// visible canvas (size will be readjusted on load and on resize)
const [CTX] = createCanvas(1024, 768, c);
// full map, rendered off screen
const [MAP_CTX, MAP] = createCanvas(640, 480);
// visible portion of the map, seen from camera
const [VIEWPORT_CTX, VIEWPORT] = createCanvas(640, 480);


let canvasX;
let scaleToFit;


const DISTANCE_TO_TARGET_RANGE = 5; // in pixel


// LOOP VARIABLES

let currentTime;
let elapsedTime;
let lastTime;
let requestId;
let running = true;

// GAMEPLAY HANDLERS

// map key [0-35] to hue [0-360]
const keyToHue = key => key*10;

const mainColor = note => `hsl(${note.hue} 80% ${lerp(90, 50, (currentTime - note.startTime)/note.next)}%)`;
const trailColor = note => `hsl(${note.hue} 10% 10%)`;


function startGame() {
  // setRandSeed(getRandSeed());
  konamiIndex = 0;
  // clone the current song, that can altered at will without damaging the original template
  currentSong = SONGS[s].map(note => ({...note}));
  // TODO randomize the song

  updateNotesDisplayAttributes();
  
  // HACK: notes will be used as entities
  entities = [
    ...currentSong
    // TODO add planet
  ]

  updateWellPlacedNotes();

  crosshair = {
    view: { x: VIEWPORT.width / 2, y: VIEWPORT.height / 2 },
    map: {}
  };
  renderMap();
  
  screen = GAME_SCREEN;
};

function updateNotesDisplayAttributes() {
  // use reduceRight like a right-to-left forEach
  currentSong.reduceRight(
    (currentRadius, note) => {
      // set some rendering
      note.hue = keyToHue(note.key);
      note.radius = currentRadius + 2*note.hold + note.next/100;
      note.width = note.hold;
      note.startTime = 0;

      return note.radius;
    },
    BASE_RADIUS
  );
}

function swapRings(src, dest) {
  let srcNote = currentSong[src];
  let destNote = currentSong[dest];

  // swap notes
  currentSong[src] = destNote;
  currentSong[dest] = srcNote;

  // TODO either:
  // - [x] recalculate all the radiuses, but that's gonna lead to jarring
  // - [ ] only swap the note frequency (key and buffer) so the song rhythm is preserved
  //  (but then how to I check that the song has been reconstituted?
  //  (id vs position ain't enough anymore... key at position vs key in template at position?)
  updateNotesDisplayAttributes();
  updateWellPlacedNotes();
}

function updateWellPlacedNotes() {
  // count how many notes hold the same position than their id?
  wellPlacedNotes = currentSong.reduce(
    (sum, note, n) => sum + (note.id == n ? 1 : 0),
    0
  );
}
function updateCrosshairMapPosition() {
  crosshair.x = Math.round(crosshair.view.x);
  crosshair.y = Math.round(crosshair.view.y);
}

function updateEntityPosition(entity) {
  // const ratio = entity.velX && entity.velY ? DIAGONAL_VELOCITY_DRAG : 1;
  // const distance = entity.speed * elapsedTime * ratio;
  // entity.x += distance * entity.velX;
  // entity.y += distance * entity.velY;
}

function withinDestinationRange(entity) {
  return Math.sqrt(Math.pow(entity.destX - entity.x, 2) + Math.pow(entity.destY - entity.y, 2)) <= DISTANCE_TO_TARGET_RANGE;
}


function updateEntityCounters(entity) {
  switch (entity.type) {
    case 'hero':
      break;
  }
};

function updateEntity(entity) {
  updateEntityPosition(entity);
  updateEntityCounters(entity);
}

function update() {
  switch (screen) {
    case GAME_SCREEN:

      entities.forEach(updateEntity);
      updateCrosshairMapPosition();
      entities = entities.filter(entity => !entity.dead);
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

function render() {
  VIEWPORT_CTX.fillStyle = '#fff';
  VIEWPORT_CTX.fillRect(0, 0, VIEWPORT.width, VIEWPORT.height);

  switch (screen) {
    case TITLE_SCREEN:
      renderBitmapText(
        '2021: a space opera',
        VIEWPORT.width / 2, 2*CHARSET_SIZE, ALIGN_CENTER, 2);
      break;
    case GAME_SCREEN:
      VIEWPORT_CTX.drawImage(
        MAP,
        // adjust x/y offset
        0, 0, VIEWPORT.width, VIEWPORT.height,
        0, 0, VIEWPORT.width, VIEWPORT.height
      );
      entities.forEach(entity => renderEntity(entity));
      renderBitmapText(
        `harmonious notes: ${wellPlacedNotes}/${currentSong.length}`,
        VIEWPORT.width - CHARSET_SIZE, CHARSET_SIZE, ALIGN_RIGHT, 2
      );
      renderCrosshair();
      break;
    case END_SCREEN:
      break;
  }

  blit();
};

function renderCrosshair() {
  VIEWPORT_CTX.strokeStyle = '#fff';
  VIEWPORT_CTX.lineWidth = 2;
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 1, crosshair.view.y - 1, 2, 2);
  VIEWPORT_CTX.strokeRect(crosshair.view.x - 6, crosshair.view.y - 6, 12, 12);
}

function renderEntity(entity, ctx = VIEWPORT_CTX) {
  ctx.save();
  ctx.shadowBlur = 15;
  ctx.lineWidth = entity.width;
  
  // trail (not sure if keeping it)
  ctx.beginPath();
  ctx.arc(VIEWPORT.width / 2, VIEWPORT.height, entity.radius-2*entity.hold, 0, 2 * Math.PI);
  ctx.strokeStyle = trailColor(entity);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.stroke();
  ctx.closePath();

  // ring
  ctx.beginPath();
  ctx.arc(VIEWPORT.width / 2, VIEWPORT.height, entity.radius, 0, 2 * Math.PI);
  ctx.strokeStyle = mainColor(entity);
  ctx.shadowColor = ctx.strokeStyle;
  ctx.stroke();
  ctx.closePath();
  
  ctx.restore();
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

  initAudio(SONGS);

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
      switch (e.code) {
        case 'Digit0':
        case 'Digit1':
        case 'Digit2':
        case 'Digit3':
        case 'Digit4':
        case 'Digit5':
        case 'Digit6':
        case 'Digit7':
        case 'Digit8':
        case 'Digit9':
          let i = e.key;
          let j;
        
          do {
            j = Math.floor(Math.random() * currentSong.length);
          } while (j == i);
        
          swapRings(i, j);
          break;
        }
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
      if (on) {
        playSong(currentSong);
      } else {
        stopSong(currentSong);
      }
      on = !on;
      break;
  }
};

onpointermove = function(e) {
  e.preventDefault();
  switch (screen) {
    case GAME_SCREEN:
      const [touchX, touchY] = pointerLocation(e);
      crosshair.view.x = touchX;
      crosshair.view.y = touchY;
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
