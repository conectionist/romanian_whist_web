// The faces the table draws with. A face loads only when something is drawn in it, so a page that
// has to be ready (a capture) asks for them all.
const FACES = [
  '400 25px "Belleza"',
  '400 19px "Alegreya Sans"',
  '500 19px "Alegreya Sans"',
  '700 19px "Alegreya Sans"',
  '700 37px "Cinzel Decorative"',
];

export async function loadFonts(): Promise<void> {
  await Promise.allSettled(FACES.map((face) => document.fonts.load(face)));
  await document.fonts.ready;
}
