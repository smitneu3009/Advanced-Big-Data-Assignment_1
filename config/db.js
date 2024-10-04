const mongoose= require('mongoose');
const dotenv = require('dotenv');


dotenv.config();

const connection = async () => {
  const USERNAME = process.env.DB_USERNAME;
  const PASSWORD = process.env.DB_PASSWORD;

  const URL = `mongodb://${USERNAME}:${PASSWORD}@ac-gizmxbc-shard-00-00.xl93pss.mongodb.net:27017,ac-gizmxbc-shard-00-01.xl93pss.mongodb.net:27017,ac-gizmxbc-shard-00-02.xl93pss.mongodb.net:27017/?ssl=true&replicaSet=atlas-yt6wi9-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Refugee-assistant-app`;

  try {
    await mongoose.connect(URL, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log("Database connected successfully");
  } catch (error) {
    console.log("Error while connecting with the database", error);
  }
};

module.exports = connection;