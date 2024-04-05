"use strict"

const { MongoClient } = require('mongodb');

class Database {
  constructor(url, name) {
    this.client = new MongoClient(url);
    this.client.connect((error) => {
      if (error) {
        throw new Error(`Error connection MongoClient to ${url}: ${error.message}`);
      } else {
        console.log(`MongoClient connected to ${url}`);
      }
    });
    this.db = this.client.db(name);
  }

  createTable(tableName) {
    this.db.createCollection(tableName).then(() => {
      console.log(`${process.env.DATABASE} ${tableName} collection created.`);
    }).catch((error) => {
      if (error.codeName === 'NamespaceExists') {
        console.log(`${process.env.DATABASE} ${tableName} collection already exists.`);
      } else {
        console.log(`Failed to create ${process.env.DATABASE} ${tableName} collection: ${error.message}`);
        throw new Error(`Failed to create ${process.env.DATABASE} ${tableName} collection: ${error.message}`);
      }
    });
  }
}
function setupDigitalReceiptDB() {
  console.log(`Setting up ${process.env.DATABASE} database.`);
  let database = new Database(process.env.DATABASE_URL, process.env.DATABASE);

  database.createTable(process.env.USERS);
  database.createTable(process.env.RECEIPTS);
}

module.exports = { setupDigitalReceiptDB }

