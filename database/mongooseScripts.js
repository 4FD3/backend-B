const mongoose = require('mongoose');

mongoose.connect(`${process.env.DATABASE_URL}/${process.env.DATABASE}`, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('Connected to MongoDB...'))
  .catch(err => console.error('Could not connect to MongoDB...', err));


const receiptSchema = new mongoose.Schema({
  userId: { type: String, ref: 'User' },
  storeName: String,
  tax: [{
    itemName: String,
    price: Number
  }],
  total: [{
    itemName: String,
    price: Number
  }],
  items: [{
    itemName: String,
    price: Number,
    quantity: Number,
    category: String
  }],
  createdAt: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  googleId: String,
  email: String,
  avatar: String,
  createdAt: { type: Date, default: Date.now }
});

const Receipt = mongoose.model('Receipt', receiptSchema);
const User = mongoose.model('User', userSchema);

module.exports = { Receipt, User };