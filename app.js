const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const app = express();
const session = require('express-session');
const { OAuth2Client } = require('google-auth-library');

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID,);


const port = 3001;
const cors = require('cors');
app.use(cors());
require('dotenv').config();
const bodyParser = require('body-parser');
const { setupDigitalReceiptDB } = require('./database/initDB');
setupDigitalReceiptDB();
const { Receipt, User } = require('./database/mongooseScripts');
app.use(bodyParser.json());
const router = require('./routes/r_1');
const authMiddleware = async (req, res, next) => {

  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.YOUR_GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (payload['iss'] !== 'accounts.google.com' && payload['iss'] !== 'https://accounts.google.com') {
      throw new Error('Wrong issuer.');
    }
    req.user = {
      _id: payload['sub'],
      email: payload['email'],
      avatar: payload['avatar'],
    };
    next();
  } catch (error) {
    console.error(error);
    res.status(401).send({ error: 'Please authenticate.' });
  }
};

// router.use(authMiddleware);
app.use('/api', router);

app.use(function (err, req, res, next) {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: "http://localhost:3001/auth/google/callback"
},
  async (accessToken, refreshToken, profile, done) => {

    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.create({
          googleId: profile.id,
          email: profile.emails[0].value,
          avatar: profile.photos[0].value
        });
      }
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  // Fetch the user from the database using the ID
  console.log(req.user);
  User.findById(id, (err, user) => {
    done(err, user);
  });
});

const supermarkets = require('./ocr/store_name');

// Configure multer for image upload, using memory storage.
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use(session({ secret: 'secret', resave: false, saveUninitialized: true }));
app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    let user = await User.findOne({ email: payload.email });
    if (!user) {
      user = await User.create({
        id: payload.sub,
        email: payload.email,
        avatar: payload.picture,
        createdAt: new Date()
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error verifying Google token:', error);
    res.status(500).send('Internal Server Error');
  }
});
function extractItemAndPrice(str) {

  const regex = /^(.+?)\s+\$?(\d+\.\d{1,2})\s*[A-Za-z]?[A-Za-z]?$/;
  const matches = str.match(regex);

  if (matches && matches.length >= 3) {
    const temp = matches[1].replace(/^[A-Za-z]\s*\d+/, "");
    const temp0 = temp.replace(/^\d+/, "");
    const itemName = temp0.replace(/\d+$/, "");
    const price = matches[2];
    const category = "grocery";
    const quantity = 1;

    return { itemName, price, quantity, category };
  } else {
    return undefined;
  }
}

app.post('/api/receipts/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }
  (async () => {
    const worker = await createWorker('eng');
    const { data: { text } } = await worker.recognize(req.file.buffer);
    console.log(text);

    const lines = text.split('\n');

    let storeName = "";
    let items = [];
    let tax = [];
    let total = [];

    const regex = /\d+\.\d{1,2}/;
    const matches = lines.filter(str => regex.test(str));
    const mismatches = lines.filter(str => !regex.test(str));
    // console.log('==== ',matches);
    // console.log('---- ',mismatches);
    matches.forEach(line => {
      let result = extractItemAndPrice(line);

      if (line.toLowerCase().includes('tax') || line.toLowerCase().includes('hst')) {
        if (result && 'quantity' in result)
          delete result.quantity
        if (result && 'category' in result)
          delete result.category
        tax.push(result);
      } else if (line.toLowerCase().includes('total') || line.toLowerCase().includes('purchase')) {
        if (result && 'quantity' in result)
          delete result.quantity
        if (result && 'category' in result)
          delete result.category
        total.push(result);
      } else {
        items.push(result);
      }

    });

    mismatches.forEach(line => {
      supermarkets.some(store => {
        if (line.toLowerCase().includes(store.toLowerCase())) {
          storeName = store;
        }
      });
    });

    const receiptData = {
      storeName,
      items,
      tax,
      total
    };

    console.log("----- ", receiptData);
    return res.status(200).send(receiptData);
  })();

});

app.post('/api/receipts/insertData', authMiddleware, async (req, res) => {
  const data = req.body;
  const userId = req.user._id;
  data.items = data.items.filter(item => item);
  data.tax = data.tax.filter(item => item);
  data.total = data.total.filter(item => item);
  data['userId'] = userId;

  try {
    const receipt = new Receipt(data);
    console.log("save data ", data);
    await receipt.save().then(result => {
      console.log("Save result:", result);
      res.status(200).send(`Successfully save data.`);
    }).catch(err => console.log("error ", err));
    // res.send('Receipt inserted successfully');
  } catch (error) {
    console.log(error);
    res.status(500).send(`Error inserting data: ${error.message}`);
  }
});
app.post('/api/auth/validateToken', authMiddleware, (req, res) => {
  res.json({
    message: 'Token is valid',
    user: req.user
  });
});

app.get('/api/logout', authMiddleware, (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('Could not log out, please try again.');
    } else {
      res.send('Logout successful');
    }
  });
});


// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
