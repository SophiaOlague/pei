const { neon } = require('@neondatabase/serverless');
require('dotenv').config();

const sql = neon(process.env.DATABASE_URL);

sql`SELECT NOW()`
  .then((result) => {
    console.log('Conexión exitosa:', result);
  })
  .catch((error) => {
    console.error('Error de conexión:', error);
  });