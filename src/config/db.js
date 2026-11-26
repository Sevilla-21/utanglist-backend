const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri || mongoUri.includes('<username>')) {
    throw new Error(
      'MONGODB_URI is missing or still using placeholder credentials in backend/.env'
    );
  }

  const conn = await mongoose.connect(mongoUri);
  console.log(`MongoDB Atlas connected: ${conn.connection.host}`);
  return conn;
};

module.exports = connectDB;