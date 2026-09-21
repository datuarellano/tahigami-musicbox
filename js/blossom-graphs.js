// Blossom graph data for the How it Works demo, ported from the firmware
// (include/{leaf,radial,wave,mountain}_blossom.h in the D1-40 repo). Keys match
// blossom-viz's names; the four sequences are puncture ids, same numbering as
// the artwork and the device's !TRIG lines.
//
//   edges     - undirected threads between punctures (drives the Random walk)
//   contour   - the outer-edge path, in play order
//   skeletal  - the internal-structure path, in play order
//   pitch     - puncture id -> index into the scale's 10-note ladder (pitchMapping)
export const BLOSSOMS = {
  DAHON: {
    label: 'Dahon',
    count: 20,
    edges: [
      [0,1], [1,2], [1,12], [1,13], [2,3], [2,13], [3,4], [3,13], [3,14], [4,5],
      [4,14], [4,15], [4,16], [5,6], [5,16], [5,17], [6,7], [6,17], [6,18], [6,19],
      [7,8], [7,19], [8,9], [8,18], [8,19], [9,10], [9,17], [9,18], [10,11], [10,15],
      [10,16], [10,17], [11,12], [11,13], [11,14], [11,15], [12,13], [13,14], [14,15], [15,16],
      [16,17], [17,18], [18,19],
    ],
    contour: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1],
    skeletal: [0, 1, 13, 2, 13, 12, 13, 3, 13, 11, 13, 14, 4, 14, 15, 10, 15, 16, 5, 16, 17, 9, 17, 6, 17, 18, 8, 18, 19, 7],
    pitch: [0, 1, 2, 3, 5, 7, 8, 9, 8, 7, 6, 4, 2, 2, 3, 4, 5, 6, 7, 8],
  },
  BITUIN: {
    label: 'Bituin',
    count: 14,
    edges: [
      [0,1], [0,2], [0,3], [0,4], [0,5], [0,6], [0,7], [0,8], [0,9], [0,10],
      [0,11], [0,12], [0,13], [1,2], [2,3], [3,4], [4,5], [5,6], [6,7], [7,8],
      [8,9], [9,10], [10,11], [11,12], [12,13],
    ],
    contour: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
    skeletal: [0, 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0, 7, 0, 8, 0, 9, 0, 10, 0, 11, 0, 12, 0, 13],
    pitch: [4, 0, 2, 3, 5, 8, 6, 9, 7, 7, 5, 4, 3, 1],
  },
  ALON: {
    label: 'Alon',
    count: 20,
    edges: [
      [0,1], [0,9], [0,19], [1,2], [1,7], [1,8], [1,9], [2,3], [2,7], [3,4],
      [3,6], [3,7], [4,5], [4,6], [5,6], [6,7], [7,8], [8,9], [9,10], [9,19],
      [10,11], [10,19], [11,12], [11,17], [11,18], [11,19], [12,13], [12,17], [13,14], [13,16],
      [13,17], [14,15], [14,16], [15,16], [16,17], [17,18], [18,19],
    ],
    contour: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19],
    skeletal: [4, 6, 3, 7, 2, 7, 1, 8, 1, 9, 0, 9, 19, 10, 19, 11, 18, 11, 17, 12, 17, 13, 16, 14],
    pitch: [0, 4, 2, 5, 3, 5, 7, 6, 5, 6, 8, 5, 9, 5, 6, 4, 1, 3, 4, 3],
  },
  BUNDOK: {
    label: 'Bundok',
    count: 15,
    edges: [
      [0,1], [0,5], [0,6], [0,7], [0,14], [1,2], [1,3], [1,4], [1,5], [2,3],
      [3,4], [4,5], [5,6], [6,7], [7,8], [7,14], [8,9], [8,14], [9,10], [9,13],
      [9,14], [10,11], [10,13], [11,12], [11,13], [12,13], [13,14],
    ],
    contour: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    skeletal: [3, 1, 4, 1, 5, 0, 6, 0, 7, 14, 8, 14, 9, 13, 10, 13, 11],
    pitch: [0, 1, 2, 5, 4, 8, 5, 9, 6, 7, 3, 5, 2, 1, 0],
  },
};

// Scales from the firmware's interval_formulas table (include/parameters.h):
// semitone offsets from the key's root for each of the 10 ladder slots.
export const SCALES = {
  lydian: { name: 'Lydian', steps: [0, 2, 4, 6, 7, 9, 11, 12, 14, 16] },
  hamsadhwani: { name: 'Hamsadhwani', steps: [0, 2, 4, 7, 11, 12, 14, 16, 19, 23] },
  majorPentatonic: { name: 'Major Pentatonic', steps: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] },
  dorian: { name: 'Dorian', steps: [0, 2, 3, 5, 7, 9, 10, 12, 14, 15] },
};

// Which scale each blossom sounds in during the demo, so the loop also
// shows how the same shapes read in different moods.
export const DEMO_SCALE = {
  DAHON: 'majorPentatonic',
  BITUIN: 'lydian',
  ALON: 'hamsadhwani',
  BUNDOK: 'dorian',
};
