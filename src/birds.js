export const BIRD_TYPES = Object.freeze({
  eagle: { label: 'Eagle', dark: 0x4b352a, mid: 0x76513a, light: 0xe7dbba, wing: 0x4b372d, beak: 0xd3a34d, scale: 1, body: 1, wingSpan: 1, tail: 1, beakLength: 1, flapRate: 1 },
  falcon: { label: 'Falcon', dark: 0x303c44, mid: 0x60717a, light: 0xd7c7a8, wing: 0x34454b, beak: 0xbeb69b, scale: .88, body: .82, wingSpan: 1.06, tail: .85, beakLength: .76, flapRate: 1.3 },
  owl: { label: 'Owl', dark: 0x574534, mid: 0x93785b, light: 0xd0b995, wing: 0x65513b, beak: 0xbba16a, scale: 1.02, body: 1.16, wingSpan: .92, tail: .68, beakLength: .55, flapRate: .7 },
  kingfisher: { label: 'Kingfisher', dark: 0x155b80, mid: 0x2d90a8, light: 0xd68145, wing: 0x267c94, beak: 0x30383a, scale: .72, body: .72, wingSpan: .77, tail: .52, beakLength: 1.45, flapRate: 1.55 }
});

export const birdIds = Object.keys(BIRD_TYPES);
export const birdType = id => BIRD_TYPES[id] || BIRD_TYPES.eagle;
