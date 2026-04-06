// Seed script to initialize face data for game 2
require('dotenv').config();
const { initDB, runQuery, getAll } = require('./db');

async function seed() {
  await initDB();

  // Check if faces already exist
  const existing = getAll('SELECT * FROM game2_faces');
  if (existing.length > 0) {
    console.log(`Already have ${existing.length} face pairs. Re-seeding...`);
    runQuery('DELETE FROM game2_faces');
  }

  // 8 face pairs (we have 9 real images but only 8 fake images)
  // real_position: matches frontend logic - odd sortOrder = 'left', even sortOrder = 'right'
  const faces = [
    { real: 'real_1.png', fake: 'fake_1.png', realPos: 'left', order: 1 },   // odd -> left
    { real: 'real_2.png', fake: 'fake_2.png', realPos: 'right', order: 2 },  // even -> right
    { real: 'real_3.png', fake: 'fake_3.png', realPos: 'left', order: 3 },   // odd -> left
    { real: 'real_4.png', fake: 'fake_4.png', realPos: 'right', order: 4 },  // even -> right
    { real: 'real_5.png', fake: 'fake_5.png', realPos: 'left', order: 5 },   // odd -> left
    { real: 'real_6.png', fake: 'fake_6.png', realPos: 'right', order: 6 },  // even -> right
    { real: 'real_7.png', fake: 'fake_7.png', realPos: 'left', order: 7 },   // odd -> left
    { real: 'real_8.png', fake: 'fake_8.png', realPos: 'right', order: 8 },  // even -> right
  ];

  faces.forEach(f => {
    runQuery(`INSERT INTO game2_faces (real_image, fake_image, real_position, sort_order) VALUES ('${f.real}', '${f.fake}', '${f.realPos}', ${f.order})`);
  });

  console.log(`Seeded ${faces.length} face pairs into database.`);
}

seed().then(() => {
  console.log('Seed complete!');
  process.exit(0);
}).catch(e => {
  console.error('Seed error:', e);
  process.exit(1);
});
